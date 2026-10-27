// Optional event tap. No observed text is persisted, returned to JS or logged.
#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
#import <Carbon/Carbon.h>
#include <stdatomic.h>
#define PW_INPUT_TAG 0x5057494e57414c4cLL
typedef struct {char text[25];unsigned length;double touched;} PWPrefix;
static atomic_ullong PWInputEpoch;
unsigned long long pinwall_input_generation(void){return atomic_load(&PWInputEpoch);}
static CFMachPortRef PWInputTap;
static CFRunLoopSourceRef PWInputSource;
static NSDictionary *PWInputProfile,*PWInputExpansions;
static NSSet *PWInputExcluded;
static id PWInputActivation;
static BOOL PWInputBlocked=YES;
static pid_t PWInputPID;
static PWPrefix PWInputPrefix;
static CFTypeRef PWPrefixFocus,PWUndoFocus;
static NSString *PWUndoTrigger;
static NSUInteger PWUndoCount;
static CFAbsoluteTime PWUndoTime;
static pid_t PWUndoPID;
static BOOL PWMappedKeys[256];
static NSString *PWInputError;
static NSUInteger PWInputExpanded;
static void PWIResetPrefix(void){memset(&PWInputPrefix,0,sizeof(PWInputPrefix));if(PWPrefixFocus){CFRelease(PWPrefixFocus);PWPrefixFocus=NULL;}}
static void PWIClearUndo(void){PWUndoTrigger=nil;PWUndoCount=0;if(PWUndoFocus){CFRelease(PWUndoFocus);PWUndoFocus=NULL;}}
// Only explicit semicolon-prefixed ASCII candidates enter this 24-byte volatile buffer.
static BOOL PWIAppend(PWPrefix *prefix,UniChar character,double now){
    if(now-prefix->touched>2)memset(prefix,0,sizeof(*prefix));prefix->touched=now;
    if(character==';'){prefix->length=1;prefix->text[0]=';';prefix->text[1]=0;return YES;}
    if(!prefix->length)return NO;
    if(prefix->length>=24||!((character>='a'&&character<='z')||(character>='A'&&character<='Z')||(character>='0'&&character<='9')||character=='_'||character=='-')){memset(prefix,0,sizeof(*prefix));return NO;}
    prefix->text[prefix->length++]=(char)character;prefix->text[prefix->length]=0;return YES;
}
static id PWICopyAX(AXUIElementRef element,CFStringRef attribute){CFTypeRef value=NULL;return AXUIElementCopyAttributeValue(element,attribute,&value)==kAXErrorSuccess?CFBridgingRelease(value):nil;}
static AXUIElementRef PWIFocusedText(void){
    if(IsSecureEventInputEnabled()||PWInputBlocked||PWInputPID<=1)return NULL;
    TISInputSourceRef input=TISCopyCurrentKeyboardInputSource();if(!input)return NULL;
    CFBooleanRef ascii=TISGetInputSourceProperty(input,kTISPropertyInputSourceIsASCIICapable);BOOL supported=ascii&&CFGetTypeID(ascii)==CFBooleanGetTypeID()&&CFBooleanGetValue(ascii);CFRelease(input);if(!supported)return NULL;
    AXUIElementRef app=AXUIElementCreateApplication(PWInputPID);AXUIElementSetMessagingTimeout(app,0.02);
    id element=PWICopyAX(app,kAXFocusedUIElementAttribute);CFRelease(app);
    if(!element||CFGetTypeID((__bridge CFTypeRef)element)!=AXUIElementGetTypeID())return NULL;
    AXUIElementRef focused=(__bridge AXUIElementRef)element;AXUIElementSetMessagingTimeout(focused,0.02);
    id role=PWICopyAX(focused,kAXRoleAttribute),subrole=PWICopyAX(focused,kAXSubroleAttribute);
    if([subrole isEqual:(__bridge NSString *)kAXSecureTextFieldSubrole]||(![role isEqual:(__bridge NSString *)kAXTextFieldRole]&&![role isEqual:(__bridge NSString *)kAXTextAreaRole]))return NULL;
    return (AXUIElementRef)CFRetain(focused);
}
static void PWIKey(CGKeyCode code,BOOL down){
    CGEventRef event=CGEventCreateKeyboardEvent(NULL,code,down);if(!event)return;
    CGEventSetFlags(event,0);CGEventSetIntegerValueField(event,kCGEventSourceUserData,PW_INPUT_TAG);CGEventPost(kCGHIDEventTap,event);CFRelease(event);
}
static void PWIText(NSString *text){
    NSUInteger offset=0;while(offset<text.length){NSRange range=NSMakeRange(offset,MIN((NSUInteger)20,text.length-offset));
        // Preserve surrogate pairs at chunk boundaries.
        if(NSMaxRange(range)<text.length&&CFStringIsSurrogateHighCharacter([text characterAtIndex:NSMaxRange(range)-1]))range.length--;
        UniChar characters[20];[text getCharacters:characters range:range];
        for(int down=1;down>=0;down--){CGEventRef event=CGEventCreateKeyboardEvent(NULL,0,down);if(event){CGEventSetFlags(event,0);CGEventKeyboardSetUnicodeString(event,range.length,characters);CGEventSetIntegerValueField(event,kCGEventSourceUserData,PW_INPUT_TAG);CGEventPost(kCGHIDEventTap,event);CFRelease(event);}}
        offset+=range.length;
    }
}
static CGKeyCode PWIArrow(CGKeyCode code){switch(code){case kVK_ANSI_H:return kVK_LeftArrow;case kVK_ANSI_J:return kVK_DownArrow;case kVK_ANSI_K:return kVK_UpArrow;case kVK_ANSI_L:return kVK_RightArrow;default:return 0;}}
static void PWIFront(void){
    PWIResetPrefix();PWIClearUndo();NSRunningApplication *app=NSWorkspace.sharedWorkspace.frontmostApplication;
    PWInputPID=app.processIdentifier;NSString *bundle=app.bundleIdentifier;
    PWInputBlocked=PWInputPID==getpid()||!bundle.length||[PWInputExcluded containsObject:bundle];
}
static void PWIStop(void){
    if(PWInputTap){CGEventTapEnable(PWInputTap,false);if(PWInputSource)CFRunLoopRemoveSource(CFRunLoopGetMain(),PWInputSource,kCFRunLoopCommonModes);CFMachPortInvalidate(PWInputTap);CFRelease(PWInputTap);PWInputTap=NULL;}
    if(PWInputSource){CFRelease(PWInputSource);PWInputSource=NULL;}
    if(PWInputActivation){[NSWorkspace.sharedWorkspace.notificationCenter removeObserver:PWInputActivation];PWInputActivation=nil;}
    for(unsigned i=0;i<256;i++)if(PWMappedKeys[i]){PWIKey(PWIArrow((CGKeyCode)i),NO);PWMappedKeys[i]=NO;}
    PWIResetPrefix();PWIClearUndo();PWInputProfile=nil;PWInputExpansions=nil;PWInputExcluded=nil;PWInputBlocked=YES;
}
void pinwall_input_clear(void){atomic_fetch_add(&PWInputEpoch,1);if(NSThread.isMainThread)PWIStop();else dispatch_async(dispatch_get_main_queue(),^{PWIStop();});}
static void PWITransformScroll(CGEventRef event, NSDictionary *profile){
    if([profile[@"discreteOnly"] boolValue]&&CGEventGetIntegerValueField(event,kCGScrollWheelEventIsContinuous))return;
    CGEventField fields[]={kCGScrollWheelEventDeltaAxis1,kCGScrollWheelEventDeltaAxis2,kCGScrollWheelEventPointDeltaAxis1,kCGScrollWheelEventPointDeltaAxis2,kCGScrollWheelEventFixedPtDeltaAxis1,kCGScrollWheelEventFixedPtDeltaAxis2};
    int64_t values[6];for(unsigned i=0;i<6;i++)values[i]=CGEventGetIntegerValueField(event,fields[i]);
    // Quartz setters recalculate sibling fields; read the entire tuple before writing it.
    BOOL vertical=[profile[@"reverseVertical"] boolValue],horizontal=[profile[@"reverseHorizontal"] boolValue];
    for(unsigned i=0;i<6;i++){int64_t value=values[i];if((i%2==0?vertical:horizontal)&&value>INT64_MIN)value=-value;CGEventSetIntegerValueField(event,fields[i],value);}
}
static CGEventRef PWIEvent(CGEventTapProxy proxy,CGEventType type,CGEventRef event,void *context){
    (void)proxy;(void)context;
    if(type==kCGEventTapDisabledByTimeout||type==kCGEventTapDisabledByUserInput){PWInputError=@"input_tap_disabled";dispatch_async(dispatch_get_main_queue(),^{PWIStop();});return event;}
    if(!PWInputTap||CGEventGetIntegerValueField(event,kCGEventSourceUserData)==PW_INPUT_TAG)return event;
    CGKeyCode code=(CGKeyCode)CGEventGetIntegerValueField(event,kCGKeyboardEventKeycode);CGEventFlags flags=CGEventGetFlags(event);
    if(type==kCGEventKeyUp&&code<256&&PWMappedKeys[code]){PWMappedKeys[code]=NO;CGEventSetIntegerValueField(event,kCGKeyboardEventKeycode,PWIArrow(code));CGEventKeyboardSetUnicodeString(event,0,NULL);CGEventSetFlags(event,flags&~kCGEventFlagMaskAlternate);return event;}
    if(PWInputBlocked||IsSecureEventInputEnabled()){PWIResetPrefix();PWIClearUndo();return event;}
    if(type==kCGEventScrollWheel){
        PWIResetPrefix();PWIClearUndo();PWITransformScroll(event,PWInputProfile);
        return event;
    }
    if(type==kCGEventLeftMouseDown||type==kCGEventRightMouseDown||type==kCGEventOtherMouseDown){PWIResetPrefix();PWIClearUndo();return event;}
    if(type==kCGEventFlagsChanged){if(flags&(kCGEventFlagMaskCommand|kCGEventFlagMaskControl|kCGEventFlagMaskAlternate))PWIResetPrefix();return event;}
    if(type!=kCGEventKeyDown)return event;
    if(code==kVK_ANSI_Z&&(flags&(kCGEventFlagMaskCommand|kCGEventFlagMaskAlternate))==(kCGEventFlagMaskCommand|kCGEventFlagMaskAlternate)&&PWUndoTrigger){
        AXUIElementRef focused=PWIFocusedText();BOOL canUndo=focused&&PWUndoFocus&&CFEqual(focused,PWUndoFocus)&&PWInputPID==PWUndoPID&&CFAbsoluteTimeGetCurrent()-PWUndoTime<5;
        if(focused)CFRelease(focused);
        if(canUndo){for(NSUInteger i=0;i<PWUndoCount;i++){PWIKey(kVK_Delete,YES);PWIKey(kVK_Delete,NO);}PWIText([PWUndoTrigger stringByAppendingString:@" "]);PWIClearUndo();PWIResetPrefix();return NULL;}
    }
    PWIClearUndo();
    if([PWInputProfile[@"arrowNavigation"] boolValue]&&(flags&kCGEventFlagMaskAlternate)&&!(flags&(kCGEventFlagMaskCommand|kCGEventFlagMaskControl))&&PWIArrow(code)){
        PWIResetPrefix();if(code<256)PWMappedKeys[code]=YES;CGEventSetIntegerValueField(event,kCGKeyboardEventKeycode,PWIArrow(code));CGEventKeyboardSetUnicodeString(event,0,NULL);CGEventSetFlags(event,flags&~kCGEventFlagMaskAlternate);return event;
    }
    if(![PWInputProfile[@"textExpansion"] boolValue]||flags&(kCGEventFlagMaskCommand|kCGEventFlagMaskControl|kCGEventFlagMaskAlternate)){PWIResetPrefix();return event;}
    UniChar characters[8];UniCharCount length=0;CGEventKeyboardGetUnicodeString(event,8,&length,characters);
    if(length!=1){PWIResetPrefix();return event;}
    if(characters[0]==' '&&PWInputPrefix.length>1&&CFAbsoluteTimeGetCurrent()-PWInputPrefix.touched<=2){
        NSString *trigger=[NSString stringWithUTF8String:PWInputPrefix.text],*replacement=PWInputExpansions[trigger];AXUIElementRef focused=PWIFocusedText();
        BOOL match=replacement.length&&focused&&PWPrefixFocus&&CFEqual(focused,PWPrefixFocus);
        if(match){
            NSUInteger count=PWInputPrefix.length;PWIResetPrefix();for(NSUInteger i=0;i<count;i++){PWIKey(kVK_Delete,YES);PWIKey(kVK_Delete,NO);}
            NSString *expanded=[replacement stringByAppendingString:@" "];PWIText(expanded);
            __block NSUInteger graphemes=0;[expanded enumerateSubstringsInRange:NSMakeRange(0,expanded.length) options:NSStringEnumerationByComposedCharacterSequences usingBlock:^(NSString *substring,NSRange range,NSRange enclosing,BOOL *stop){(void)substring;(void)range;(void)enclosing;(void)stop;graphemes++;}];
            PWUndoTrigger=trigger;PWUndoCount=graphemes;PWUndoTime=CFAbsoluteTimeGetCurrent();PWUndoPID=PWInputPID;PWUndoFocus=CFRetain(focused);PWInputExpanded++;CFRelease(focused);return NULL;
        }
        if(focused)CFRelease(focused);PWIResetPrefix();return event;
    }
    if(characters[0]==';'){PWIResetPrefix();PWPrefixFocus=PWIFocusedText();if(!PWPrefixFocus)return event;}
    if(!PWIAppend(&PWInputPrefix,characters[0],CFAbsoluteTimeGetCurrent()))PWIResetPrefix();
    return event;
}
static NSDictionary *PWIStatus(void){BOOL listening=YES;if(@available(macOS 10.15,*))listening=CGPreflightListenEventAccess();return @{@"active":@((BOOL)(PWInputTap!=NULL)),@"accessibility":@((BOOL)AXIsProcessTrusted()),@"inputMonitoring":@(listening),@"suspended":@(PWInputBlocked),@"expanded":@(PWInputExpanded),@"lastError":PWInputError?:NSNull.null};}
static NSDictionary *PWIRequestMain(NSDictionary *request){
    NSString *method=request[@"method"];
    if([method isEqual:@"status"])return PWIStatus();
    if([method isEqual:@"permission"]){AXIsProcessTrustedWithOptions((__bridge CFDictionaryRef)@{(__bridge NSString *)kAXTrustedCheckOptionPrompt:@YES});if(@available(macOS 10.15,*)){CGRequestListenEventAccess();}return PWIStatus();}
    if(![method isEqual:@"start"])return @{@"error":@"input_invalid_profile"};
    if([request[@"epoch"] unsignedLongLongValue]!=atomic_load(&PWInputEpoch))return @{@"error":@"tool_cancelled"};
    if(!AXIsProcessTrusted())return @{@"error":@"input_permission_denied"};if(@available(macOS 10.15,*)){if(!CGPreflightListenEventAccess())return @{@"error":@"input_permission_denied"};}
    PWIStop();PWInputProfile=request[@"profile"];PWInputExcluded=[NSSet setWithArray:PWInputProfile[@"excludedApps"]];NSMutableDictionary *expansions=[NSMutableDictionary dictionary];for(NSDictionary *snippet in PWInputProfile[@"snippets"])expansions[snippet[@"trigger"]]=snippet[@"text"];PWInputExpansions=expansions;
    CGEventMask mask=CGEventMaskBit(kCGEventLeftMouseDown)|CGEventMaskBit(kCGEventRightMouseDown)|CGEventMaskBit(kCGEventOtherMouseDown);
    if([PWInputProfile[@"reverseVertical"] boolValue]||[PWInputProfile[@"reverseHorizontal"] boolValue])mask|=CGEventMaskBit(kCGEventScrollWheel);
    if([PWInputProfile[@"arrowNavigation"] boolValue]||[PWInputProfile[@"textExpansion"] boolValue])mask|=CGEventMaskBit(kCGEventKeyDown)|CGEventMaskBit(kCGEventKeyUp)|CGEventMaskBit(kCGEventFlagsChanged);
    PWInputTap=CGEventTapCreate(kCGSessionEventTap,kCGHeadInsertEventTap,kCGEventTapOptionDefault,mask,PWIEvent,NULL);
    if(!PWInputTap){PWIStop();return @{@"error":@"input_permission_denied"};}
    PWInputSource=CFMachPortCreateRunLoopSource(kCFAllocatorDefault,PWInputTap,0);if(!PWInputSource){PWIStop();return @{@"error":@"input_unavailable"};}
    CFRunLoopAddSource(CFRunLoopGetMain(),PWInputSource,kCFRunLoopCommonModes);CGEventTapEnable(PWInputTap,true);PWInputError=nil;PWInputExpanded=0;PWIFront();
    PWInputActivation=[NSWorkspace.sharedWorkspace.notificationCenter addObserverForName:NSWorkspaceDidActivateApplicationNotification object:nil queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification *notification){(void)notification;PWIFront();}];
    return PWIStatus();
}
NSDictionary *pinwall_input_request(NSDictionary *request){__block NSDictionary *result=nil;if(NSThread.isMainThread)result=PWIRequestMain(request);else dispatch_sync(dispatch_get_main_queue(),^{result=PWIRequestMain(request);});return result;}
int pinwall_input_prefix_test(void){
    PWPrefix prefix={0};const char *normal="normal typing without trigger";for(unsigned i=0;i<strlen(normal);i++)PWIAppend(&prefix,normal[i],1);if(prefix.length)return 0;
    PWIAppend(&prefix,';',2);PWIAppend(&prefix,'s',2.1);PWIAppend(&prefix,'i',2.2);PWIAppend(&prefix,'g',2.3);if(strcmp(prefix.text,";sig"))return 0;
    PWIAppend(&prefix,'x',5);if(prefix.length)return 0;
    PWIAppend(&prefix,';',6);for(unsigned i=0;i<100;i++)PWIAppend(&prefix,'a',6.1);if(prefix.length>24)return 0;
    PWIAppend(&prefix,';',7);PWIAppend(&prefix,0x4e2d,7.1);return prefix.length==0?1:0;
}

// Synthetic events are never posted; exercise actual field transforms without a tap.
int pinwall_input_scroll_test(void){
    CGEventRef event=CGEventCreateScrollWheelEvent(NULL,kCGScrollEventUnitLine,2,3,-4);if(!event)return 0;
    CGEventSetIntegerValueField(event,kCGScrollWheelEventIsContinuous,0);
    CGEventSetIntegerValueField(event,kCGScrollWheelEventPointDeltaAxis1,12);
    CGEventSetIntegerValueField(event,kCGScrollWheelEventFixedPtDeltaAxis2,-65536);
    CGEventField fields[]={kCGScrollWheelEventDeltaAxis1,kCGScrollWheelEventDeltaAxis2,kCGScrollWheelEventPointDeltaAxis1,kCGScrollWheelEventPointDeltaAxis2,kCGScrollWheelEventFixedPtDeltaAxis1,kCGScrollWheelEventFixedPtDeltaAxis2};
    int64_t before[6];for(unsigned i=0;i<6;i++)before[i]=CGEventGetIntegerValueField(event,fields[i]);
    PWITransformScroll(event,@{@"reverseVertical":@YES,@"reverseHorizontal":@YES,@"discreteOnly":@YES});
    BOOL correct=CGEventGetIntegerValueField(event,kCGScrollWheelEventDeltaAxis1)==-3&&CGEventGetIntegerValueField(event,kCGScrollWheelEventDeltaAxis2)==4;
    for(unsigned i=0;i<6;i++)correct=correct&&CGEventGetIntegerValueField(event,fields[i])==-before[i];
    CGEventSetIntegerValueField(event,kCGScrollWheelEventIsContinuous,1);
    PWITransformScroll(event,@{@"reverseVertical":@YES,@"reverseHorizontal":@YES,@"discreteOnly":@YES});
    correct=correct&&CGEventGetIntegerValueField(event,kCGScrollWheelEventDeltaAxis1)==-3;
    PWITransformScroll(event,@{@"reverseVertical":@YES,@"discreteOnly":@NO});
    correct=correct&&CGEventGetIntegerValueField(event,kCGScrollWheelEventDeltaAxis1)==3;
    CFRelease(event);return correct?1:0;
}
