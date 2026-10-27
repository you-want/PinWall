// CoreAudio process taps + independent HAL outputs. No capture until an explicit Start.
#import <AppKit/AppKit.h>
#import <CoreAudio/CoreAudio.h>
#import <CoreAudio/AudioHardwareTapping.h>
#import <CoreAudio/CATapDescription.h>
#import <AudioToolbox/AudioToolbox.h>
#include <stdatomic.h>
#include <pthread.h>
#include <unistd.h>
#define PW_ROUTE_COUNT 4
#define PW_RING_FRAMES 65536u
#define PW_RING_MASK (PW_RING_FRAMES-1)
typedef struct {
    AudioObjectID process, tap, aggregate, output;
    pid_t pid;
    AudioDeviceIOProcID capture;
    AudioUnit unit;
    float *ring;
    atomic_uint_fast64_t written, read, callbacks, dropped, missing;
    atomic_uint gain;
    double ratio, phase;
    BOOL planar, active;
    uint64_t lastCallbacks;unsigned stalledTicks;
    NSString *__strong token;
    NSString *__strong name;
} PWRoute;
static PWRoute PWRoutes[PW_ROUTE_COUNT];
static atomic_ullong PWRouteEpoch;
unsigned long long pinwall_routes_generation(void){return atomic_load(&PWRouteEpoch);}
static pthread_mutex_t PWRouteLock=PTHREAD_MUTEX_INITIALIZER;
static dispatch_source_t PWRouteWatchdog;
static NSString *PWRouteLastError;
static BOOL PWRGet(AudioObjectID object,AudioObjectPropertySelector selector,AudioObjectPropertyScope scope,UInt32 size,void *data){
    AudioObjectPropertyAddress address={selector,scope,0};return AudioObjectGetPropertyData(object,&address,0,NULL,&size,data)==noErr;
}
static NSString *PWRString(AudioObjectID object,AudioObjectPropertySelector selector){CFStringRef value=NULL;if(!PWRGet(object,selector,kAudioObjectPropertyScopeGlobal,sizeof(value),&value)||!value)return @"";return CFBridgingRelease(value);}
static BOOL PWRFloatStereo(AudioStreamBasicDescription format){
    return format.mFormatID==kAudioFormatLinearPCM&&(format.mFormatFlags&kAudioFormatFlagIsFloat)&&!(format.mFormatFlags&kAudioFormatFlagIsBigEndian)&&format.mBitsPerChannel==32&&format.mChannelsPerFrame==2&&format.mFramesPerPacket==1&&isfinite(format.mSampleRate)&&format.mSampleRate>=8000&&format.mSampleRate<=192000;
}
static OSStatus PWRCapture(AudioObjectID device,const AudioTimeStamp *now,const AudioBufferList *input,const AudioTimeStamp *inputTime,AudioBufferList *output,const AudioTimeStamp *outputTime,void *context){
    (void)device;(void)now;(void)inputTime;(void)output;(void)outputTime;
    PWRoute *route=context;if(!input||!route->ring)return noErr;
    // A private aggregate contains only one stereo process tap, never a microphone subdevice.
    if((route->planar&&input->mNumberBuffers!=2)||(!route->planar&&input->mNumberBuffers!=1))return noErr;
    for(UInt32 b=0;b<input->mNumberBuffers;b++)if(!input->mBuffers[b].mData||input->mBuffers[b].mNumberChannels!=(route->planar?1:2))return noErr;
    UInt32 frames=input->mBuffers[0].mDataByteSize/(route->planar?sizeof(float):2*sizeof(float));
    if(route->planar)frames=MIN(frames,input->mBuffers[1].mDataByteSize/sizeof(float));
    if(frames>8192)return noErr;
    uint64_t write=atomic_load_explicit(&route->written,memory_order_relaxed),read=atomic_load_explicit(&route->read,memory_order_acquire);
    if(write-read+frames>=PW_RING_FRAMES){atomic_fetch_add_explicit(&route->dropped,frames,memory_order_relaxed);return noErr;}
    const float *left=input->mBuffers[0].mData,*right=route->planar?input->mBuffers[1].mData:NULL;
    for(UInt32 i=0;i<frames;i++){
        UInt32 at=(UInt32)((write+i)&PW_RING_MASK)*2;
        route->ring[at]=route->planar?left[i]:left[2*i];route->ring[at+1]=route->planar?right[i]:left[2*i+1];
    }
    atomic_store_explicit(&route->written,write+frames,memory_order_release);
    atomic_fetch_add_explicit(&route->callbacks,1,memory_order_relaxed);return noErr;
}
// Single producer/single consumer ring, bounded linear resampling. No allocation, locks or ObjC on the audio threads.
static void PWRRenderSamples(PWRoute *route,float *output,UInt32 frames){
    uint64_t read=atomic_load_explicit(&route->read,memory_order_relaxed),written=atomic_load_explicit(&route->written,memory_order_acquire);
    float gain=atomic_load_explicit(&route->gain,memory_order_relaxed)/10000.0f;
    for(UInt32 i=0;i<frames;i++){
        if(written-read<2){output[2*i]=output[2*i+1]=0;atomic_fetch_add_explicit(&route->missing,1,memory_order_relaxed);continue;}
        UInt32 a=(UInt32)(read&PW_RING_MASK)*2,b=(UInt32)((read+1)&PW_RING_MASK)*2;float fraction=(float)route->phase;
        for(UInt32 channel=0;channel<2;channel++){
            float value=(route->ring[a+channel]+(route->ring[b+channel]-route->ring[a+channel])*fraction)*gain;
            output[2*i+channel]=isfinite(value)?fmaxf(-1,fminf(1,value)):0;
        }
        route->phase+=route->ratio;uint64_t advance=(uint64_t)route->phase;
        advance=MIN(advance,written-read-1);route->phase-=advance;read+=advance;
        // No extrapolation after a large rate change/underflow.
        if(route->phase>=1)route->phase=0;
    }
    atomic_store_explicit(&route->read,read,memory_order_release);
}
static OSStatus PWROutput(void *context,AudioUnitRenderActionFlags *flags,const AudioTimeStamp *time,UInt32 bus,UInt32 frames,AudioBufferList *data){
    (void)flags;(void)time;(void)bus;PWRoute *route=context;
    if(!data)return noErr;
    for(UInt32 i=0;i<data->mNumberBuffers;i++)if(data->mBuffers[i].mData)memset(data->mBuffers[i].mData,0,data->mBuffers[i].mDataByteSize);
    if(frames>8192||data->mNumberBuffers!=1||data->mBuffers[0].mNumberChannels!=2||!data->mBuffers[0].mData||data->mBuffers[0].mDataByteSize<frames*2*sizeof(float))return noErr;
    PWRRenderSamples(route,data->mBuffers[0].mData,frames);return noErr;
}
static BOOL PWRStop(PWRoute *route){
    BOOL safe=YES;
    // Make the original playback audible before attempting any potentially failing teardown.
    if(@available(macOS 14.2,*)){
        if(route->tap){CFTypeRef value=NULL;if(PWRGet(route->tap,kAudioTapPropertyDescription,kAudioObjectPropertyScopeGlobal,sizeof(value),&value)&&value){CATapDescription *description=CFBridgingRelease(value);description.muteBehavior=CATapUnmuted;AudioObjectPropertyAddress address={kAudioTapPropertyDescription,kAudioObjectPropertyScopeGlobal,0};CFTypeRef reference=(__bridge CFTypeRef)description;AudioObjectSetPropertyData(route->tap,&address,0,NULL,sizeof(reference),&reference);}}
    }
    if(route->unit){AudioOutputUnitStop(route->unit);AudioUnitUninitialize(route->unit);if(!AudioComponentInstanceDispose(route->unit))route->unit=NULL;else safe=NO;}
    if(route->aggregate&&route->capture){AudioDeviceStop(route->aggregate,route->capture);if(!AudioDeviceDestroyIOProcID(route->aggregate,route->capture))route->capture=NULL;else safe=NO;}
    // Never release callback memory if a driver refuses to unregister its callback.
    if(!safe){PWRouteLastError=@"desktop_route_cleanup";return NO;}
    if(route->aggregate){if(AudioHardwareDestroyAggregateDevice(route->aggregate)){PWRouteLastError=@"desktop_route_cleanup";return NO;}route->aggregate=0;}
    if(@available(macOS 14.2,*)){if(route->tap){if(AudioHardwareDestroyProcessTap(route->tap)){PWRouteLastError=@"desktop_route_cleanup";return NO;}route->tap=0;}}
    free(route->ring);route->ring=NULL;route->active=NO;route->token=nil;route->name=nil;route->process=0;route->phase=0;route->lastCallbacks=0;route->stalledTicks=0;return YES;
}
static void PWRUpdateWatchdog(void){
    BOOL any=NO;for(NSUInteger i=0;i<PW_ROUTE_COUNT;i++)any=any||PWRoutes[i].tap||PWRoutes[i].unit||PWRoutes[i].aggregate;
    if(!any&&PWRouteWatchdog){dispatch_source_cancel(PWRouteWatchdog);PWRouteWatchdog=nil;}
    if(!any||PWRouteWatchdog)return;
    PWRouteWatchdog=dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER,0,0,dispatch_get_global_queue(QOS_CLASS_UTILITY,0));
    dispatch_source_set_timer(PWRouteWatchdog,dispatch_time(DISPATCH_TIME_NOW,NSEC_PER_SEC),NSEC_PER_SEC,100*NSEC_PER_MSEC);
    dispatch_source_set_event_handler(PWRouteWatchdog,^{
        pthread_mutex_lock(&PWRouteLock);
        if(@available(macOS 14.2,*)){
            for(NSUInteger i=0;i<PW_ROUTE_COUNT;i++)if(PWRoutes[i].tap){
                PWRoute *route=&PWRoutes[i];pid_t pid=0;UInt32 alive=0,playing=0;Float64 rate=0;
                BOOL valid=PWRGet(route->process,kAudioProcessPropertyPID,kAudioObjectPropertyScopeGlobal,sizeof(pid),&pid)&&pid==route->pid&&PWRGet(route->output,kAudioDevicePropertyDeviceIsAlive,kAudioObjectPropertyScopeGlobal,sizeof(alive),&alive)&&alive;
                if(valid&&route->unit){AudioStreamBasicDescription output={0};UInt32 bytes=sizeof(output);valid=!AudioUnitGetProperty(route->unit,kAudioUnitProperty_StreamFormat,kAudioUnitScope_Input,0,&output,&bytes)&&PWRGet(route->output,kAudioDevicePropertyNominalSampleRate,kAudioObjectPropertyScopeGlobal,sizeof(rate),&rate)&&fabs(output.mSampleRate-rate)<1;}
                uint64_t callbacks=atomic_load(&route->callbacks);PWRGet(route->process,kAudioProcessPropertyIsRunningOutput,kAudioObjectPropertyScopeGlobal,sizeof(playing),&playing);
                route->stalledTicks=playing&&callbacks==route->lastCallbacks?route->stalledTicks+1:0;route->lastCallbacks=callbacks;
                if(!valid||route->stalledTicks>=5){PWRStop(route);PWRouteLastError=valid?@"desktop_route_stalled":@"desktop_route_expired";}
            }
        }
        PWRUpdateWatchdog();pthread_mutex_unlock(&PWRouteLock);
    });
    dispatch_resume(PWRouteWatchdog);
}
BOOL pinwall_routes_clear(void){atomic_fetch_add(&PWRouteEpoch,1);pthread_mutex_lock(&PWRouteLock);BOOL success=YES;for(NSUInteger i=0;i<PW_ROUTE_COUNT;i++)if(!PWRStop(&PWRoutes[i]))success=NO;PWRUpdateWatchdog();pthread_mutex_unlock(&PWRouteLock);return success;}
static NSArray *PWRProcesses(void){
    if(@available(macOS 14.2,*)){
        AudioObjectPropertyAddress address={kAudioHardwarePropertyProcessObjectList,kAudioObjectPropertyScopeGlobal,0};UInt32 bytes=0;
        if(AudioObjectGetPropertyDataSize(kAudioObjectSystemObject,&address,0,NULL,&bytes)||bytes>4096||bytes%sizeof(AudioObjectID))return @[];
        AudioObjectID objects[1024];if(AudioObjectGetPropertyData(kAudioObjectSystemObject,&address,0,NULL,&bytes,objects))return @[];
        NSMutableArray *result=[NSMutableArray array];
        for(UInt32 i=0;i<bytes/sizeof(AudioObjectID);i++){
            pid_t pid=0;UInt32 output=0;
            if(!PWRGet(objects[i],kAudioProcessPropertyPID,kAudioObjectPropertyScopeGlobal,sizeof(pid),&pid)||pid<=1||pid==getpid()||!PWRGet(objects[i],kAudioProcessPropertyIsRunningOutput,kAudioObjectPropertyScopeGlobal,sizeof(output),&output)||!output)continue;
            NSRunningApplication *app=[NSRunningApplication runningApplicationWithProcessIdentifier:pid];
            NSString *bundle=PWRString(objects[i],kAudioProcessPropertyBundleID);
            if([bundle hasPrefix:@"com.rain9.pinwall"])continue;
            NSString *name=app.localizedName.length?app.localizedName:(bundle.length?bundle:@"Audio process");if(name.length>128)name=[name substringToIndex:128];
            [result addObject:@{@"id":@(objects[i]),@"pid":@(pid),@"name":name}];if(result.count>=128)break;
        }
        return result;
    }
    return @[];
}
static NSDictionary *PWRStart(PWRoute *route,NSDictionary *request){
    if(@available(macOS 14.2,*)){
        AudioObjectID process=[request[@"process"] unsignedIntValue],device=[request[@"device"] unsignedIntValue];pid_t pid=[request[@"pid"] intValue],actual=0;UInt32 alive=0;
        if(pid<=1||pid==getpid()||!PWRGet(process,kAudioProcessPropertyPID,kAudioObjectPropertyScopeGlobal,sizeof(actual),&actual)||actual!=pid||!PWRGet(device,kAudioDevicePropertyDeviceIsAlive,kAudioObjectPropertyScopeGlobal,sizeof(alive),&alive)||!alive)return @{@"error":@"desktop_route_expired"};
        BOOL listed=NO;for(NSDictionary *candidate in PWRProcesses())if([candidate[@"id"] unsignedIntValue]==process&&[candidate[@"pid"] intValue]==pid){listed=YES;route->name=candidate[@"name"];break;}
        if(!listed)return @{@"error":@"desktop_route_expired"};
        NSString *outputUID=PWRString(device,kAudioDevicePropertyDeviceUID);if(!outputUID.length||[outputUID hasPrefix:@"com.pinwall.route."])return @{@"error":@"desktop_route_expired"};
        route->process=process;route->pid=pid;route->output=device;route->token=NSUUID.UUID.UUIDString;
        atomic_store(&route->written,0);atomic_store(&route->read,0);atomic_store(&route->gain,(unsigned int)([request[@"gain"] doubleValue]*10000));atomic_store(&route->callbacks,0);atomic_store(&route->dropped,0);atomic_store(&route->missing,0);
        CATapDescription *description=[[CATapDescription alloc] initStereoMixdownOfProcesses:@[@(process)]];description.name=@"PinWall explicit audio route";description.privateTap=YES;description.muteBehavior=CATapUnmuted;
        OSStatus status=AudioHardwareCreateProcessTap(description,&route->tap);
        if(status)return @{@"error":status=='perm'?@"desktop_route_denied":@"desktop_route_failed"};
        AudioStreamBasicDescription format={0};
        if(!PWRGet(route->tap,kAudioTapPropertyFormat,kAudioObjectPropertyScopeGlobal,sizeof(format),&format)||!PWRFloatStereo(format))return @{@"error":@"desktop_route_format"};
        NSDictionary *aggregate=@{@kAudioAggregateDeviceNameKey:@"PinWall private process route",@kAudioAggregateDeviceUIDKey:[@"com.pinwall.route." stringByAppendingString:route->token],@kAudioAggregateDeviceIsPrivateKey:@YES,@kAudioAggregateDeviceTapAutoStartKey:@YES,@kAudioAggregateDeviceTapListKey:@[@{@kAudioSubTapUIDKey:description.UUID.UUIDString,@kAudioSubTapDriftCompensationKey:@YES}]};
        if(AudioHardwareCreateAggregateDevice((__bridge CFDictionaryRef)aggregate,&route->aggregate))return @{@"error":@"desktop_route_failed"};
        AudioStreamBasicDescription input={0};
        if(!PWRGet(route->aggregate,kAudioDevicePropertyStreamFormat,kAudioDevicePropertyScopeInput,sizeof(input),&input)||!PWRFloatStereo(input))return @{@"error":@"desktop_route_format"};
        route->planar=(input.mFormatFlags&kAudioFormatFlagIsNonInterleaved)!=0;
        Float64 outputRate=0;if(!PWRGet(device,kAudioDevicePropertyNominalSampleRate,kAudioObjectPropertyScopeGlobal,sizeof(outputRate),&outputRate)||!isfinite(outputRate)||outputRate<8000||outputRate>192000)return @{@"error":@"desktop_route_format"};
        route->ratio=input.mSampleRate/outputRate;if(route->ratio<0.125||route->ratio>8)return @{@"error":@"desktop_route_format"};
        route->ring=calloc(PW_RING_FRAMES*2,sizeof(float));if(!route->ring)return @{@"error":@"desktop_route_failed"};
        AudioComponentDescription component={kAudioUnitType_Output,kAudioUnitSubType_HALOutput,kAudioUnitManufacturer_Apple,0,0};AudioComponent found=AudioComponentFindNext(NULL,&component);
        if(!found||AudioComponentInstanceNew(found,&route->unit))return @{@"error":@"desktop_route_failed"};
        UInt32 enabled=1,disabled=0;AudioStreamBasicDescription output={outputRate,kAudioFormatLinearPCM,kAudioFormatFlagIsFloat|kAudioFormatFlagIsPacked,8,1,8,2,32,0};
        if(AudioUnitSetProperty(route->unit,kAudioOutputUnitProperty_EnableIO,kAudioUnitScope_Output,0,&enabled,sizeof(enabled))||AudioUnitSetProperty(route->unit,kAudioOutputUnitProperty_EnableIO,kAudioUnitScope_Input,1,&disabled,sizeof(disabled))||AudioUnitSetProperty(route->unit,kAudioOutputUnitProperty_CurrentDevice,kAudioUnitScope_Global,0,&device,sizeof(device))||AudioUnitSetProperty(route->unit,kAudioUnitProperty_StreamFormat,kAudioUnitScope_Input,0,&output,sizeof(output)))return @{@"error":@"desktop_route_format"};
        AURenderCallbackStruct callback={PWROutput,route};
        if(AudioUnitSetProperty(route->unit,kAudioUnitProperty_SetRenderCallback,kAudioUnitScope_Input,0,&callback,sizeof(callback))||AudioUnitInitialize(route->unit)||AudioDeviceCreateIOProcID(route->aggregate,PWRCapture,route,&route->capture)||AudioDeviceStart(route->aggregate,route->capture)||AudioOutputUnitStart(route->unit))return @{@"error":@"desktop_route_failed"};
        // Only mute the original path once both ends exist. Destroying/stopping this tap restores it.
        description.muteBehavior=CATapMutedWhenTapped;AudioObjectPropertyAddress address={kAudioTapPropertyDescription,kAudioObjectPropertyScopeGlobal,0};CFTypeRef reference=(__bridge CFTypeRef)description;
        if(AudioObjectSetPropertyData(route->tap,&address,0,NULL,sizeof(reference),&reference))return @{@"error":@"desktop_route_failed"};
        route->active=YES;return nil;
    }
    return @{@"error":@"desktop_unsupported"};
}
NSDictionary *pinwall_routes_request(NSDictionary *request){
    pthread_mutex_lock(&PWRouteLock);
    @try{
        if([request[@"epoch"] unsignedLongLongValue]!=atomic_load(&PWRouteEpoch))return @{@"error":@"tool_cancelled"};
        if(@available(macOS 14.2,*)){
            NSString *method=request[@"method"];NSDictionary *error=nil;
            if([method isEqual:@"start"]){
                PWRoute *slot=NULL;
                for(NSUInteger i=0;i<PW_ROUTE_COUNT;i++){
                    if(PWRoutes[i].active&&PWRoutes[i].process==[request[@"process"] unsignedIntValue])return @{@"error":@"desktop_route_duplicate"};
                    if(!PWRoutes[i].active&&!PWRoutes[i].tap&&!PWRoutes[i].unit&&!PWRoutes[i].aggregate&&!slot)slot=&PWRoutes[i];
                }
                if(!slot)return @{@"error":@"desktop_route_limit"};
                PWRouteLastError=nil;@try{error=PWRStart(slot,request);}@catch(NSException *exception){(void)exception;error=@{@"error":@"desktop_route_failed"};}if(error)PWRStop(slot);PWRUpdateWatchdog();
            }else if([method isEqual:@"stopAll"]){BOOL stopped=YES;for(NSUInteger i=0;i<PW_ROUTE_COUNT;i++)if(!PWRStop(&PWRoutes[i]))stopped=NO;PWRUpdateWatchdog();if(!stopped)return @{@"error":@"desktop_route_cleanup"};}
            else if([method isEqual:@"stop"]||[method isEqual:@"gain"]){
                PWRoute *selected=NULL;for(NSUInteger i=0;i<PW_ROUTE_COUNT;i++)if([PWRoutes[i].token isEqual:request[@"token"]]){selected=&PWRoutes[i];break;}
                if(!selected)return @{@"error":@"desktop_route_expired"};
                if([method isEqual:@"stop"]){if(!PWRStop(selected))return @{@"error":@"desktop_route_cleanup"};PWRUpdateWatchdog();}else atomic_store(&selected->gain,(unsigned int)([request[@"gain"] doubleValue]*10000));
            }else if(![method isEqual:@"list"])return @{@"error":@"desktop_invalid_action"};
            PWRUpdateWatchdog();if(error)return error;
            NSMutableArray *routes=[NSMutableArray array];
            for(NSUInteger i=0;i<PW_ROUTE_COUNT;i++)if(PWRoutes[i].active){
                PWRoute *route=&PWRoutes[i];pid_t current=0;UInt32 alive=0;
                if(!PWRGet(route->process,kAudioProcessPropertyPID,kAudioObjectPropertyScopeGlobal,sizeof(current),&current)||current!=route->pid||!PWRGet(route->output,kAudioDevicePropertyDeviceIsAlive,kAudioObjectPropertyScopeGlobal,sizeof(alive),&alive)||!alive){PWRStop(route);continue;}
                [routes addObject:@{@"token":route->token,@"name":route->name?:@"Audio process",@"process":@(route->process),@"device":@(route->output),@"gain":@(atomic_load(&route->gain)/10000.0),@"callbacks":@(atomic_load(&route->callbacks)),@"dropped":@(atomic_load(&route->dropped)),@"missing":@(atomic_load(&route->missing))}];
            }
            return @{@"supported":@YES,@"processes":PWRProcesses(),@"routes":routes,@"lastError":PWRouteLastError?:NSNull.null};
        }
        return @{@"supported":@NO,@"processes":@[],@"routes":@[],@"lastError":NSNull.null};
    }@finally{pthread_mutex_unlock(&PWRouteLock);}
}
// Synthetic DSP verification; never creates a tap, opens a device or accesses real audio.
int pinwall_route_dsp_test(void){
    PWRoute route={0};route.ring=calloc(PW_RING_FRAMES*2,sizeof(float));if(!route.ring)return 0;
    route.ratio=0.5;atomic_store(&route.gain,5000);for(unsigned i=0;i<16;i++){route.ring[i*2]=0.8;route.ring[i*2+1]=-0.4;}atomic_store(&route.written,16);
    float output[64]={0};PWRRenderSamples(&route,output,16);BOOL valid=atomic_load(&route.read)==8;
    for(unsigned i=0;i<16;i++)valid=valid&&fabsf(output[i*2]-0.4f)<0.0001f&&fabsf(output[i*2+1]+0.2f)<0.0001f;
    atomic_store(&route.gain,0);PWRRenderSamples(&route,output,32);for(unsigned i=0;i<64;i++)valid=valid&&output[i]==0;
    valid=valid&&atomic_load(&route.missing)>0;free(route.ring);return valid?1:0;
}
