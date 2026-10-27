// PinWall's original, narrow privileged helper. No shell, caller paths or arbitrary SMC keys.
#import <Foundation/Foundation.h>
#import <Security/Security.h>
#import <SystemConfiguration/SystemConfiguration.h>
#import <IOKit/IOKitLib.h>
#import <IOKit/IOMessage.h>
#import <IOKit/pwr_mgt/IOPMLib.h>
#import <IOKit/pwr_mgt/IOPMLibDefs.h>
#import <IOKit/pwr_mgt/IOPM.h>
#import <xpc/xpc.h>
#import <sys/stat.h>
#import <fcntl.h>
#import <unistd.h>
#import <signal.h>
#import "hardware_policy.h"
#define PW_SERVICE "com.rain9.pinwall.hardware-helper"
#define PW_APP "com.rain9.pinwall"
typedef struct{uint8_t major,minor,build,reserved;uint16_t release;} PWVersion;
typedef struct{uint16_t version,length;uint32_t cpu,gpu,memory;} PWPLimit;
typedef struct{uint32_t size,type;uint8_t attributes;} PWKeyInfo;
typedef struct{uint32_t key;PWVersion version;PWPLimit limits;PWKeyInfo info;uint8_t result,status,command;uint32_t index;uint8_t bytes[32];} PWSMCData;
_Static_assert(sizeof(PWSMCData)==80,"SMC ABI size must be 80");
static uint32_t PWKey(const char *s){return ((uint32_t)(uint8_t)s[0]<<24)|((uint32_t)(uint8_t)s[1]<<16)|((uint32_t)(uint8_t)s[2]<<8)|(uint8_t)s[3];}
static io_connect_t PWConnection,PWPowerConnection;
static IONotificationPortRef PWPowerPort;
static io_object_t PWPowerNotifier;
static int PWStateDir=-1;
static NSInteger PWFan=-1;
static BOOL PWLid=NO,PWRecovery=NO,PWRetiring=NO;
static xpc_connection_t PWOwner;
static NSTimeInterval PWLease,PWDeadline;
static dispatch_source_t PWTimer;
static dispatch_queue_t PWQueue;
static NSMutableArray *PWSignals;
static IOPMAssertionID PWAssertion=kIOPMNullAssertionID;
// Test mode is reachable only through --self-test and substitutes all machine IO.
static BOOL PWTesting=NO,PWTestJournalOK=YES,PWTestAutoFail=NO,PWTestPeerAllowed=YES;
static double PWTestMode=0,PWTestTarget=3000;
static NSMutableArray<NSString *> *PWTestTrace;
static NSDictionary *PWError(NSString *code){return @{@"error":code};}
static NSString *PWTeam(void){
    SecCodeRef code=NULL;CFDictionaryRef info=NULL;
    if(SecCodeCopySelf(kSecCSDefaultFlags,&code)!=errSecSuccess)return nil;
    OSStatus status=SecCodeCopySigningInformation(code,kSecCSSigningInformation,&info);
    if(status!=errSecSuccess){CFRelease(code);return nil;}
    NSDictionary *data=CFBridgingRelease(info);NSString *team=data[(__bridge NSString *)kSecCodeInfoTeamIdentifier];
    BOOL valid=[data[(__bridge NSString *)kSecCodeInfoIdentifier] isEqual:@"com.rain9.pinwall.hardware-helper"]&&[team isKindOfClass:NSString.class]&&team.length==10&&[team rangeOfCharacterFromSet:[[NSCharacterSet characterSetWithCharactersInString:@"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"] invertedSet]].location==NSNotFound;
    if(valid){
        NSString *text=[NSString stringWithFormat:@"identifier \"com.rain9.pinwall.hardware-helper\" and anchor apple generic and certificate leaf[field.1.2.840.113635.100.6.1.13] exists and certificate leaf[subject.OU] = \"%@\"",team];
        SecRequirementRef requirement=NULL;
        status=SecRequirementCreateWithString((__bridge CFStringRef)text,kSecCSDefaultFlags,&requirement);
        if(status==errSecSuccess)status=SecCodeCheckValidity(code,kSecCSStrictValidate,requirement);
        if(requirement)CFRelease(requirement);valid=status==errSecSuccess;
    }
    CFRelease(code);return valid?team:nil;
}
static BOOL PWSMCOpen(void){if(PWConnection)return YES;io_service_t service=IOServiceGetMatchingService(kIOMainPortDefault,IOServiceMatching("AppleSMC"));if(!service)return NO;kern_return_t status=IOServiceOpen(service,mach_task_self(),0,&PWConnection);IOObjectRelease(service);return status==KERN_SUCCESS;}
static BOOL PWSMCInfo(const char *key,PWSMCData *output){if(!PWSMCOpen())return NO;PWSMCData input={0};input.key=PWKey(key);input.command=9;size_t size=sizeof(*output);memset(output,0,size);return IOConnectCallStructMethod(PWConnection,2,&input,sizeof(input),output,&size)==KERN_SUCCESS&&size==sizeof(*output)&&output->result==0&&output->info.size>0&&output->info.size<=32;}
static BOOL PWSMCRead(const char *key,PWSMCData *output){PWSMCData info;if(!PWSMCInfo(key,&info))return NO;PWSMCData input={0};input.key=PWKey(key);input.info.size=info.info.size;input.command=5;size_t size=sizeof(*output);memset(output,0,size);if(IOConnectCallStructMethod(PWConnection,2,&input,sizeof(input),output,&size)!=KERN_SUCCESS||size!=sizeof(*output)||output->result)return NO;output->info=info.info;return YES;}
static double PWDecode(const PWSMCData *data){if(data->info.type==PWKey("fpe2")&&data->info.size==2)return (data->bytes[0]*256+data->bytes[1])/4.;if(data->info.type==PWKey("sp78")&&data->info.size==2)return (int16_t)(data->bytes[0]*256+data->bytes[1])/256.;if(data->info.type==PWKey("flt ")&&data->info.size==4){float value;memcpy(&value,data->bytes,4);return isfinite(value)?value:NAN;}if(data->info.type==PWKey("ui8 ")&&data->info.size==1)return data->bytes[0];return NAN;}
static double PWReadNumber(const char *key){if(PWTesting){if(!strcmp(key,"F0Md"))return PWTestMode;if(!strcmp(key,"F0Tg"))return PWTestTarget;return NAN;}PWSMCData data;return PWSMCRead(key,&data)?PWDecode(&data):NAN;}
static BOOL PWModeType(const PWSMCData *data){return data->info.type==PWKey("ui8 ")&&data->info.size==1;}
static BOOL PWTargetType(const PWSMCData *data){return (data->info.type==PWKey("fpe2")&&data->info.size==2)||(data->info.type==PWKey("flt ")&&data->info.size==4);}
static BOOL PWControllable(unsigned fan,double mode){if(mode!=0)return NO;char key[5];PWSMCData info;snprintf(key,sizeof(key),"F%uMd",fan);if(!PWSMCInfo(key,&info)||!PWModeType(&info))return NO;snprintf(key,sizeof(key),"F%uTg",fan);return PWSMCInfo(key,&info)&&PWTargetType(&info);}
static BOOL PWSMCWriteNumber(const char *key,double value){if(PWTesting){[PWTestTrace addObject:[NSString stringWithFormat:@"write:%s:%g",key,value]];if(!strcmp(key,"F0Md")){if(value==0&&PWTestAutoFail)return NO;PWTestMode=value;return YES;}if(!strcmp(key,"F0Tg")){PWTestTarget=value;return YES;}return NO;}PWSMCData info;if(!isfinite(value)||value<0||!PWSMCInfo(key,&info))return NO;PWSMCData input={0},output={0};input.key=PWKey(key);input.info.size=info.info.size;input.command=6;if(info.info.type==PWKey("fpe2")&&info.info.size==2){if(value>16383.75)return NO;uint16_t raw=(uint16_t)llround(value*4);input.bytes[0]=raw>>8;input.bytes[1]=raw&255;}else if(info.info.type==PWKey("flt ")&&info.info.size==4){float raw=(float)value;memcpy(input.bytes,&raw,4);}else if(info.info.type==PWKey("ui8 ")&&info.info.size==1&&value<=255&&floor(value)==value)input.bytes[0]=(uint8_t)value;else return NO;size_t size=sizeof(output);return IOConnectCallStructMethod(PWConnection,2,&input,sizeof(input),&output,&size)==KERN_SUCCESS&&size==sizeof(output)&&output.result==0;}
static double PWTemperature(void){if(PWTesting)return 45;const char *keys[]={"TC0P","TC0D","Tp0C","Tp01","Tp09","Tp0P"};double value=NAN;for(size_t n=0;n<sizeof(keys)/sizeof(*keys);n++){double v=PWReadNumber(keys[n]);if(isfinite(v)&&v>0&&v<125)value=isfinite(value)?fmax(value,v):v;}return value;}
static NSDictionary *PWBattery(void){if(PWTesting)return @{@"ac":@YES,@"hasBattery":@YES};io_service_t battery=IOServiceGetMatchingService(kIOMainPortDefault,IOServiceMatching("AppleSmartBattery"));if(!battery)return @{@"ac":@YES,@"hasBattery":@NO};CFTypeRef external=IORegistryEntryCreateCFProperty(battery,CFSTR("ExternalConnected"),kCFAllocatorDefault,0);BOOL ac=external&&CFGetTypeID(external)==CFBooleanGetTypeID()&&CFBooleanGetValue(external);if(external)CFRelease(external);IOObjectRelease(battery);return @{@"ac":@((BOOL)ac),@"hasBattery":@YES};}
static NSDictionary *PWLidState(void){if(PWTesting)return @{@"hasLid":@YES,@"disabled":@((BOOL)PWLid)};io_service_t root=IOServiceGetMatchingService(kIOMainPortDefault,IOServiceMatching("IOPMrootDomain"));if(!root)return @{@"hasLid":@NO,@"disabled":@NO};CFTypeRef state=IORegistryEntryCreateCFProperty(root,CFSTR(kAppleClamshellStateKey),kCFAllocatorDefault,0);CFTypeRef causes=IORegistryEntryCreateCFProperty(root,CFSTR(kAppleClamshellCausesSleepKey),kCFAllocatorDefault,0);BOOL has=state&&CFGetTypeID(state)==CFBooleanGetTypeID()&&causes&&CFGetTypeID(causes)==CFBooleanGetTypeID();BOOL disabled=has&&!CFBooleanGetValue(causes);if(state)CFRelease(state);if(causes)CFRelease(causes);IOObjectRelease(root);return @{@"hasLid":@((BOOL)has),@"disabled":@((BOOL)disabled)};}
static BOOL PWSetLid(BOOL disable){if(PWTesting){[PWTestTrace addObject:disable?@"lid:1":@"lid:0"];return YES;}io_connect_t root=IOPMFindPowerManagement(kIOMainPortDefault);if(!root)return NO;uint64_t input=disable?1:0;IOReturn status=IOConnectCallScalarMethod(root,kPMSetClamshellSleepState,&input,1,NULL,NULL);IOServiceClose(root);return status==kIOReturnSuccess;}
static BOOL PWJournal(void){if(PWTesting){[PWTestTrace addObject:@"journal"];return PWTestJournalOK;}if(PWStateDir<0)return NO;NSDictionary *state=@{@"schemaVersion":@1,@"fan":@(PWFan),@"lid":@((BOOL)PWLid)};NSData *bytes=[NSJSONSerialization dataWithJSONObject:state options:0 error:NULL];NSString *temp=[@".state-" stringByAppendingString:NSUUID.UUID.UUIDString];int fd=openat(PWStateDir,temp.UTF8String,O_WRONLY|O_CREAT|O_EXCL|O_NOFOLLOW,0600);if(fd<0)return NO;BOOL ok=write(fd,bytes.bytes,bytes.length)==(ssize_t)bytes.length&&fsync(fd)==0;close(fd);if(ok)ok=renameat(PWStateDir,temp.UTF8String,PWStateDir,"state.json")==0&&fsync(PWStateDir)==0;if(!ok)unlinkat(PWStateDir,temp.UTF8String,0);return ok;}
static BOOL PWLoadJournal(void){const char *directory="/var/db/com.rain9.pinwall.hardware";if(mkdir(directory,0700)!=0&&errno!=EEXIST)return NO;PWStateDir=open(directory,O_RDONLY|O_DIRECTORY|O_NOFOLLOW);struct stat meta;if(PWStateDir<0||fstat(PWStateDir,&meta)!=0||meta.st_uid!=0||(meta.st_mode&077)!=0)return NO;int fd=openat(PWStateDir,"state.json",O_RDONLY|O_NOFOLLOW|O_NONBLOCK);if(fd<0)return errno==ENOENT;if(fstat(fd,&meta)!=0||!S_ISREG(meta.st_mode)||meta.st_uid!=0||meta.st_nlink!=1||meta.st_size>512||(meta.st_mode&077)!=0){close(fd);return NO;}char bytes[513];ssize_t length=read(fd,bytes,513);close(fd);if(length<0||length>512)return NO;NSDictionary *value=[NSJSONSerialization JSONObjectWithData:[NSData dataWithBytes:bytes length:(NSUInteger)length] options:0 error:NULL];if(![value isKindOfClass:NSDictionary.class]||value.count!=3||![value[@"schemaVersion"] isEqual:@1]||![value[@"fan"] isKindOfClass:NSNumber.class]||![value[@"lid"] isKindOfClass:NSNumber.class])return NO;double fan=[value[@"fan"] doubleValue];if(!isfinite(fan)||floor(fan)!=fan||fan< -1||fan>3||CFGetTypeID((__bridge CFTypeRef)value[@"lid"])!=CFBooleanGetTypeID())return NO;PWFan=(NSInteger)fan;PWLid=[value[@"lid"] boolValue];PWRecovery=PWFan>=0||PWLid;return YES;}
static BOOL PWReset(void){BOOL ok=YES;if(PWAssertion!=kIOPMNullAssertionID){IOReturn released=IOPMAssertionRelease(PWAssertion);if(released==kIOReturnSuccess||released==kIOReturnNotFound)PWAssertion=kIOPMNullAssertionID;else ok=NO;}if(PWFan>=0){char key[5];snprintf(key,sizeof(key),"F%ldMd",(long)PWFan);if(PWSMCWriteNumber(key,0)&&PWReadNumber(key)==0)PWFan=-1;else ok=NO;}if(PWLid){if(PWSetLid(NO))PWLid=NO;else ok=NO;}if(!PWJournal())ok=NO;PWRecovery=!ok;if(ok){PWOwner=NULL;PWLease=0;PWDeadline=0;if(PWTimer){dispatch_source_cancel(PWTimer);PWTimer=nil;}if(PWConnection){IOServiceClose(PWConnection);PWConnection=0;}}return ok;}
static NSArray *PWFans(void){if(PWTesting)return @[@{@"id":@0,@"minimum":@1200,@"maximum":@6000,@"current":@3000,@"controllable":@((BOOL)(PWTestMode==0)),@"manual":@((BOOL)(PWTestMode!=0))}];double count=PWReadNumber("FNum");NSMutableArray *fans=[NSMutableArray new];if(!isfinite(count)||floor(count)!=count||count<0||count>4)return fans;for(unsigned n=0;n<(unsigned)count;n++){char key[5];snprintf(key,sizeof(key),"F%uMn",n);double minimum=PWReadNumber(key);snprintf(key,sizeof(key),"F%uMx",n);double maximum=PWReadNumber(key);snprintf(key,sizeof(key),"F%uAc",n);double current=PWReadNumber(key);snprintf(key,sizeof(key),"F%uMd",n);double mode=PWReadNumber(key);if(isfinite(minimum)&&isfinite(maximum)&&isfinite(current)&&minimum>=0&&maximum>minimum&&maximum<=12000&&current>=0&&current<=maximum)[fans addObject:@{@"id":@(n),@"minimum":@(minimum),@"maximum":@(maximum),@"current":@(current),@"controllable":@((BOOL)PWControllable(n,mode)),@"manual":@((BOOL)(isfinite(mode)&&mode!=0))}];}return fans;}
static NSDictionary *PWStatus(void){double temperature=PWTemperature();NSDictionary *battery=PWBattery(),*lid=PWLidState();NSDictionary *status=@{@"fans":PWFans(),@"temperature":isfinite(temperature)?@(temperature):NSNull.null,@"onAc":battery[@"ac"],@"hasLid":lid[@"hasLid"],@"lidDisabled":lid[@"disabled"],@"fanActive":@(PWFan),@"lidActive":@((BOOL)PWLid),@"recoveryRequired":@((BOOL)PWRecovery),@"remaining":@(PWDeadline?fmax(0,PWDeadline-NSProcessInfo.processInfo.systemUptime):0)};if(!PWOwner&&PWConnection){IOServiceClose(PWConnection);PWConnection=0;}return status;}
static int PWThermal(void){return PWTesting?0:(int)NSProcessInfo.processInfo.thermalState;}
static BOOL PWPeerActive(xpc_connection_t peer);
static void PWWatch(void){if(PWTimer)return;PWTimer=dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER,0,0,PWQueue);dispatch_source_set_timer(PWTimer,dispatch_time(DISPATCH_TIME_NOW,NSEC_PER_SEC),NSEC_PER_SEC,100*NSEC_PER_MSEC);dispatch_source_set_event_handler(PWTimer,^{double time=NSProcessInfo.processInfo.systemUptime;if(PWRecovery||!PWPeerActive(PWOwner)||PWLeaseExpired(time,PWLease,PWDeadline,[PWBattery()[@"ac"] boolValue],PWThermal(),PWTemperature()))if(!PWReset())NSLog(@"[HardwareHelper] Recovery pending; retrying automatic control");});dispatch_resume(PWTimer);}
static BOOL PWPeerActive(xpc_connection_t peer){if(PWTesting)return PWTestPeerAllowed;if(!peer)return NO;uid_t console=0;gid_t group=0;CFStringRef user=SCDynamicStoreCopyConsoleUser(NULL,&console,&group);if(user)CFRelease(user);return console!=0&&xpc_connection_get_euid(peer)==console;}
static void PWPowerEvent(void *context,io_service_t service,natural_t message,void *argument){
    (void)context;(void)service;
    if(message==kIOMessageSystemWillSleep||message==kIOMessageSystemHasPoweredOn){if(!PWReset())PWWatch();}
    // Never veto an explicit system sleep, even if restoration needs retrying after wake.
    if(!PWTesting&&(message==kIOMessageCanSystemSleep||message==kIOMessageSystemWillSleep))IOAllowPowerChange(PWPowerConnection,(intptr_t)argument);
}
static BOOL PWExactKeys(NSDictionary *request,NSArray *keys){return request.count==keys.count&&[[NSSet setWithArray:request.allKeys] isEqual:[NSSet setWithArray:keys]];}
static NSDictionary *PWRequest(NSDictionary *request,xpc_connection_t peer){
    if(!PWPeerActive(peer)){if(PWOwner==peer&&!PWReset())PWWatch();return PWError(@"hardware_unavailable");}
    if(![request isKindOfClass:NSDictionary.class]||![request[@"method"] isKindOfClass:NSString.class])return PWError(@"hardware_invalid");NSString *method=request[@"method"];double time=NSProcessInfo.processInfo.systemUptime;
    if([method isEqual:@"status"]&&PWExactKeys(request,@[@"method"])){if(peer==PWOwner&&!PWRecovery){if(time>=PWLease||time>=PWDeadline){if(!PWReset())PWWatch();}else PWLease=time+5;}return PWStatus();}
    if(([method isEqual:@"stop"]||[method isEqual:@"retire"]||[method isEqual:@"resume"])&&PWExactKeys(request,@[@"method"])){if(PWOwner&&PWOwner!=peer)return PWError(@"hardware_busy");if(!PWReset()){PWWatch();return PWError(@"hardware_recovery");}if([method isEqual:@"retire"])PWRetiring=YES;if([method isEqual:@"resume"])PWRetiring=NO;return PWStatus();}
    if(PWRetiring)return PWError(@"hardware_busy");
    if(PWRecovery)return PWError(@"hardware_recovery");if(PWOwner)return PWError(@"hardware_busy");
    if(![request[@"seconds"] isKindOfClass:NSNumber.class])return PWError(@"hardware_invalid");double seconds=[request[@"seconds"] doubleValue];if(!isfinite(seconds)||floor(seconds)!=seconds||seconds<15||seconds>300)return PWError(@"hardware_invalid");
    if([method isEqual:@"fan"]&&PWExactKeys(request,@[@"method",@"fan",@"rpm",@"seconds"])){
        if(![request[@"fan"] isKindOfClass:NSNumber.class]||![request[@"rpm"] isKindOfClass:NSNumber.class])return PWError(@"hardware_invalid");double index=[request[@"fan"] doubleValue],rpm=[request[@"rpm"] doubleValue];if(!isfinite(index)||floor(index)!=index||index<0||index>3)return PWError(@"hardware_invalid");NSDictionary *selected=nil;NSArray *fans=PWFans();for(NSDictionary *fan in fans)if([fan[@"id"] integerValue]==(NSInteger)index)selected=fan;
        if(!selected||![selected[@"controllable"] boolValue]||!PWFanPolicy((unsigned)index,4,rpm,[selected[@"minimum"] doubleValue],[selected[@"maximum"] doubleValue],[selected[@"current"] doubleValue],PWTemperature(),[PWBattery()[@"ac"] boolValue],PWThermal(),(unsigned)seconds))return PWError(@"hardware_safety");
        PWFan=(NSInteger)index;PWOwner=peer;PWRecovery=YES;if(!PWJournal()){if(!PWReset())PWWatch();return PWError(@"hardware_recovery");}
        char target[5],mode[5];snprintf(target,sizeof(target),"F%ldTg",(long)PWFan);snprintf(mode,sizeof(mode),"F%ldMd",(long)PWFan);
        if(!PWSMCWriteNumber(target,rpm)||!PWSMCWriteNumber(mode,1)||PWReadNumber(mode)!=1){PWReset();PWWatch();return PWError(@"hardware_unavailable");}
    }else if([method isEqual:@"lid"]&&PWExactKeys(request,@[@"method",@"seconds"])){
        NSDictionary *lid=PWLidState();if(!PWLidPolicy([lid[@"hasLid"] boolValue],[lid[@"disabled"] boolValue],[PWBattery()[@"ac"] boolValue],PWThermal(),PWTemperature(),(unsigned)seconds))return PWError(@"hardware_safety");
        PWLid=YES;PWOwner=peer;PWRecovery=YES;if(!PWJournal()){if(!PWReset())PWWatch();return PWError(@"hardware_recovery");}if((!PWTesting&&IOPMAssertionCreateWithDescription(kIOPMAssertPreventUserIdleSystemSleep,CFSTR("PinWall timed lid session"),NULL,NULL,NULL,seconds,kIOPMAssertionTimeoutActionRelease,&PWAssertion)!=kIOReturnSuccess)||!PWSetLid(YES)){PWReset();PWWatch();return PWError(@"hardware_unavailable");}
    }else return PWError(@"hardware_invalid");
    PWRecovery=NO;PWLease=time+5;PWDeadline=time+seconds;PWWatch();return PWStatus();
}
static int PWTest(void){unsigned pass=0;
#define CHECK(x) do{if(!(x))return 1;pass++;}while(0)
 CHECK(PWFanPolicy(0,2,4000,1200,6000,3000,45,true,0,60));CHECK(!PWFanPolicy(0,2,2000,1200,6000,3000,45,true,0,60));CHECK(!PWFanPolicy(0,2,7000,1200,6000,3000,45,true,0,60));CHECK(!PWFanPolicy(0,2,4000,1200,6000,3000,NAN,true,0,60));CHECK(!PWFanPolicy(0,2,4000,1200,6000,3000,60,true,0,60));CHECK(!PWFanPolicy(0,2,4000,1200,6000,3000,45,false,0,60));CHECK(!PWFanPolicy(0,2,4000,1200,6000,3000,45,true,2,60));CHECK(!PWFanPolicy(4,4,4000,1200,6000,3000,45,true,0,60));CHECK(!PWFanPolicy(0,2,4000,1200,6000,3000,45,true,0,301));CHECK(PWLidPolicy(true,false,true,0,45,60));CHECK(!PWLidPolicy(true,true,true,0,45,60));CHECK(!PWLidPolicy(false,false,true,0,45,60));CHECK(!PWLidPolicy(true,false,false,0,45,60));CHECK(PWLeaseExpired(10,10,100,true,0,45));CHECK(PWLeaseExpired(10,20,10,true,0,45));CHECK(PWLeaseExpired(10,20,100,true,0,75));CHECK(PWLeaseExpired(10,20,100,false,0,45));CHECK(!PWLeaseExpired(10,20,100,true,0,45));PWSMCData data={0};data.info.type=PWKey("fpe2");data.info.size=2;data.bytes[0]=0x3e;data.bytes[1]=0x80;CHECK(PWDecode(&data)==4000);data.info.type=PWKey("sp78");data.bytes[0]=45;data.bytes[1]=128;CHECK(PWDecode(&data)==45.5);CHECK(PWExactKeys(@{@"method":@"status"},@[@"method"]));CHECK(!PWExactKeys(@{@"method":@"status",@"command":@"unsafe"},@[@"method"]));PWTesting=YES;PWTestTrace=[NSMutableArray new];PWQueue=dispatch_queue_create("com.rain9.pinwall.helper-tests",DISPATCH_QUEUE_SERIAL);xpc_connection_t peer=xpc_connection_create(NULL,PWQueue);xpc_connection_set_event_handler(peer,^(xpc_object_t ignored){(void)ignored;});xpc_connection_resume(peer);
NSDictionary *result=PWRequest(@{@"method":@"fan",@"fan":@0,@"rpm":@4000,@"seconds":@60},peer);CHECK(result[@"error"]==nil);CHECK(PWFan==0&&PWTestMode==1);CHECK([PWTestTrace[0] isEqual:@"journal"]);CHECK([PWTestTrace[1] isEqual:@"write:F0Tg:4000"]);CHECK([PWTestTrace[2] isEqual:@"write:F0Md:1"]);CHECK([PWRequest(@{@"method":@"fan",@"fan":@0,@"rpm":@4000,@"seconds":@60},peer)[@"error"] isEqual:@"hardware_busy"]);
PWTestAutoFail=YES;CHECK(!PWReset());CHECK(PWRecovery&&PWFan==0&&PWOwner==peer);PWTestAutoFail=NO;CHECK(PWReset());CHECK(PWFan== -1&&PWTestMode==0&&PWOwner==nil);
[PWTestTrace removeAllObjects];PWTestJournalOK=NO;result=PWRequest(@{@"method":@"fan",@"fan":@0,@"rpm":@4000,@"seconds":@60},peer);CHECK([result[@"error"] isEqual:@"hardware_recovery"]);CHECK(![PWTestTrace containsObject:@"write:F0Md:1"]);PWTestJournalOK=YES;CHECK(PWReset());
[PWTestTrace removeAllObjects];result=PWRequest(@{@"method":@"lid",@"seconds":@60},peer);CHECK(result[@"error"]==nil&&PWLid);CHECK([PWTestTrace[0] isEqual:@"journal"]);CHECK([PWTestTrace[1] isEqual:@"lid:1"]);CHECK(PWReset()&&!PWLid);CHECK([PWTestTrace containsObject:@"lid:0"]);CHECK(PWRequest(@{@"method":@"retire"},peer)[@"error"]==nil);CHECK([PWRequest(@{@"method":@"lid",@"seconds":@60},peer)[@"error"] isEqual:@"hardware_busy"]);CHECK(PWRequest(@{@"method":@"resume"},peer)[@"error"]==nil);
result=PWRequest(@{@"method":@"fan",@"fan":@0,@"rpm":@4000,@"seconds":@60},peer);CHECK(result[@"error"]==nil);PWLease=0;result=PWRequest(@{@"method":@"status"},peer);CHECK([result[@"fanActive"] integerValue]== -1&&PWTestMode==0);
result=PWRequest(@{@"method":@"lid",@"seconds":@60},peer);CHECK(result[@"error"]==nil);PWTestPeerAllowed=NO;CHECK([PWRequest(@{@"method":@"status"},peer)[@"error"] isEqual:@"hardware_unavailable"]);CHECK(!PWLid&&PWOwner==nil);PWTestPeerAllowed=YES;
PWTestJournalOK=NO;PWTestAutoFail=YES;result=PWRequest(@{@"method":@"fan",@"fan":@0,@"rpm":@4000,@"seconds":@60},peer);CHECK([result[@"error"] isEqual:@"hardware_recovery"]);CHECK(PWTimer!=nil&&PWRecovery);PWTestJournalOK=YES;PWTestAutoFail=NO;CHECK(PWReset());
data.info.type=PWKey("ui8 ");data.info.size=1;CHECK(PWModeType(&data)&&!PWTargetType(&data));data.info.type=PWKey("flt ");data.info.size=4;CHECK(!PWModeType(&data)&&PWTargetType(&data));data.info.size=3;CHECK(!PWTargetType(&data));
result=PWRequest(@{@"method":@"lid",@"seconds":@60},peer);CHECK(result[@"error"]==nil);PWPowerEvent(NULL,0,kIOMessageSystemWillSleep,NULL);CHECK(!PWLid&&PWOwner==nil);
xpc_connection_cancel(peer);printf("hardware helper synthetic checks: %u\n",pass);return 0;}
int main(int argc,const char **argv){@autoreleasepool{
    if(argc==2&&strcmp(argv[1],"--self-test")==0)return PWTest();if(argc!=1||geteuid()!=0)return 77;NSString *team=PWTeam();if(!team)return 77;
    if(!PWLoadJournal()){NSLog(@"[HardwareHelper] Recovery journal invalid; refusing hardware operations");return 78;}
    PWQueue=dispatch_queue_create("com.rain9.pinwall.hardware-helper",DISPATCH_QUEUE_SERIAL);
    if(PWRecovery&&!PWReset())PWWatch();
    PWPowerConnection=IORegisterForSystemPower(NULL,&PWPowerPort,PWPowerEvent,&PWPowerNotifier);if(!PWPowerConnection||!PWPowerPort)return 77;IONotificationPortSetDispatchQueue(PWPowerPort,PWQueue);
    NSString *requirement=[NSString stringWithFormat:@"identifier \"%s\" and anchor apple generic and certificate leaf[field.1.2.840.113635.100.6.1.13] exists and certificate leaf[subject.OU] = \"%@\"",PW_APP,team];
    xpc_connection_t listener=xpc_connection_create_mach_service(PW_SERVICE,PWQueue,XPC_CONNECTION_MACH_SERVICE_LISTENER);if(!listener)return 77;if(xpc_connection_set_peer_code_signing_requirement(listener,requirement.UTF8String)!=0){xpc_connection_set_event_handler(listener,^(xpc_object_t ignored){(void)ignored;});xpc_connection_resume(listener);xpc_connection_cancel(listener);return 77;}
    xpc_connection_set_event_handler(listener,^(xpc_object_t event){if(xpc_get_type(event)!=XPC_TYPE_CONNECTION)return;xpc_connection_t peer=(xpc_connection_t)event;if(!PWPeerActive(peer)){xpc_connection_set_event_handler(peer,^(xpc_object_t ignored){(void)ignored;});xpc_connection_resume(peer);xpc_connection_cancel(peer);return;}xpc_connection_set_target_queue(peer,PWQueue);__block unsigned count=0;__block NSTimeInterval period=0;
        xpc_connection_set_event_handler(peer,^(xpc_object_t message){if(xpc_get_type(message)==XPC_TYPE_ERROR){if(PWOwner==peer&&!PWReset())PWWatch();xpc_connection_set_event_handler(peer,^(xpc_object_t ignored){(void)ignored;});return;}if(xpc_get_type(message)!=XPC_TYPE_DICTIONARY)return;double time=NSProcessInfo.processInfo.systemUptime;if(time-period>=1){period=time;count=0;}if(++count>32){xpc_connection_cancel(peer);return;}size_t size=0;const void *bytes=xpc_dictionary_get_data(message,"request",&size);NSDictionary *result;if(xpc_dictionary_get_uint64(message,"version")!=1||!bytes||size>4096)result=PWError(@"hardware_invalid");else{@try{NSDictionary *request=[NSJSONSerialization JSONObjectWithData:[NSData dataWithBytes:bytes length:size] options:0 error:NULL];result=PWRequest(request,peer);}@catch(NSException *exception){(void)exception;if(!PWReset())PWWatch();result=PWError(@"hardware_unavailable");}}xpc_object_t reply=xpc_dictionary_create_reply(message);if(reply){NSData *output=[NSJSONSerialization dataWithJSONObject:result options:0 error:NULL];xpc_dictionary_set_uint64(reply,"version",1);xpc_dictionary_set_data(reply,"response",output.bytes,output.length);xpc_connection_send_message(peer,reply);}
        });xpc_connection_resume(peer);
    });xpc_connection_resume(listener);
    PWSignals=[NSMutableArray new];signal(SIGTERM,SIG_IGN);signal(SIGINT,SIG_IGN);for(int sig=SIGINT;sig<=SIGTERM;sig+=SIGTERM-SIGINT){dispatch_source_t source=dispatch_source_create(DISPATCH_SOURCE_TYPE_SIGNAL,(uintptr_t)sig,0,PWQueue);dispatch_source_set_event_handler(source,^{if(PWReset())exit(0);PWWatch();});[PWSignals addObject:source];dispatch_resume(source);}
    dispatch_main();
}}
