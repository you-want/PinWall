// Opt-in Dock hover thumbnails using public Accessibility and ScreenCaptureKit APIs.
#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
#import <ScreenCaptureKit/ScreenCaptureKit.h>
#include <stdatomic.h>
#include <unistd.h>
static NSTimer *PWDockTimer;
static NSPanel *PWDockPanel;
static NSMutableArray *PWDockButtons;
static NSUInteger PWDockEpoch;
static pid_t PWDockPID;
static NSPoint PWDockAnchor;
static NSString *PWDockError;
static CFAbsoluteTime PWDockHoverAt;
static id PWDockSleepObserver;
static BOOL PWDockPending,PWDockListing;
static atomic_uint PWDockCaptures;
static void PWDockHide(void){PWDockEpoch++;[PWDockPanel orderOut:nil];PWDockPanel=nil;PWDockButtons=nil;PWDockPID=0;PWDockPending=NO;}
static void PWDockStop(void){[PWDockTimer invalidate];PWDockTimer=nil;PWDockHide();if(PWDockSleepObserver){[NSWorkspace.sharedWorkspace.notificationCenter removeObserver:PWDockSleepObserver];PWDockSleepObserver=nil;}}
void pinwall_dock_clear(void){if(NSThread.isMainThread)PWDockStop();else dispatch_async(dispatch_get_main_queue(),^{PWDockStop();});}
static id PWDockAX(AXUIElementRef element,CFStringRef attribute){CFTypeRef value=NULL;return AXUIElementCopyAttributeValue(element,attribute,&value)==kAXErrorSuccess?CFBridgingRelease(value):nil;}
static NSRect PWDockPlacement(NSRect visible,NSPoint point,NSSize size){
    CGFloat x=point.x-size.width/2,y=point.y+24;
    if(y+size.height>NSMaxY(visible))y=point.y-size.height-24;
    if(point.x<NSMinX(visible)+100)x=point.x+40;
    if(point.x>NSMaxX(visible)-100)x=point.x-size.width-40;
    return NSMakeRect(fmax(NSMinX(visible),fmin(x,NSMaxX(visible)-size.width)),fmax(NSMinY(visible),fmin(y,NSMaxY(visible)-size.height)),size.width,size.height);
}
@interface PWDockWindowButton:NSButton
@property(nonatomic) CGWindowID windowID;
@property(nonatomic) pid_t owner;
@property(nonatomic) CGRect originalFrame;
@end
@implementation PWDockWindowButton
- (void)activateWindow:(id)sender{
    (void)sender;NSRunningApplication *application=[NSRunningApplication runningApplicationWithProcessIdentifier:self.owner];
    if(!application||application.terminated||self.owner==getpid()){PWDockHide();return;}
    AXUIElementRef app=AXUIElementCreateApplication(self.owner);AXUIElementSetMessagingTimeout(app,0.1);
    id windows=PWDockAX(app,kAXWindowsAttribute);CFRelease(app);
    if([windows isKindOfClass:NSArray.class]){NSUInteger count=0;CFAbsoluteTime deadline=CFAbsoluteTimeGetCurrent()+0.5;
        for(id item in windows){if(++count>32||CFAbsoluteTimeGetCurrent()>deadline)break;
            if(CFGetTypeID((__bridge CFTypeRef)item)!=AXUIElementGetTypeID())continue;
            AXUIElementRef window=(__bridge AXUIElementRef)item;AXUIElementSetMessagingTimeout(window,0.05);
            id p=PWDockAX(window,kAXPositionAttribute),s=PWDockAX(window,kAXSizeAttribute);CGPoint position;CGSize size;
            if(!p||!s||CFGetTypeID((__bridge CFTypeRef)p)!=AXValueGetTypeID()||CFGetTypeID((__bridge CFTypeRef)s)!=AXValueGetTypeID())continue;
            if(!AXValueGetValue((__bridge AXValueRef)p,kAXValueCGPointType,&position)||!AXValueGetValue((__bridge AXValueRef)s,kAXValueCGSizeType,&size))continue;
            CGRect rect=self.originalFrame;
            if(fabs(rect.origin.x-position.x)>3||fabs(rect.origin.y-position.y)>3||fabs(rect.size.width-size.width)>3||fabs(rect.size.height-size.height)>3)continue;
            // Revalidate identity from CG's current list before acting on the matched AX reference.
            NSArray *current=CFBridgingRelease(CGWindowListCopyWindowInfo(kCGWindowListOptionIncludingWindow,self.windowID));BOOL valid=NO;
            for(NSDictionary *entry in current)if([entry[(id)kCGWindowNumber] unsignedIntValue]==self.windowID&&[entry[(id)kCGWindowOwnerPID] intValue]==self.owner)valid=YES;
            if(valid){[application activateWithOptions:0];AXUIElementPerformAction(window,kAXRaiseAction);}break;
        }
    }
    PWDockHide();
}
@end
static void PWDockCapture(pid_t pid,NSUInteger epoch){
    if(@available(macOS 14.0,*)){
        if(PWDockListing||atomic_load(&PWDockCaptures)>=4){PWDockError=@"desktop_dock_busy";return;}
        PWDockPending=YES;PWDockListing=YES;
        // A stalled system callback cannot keep an invisible pending session forever.
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW,6*NSEC_PER_SEC),dispatch_get_main_queue(),^{if(epoch==PWDockEpoch&&PWDockPending){PWDockError=@"desktop_timeout";PWDockHide();}});
        [SCShareableContent getShareableContentExcludingDesktopWindows:YES onScreenWindowsOnly:YES completionHandler:^(SCShareableContent *content,NSError *error){
            dispatch_async(dispatch_get_main_queue(),^{
                PWDockListing=NO;if(epoch!=PWDockEpoch||!PWDockTimer)return;PWDockPending=NO;
                if(error||!content){PWDockError=@"desktop_window_failed";PWDockHide();return;}
                NSMutableArray<SCWindow *> *windows=[NSMutableArray array];for(SCWindow *window in content.windows){if(window.owningApplication.processID==pid&&window.windowLayer==0&&window.frame.size.width>=80&&window.frame.size.height>=60){[windows addObject:window];if(windows.count==4)break;}}
                if(!windows.count){PWDockHide();return;}
                NSScreen *screen=NSScreen.mainScreen;for(NSScreen *candidate in NSScreen.screens)if(NSPointInRect(PWDockAnchor,candidate.frame)){screen=candidate;break;}
                // At most four tiles, also bounded by this display's visible width.
                NSUInteger columns=MAX((NSUInteger)1,MIN(windows.count,(NSUInteger)(screen.visibleFrame.size.width/210)));if(windows.count>columns)[windows removeObjectsInRange:NSMakeRange(columns,windows.count-columns)];
                NSSize size=NSMakeSize(columns*210,170);NSRect frame=PWDockPlacement(screen.visibleFrame,PWDockAnchor,size);
                PWDockPanel=[[NSPanel alloc] initWithContentRect:frame styleMask:NSWindowStyleMaskNonactivatingPanel|NSWindowStyleMaskTitled backing:NSBackingStoreBuffered defer:NO];
                PWDockPanel.titleVisibility=NSWindowTitleHidden;PWDockPanel.titlebarAppearsTransparent=YES;PWDockPanel.level=NSStatusWindowLevel;PWDockPanel.hidesOnDeactivate=NO;PWDockPanel.releasedWhenClosed=NO;PWDockPanel.collectionBehavior=NSWindowCollectionBehaviorCanJoinAllSpaces|NSWindowCollectionBehaviorFullScreenAuxiliary;PWDockButtons=[NSMutableArray array];
                NSUInteger index=0;for(SCWindow *window in windows){
                    PWDockWindowButton *button=[[PWDockWindowButton alloc] initWithFrame:NSMakeRect(index*210+5,5,200,140)];button.bordered=NO;button.title=window.title?:window.owningApplication.applicationName;button.accessibilityLabel=button.title;button.imagePosition=NSImageAbove;button.imageScaling=NSImageScaleProportionallyDown;button.font=[NSFont systemFontOfSize:11];button.lineBreakMode=NSLineBreakByTruncatingTail;button.windowID=window.windowID;button.owner=pid;button.originalFrame=window.frame;button.target=button;button.action=@selector(activateWindow:);[PWDockPanel.contentView addSubview:button];[PWDockButtons addObject:button];index++;
                    SCStreamConfiguration *config=[SCStreamConfiguration new];config.width=400;config.height=240;config.showsCursor=NO;config.scalesToFit=YES;
                    SCContentFilter *filter=[[SCContentFilter alloc] initWithDesktopIndependentWindow:window];
                    if(atomic_load(&PWDockCaptures)>=4)continue;atomic_fetch_add(&PWDockCaptures,1);
                    [SCScreenshotManager captureImageWithFilter:filter configuration:config completionHandler:^(CGImageRef image,NSError *captureError){
                        atomic_fetch_sub(&PWDockCaptures,1);NSImage *preview=image?[[NSImage alloc] initWithCGImage:image size:NSMakeSize(190,110)]:nil;
                        dispatch_async(dispatch_get_main_queue(),^{if(epoch!=PWDockEpoch||!PWDockTimer)return;if(preview)button.image=preview;else if(captureError)PWDockError=@"desktop_window_failed";});
                    }];
                }
                [PWDockPanel orderFrontRegardless];
            });
        }];
    }
}
static void PWDockTick(void){
    BOOL allowed=NO;if(@available(macOS 14.0,*))allowed=AXIsProcessTrusted()&&CGPreflightScreenCaptureAccess();
    if(!allowed){PWDockError=@"desktop_dock_permission";PWDockStop();return;}
    NSPoint mouse=NSEvent.mouseLocation;if(PWDockPanel.visible&&NSPointInRect(mouse,NSInsetRect(PWDockPanel.frame,-8,-8)))return;
    NSArray *docks=[NSRunningApplication runningApplicationsWithBundleIdentifier:@"com.apple.dock"];NSRunningApplication *dock=docks.firstObject;
    // Only query an AX element while the pointer is actually over the visible Dock window.
    CGFloat top=NSMaxY(NSScreen.screens.firstObject.frame);CGPoint point=CGPointMake(mouse.x,top-mouse.y);BOOL overDock=NO;
    NSArray *cg=CFBridgingRelease(CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly|kCGWindowListExcludeDesktopElements,kCGNullWindowID));
    for(NSDictionary *entry in cg){if([entry[(id)kCGWindowOwnerPID] intValue]!=dock.processIdentifier)continue;CGRect frame;if(CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)entry[(id)kCGWindowBounds],&frame)&&CGRectContainsPoint(frame,point)){overDock=YES;break;}}
    if(!overDock){if(PWDockPID&&CFAbsoluteTimeGetCurrent()-PWDockHoverAt>0.7)PWDockHide();return;}
    AXUIElementRef ax=AXUIElementCreateApplication(dock.processIdentifier);AXUIElementSetMessagingTimeout(ax,0.05);AXUIElementRef hit=NULL;
    AXError result=AXUIElementCopyElementAtPosition(ax,point.x,point.y,&hit);CFRelease(ax);if(result!=kAXErrorSuccess||!hit){PWDockHide();return;}
    AXUIElementSetMessagingTimeout(hit,0.05);id role=PWDockAX(hit,kAXRoleAttribute),url=PWDockAX(hit,kAXURLAttribute);CFRelease(hit);
    if(![role isEqual:@"AXDockItem"]||![url isKindOfClass:NSURL.class]||![url isFileURL]){PWDockHide();return;}
    pid_t pid=0;for(NSRunningApplication *app in NSWorkspace.sharedWorkspace.runningApplications)if(app.processIdentifier!=getpid()&&app.activationPolicy==NSApplicationActivationPolicyRegular&&[app.bundleURL.URLByStandardizingPath isEqual:[url URLByStandardizingPath]]){pid=app.processIdentifier;break;}
    if(!pid){PWDockHide();return;}PWDockHoverAt=CFAbsoluteTimeGetCurrent();
    if(PWDockPID!=pid){PWDockHide();PWDockPID=pid;PWDockAnchor=mouse;NSUInteger epoch=PWDockEpoch;dispatch_after(dispatch_time(DISPATCH_TIME_NOW,350*NSEC_PER_MSEC),dispatch_get_main_queue(),^{if(epoch==PWDockEpoch&&PWDockTimer&&PWDockPID==pid)PWDockCapture(pid,epoch);});}
}
static NSDictionary *PWDockRequestMain(NSDictionary *request){
    NSString *method=request[@"method"];
    if([method isEqual:@"dockStop"])PWDockStop();
    else if([method isEqual:@"dockStart"]){
        if(@available(macOS 14.0,*)){
            if(!AXIsProcessTrusted())return @{@"error":@"desktop_accessibility_denied"};
            if(!CGPreflightScreenCaptureAccess()){CGRequestScreenCaptureAccess();return @{@"error":@"desktop_screen_denied"};}
            if(!PWDockTimer){PWDockError=nil;PWDockTimer=[NSTimer scheduledTimerWithTimeInterval:0.25 repeats:YES block:^(NSTimer *timer){(void)timer;PWDockTick();}];PWDockTimer.tolerance=0.1;PWDockSleepObserver=[NSWorkspace.sharedWorkspace.notificationCenter addObserverForName:NSWorkspaceWillSleepNotification object:nil queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification *n){(void)n;PWDockStop();}];}
        }else return @{@"error":@"desktop_unsupported"};
    }
    else if(![method isEqual:@"dockStatus"])return @{@"error":@"desktop_invalid_action"};
    return @{@"active":@((BOOL)(PWDockTimer!=nil)),@"lastError":PWDockError?:NSNull.null};
}
NSDictionary *pinwall_dock_request(NSDictionary *request){__block NSDictionary *result=nil;if(NSThread.isMainThread)result=PWDockRequestMain(request);else dispatch_sync(dispatch_get_main_queue(),^{result=PWDockRequestMain(request);});return result;}
int pinwall_dock_geometry_test(void){NSRect rect=PWDockPlacement(NSMakeRect(-1440,-100,1440,800),NSMakePoint(-1430,0),NSMakeSize(420,170));return NSContainsRect(NSMakeRect(-1440,-100,1440,800),rect)?1:0;}
