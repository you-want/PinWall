// Signed, peer-authenticated XPC client. Only the bundled host can reach the narrow helper API.
#import <Foundation/Foundation.h>
#import <Security/Security.h>
#import <ServiceManagement/ServiceManagement.h>
#import <xpc/xpc.h>
#import <stdatomic.h>
#import <sys/stat.h>
#define PW_HELPER_ID @"com.rain9.pinwall.hardware-helper"
#define PW_DAEMON_PLIST @"com.rain9.pinwall.hardware-helper.plist"
static atomic_ullong PWHardwareEpoch=0;
static xpc_connection_t PWClient;
static dispatch_queue_t PWClientQueue;
static NSDictionary *PHError(NSString *code){return @{@"error":code};}
static NSString *PHTeam(void){
    SecCodeRef code=NULL;CFDictionaryRef info=NULL;
    if(SecCodeCopySelf(kSecCSDefaultFlags,&code)!=errSecSuccess)return nil;
    OSStatus status=SecCodeCopySigningInformation(code,kSecCSSigningInformation,&info);
    if(status!=errSecSuccess){CFRelease(code);return nil;}
    NSDictionary *data=CFBridgingRelease(info);NSString *team=data[(__bridge NSString *)kSecCodeInfoTeamIdentifier];
    BOOL valid=[data[(__bridge NSString *)kSecCodeInfoIdentifier] isEqual:@"com.rain9.pinwall"]&&[team isKindOfClass:NSString.class]&&team.length==10&&[team rangeOfCharacterFromSet:[[NSCharacterSet characterSetWithCharactersInString:@"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"] invertedSet]].location==NSNotFound;
    if(valid){
        NSString *text=[NSString stringWithFormat:@"identifier \"com.rain9.pinwall\" and anchor apple generic and certificate leaf[field.1.2.840.113635.100.6.1.13] exists and certificate leaf[subject.OU] = \"%@\"",team];
        SecRequirementRef requirement=NULL;
        status=SecRequirementCreateWithString((__bridge CFStringRef)text,kSecCSDefaultFlags,&requirement);
        if(status==errSecSuccess)status=SecCodeCheckValidity(code,kSecCSStrictValidate,requirement);
        if(requirement)CFRelease(requirement);valid=status==errSecSuccess;
    }
    CFRelease(code);return valid?team:nil;
}
static NSString *PHRequirement(NSString *team){return [NSString stringWithFormat:@"identifier \"%@\" and anchor apple generic and certificate leaf[field.1.2.840.113635.100.6.1.13] exists and certificate leaf[subject.OU] = \"%@\"",PW_HELPER_ID,team];}
static BOOL PHBundle(NSString *team){
    NSURL *contents=[NSBundle.mainBundle.bundleURL URLByAppendingPathComponent:@"Contents"],*helper=[contents URLByAppendingPathComponent:@"Library/HelperTools/com.rain9.pinwall.hardware-helper"],*plist=[contents URLByAppendingPathComponent:[@"Library/LaunchDaemons/" stringByAppendingString:PW_DAEMON_PLIST]];
    struct stat meta;for(NSURL *url in @[helper,plist]){if(lstat(url.fileSystemRepresentation,&meta)!=0||!S_ISREG(meta.st_mode)||S_ISLNK(meta.st_mode))return NO;}
    NSDictionary *expected=@{@"Label":PW_HELPER_ID,@"BundleProgram":@"Contents/Library/HelperTools/com.rain9.pinwall.hardware-helper",@"MachServices":@{PW_HELPER_ID:@YES},@"KeepAlive":@YES,@"RunAtLoad":@YES,@"ThrottleInterval":@10};
    NSDictionary *actual=[NSDictionary dictionaryWithContentsOfURL:plist];if(![actual isEqual:expected])return NO;
    SecStaticCodeRef code=NULL;SecRequirementRef requirement=NULL;if(SecStaticCodeCreateWithPath((__bridge CFURLRef)helper,kSecCSDefaultFlags,&code)!=errSecSuccess)return NO;
    OSStatus result=SecRequirementCreateWithString((__bridge CFStringRef)PHRequirement(team),kSecCSDefaultFlags,&requirement);if(result==errSecSuccess)result=SecStaticCodeCheckValidity(code,kSecCSStrictValidate,requirement);if(requirement)CFRelease(requirement);CFRelease(code);return result==errSecSuccess;
}
static dispatch_queue_t PHQueue(void){static dispatch_once_t once;dispatch_once(&once,^{PWClientQueue=dispatch_queue_create("com.rain9.pinwall.hardware-client",DISPATCH_QUEUE_SERIAL);});return PWClientQueue;}
unsigned long long pinwall_hardware_generation(void){return atomic_load(&PWHardwareEpoch);}
static void PHDisconnect(void){dispatch_async(PHQueue(),^{if(PWClient){xpc_connection_cancel(PWClient);PWClient=nil;}});}
void pinwall_hardware_clear(void){atomic_fetch_add(&PWHardwareEpoch,1);PHDisconnect();}
static NSDictionary *PHSend(NSDictionary *request,NSString *team,unsigned long long epoch) API_AVAILABLE(macos(14.0));
static NSDictionary *PHSend(NSDictionary *request,NSString *team,unsigned long long epoch){
    __block xpc_connection_t connection=nil;dispatch_sync(PHQueue(),^{
        if(epoch!=atomic_load(&PWHardwareEpoch))return;
        if(!PWClient){xpc_connection_t created=xpc_connection_create_mach_service(PW_HELPER_ID.UTF8String,PHQueue(),XPC_CONNECTION_MACH_SERVICE_PRIVILEGED);if(!created)return;
            if(xpc_connection_set_peer_code_signing_requirement(created,PHRequirement(team).UTF8String)!=0){xpc_connection_set_event_handler(created,^(xpc_object_t ignored){(void)ignored;});xpc_connection_resume(created);xpc_connection_cancel(created);return;}
            xpc_connection_set_event_handler(created,^(xpc_object_t event){if(xpc_get_type(event)==XPC_TYPE_ERROR&&PWClient==created){xpc_connection_cancel(created);PWClient=nil;}if(xpc_get_type(event)==XPC_TYPE_ERROR)xpc_connection_set_event_handler(created,^(xpc_object_t ignored){(void)ignored;});});PWClient=created;xpc_connection_resume(created);
        }connection=PWClient;
    });if(!connection)return PHError(epoch!=atomic_load(&PWHardwareEpoch)?@"tool_cancelled":@"hardware_unavailable");
    NSData *data=[NSJSONSerialization dataWithJSONObject:request options:0 error:NULL];if(!data||data.length>4096)return PHError(@"hardware_invalid");
    xpc_object_t message=xpc_dictionary_create(NULL,NULL,0);xpc_dictionary_set_uint64(message,"version",1);xpc_dictionary_set_data(message,"request",data.bytes,data.length);
    dispatch_semaphore_t complete=dispatch_semaphore_create(0);__block NSDictionary *result=nil;
    xpc_connection_send_message_with_reply(connection,message,PHQueue(),^(xpc_object_t response){
        if(xpc_get_type(response)!=XPC_TYPE_DICTIONARY||xpc_dictionary_get_uint64(response,"version")!=1)result=PHError(@"hardware_unavailable");else{size_t length=0;const void *bytes=xpc_dictionary_get_data(response,"response",&length);if(!bytes||length>65536)result=PHError(@"hardware_invalid");else{NSDictionary *value=[NSJSONSerialization JSONObjectWithData:[NSData dataWithBytes:bytes length:length] options:0 error:NULL];result=[value isKindOfClass:NSDictionary.class]?value:PHError(@"hardware_invalid");}}dispatch_semaphore_signal(complete);
    });
    if(dispatch_semaphore_wait(complete,dispatch_time(DISPATCH_TIME_NOW,4*NSEC_PER_SEC))){pinwall_hardware_clear();return PHError(@"hardware_timeout");}
    if(epoch!=atomic_load(&PWHardwareEpoch))return PHError(@"tool_cancelled");return result?:PHError(@"hardware_unavailable");
}
NSDictionary *pinwall_hardware_request(NSDictionary *request){
    if(@available(macOS 14.0,*)){
        NSString *team=PHTeam();if(!team)return PHError(@"hardware_signing_required");if(!PHBundle(team))return PHError(@"hardware_helper_missing");
        unsigned long long epoch=[request[@"epoch"] unsignedLongLongValue];if(epoch!=atomic_load(&PWHardwareEpoch))return PHError(@"tool_cancelled");
        NSString *method=request[@"method"];SMAppService *service=[SMAppService daemonServiceWithPlistName:PW_DAEMON_PLIST];
        if([method isEqual:@"service"])return @{@"service":@(service.status)};
        if([method isEqual:@"register"]){__block BOOL ok=NO;dispatch_sync(dispatch_get_main_queue(),^{if(epoch!=atomic_load(&PWHardwareEpoch))return;NSError *error=nil;ok=[service registerAndReturnError:&error];if(!ok&&service.status==SMAppServiceStatusEnabled)ok=YES;});if(ok&&service.status==SMAppServiceStatusEnabled){NSDictionary *resumed=PHSend(@{@"method":@"resume"},team,epoch);if(resumed[@"error"])return resumed;}return ok?@{@"service":@(service.status)}:PHError(@"hardware_register_failed");}
        if([method isEqual:@"unregister"]){if(service.status==SMAppServiceStatusEnabled){NSDictionary *stopped=PHSend(@{@"method":@"retire"},team,epoch);if(stopped[@"error"]||[stopped[@"recoveryRequired"] boolValue])return stopped;}unsigned long long expected=epoch,unregisterEpoch=epoch+1;if(!atomic_compare_exchange_strong(&PWHardwareEpoch,&expected,unregisterEpoch))return PHError(@"tool_cancelled");PHDisconnect();__block BOOL ok=NO;dispatch_sync(dispatch_get_main_queue(),^{if(unregisterEpoch!=atomic_load(&PWHardwareEpoch))return;NSError *error=nil;ok=[service unregisterAndReturnError:&error];});return ok?@{@"service":@(service.status)}:PHError(@"hardware_register_failed");}
        if(service.status!=SMAppServiceStatusEnabled)return PHError(@"hardware_approval_required");
        NSMutableDictionary *payload=[request mutableCopy];[payload removeObjectForKey:@"domain"];[payload removeObjectForKey:@"epoch"];
        return PHSend(payload,team,epoch);
    }return PHError(@"desktop_unsupported");
}
