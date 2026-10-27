// Public macOS APIs only. Called serially by the Rust host; no renderer-supplied code.
#import <AppKit/AppKit.h>
#import <CoreAudio/CoreAudio.h>
#import <ApplicationServices/ApplicationServices.h>
#import <ScreenCaptureKit/ScreenCaptureKit.h>
#import <UserNotifications/UserNotifications.h>
#include <stdatomic.h>
#include <unistd.h>

static NSDictionary *PWError(NSString *code) { return @{ @"error": code }; }
static NSString *PWString(NSString *value, NSUInteger max) {
    if (![value isKindOfClass:NSString.class]) return @"";
    return value.length > max ? [value substringToIndex:max] : value;
}
static AudioObjectPropertyAddress PWAddress(AudioObjectPropertySelector selector, AudioObjectPropertyScope scope, UInt32 element) {
    return (AudioObjectPropertyAddress){selector, scope, element};
}
static BOOL PWGet(AudioObjectID object, AudioObjectPropertySelector selector, AudioObjectPropertyScope scope, UInt32 element, UInt32 size, void *value) {
    AudioObjectPropertyAddress address = PWAddress(selector, scope, element);
    return AudioObjectGetPropertyData(object, &address, 0, NULL, &size, value) == noErr;
}
static NSArray<NSNumber *> *PWObjects(AudioObjectID object, AudioObjectPropertySelector selector, AudioObjectPropertyScope scope) {
    AudioObjectPropertyAddress address = PWAddress(selector, scope, 0); UInt32 bytes = 0;
    if (AudioObjectGetPropertyDataSize(object, &address, 0, NULL, &bytes) || bytes > 4096 || bytes % sizeof(AudioObjectID)) return @[];
    AudioObjectID ids[1024];
    if (AudioObjectGetPropertyData(object, &address, 0, NULL, &bytes, ids)) return @[];
    NSMutableArray *result = [NSMutableArray array];
    for (UInt32 i=0; i<bytes/sizeof(AudioObjectID); i++) [result addObject:@(ids[i])];
    return result;
}
static NSString *PWAudioString(AudioObjectID object, AudioObjectPropertySelector selector) {
    CFStringRef value = NULL;
    if (!PWGet(object, selector, kAudioObjectPropertyScopeGlobal, 0, sizeof(value), &value) || !value) return @"";
    return CFBridgingRelease(value);
}
static BOOL PWSettable(AudioObjectID object, AudioObjectPropertySelector selector, AudioObjectPropertyScope scope) {
    AudioObjectPropertyAddress address = PWAddress(selector, scope, 0); Boolean writable = false;
    return !AudioObjectIsPropertySettable(object, &address, &writable) && writable;
}
static BOOL PWSet(AudioObjectID object, AudioObjectPropertySelector selector, AudioObjectPropertyScope scope, UInt32 size, const void *value) {
    AudioObjectPropertyAddress address = PWAddress(selector, scope, 0);
    return PWSettable(object, selector, scope) && !AudioObjectSetPropertyData(object, &address, 0, NULL, size, value);
}

// Prefer the master control; stereo-only hardware exposes separate channel controls.
static NSArray<NSNumber *> *PWVolumeElements(AudioObjectID device, AudioObjectPropertyScope scope) {
    Float32 value=0;
    if(PWGet(device,kAudioDevicePropertyVolumeScalar,scope,0,sizeof(value),&value))return @[@0];
    UInt32 stereo[2]={1,2};
    PWGet(device,kAudioDevicePropertyPreferredChannelsForStereo,scope,0,sizeof(stereo),stereo);
    NSMutableArray *channels=[NSMutableArray array];
    for(UInt32 i=0;i<2;i++)if(stereo[i]<=32&&stereo[i]>0&&PWGet(device,kAudioDevicePropertyVolumeScalar,scope,stereo[i],sizeof(value),&value)&&![channels containsObject:@(stereo[i])])[channels addObject:@(stereo[i])];
    return channels;
}
static BOOL PWVolumeWritable(AudioObjectID device, AudioObjectPropertyScope scope, NSArray<NSNumber *> *elements) {
    if(!elements.count)return NO;
    for(NSNumber *element in elements){AudioObjectPropertyAddress address=PWAddress(kAudioDevicePropertyVolumeScalar,scope,element.unsignedIntValue);Boolean writable=false;if(AudioObjectIsPropertySettable(device,&address,&writable)||!writable)return NO;}
    return YES;
}
static BOOL PWVolumeRead(AudioObjectID device, AudioObjectPropertyScope scope, Float32 *value) {
    NSArray *elements=PWVolumeElements(device,scope);if(!elements.count)return NO;*value=0;
    for(NSNumber *element in elements){Float32 channel=0;if(!PWGet(device,kAudioDevicePropertyVolumeScalar,scope,element.unsignedIntValue,sizeof(channel),&channel)||!isfinite(channel)||channel<0||channel>1)return NO;*value=fmaxf(*value,channel);}
    return YES;
}
static BOOL PWVolumeWrite(AudioObjectID device, AudioObjectPropertyScope scope, Float32 value) {
    NSArray *elements=PWVolumeElements(device,scope);if(!PWVolumeWritable(device,scope,elements))return NO;
    Float32 old[2]={0},peak=0;for(NSUInteger i=0;i<elements.count;i++){if(!PWGet(device,kAudioDevicePropertyVolumeScalar,scope,[elements[i] unsignedIntValue],sizeof(old[i]),&old[i]))return NO;peak=fmaxf(peak,old[i]);}
    for(NSUInteger i=0;i<elements.count;i++){
        AudioObjectPropertyAddress address=PWAddress(kAudioDevicePropertyVolumeScalar,scope,[elements[i] unsignedIntValue]);Float32 next=peak>0?value*old[i]/peak:value;
        if(AudioObjectSetPropertyData(device,&address,0,NULL,sizeof(next),&next)){
            for(NSUInteger j=0;j<i;j++){AudioObjectPropertyAddress previous=PWAddress(kAudioDevicePropertyVolumeScalar,scope,[elements[j] unsignedIntValue]);AudioObjectSetPropertyData(device,&previous,0,NULL,sizeof(old[j]),&old[j]);}
            return NO;
        }
    }
    return YES;
}
static NSArray *PWDevices(void) {
    NSMutableArray *result = [NSMutableArray array];
    AudioObjectID defaultInput=0, defaultOutput=0;
    PWGet(kAudioObjectSystemObject, kAudioHardwarePropertyDefaultInputDevice, kAudioObjectPropertyScopeGlobal, 0, sizeof(defaultInput), &defaultInput);
    PWGet(kAudioObjectSystemObject, kAudioHardwarePropertyDefaultOutputDevice, kAudioObjectPropertyScopeGlobal, 0, sizeof(defaultOutput), &defaultOutput);
    for (NSNumber *number in PWObjects(kAudioObjectSystemObject, kAudioHardwarePropertyDevices, kAudioObjectPropertyScopeGlobal)) {
        AudioObjectID device=number.unsignedIntValue; UInt32 alive=0;
        if (!PWGet(device,kAudioDevicePropertyDeviceIsAlive,kAudioObjectPropertyScopeGlobal,0,sizeof(alive),&alive) || !alive) continue;
        NSString *uid=PWAudioString(device,kAudioDevicePropertyDeviceUID);
        if (!uid.length || [uid hasPrefix:@"com.pinwall.route."]) continue;
        for (NSString *direction in @[@"input",@"output"]) {
            AudioObjectPropertyScope scope=[direction isEqual:@"input"] ? kAudioDevicePropertyScopeInput : kAudioDevicePropertyScopeOutput;
            if (!PWObjects(device,kAudioDevicePropertyStreams,scope).count) continue;
            Float32 volume=0; UInt32 muted=0;
            BOOL hasVolume=PWVolumeRead(device,scope,&volume);
            BOOL hasMute=PWGet(device,kAudioDevicePropertyMute,scope,0,sizeof(muted),&muted);
            [result addObject:@{@"id":number,@"name":PWString(PWAudioString(device,kAudioObjectPropertyName),256),@"direction":direction,
                @"isDefault":@((BOOL)(device==([direction isEqual:@"input"]?defaultInput:defaultOutput))),
                @"volume":hasVolume?@(volume):NSNull.null,@"muted":hasMute?@((BOOL)(muted!=0)):NSNull.null,
                @"canVolume":@((BOOL)(hasVolume&&PWVolumeWritable(device,scope,PWVolumeElements(device,scope)))),
                @"canMute":@((BOOL)(hasMute&&PWSettable(device,kAudioDevicePropertyMute,scope)))}];
            if (result.count>=128) return result;
        }
    }
    return result;
}
static NSDictionary *PWAudio(NSDictionary *request) {
    NSString *method=request[@"method"];
    if (![method isEqual:@"list"]) {
        NSNumber *device=request[@"device"]; NSString *direction=request[@"direction"];
        NSDictionary *found=nil;
        for (NSDictionary *candidate in PWDevices()) if ([candidate[@"id"] isEqual:device] && [candidate[@"direction"] isEqual:direction]) { found=candidate; break; }
        if (!found) return PWError(@"desktop_device_missing");
        AudioObjectID id=device.unsignedIntValue;
        AudioObjectPropertyScope scope=[direction isEqual:@"input"]?kAudioDevicePropertyScopeInput:kAudioDevicePropertyScopeOutput;
        BOOL success=NO;
        if ([method isEqual:@"default"]) {
            AudioObjectPropertySelector selector=[direction isEqual:@"input"]?kAudioHardwarePropertyDefaultInputDevice:kAudioHardwarePropertyDefaultOutputDevice;
            success=PWSet(kAudioObjectSystemObject,selector,kAudioObjectPropertyScopeGlobal,sizeof(id),&id);
        } else if ([method isEqual:@"volume"]) {
            Float32 volume=[request[@"value"] floatValue];
            success=isfinite(volume)&&volume>=0&&volume<=1&&PWVolumeWrite(id,scope,volume);
        } else if ([method isEqual:@"mute"]) {
            UInt32 muted=[request[@"muted"] boolValue];
            success=PWSet(id,kAudioDevicePropertyMute,scope,sizeof(muted),&muted);
        }
        if (!success) return PWError(@"desktop_device_readonly");
    }
    return @{@"devices":PWDevices()};
}

// Media automation is limited to running Music/Spotify. Never launches an application.
static NSDictionary *PWMedia(NSDictionary *request) {
    NSString *method=request[@"method"], *player=request[@"player"];
    NSArray *players=@[@"com.apple.Music",@"com.spotify.client"];
    if ([method isEqual:@"players"]) {
        NSMutableArray *running=[NSMutableArray array];
        for (NSString *bundle in players) if ([NSRunningApplication runningApplicationsWithBundleIdentifier:bundle].count) [running addObject:bundle];
        return @{@"players":running};
    }
    if (![players containsObject:player] || ![NSRunningApplication runningApplicationsWithBundleIdentifier:player].count) return PWError(@"desktop_player_missing");
    NSString *body=nil;
    if ([method isEqual:@"info"]) body=@"if player state is stopped then\nreturn {\"\", \"\", \"\", false, 0, 0}\nend if\nreturn {name of current track, artist of current track, album of current track, player state is playing, player position, duration of current track}";
    else {
        NSDictionary *commands=@{@"play":@"play",@"pause":@"pause",@"toggle":@"playpause",@"next":@"next track",@"previous":@"previous track"};
        body=commands[request[@"action"]];
        if (!body) return PWError(@"desktop_invalid_action");
    }
    NSString *source=[NSString stringWithFormat:@"with timeout of 5 seconds\ntell application id \"%@\"\n%@\nend tell\nend timeout",player,body];
    NSDictionary *error=nil;
    NSAppleEventDescriptor *reply=[[[NSAppleScript alloc] initWithSource:source] executeAndReturnError:&error];
    if (!reply || error) return PWError([error[NSAppleScriptErrorNumber] intValue]==-1743?@"desktop_automation_denied":@"desktop_media_failed");
    if (![method isEqual:@"info"]) return @{@"ok":@YES};
    double duration=[[reply descriptorAtIndex:6] doubleValue];
    if ([player isEqual:@"com.spotify.client"]) duration/=1000;
    return @{@"trackName":PWString([[reply descriptorAtIndex:1] stringValue],512),@"artistName":PWString([[reply descriptorAtIndex:2] stringValue],512),
             @"albumName":PWString([[reply descriptorAtIndex:3] stringValue],512),@"isPlaying":@([[reply descriptorAtIndex:4] booleanValue]),
             @"position":@(fmax(0,[[reply descriptorAtIndex:5] doubleValue])),@"duration":@(fmax(0,duration))};
}


static atomic_ulong PWEpoch;
static NSMutableDictionary<NSString *,NSDictionary *> *PWWindows;
static NSMutableDictionary<NSString *,NSDictionary *> *PWUndo;
static id PWAXCopy(AXUIElementRef element, CFStringRef attribute) {
    CFTypeRef value=NULL;
    return AXUIElementCopyAttributeValue(element,attribute,&value)==kAXErrorSuccess ? CFBridgingRelease(value) : nil;
}
static BOOL PWRect(AXUIElementRef element, CGRect *rect) {
    id position=PWAXCopy(element,kAXPositionAttribute),size=PWAXCopy(element,kAXSizeAttribute);
    if (!position || !size || CFGetTypeID((__bridge CFTypeRef)position)!=AXValueGetTypeID() || CFGetTypeID((__bridge CFTypeRef)size)!=AXValueGetTypeID()) return NO;
    CGPoint point;CGSize dimensions;
    if (!AXValueGetValue((__bridge AXValueRef)position,kAXValueCGPointType,&point) || !AXValueGetValue((__bridge AXValueRef)size,kAXValueCGSizeType,&dimensions)) return NO;
    *rect=(CGRect){point,dimensions};return YES;
}
static BOOL PWMove(AXUIElementRef element, CGRect rect) {
    AXValueRef position=AXValueCreate(kAXValueCGPointType,&rect.origin),size=AXValueCreate(kAXValueCGSizeType,&rect.size);
    if (!position || !size) { if(position)CFRelease(position);if(size)CFRelease(size);return NO; }
    AXError a=AXUIElementSetAttributeValue(element,kAXSizeAttribute,size),b=AXUIElementSetAttributeValue(element,kAXPositionAttribute,position);
    // Applications may clamp a resize to the old screen, so apply the size again after moving.
    AXError c=AXUIElementSetAttributeValue(element,kAXSizeAttribute,size);
    CFRelease(position);CFRelease(size);return a==kAXErrorSuccess&&b==kAXErrorSuccess&&c==kAXErrorSuccess;
}
static NSArray *PWScreens(void) {
    CGFloat top=NSMaxY(NSScreen.screens.firstObject.frame);NSMutableArray *result=[NSMutableArray array];
    for(NSScreen *screen in NSScreen.screens) {
        NSRect frame=screen.visibleFrame;NSString *name=@"Display";if(@available(macOS 10.15,*))name=screen.localizedName;
        [result addObject:@{@"id":screen.deviceDescription[@"NSScreenNumber"],@"name":PWString(name,128),
            @"x":@(frame.origin.x),@"y":@(top-NSMaxY(frame)),@"width":@(frame.size.width),@"height":@(frame.size.height)}];
    }
    return result;
}
static NSDictionary *PWWindowList(void) {
    if (!AXIsProcessTrusted()) return @{@"permitted":@NO,@"windows":@[],@"screens":PWScreens()};
    NSDictionary *previous=PWWindows;PWWindows=[NSMutableDictionary dictionary];if(!PWUndo)PWUndo=[NSMutableDictionary dictionary];
    NSArray *cg=CFBridgingRelease(CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly|kCGWindowListExcludeDesktopElements,kCGNullWindowID));
    NSMutableArray *result=[NSMutableArray array];CFAbsoluteTime deadline=CFAbsoluteTimeGetCurrent()+3;
    NSUInteger apps=0;
    for(NSRunningApplication *app in NSWorkspace.sharedWorkspace.runningApplications) {
        if(app.processIdentifier==getpid()||app.activationPolicy!=NSApplicationActivationPolicyRegular||app.terminated)continue;
        if(++apps>64||CFAbsoluteTimeGetCurrent()>deadline)break;
        AXUIElementRef application=AXUIElementCreateApplication(app.processIdentifier);AXUIElementSetMessagingTimeout(application,0.15);
        id windows=PWAXCopy(application,kAXWindowsAttribute);CFRelease(application);
        if(![windows isKindOfClass:NSArray.class])continue;
        for(id item in windows) {
            if(result.count>=128||CFAbsoluteTimeGetCurrent()>deadline)break;
            AXUIElementRef element=(__bridge AXUIElementRef)item;
            if(CFGetTypeID(element)!=AXUIElementGetTypeID())continue;
            AXUIElementSetMessagingTimeout(element,0.15);
            NSString *role=PWAXCopy(element,kAXRoleAttribute);CGRect rect;
            if(![role isEqual:(__bridge NSString *)kAXWindowRole]||!PWRect(element,&rect)||rect.size.width<40||rect.size.height<40)continue;
            NSString *title=PWString(PWAXCopy(element,kAXTitleAttribute),512);NSNumber *number=@0;
            for(NSDictionary *candidate in cg) {
                CGRect bounds;
                if([candidate[(id)kCGWindowOwnerPID] intValue]!=app.processIdentifier || [candidate[(id)kCGWindowLayer] intValue]!=0 || !CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)candidate[(id)kCGWindowBounds],&bounds))continue;
                if(fabs(bounds.origin.x-rect.origin.x)<3&&fabs(bounds.origin.y-rect.origin.y)<3&&fabs(bounds.size.width-rect.size.width)<3&&fabs(bounds.size.height-rect.size.height)<3){number=candidate[(id)kCGWindowNumber];break;}
            }
            NSString *token=nil;
            for(NSString *key in previous)if([previous[key][@"pid"] intValue]==app.processIdentifier&&CFEqual((__bridge CFTypeRef)previous[key][@"element"],element)){token=key;break;}
            if(!token)token=NSUUID.UUID.UUIDString;
            PWWindows[token]=@{@"element":item,@"pid":@(app.processIdentifier),@"windowId":number};
            [result addObject:@{@"token":token,@"app":PWString(app.localizedName,128),@"title":title,@"minimized":@([PWAXCopy(element,kAXMinimizedAttribute) boolValue]),@"canPreview":@((BOOL)(number.unsignedIntValue!=0))}];
        }
    }
    for(NSString *key in PWUndo.allKeys)if(!PWWindows[key])[PWUndo removeObjectForKey:key];
    return @{@"permitted":@YES,@"windows":result,@"screens":PWScreens()};
}
static CGRect PWLayoutRect(CGRect rect,NSString *layout,BOOL *valid){
    CGFloat width=rect.size.width,height=rect.size.height;*valid=YES;
    if([layout isEqual:@"left"]||[layout isEqual:@"right"]){rect.size.width/=2;if([layout isEqual:@"right"])rect.origin.x+=rect.size.width;}
    else if([layout isEqual:@"top"]||[layout isEqual:@"bottom"]){rect.size.height/=2;if([layout isEqual:@"bottom"])rect.origin.y+=rect.size.height;}
    else if([layout hasPrefix:@"quarter"]){rect.size.width/=2;rect.size.height/=2;if([layout hasSuffix:@"Right"])rect.origin.x+=rect.size.width;if([layout containsString:@"Bottom"])rect.origin.y+=rect.size.height;}
    else if([layout isEqual:@"center"]){rect.size.width*=0.75;rect.size.height*=0.75;rect.origin.x+=width*0.125;rect.origin.y+=height*0.125;}
    else if(![layout isEqual:@"maximize"]){*valid=NO;return rect;}
    return rect;
}
extern NSDictionary *pinwall_dock_request(NSDictionary *request);
extern void pinwall_dock_clear(void);
static NSDictionary *PWWindowAction(NSDictionary *request) {
    NSString *method=request[@"method"];
    if([method hasPrefix:@"dock"])return pinwall_dock_request(request);
    if([method isEqual:@"release"]){PWWindows=nil;PWUndo=nil;return @{@"ok":@YES};}
    if([method isEqual:@"permission"]){AXIsProcessTrustedWithOptions((__bridge CFDictionaryRef)@{(__bridge NSString *)kAXTrustedCheckOptionPrompt:@YES});return @{@"ok":@YES};}
    if([method isEqual:@"list"])return PWWindowList();
    if(!AXIsProcessTrusted())return PWError(@"desktop_accessibility_denied");
    NSDictionary *record=PWWindows[request[@"token"]];if(!record)return PWError(@"desktop_window_expired");
    AXUIElementRef element=(__bridge AXUIElementRef)record[@"element"];
    NSRunningApplication *app=[NSRunningApplication runningApplicationWithProcessIdentifier:[record[@"pid"] intValue]];
    if(!app||app.terminated)return PWError(@"desktop_window_expired");
    if([method isEqual:@"focus"]) {
        AXUIElementSetAttributeValue(element,kAXMinimizedAttribute,kCFBooleanFalse);
        BOOL activated=[app activateWithOptions:0];
        AXError raised=AXUIElementPerformAction(element,kAXRaiseAction);
        return activated&&raised==kAXErrorSuccess?@{@"ok":@YES}:PWError(@"desktop_window_failed");
    }
    if([method isEqual:@"restore"]) {
        NSDictionary *old=PWUndo[request[@"token"]];if(!old)return PWError(@"desktop_no_undo");
        CGRect rect=NSRectFromString(old[@"rect"]);
        if(!PWMove((__bridge AXUIElementRef)old[@"element"],rect))return PWError(@"desktop_window_failed");
        [PWUndo removeObjectForKey:request[@"token"]];return @{@"ok":@YES};
    }
    if([method isEqual:@"layout"]) {
        NSDictionary *screen=nil;for(NSDictionary *candidate in PWScreens())if([candidate[@"id"] isEqual:request[@"screen"]]){screen=candidate;break;}
        CGRect old;if(!screen||!PWRect(element,&old))return PWError(@"desktop_window_expired");
        CGRect rect=CGRectMake([screen[@"x"] doubleValue],[screen[@"y"] doubleValue],[screen[@"width"] doubleValue],[screen[@"height"] doubleValue]);
        NSString *layout=request[@"layout"];
        BOOL valid=NO;rect=PWLayoutRect(rect,layout,&valid);if(!valid)return PWError(@"desktop_invalid_action");
        if(!PWUndo[request[@"token"]])PWUndo[request[@"token"]]=@{@"element":record[@"element"],@"rect":NSStringFromRect(old)};
        AXUIElementSetAttributeValue(element,kAXMinimizedAttribute,kCFBooleanFalse);
        if(!PWMove(element,rect)){PWMove(element,old);return PWError(@"desktop_window_failed");}
        CGRect actual;if(!PWRect(element,&actual))return PWError(@"desktop_window_failed");
        BOOL clamped=fabs(actual.origin.x-rect.origin.x)>3||fabs(actual.origin.y-rect.origin.y)>3||fabs(actual.size.width-rect.size.width)>3||fabs(actual.size.height-rect.size.height)>3;
        return @{@"ok":@YES,@"clamped":@(clamped)};
    }
    return PWError(@"desktop_invalid_action");
}
int pinwall_window_geometry_test(void){
    CGRect screen=CGRectMake(-1440,100,1440,800);BOOL valid=NO;
    CGRect right=PWLayoutRect(screen,@"right",&valid);if(!valid||!CGRectEqualToRect(right,CGRectMake(-720,100,720,800)))return 0;
    CGRect quarter=PWLayoutRect(screen,@"quarterBottomRight",&valid);if(!valid||!CGRectEqualToRect(quarter,CGRectMake(-720,500,720,400)))return 0;
    CGRect center=PWLayoutRect(screen,@"center",&valid);if(!valid||!CGRectEqualToRect(center,CGRectMake(-1260,200,1080,600)))return 0;
    PWLayoutRect(screen,@"unknown",&valid);return valid?0:1;
}
static NSDictionary *PWWindowPreview(NSDictionary *request) {
    if(@available(macOS 14.0,*)) {
        if(!CGPreflightScreenCaptureAccess()){CGRequestScreenCaptureAccess();return PWError(@"desktop_screen_denied");}
        __block NSNumber *number=nil;
        dispatch_sync(dispatch_get_main_queue(),^{number=PWWindows[request[@"token"]][@"windowId"];});
        if(!number.unsignedIntValue)return PWError(@"desktop_window_expired");
        dispatch_semaphore_t listed=dispatch_semaphore_create(0);__block SCWindow *selected=nil;
        [SCShareableContent getShareableContentExcludingDesktopWindows:YES onScreenWindowsOnly:NO completionHandler:^(SCShareableContent *content,NSError *error){
            (void)error;
            for(SCWindow *window in content.windows)if(window.windowID==number.unsignedIntValue&&window.owningApplication.processID!=getpid()){selected=window;break;}
            dispatch_semaphore_signal(listed);
        }];
        if(dispatch_semaphore_wait(listed,dispatch_time(DISPATCH_TIME_NOW,6*NSEC_PER_SEC)))return PWError(@"desktop_timeout");
        if(!selected)return PWError(@"desktop_window_expired");
        SCStreamConfiguration *config=[SCStreamConfiguration new];config.width=480;config.height=(size_t)fmax(1,fmin(320,480*selected.frame.size.height/fmax(1,selected.frame.size.width)));config.showsCursor=NO;config.scalesToFit=YES;
        SCContentFilter *filter=[[SCContentFilter alloc] initWithDesktopIndependentWindow:selected];
        dispatch_semaphore_t captured=dispatch_semaphore_create(0);__block NSData *png=nil;
        [SCScreenshotManager captureImageWithFilter:filter configuration:config completionHandler:^(CGImageRef image,NSError *error){
            (void)error;
            if(image){NSBitmapImageRep *rep=[[NSBitmapImageRep alloc] initWithCGImage:image];png=[rep representationUsingType:NSBitmapImageFileTypePNG properties:@{}];}
            dispatch_semaphore_signal(captured);
        }];
        if(dispatch_semaphore_wait(captured,dispatch_time(DISPATCH_TIME_NOW,6*NSEC_PER_SEC)))return PWError(@"desktop_timeout");
        if(!png||png.length>700*1024)return PWError(@"desktop_window_failed");
        return @{@"preview":[@"data:image/png;base64," stringByAppendingString:[png base64EncodedStringWithOptions:0]]};
    }
    return PWError(@"desktop_unsupported");
}


static NSDictionary *PWNotify(NSDictionary *request) {
    if(@available(macOS 10.14,*)) {
        UNUserNotificationCenter *center=UNUserNotificationCenter.currentNotificationCenter;
        dispatch_semaphore_t checked=dispatch_semaphore_create(0);__block UNAuthorizationStatus status=UNAuthorizationStatusDenied;
        [center getNotificationSettingsWithCompletionHandler:^(UNNotificationSettings *settings){status=settings.authorizationStatus;dispatch_semaphore_signal(checked);}];
        if(dispatch_semaphore_wait(checked,dispatch_time(DISPATCH_TIME_NOW,3*NSEC_PER_SEC)))return PWError(@"widget_notification_timeout");
        if(status==UNAuthorizationStatusNotDetermined){
            dispatch_semaphore_t authorized=dispatch_semaphore_create(0);__block BOOL allowed=NO;
            [center requestAuthorizationWithOptions:UNAuthorizationOptionAlert|UNAuthorizationOptionSound completionHandler:^(BOOL granted,NSError *error){(void)error;allowed=granted;dispatch_semaphore_signal(authorized);}];
            if(dispatch_semaphore_wait(authorized,dispatch_time(DISPATCH_TIME_NOW,30*NSEC_PER_SEC)))return PWError(@"widget_notification_timeout");
            if(!allowed)return PWError(@"widget_notification_denied");
        }else if(status!=UNAuthorizationStatusAuthorized&&status!=UNAuthorizationStatusProvisional)return PWError(@"widget_notification_denied");
        UNMutableNotificationContent *content=[UNMutableNotificationContent new];content.title=request[@"title"];content.body=request[@"body"];content.threadIdentifier=request[@"widgetId"];
        UNNotificationRequest *notification=[UNNotificationRequest requestWithIdentifier:NSUUID.UUID.UUIDString content:content trigger:nil];
        dispatch_semaphore_t submitted=dispatch_semaphore_create(0);__block BOOL success=NO;
        [center addNotificationRequest:notification withCompletionHandler:^(NSError *error){success=error==nil;dispatch_semaphore_signal(submitted);}];
        if(dispatch_semaphore_wait(submitted,dispatch_time(DISPATCH_TIME_NOW,3*NSEC_PER_SEC)))return PWError(@"widget_notification_timeout");
        return success?@{@"submitted":@YES}:PWError(@"widget_notification_failed");
    }
    return PWError(@"desktop_unsupported");
}
extern NSDictionary *pinwall_video_request(NSDictionary *request);
extern NSDictionary *pinwall_input_request(NSDictionary *request);
extern void pinwall_input_clear(void);
extern NSDictionary *pinwall_routes_request(NSDictionary *request);
extern BOOL pinwall_routes_clear(void);
extern unsigned long long pinwall_routes_generation(void);
// The returned allocation belongs to Rust; native exceptions never unwind across FFI.
unsigned long long pinwall_windows_generation(void){return atomic_load(&PWEpoch);}
char *pinwall_desktop_request(const char *json) {
    @autoreleasepool { @try {
        NSData *input=[[NSString stringWithUTF8String:json] dataUsingEncoding:NSUTF8StringEncoding];
        NSDictionary *request=[NSJSONSerialization JSONObjectWithData:input options:0 error:NULL];
        NSDictionary *result=nil;
        if ([request[@"domain"] isEqual:@"audio"]) result=PWAudio(request);
        else if ([request[@"domain"] isEqual:@"media"]) result=PWMedia(request);
        else if ([request[@"domain"] isEqual:@"notify"]) result=PWNotify(request);
        else if ([request[@"domain"] isEqual:@"routes"]) result=pinwall_routes_request(request);
        else if ([request[@"domain"] isEqual:@"video"]) result=pinwall_video_request(request);
        else if ([request[@"domain"] isEqual:@"input"]) result=pinwall_input_request(request);
        else if ([request[@"domain"] isEqual:@"windows"]) {
            if([request[@"epoch"] unsignedLongLongValue]!=atomic_load(&PWEpoch))result=PWError(@"tool_cancelled");
            else if([request[@"method"] isEqual:@"preview"])result=PWWindowPreview(request);
            else { __block NSDictionary *value=nil;unsigned long epoch=[request[@"epoch"] unsignedLongLongValue];dispatch_sync(dispatch_get_main_queue(),^{value=epoch==atomic_load(&PWEpoch)?PWWindowAction(request):PWError(@"tool_cancelled");});result=value; }
        } else if ([request[@"domain"] isEqual:@"clear"]) {
            BOOL all=[request[@"target"] isEqual:@"all"],cleared=YES;
            if(all||[request[@"target"] isEqual:@"input"])pinwall_input_clear();
            if(all||[request[@"target"] isEqual:@"audio"])cleared=pinwall_routes_clear();
            atomic_fetch_add(&PWEpoch,1);
            if(all||[request[@"target"] isEqual:@"windows"]){pinwall_dock_clear();if(NSThread.isMainThread){PWWindows=nil;PWUndo=nil;}else dispatch_async(dispatch_get_main_queue(),^{PWWindows=nil;PWUndo=nil;});}result=cleared?@{@"ok":@YES}:PWError(@"desktop_route_cleanup");
        } else result=PWError(@"desktop_invalid_action");
        NSData *output=[NSJSONSerialization dataWithJSONObject:result options:0 error:NULL];
        if (!output || output.length>2*1024*1024) return strdup("{\"error\":\"desktop_unavailable\"}");
        char *copy=malloc(output.length+1); if (!copy) return NULL;
        memcpy(copy,output.bytes,output.length);copy[output.length]=0;return copy;
    } @catch(NSException *exception) { return strdup("{\"error\":\"desktop_unavailable\"}"); } }
}
void pinwall_desktop_free(char *value) { free(value); }
