// Original implementation using public ScreenCaptureKit/CoreImage/Metal APIs.
// A deliberately bounded EDR mirror; no persisted images, global brightness writes or input hooks.
#import <AppKit/AppKit.h>
#import <ScreenCaptureKit/ScreenCaptureKit.h>
#import <CoreImage/CoreImage.h>
#import <Metal/Metal.h>
#import <QuartzCore/CAMetalLayer.h>
#import <CoreMedia/CoreMedia.h>
#import <stdatomic.h>
#import <math.h>
static atomic_ullong PWDisplayEpoch=0;
static NSDictionary *PDError(NSString *code){return @{@"error":code};}
static CGSize PDPixels(CGSize pixels){double scale=fmin(1,fmin(4096/fmax(1,pixels.width),fmin(4096/fmax(1,pixels.height),sqrt(4000000/fmax(1,pixels.width*pixels.height)))));return CGSizeMake(fmax(1,floor(pixels.width*scale)),fmax(1,floor(pixels.height*scale)));}
int pinwall_display_geometry_test(void){for(int i=1;i<=16;i++){CGSize size=PDPixels(CGSizeMake(1920*i,1080*i));if(size.width*size.height>4000000||size.width>4096||size.height>4096)return 0;}CGSize wide=PDPixels(CGSizeMake(12000,500));return wide.width<=4096&&wide.height>=1?1:0;}
API_AVAILABLE(macos(14.0))
@interface PWEDRSession:NSObject<SCStreamOutput,SCStreamDelegate>
@property(atomic) BOOL stopped;
@property(atomic) BOOL frameBusy;
@property(atomic) NSTimeInterval lastFrame;
@property NSPanel *panel;
@property CAMetalLayer *layer;
@property SCStream *stream;
@property CIContext *context;
@property id<MTLCommandQueue> commands;
@property dispatch_source_t timer;
@property NSArray *observers;
@property NSScreen *screen;
@property double gain;
@property NSTimeInterval deadline;
@property NSTimeInterval began;
@property unsigned long long epoch;
-(void)stop;
@end
static PWEDRSession *PDActive API_AVAILABLE(macos(14.0));
static PWEDRSession *PDStarting API_AVAILABLE(macos(14.0));
static PWEDRSession *PDStopping API_AVAILABLE(macos(14.0));
static NSString *PDLastError;
@implementation PWEDRSession
-(void)stop {
    NSAssert(NSThread.isMainThread,@"main queue required");
    self.stopped=YES;
    [self.panel orderOut:nil];[self.panel close];self.panel=nil;
    if(self.timer){dispatch_source_cancel(self.timer);self.timer=nil;}
    for(id observer in self.observers){[NSNotificationCenter.defaultCenter removeObserver:observer];[NSWorkspace.sharedWorkspace.notificationCenter removeObserver:observer];[NSDistributedNotificationCenter.defaultCenter removeObserver:observer];}self.observers=nil;
    SCStream *stream=self.stream;self.stream=nil;
    if(stream){PDStopping=self;[stream stopCaptureWithCompletionHandler:^(NSError *error){dispatch_async(dispatch_get_main_queue(),^{if(!error&&PDStopping==self)PDStopping=nil;else if(error){PDLastError=@"display_cleanup";NSLog(@"[DisplayTools] Screen stream cleanup requires restart");}});}];}
    if(PDActive==self)PDActive=nil;
}
-(void)stream:(SCStream *)stream didStopWithError:(NSError *)error {(void)stream;(void)error;dispatch_async(dispatch_get_main_queue(),^{[self stop];});}
-(void)stream:(SCStream *)stream didOutputSampleBuffer:(CMSampleBufferRef)sample ofType:(SCStreamOutputType)type {
    (void)stream;if(type!=SCStreamOutputTypeScreen||self.stopped||self.frameBusy||!CMSampleBufferIsValid(sample))return;
    CVPixelBufferRef buffer=CMSampleBufferGetImageBuffer(sample);if(!buffer||CVPixelBufferGetWidth(buffer)>4096||CVPixelBufferGetHeight(buffer)>4096)return;
    NSArray *attachments=CFBridgingRelease(CMSampleBufferGetSampleAttachmentsArray(sample,NO)?CFRetain(CMSampleBufferGetSampleAttachmentsArray(sample,NO)):NULL);
    if(attachments.count&&[attachments[0][SCStreamFrameInfoStatus] integerValue]!=SCFrameStatusComplete)return;
    self.frameBusy=YES;
    @autoreleasepool {
        id<CAMetalDrawable> drawable=[self.layer nextDrawable];
        id<MTLCommandBuffer> command=[self.commands commandBuffer];
        if(!drawable||!command){self.frameBusy=NO;return;}
        CIImage *input=[CIImage imageWithCVPixelBuffer:buffer];
        // EDR values > 1.0 are rendered into a floating point Metal layer in linear sRGB.
        CIImage *image=[input imageByApplyingFilter:@"CIExposureAdjust" withInputParameters:@{kCIInputEVKey:@(log2(self.gain))}];
        double x=drawable.texture.width/input.extent.size.width,y=drawable.texture.height/input.extent.size.height;
        image=[image imageByApplyingTransform:CGAffineTransformMakeScale(x,y)];
        CGColorSpaceRef space=CGColorSpaceCreateWithName(kCGColorSpaceExtendedLinearSRGB);
        [self.context render:image toMTLTexture:drawable.texture commandBuffer:command bounds:CGRectMake(0,0,drawable.texture.width,drawable.texture.height) colorSpace:space];CGColorSpaceRelease(space);
        [command presentDrawable:drawable];
        [command addCompletedHandler:^(id<MTLCommandBuffer> finished){(void)image;self.frameBusy=NO;if(finished.status==MTLCommandBufferStatusCompleted){self.lastFrame=NSProcessInfo.processInfo.systemUptime;dispatch_async(dispatch_get_main_queue(),^{if(!self.stopped)self.panel.alphaValue=1;});}else dispatch_async(dispatch_get_main_queue(),^{[self stop];});}];
        [command commit];
    }
}
@end
static NSArray *PDDisplays(void){
    NSMutableArray *items=[NSMutableArray new];
    for(NSScreen *screen in NSScreen.screens){
        double potential=1,current=1;NSString *name=@"Display";if(@available(macOS 10.15,*)){potential=screen.maximumPotentialExtendedDynamicRangeColorComponentValue;current=screen.maximumExtendedDynamicRangeColorComponentValue;name=screen.localizedName?:name;}
        NSNumber *display=screen.deviceDescription[@"NSScreenNumber"];
        [items addObject:@{@"id":display,@"name":[name substringToIndex:MIN(name.length,256)],@"potential":@(fmin(10,fmax(1,potential))),@"current":@(fmin(10,fmax(1,current)))}];if(items.count>=16)break;
    }return items;
}
static NSDictionary *PDStatus(void){
    if(@available(macOS 14.0,*))return @{@"active":@((BOOL)(PDActive&&!PDActive.stopped)),@"starting":@((BOOL)(PDStarting!=nil||PDStopping!=nil)),@"lastError":PDLastError?:NSNull.null,@"display":PDActive.screen.deviceDescription[@"NSScreenNumber"]?:@0,@"gain":@(PDActive?PDActive.gain:1),@"remaining":@(PDActive?fmax(0,PDActive.deadline-NSProcessInfo.processInfo.systemUptime):0)};
    return @{@"active":@NO,@"starting":@NO,@"lastError":NSNull.null,@"display":@0,@"gain":@1,@"remaining":@0};
}
static NSDictionary *PDStart(NSDictionary *request){
    if(@available(macOS 14.0,*)){
        if(!CGPreflightScreenCaptureAccess()){CGRequestScreenCaptureAccess();return PDError(@"desktop_screen_denied");}
        dispatch_semaphore_t completed=dispatch_semaphore_create(0);__block NSDictionary *result=nil;
        unsigned long long epoch=[request[@"epoch"] unsignedLongLongValue];
        dispatch_async(dispatch_get_main_queue(),^{
            if(epoch!=atomic_load(&PWDisplayEpoch)){result=PDError(@"tool_cancelled");dispatch_semaphore_signal(completed);return;}
            if(PDActive||PDStarting||PDStopping){result=PDError(@"display_busy");dispatch_semaphore_signal(completed);return;}
            NSScreen *selected=nil;for(NSScreen *s in NSScreen.screens)if([s.deviceDescription[@"NSScreenNumber"] isEqual:request[@"display"]]){selected=s;break;}
            double gain=[request[@"gain"] doubleValue],seconds=[request[@"seconds"] doubleValue];
            if(!selected||!isfinite(gain)||gain<1.05||gain>2||!isfinite(seconds)||seconds<15||seconds>300||selected.maximumPotentialExtendedDynamicRangeColorComponentValue<gain){result=PDError(@"display_unavailable");dispatch_semaphore_signal(completed);return;}
            id<MTLDevice> device=MTLCreateSystemDefaultDevice();if(!device){result=PDError(@"display_unavailable");dispatch_semaphore_signal(completed);return;}
            PDLastError=nil;PWEDRSession *session=[PWEDRSession new];session.epoch=epoch;session.gain=gain;session.screen=selected;session.began=NSProcessInfo.processInfo.systemUptime;session.lastFrame=session.began;session.deadline=session.began+seconds;
            session.commands=[device newCommandQueue];session.context=[CIContext contextWithMTLDevice:device options:@{kCIContextCacheIntermediates:@NO}];
            NSPanel *panel=[[NSPanel alloc] initWithContentRect:selected.frame styleMask:NSWindowStyleMaskBorderless|NSWindowStyleMaskNonactivatingPanel backing:NSBackingStoreBuffered defer:NO];
            panel.releasedWhenClosed=NO;panel.ignoresMouseEvents=YES;panel.hidesOnDeactivate=NO;panel.level=NSStatusWindowLevel+1;panel.collectionBehavior=NSWindowCollectionBehaviorCanJoinAllSpaces|NSWindowCollectionBehaviorFullScreenAuxiliary|NSWindowCollectionBehaviorStationary|NSWindowCollectionBehaviorIgnoresCycle;panel.alphaValue=0.01;panel.backgroundColor=NSColor.clearColor;
            CAMetalLayer *layer=[CAMetalLayer layer];layer.device=device;layer.pixelFormat=MTLPixelFormatRGBA16Float;layer.framebufferOnly=NO;layer.wantsExtendedDynamicRangeContent=YES;layer.maximumDrawableCount=2;
            CGSize pixels=CGSizeMake(selected.frame.size.width*selected.backingScaleFactor,selected.frame.size.height*selected.backingScaleFactor);layer.drawableSize=PDPixels(pixels);
            CGColorSpaceRef cs=CGColorSpaceCreateWithName(kCGColorSpaceExtendedLinearSRGB);layer.colorspace=cs;CGColorSpaceRelease(cs);layer.frame=panel.contentView.bounds;panel.contentView.wantsLayer=YES;panel.contentView.layer=layer;
            session.panel=panel;session.layer=layer;PDStarting=session;[panel orderFrontRegardless];
            [SCShareableContent getShareableContentExcludingDesktopWindows:NO onScreenWindowsOnly:NO completionHandler:^(SCShareableContent *content,NSError *error){dispatch_async(dispatch_get_main_queue(),^{
                if(session.stopped||session.epoch!=atomic_load(&PWDisplayEpoch)||error){[session stop];PDStarting=nil;result=PDError(@"display_unavailable");dispatch_semaphore_signal(completed);return;}
                SCDisplay *display=nil;SCWindow *overlay=nil;for(SCDisplay *d in content.displays)if(d.displayID==[request[@"display"] unsignedIntValue])display=d;for(SCWindow *w in content.windows)if(w.windowID==(CGWindowID)panel.windowNumber&&w.owningApplication.processID==getpid())overlay=w;
                if(!display||!overlay){[session stop];PDStarting=nil;result=PDError(@"display_unavailable");dispatch_semaphore_signal(completed);return;}
                SCContentFilter *filter=[[SCContentFilter alloc] initWithDisplay:display excludingWindows:@[overlay]];
                SCStreamConfiguration *config=[SCStreamConfiguration new];config.width=(size_t)layer.drawableSize.width;config.height=(size_t)layer.drawableSize.height;config.minimumFrameInterval=CMTimeMake(1,15);config.queueDepth=3;config.pixelFormat=kCVPixelFormatType_32BGRA;config.showsCursor=NO;config.capturesAudio=NO;
                SCStream *stream=[[SCStream alloc] initWithFilter:filter configuration:config delegate:session];session.stream=stream;
                NSError *outputError=nil;if(![stream addStreamOutput:session type:SCStreamOutputTypeScreen sampleHandlerQueue:dispatch_queue_create("com.rain9.pinwall.edr.frames",DISPATCH_QUEUE_SERIAL) error:&outputError]){[session stop];PDStarting=nil;result=PDError(@"display_unavailable");dispatch_semaphore_signal(completed);return;}
                [stream startCaptureWithCompletionHandler:^(NSError *startError){dispatch_async(dispatch_get_main_queue(),^{
                    PDStarting=nil;
                    if(startError||session.stopped||session.epoch!=atomic_load(&PWDisplayEpoch)){[session stop];result=PDError(@"display_unavailable");dispatch_semaphore_signal(completed);return;}
                    PDActive=session;
                    NSMutableArray *observers=[NSMutableArray new];
                    for(NSString *name in @[NSWorkspaceWillSleepNotification,NSWorkspaceSessionDidResignActiveNotification]){[observers addObject:[NSWorkspace.sharedWorkspace.notificationCenter addObserverForName:name object:nil queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification *note){(void)note;[session stop];}]];}
                    [observers addObject:[NSNotificationCenter.defaultCenter addObserverForName:NSApplicationDidChangeScreenParametersNotification object:nil queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification *note){(void)note;[session stop];}]];
                    [observers addObject:[NSDistributedNotificationCenter.defaultCenter addObserverForName:@"com.apple.screenIsLocked" object:nil queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification *note){(void)note;[session stop];}]];session.observers=observers;
                    dispatch_source_t timer=dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER,0,0,dispatch_get_main_queue());session.timer=timer;dispatch_source_set_timer(timer,dispatch_time(DISPATCH_TIME_NOW,NSEC_PER_SEC),NSEC_PER_SEC,100*NSEC_PER_MSEC);
                    dispatch_source_set_event_handler(timer,^{NSTimeInterval time=NSProcessInfo.processInfo.systemUptime;if(time>=session.deadline||time-session.lastFrame>5||(time-session.began>5&&session.screen.maximumExtendedDynamicRangeColorComponentValue<1.05)||session.screen.maximumPotentialExtendedDynamicRangeColorComponentValue<session.gain||NSProcessInfo.processInfo.thermalState>=NSProcessInfoThermalStateSerious||!CGPreflightScreenCaptureAccess())[session stop];});dispatch_resume(timer);
                    result=PDStatus();dispatch_semaphore_signal(completed);
                });}];
            });}];
        });
        if(dispatch_semaphore_wait(completed,dispatch_time(DISPATCH_TIME_NOW,10*NSEC_PER_SEC))){atomic_fetch_add(&PWDisplayEpoch,1);dispatch_async(dispatch_get_main_queue(),^{[PDStarting stop];[PDActive stop];});return PDError(@"desktop_timeout");}return result?:PDError(@"display_unavailable");
    }return PDError(@"desktop_unsupported");
}
unsigned long long pinwall_display_generation(void){return atomic_load(&PWDisplayEpoch);}
void pinwall_display_clear(void){atomic_fetch_add(&PWDisplayEpoch,1);dispatch_async(dispatch_get_main_queue(),^{if(@available(macOS 14.0,*)){[PDStarting stop];[PDActive stop];}});}
NSDictionary *pinwall_display_request(NSDictionary *request){
    NSString *method=request[@"method"];
    if([method isEqual:@"start"])return PDStart(request);
    __block NSDictionary *result=nil;dispatch_sync(dispatch_get_main_queue(),^{
        if([method isEqual:@"list"])result=@{@"displays":PDDisplays()};
        else if([method isEqual:@"status"])result=PDStatus();
        else if([method isEqual:@"stop"]){atomic_fetch_add(&PWDisplayEpoch,1);if(@available(macOS 14.0,*)){[PDStarting stop];[PDActive stop];}result=PDStatus();}
        else result=PDError(@"desktop_invalid_action");
    });return result;
}
