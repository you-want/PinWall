// Session-bound maintenance plans. No root privileges, shell commands or permanent deletion.
#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
#include <sys/stat.h>
#include <libproc.h>
#include <signal.h>
#include <unistd.h>
#include <stdatomic.h>
static NSMutableDictionary *PWMItems,*PWMPlans;
static NSMutableArray *PWMUndo;
static atomic_ullong PWMEpoch;
unsigned long long pinwall_maintenance_generation(void){return atomic_load(&PWMEpoch);}
static dispatch_queue_t PWMQueue(void){static dispatch_queue_t queue;static dispatch_once_t once;dispatch_once(&once,^{queue=dispatch_queue_create("com.pinwall.maintenance",DISPATCH_QUEUE_SERIAL);});return queue;}
void pinwall_maintenance_clear(void){atomic_fetch_add(&PWMEpoch,1);dispatch_async(PWMQueue(),^{PWMItems=nil;PWMPlans=nil;});}
void pinwall_maintenance_forget(void){atomic_fetch_add(&PWMEpoch,1);dispatch_async(PWMQueue(),^{PWMItems=nil;PWMPlans=nil;PWMUndo=nil;});}
static NSDictionary *PWMError(NSString *code){return @{@"error":code};}
static NSString *PWMIdentity(NSURL *url){struct stat st;if(lstat(url.fileSystemRepresentation,&st)||S_ISLNK(st.st_mode))return nil;return [NSString stringWithFormat:@"%llu:%llu",(unsigned long long)st.st_dev,(unsigned long long)st.st_ino];}
static BOOL PWMInside(NSURL *url,NSURL *root){NSString *path=url.URLByStandardizingPath.path,*parent=root.URLByStandardizingPath.path;return [path hasPrefix:[parent stringByAppendingString:@"/"]]&&![path containsString:@"/../"];}
static BOOL PWMAllowedParent(NSURL *url){
    NSURL *home=NSFileManager.defaultManager.homeDirectoryForCurrentUser;
    for(NSURL *root in @[[NSURL fileURLWithPath:@"/Applications"],[home URLByAppendingPathComponent:@"Applications"],[home URLByAppendingPathComponent:@"Library/Caches"],[home URLByAppendingPathComponent:@"Library/Preferences"]]){
        // Exact immediate children only; resolve parent symlinks before comparing boundaries.
        if([url.URLByDeletingLastPathComponent.URLByResolvingSymlinksInPath.path isEqual:root.URLByResolvingSymlinksInPath.path]&&PWMInside(url,root))return YES;
    }return NO;
}
static BOOL PWMAllowed(NSURL *url){return PWMAllowedParent(url)&&PWMIdentity(url)!=nil;}
static NSDictionary *PWMSize(NSURL *url){
    unsigned long long bytes=0;NSUInteger count=0;__block BOOL complete=YES;NSNumber *directory=nil;[url getResourceValue:&directory forKey:NSURLIsDirectoryKey error:NULL];
    if(directory.boolValue){NSDirectoryEnumerator *walk=[NSFileManager.defaultManager enumeratorAtURL:url includingPropertiesForKeys:@[NSURLIsSymbolicLinkKey,NSURLIsRegularFileKey,NSURLFileSizeKey] options:0 errorHandler:^BOOL(NSURL *u,NSError *e){(void)u;(void)e;complete=NO;return NO;}];
        CFAbsoluteTime deadline=CFAbsoluteTimeGetCurrent()+1;
        for(NSURL *entry in walk){if(++count>20000||CFAbsoluteTimeGetCurrent()>deadline){complete=NO;break;}NSNumber *link=nil,*regular=nil,*size=nil;NSError *error=nil;
            if(![entry getResourceValue:&link forKey:NSURLIsSymbolicLinkKey error:&error]){complete=NO;break;}if(link.boolValue){[walk skipDescendants];continue;}[entry getResourceValue:&regular forKey:NSURLIsRegularFileKey error:NULL];if(regular.boolValue&&[entry getResourceValue:&size forKey:NSURLFileSizeKey error:NULL])bytes+=size.unsignedLongLongValue;
        }
    }else{NSNumber *size=nil;if(![url getResourceValue:&size forKey:NSURLFileSizeKey error:NULL])complete=NO;bytes=size.unsignedLongLongValue;}
    return @{@"bytes":@(MIN(bytes,9007199254740991ULL)),@"complete":@(complete)};
}
static NSDictionary *PWMList(BOOL apps){
    PWMItems=[NSMutableDictionary dictionary];PWMPlans=[NSMutableDictionary dictionary];if(!PWMUndo)PWMUndo=[NSMutableArray array];
    NSURL *home=NSFileManager.defaultManager.homeDirectoryForCurrentUser;NSArray *roots=apps?@[[NSURL fileURLWithPath:@"/Applications"],[home URLByAppendingPathComponent:@"Applications"]]:@[[home URLByAppendingPathComponent:@"Library/Caches"]];NSMutableArray *result=[NSMutableArray array];BOOL truncated=NO;
    for(NSURL *root in roots){NSError *error=nil;NSArray *entries=[NSFileManager.defaultManager contentsOfDirectoryAtURL:root includingPropertiesForKeys:@[NSURLIsSymbolicLinkKey] options:NSDirectoryEnumerationSkipsHiddenFiles error:&error];if(!entries&&error&&error.code!=NSFileReadNoSuchFileError&&error.code!=NSFileNoSuchFileError)return PWMError(@"maintenance_unavailable");
        for(NSURL *url in entries){if(result.count>=250){truncated=YES;break;}if(!PWMAllowed(url))continue;NSString *bundleID=@"",*name=url.lastPathComponent;
            if(apps){if(![url.pathExtension.lowercaseString isEqual:@"app"])continue;NSBundle *bundle=[NSBundle bundleWithURL:url];bundleID=bundle.bundleIdentifier;if(!bundleID.length||bundleID.length>128||[bundleID rangeOfCharacterFromSet:[[NSCharacterSet characterSetWithCharactersInString:@"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-"] invertedSet]].location!=NSNotFound||[bundleID containsString:@".."]||[bundleID hasPrefix:@"com.apple."]||[bundleID isEqual:NSBundle.mainBundle.bundleIdentifier])continue;name=[bundle objectForInfoDictionaryKey:@"CFBundleDisplayName"]?:url.lastPathComponent;}
            else if([name hasPrefix:@"com.apple."]||[name isEqual:NSBundle.mainBundle.bundleIdentifier]||[name hasPrefix:@"com.rain9.pinwall"])continue;
            NSString *token=NSUUID.UUID.UUIDString;PWMItems[token]=@{@"url":url,@"identity":PWMIdentity(url),@"app":@(apps),@"bundle":bundleID};
            [result addObject:@{@"token":token,@"name":[name substringToIndex:MIN(name.length,(NSUInteger)256)],@"bundle":bundleID,@"location":[root.path isEqual:@"/Applications"]?@"/Applications":(apps?@"~/Applications":@"~/Library/Caches")}];
        }
    }return @{@"items":result,@"truncated":@(truncated),@"canRestore":@((BOOL)(PWMUndo.count>0))};
}
static BOOL PWMRunning(NSString *bundle){if(!bundle.length)return NO;return [NSRunningApplication runningApplicationsWithBundleIdentifier:bundle].count>0;}
static NSDictionary *PWMPrepare(NSDictionary *request){
    NSDictionary *item=PWMItems[request[@"token"]];if(!item)return PWMError(@"maintenance_expired");NSURL *url=item[@"url"];
    if(!PWMAllowed(url)||![PWMIdentity(url) isEqual:item[@"identity"]])return PWMError(@"maintenance_changed");
    NSString *bundle=item[@"bundle"];if(PWMRunning(bundle))return PWMError(@"maintenance_running");NSMutableArray *targets=[NSMutableArray arrayWithObject:url];
    NSURL *home=NSFileManager.defaultManager.homeDirectoryForCurrentUser;
    if([item[@"app"] boolValue]){
        if([request[@"caches"] boolValue]){NSURL *cache=[home URLByAppendingPathComponent:[@"Library/Caches/" stringByAppendingString:bundle]];if(PWMAllowed(cache))[targets addObject:cache];}
        if([request[@"preferences"] boolValue]){NSURL *prefs=[home URLByAppendingPathComponent:[NSString stringWithFormat:@"Library/Preferences/%@.plist",bundle]];if(PWMAllowed(prefs))[targets addObject:prefs];}
    }
    NSMutableArray *records=[NSMutableArray array],*preview=[NSMutableArray array];for(NSURL *target in targets){NSDictionary *size=PWMSize(target);NSString *identity=PWMIdentity(target);if(!identity)return PWMError(@"maintenance_changed");[records addObject:@{@"url":target,@"identity":identity}];[preview addObject:@{@"name":target.lastPathComponent,@"bytes":size[@"bytes"],@"complete":size[@"complete"]}];}
    NSString *token=NSUUID.UUID.UUIDString;PWMPlans=[NSMutableDictionary dictionaryWithObject:@{@"kind":@"trash",@"targets":records,@"bundle":bundle,@"created":@(CFAbsoluteTimeGetCurrent())} forKey:token];return @{@"kind":@"trash",@"plan":token,@"targets":preview};
}
static NSDictionary *PWMExecute(NSDictionary *request){
    NSString *token=request[@"plan"];NSDictionary *plan=PWMPlans[token];if(![plan[@"kind"] isEqual:@"trash"]||CFAbsoluteTimeGetCurrent()-[plan[@"created"] doubleValue]>120)return PWMError(@"maintenance_expired");
    if(PWMRunning(plan[@"bundle"]))return PWMError(@"maintenance_running");
    for(NSDictionary *item in plan[@"targets"]){NSURL *url=item[@"url"];if(!PWMAllowed(url)||![PWMIdentity(url) isEqual:item[@"identity"]])return PWMError(@"maintenance_changed");}
    [PWMPlans removeObjectForKey:token];NSMutableArray *moved=[NSMutableArray array];BOOL failed=NO;
    unsigned long long epoch=[request[@"epoch"] unsignedLongLongValue];
    for(NSDictionary *item in plan[@"targets"]){if(epoch!=atomic_load(&PWMEpoch)){failed=YES;break;}NSURL *url=item[@"url"],*trash=nil;if(!PWMAllowed(url)||![PWMIdentity(url) isEqual:item[@"identity"]]){failed=YES;break;}NSError *error=nil;if(![NSFileManager.defaultManager trashItemAtURL:url resultingItemURL:&trash error:&error]||!trash){failed=YES;break;}NSString *identity=PWMIdentity(trash);if(!identity){failed=YES;break;}[moved addObject:@{@"original":url,@"trash":trash,@"identity":identity}];}
    if(moved.count){if(PWMUndo.count>=20)[PWMUndo removeObjectAtIndex:0];[PWMUndo addObject:moved];}
    // Even partial completion is retained for explicit restoration; no blind overwrite rollback.
    return @{@"kind":@"moved",@"moved":@(moved.count),@"partial":@(failed),@"canRestore":@((BOOL)(PWMUndo.count>0))};
}
static NSDictionary *PWMRestore(void){
    NSMutableArray *batch=PWMUndo.lastObject;if(!batch)return PWMError(@"maintenance_expired");NSUInteger restored=0;
    for(NSDictionary *item in [batch.copy reverseObjectEnumerator]){NSURL *original=item[@"original"],*trash=item[@"trash"];
        // Originals may have been recreated; never replace them or follow a changed trash item.
        if(!PWMAllowedParent(original)||[NSFileManager.defaultManager fileExistsAtPath:original.path]||![PWMIdentity(trash) isEqual:item[@"identity"]]||!PWMInside(trash,[NSURL fileURLWithPath:NSFileManager.defaultManager.homeDirectoryForCurrentUser.path]))continue;
        NSError *error=nil;if([NSFileManager.defaultManager moveItemAtURL:trash toURL:original error:&error]){[batch removeObject:item];restored++;}
    }
    if(!batch.count)[PWMUndo removeLastObject];return @{@"kind":@"restored",@"restored":@(restored),@"remaining":@(batch.count),@"canRestore":@((BOOL)(PWMUndo.count>0))};
}

static BOOL PWMProcessIdentity(pid_t pid,struct proc_bsdinfo *info,char *path){
    if(pid<=1||pid==getpid()||proc_pidinfo(pid,PROC_PIDTBSDINFO,0,info,sizeof(*info))!=sizeof(*info)||info->pbi_uid!=getuid()||proc_pidpath(pid,path,PROC_PIDPATHINFO_MAXSIZE)<=0)return NO;
    NSString *executable=[NSString stringWithUTF8String:path];if(!executable.length||[executable hasPrefix:[NSBundle.mainBundle.bundlePath stringByAppendingString:@"/"]])return NO;
    for(NSString *prefix in @[@"/System/",@"/usr/",@"/bin/",@"/sbin/",@"/Library/Apple/"])if([executable hasPrefix:prefix])return NO;
    return YES;
}
static NSDictionary *PWMProcesses(void){
    PWMItems=[NSMutableDictionary dictionary];PWMPlans=[NSMutableDictionary dictionary];int pids[4096];int count=proc_listallpids(pids,sizeof(pids));if(count<0)return PWMError(@"maintenance_unavailable");
    NSMutableArray *items=[NSMutableArray array];BOOL truncated=count>=4096;for(int i=0;i<MIN(count,4096);i++){
        struct proc_bsdinfo info={0};char path[PROC_PIDPATHINFO_MAXSIZE]={0};if(!PWMProcessIdentity(pids[i],&info,path))continue;
        if(items.count>=250){truncated=YES;break;}NSString *token=NSUUID.UUID.UUIDString,*name=[[NSString stringWithUTF8String:path] lastPathComponent];
        PWMItems[token]=@{@"kind":@"process",@"pid":@(pids[i]),@"seconds":@(info.pbi_start_tvsec),@"micros":@(info.pbi_start_tvusec),@"path":[NSString stringWithUTF8String:path]};
        [items addObject:@{@"token":token,@"name":[name substringToIndex:MIN(name.length,(NSUInteger)256)],@"pid":@(pids[i])}];
    }return @{@"items":items,@"truncated":@(truncated),@"canRestore":@((BOOL)(PWMUndo.count>0))};
}
static BOOL PWMProcessUnchanged(NSDictionary *record){struct proc_bsdinfo info={0};char path[PROC_PIDPATHINFO_MAXSIZE]={0};return PWMProcessIdentity([record[@"pid"] intValue],&info,path)&&info.pbi_start_tvsec==[record[@"seconds"] unsignedLongLongValue]&&info.pbi_start_tvusec==[record[@"micros"] unsignedLongLongValue]&&[record[@"path"] isEqual:[NSString stringWithUTF8String:path]];}
static NSDictionary *PWMPrepareProcess(NSDictionary *request){
    NSDictionary *record=PWMItems[request[@"token"]];if(![record[@"kind"] isEqual:@"process"]||!PWMProcessUnchanged(record))return PWMError(@"maintenance_changed");
    NSString *token=NSUUID.UUID.UUIDString;PWMPlans=[NSMutableDictionary dictionaryWithObject:@{@"kind":@"signal",@"process":record,@"force":request[@"force"],@"created":@(CFAbsoluteTimeGetCurrent())} forKey:token];
    return @{@"kind":@"signal",@"plan":token,@"pid":record[@"pid"],@"name":[record[@"path"] lastPathComponent],@"force":request[@"force"]};
}
static NSDictionary *PWMSignal(NSDictionary *request){
    NSString *token=request[@"plan"];NSDictionary *plan=PWMPlans[token];if(![plan[@"kind"] isEqual:@"signal"]||CFAbsoluteTimeGetCurrent()-[plan[@"created"] doubleValue]>120)return PWMError(@"maintenance_expired");
    NSDictionary *record=plan[@"process"];if(!PWMProcessUnchanged(record))return PWMError(@"maintenance_changed");[PWMPlans removeObjectForKey:token];
    if(kill([record[@"pid"] intValue],[plan[@"force"] boolValue]?SIGKILL:SIGTERM))return PWMError(@"maintenance_signal_failed");
    return @{@"kind":@"signalled",@"pid":record[@"pid"]}; // Submitted signal, not a claim that the process has exited.
}
static NSDictionary *PWMRequest(NSDictionary *request){
    if([request[@"epoch"] unsignedLongLongValue]!=atomic_load(&PWMEpoch))return PWMError(@"tool_cancelled");
    NSString *method=request[@"method"];if([method isEqual:@"apps"])return PWMList(YES);if([method isEqual:@"caches"])return PWMList(NO);if([method isEqual:@"prepare"])return PWMPrepare(request);if([method isEqual:@"execute"])return PWMExecute(request);if([method isEqual:@"restore"])return PWMRestore();if([method isEqual:@"processes"])return PWMProcesses();if([method isEqual:@"prepareProcess"])return PWMPrepareProcess(request);if([method isEqual:@"signal"])return PWMSignal(request);return PWMError(@"maintenance_invalid");
}
NSDictionary *pinwall_maintenance_request(NSDictionary *request){__block NSDictionary *result=nil;dispatch_sync(PWMQueue(),^{@autoreleasepool{result=PWMRequest(request);}});return result;}
int pinwall_maintenance_boundaries_test(void){@autoreleasepool{
    NSURL *home=NSFileManager.defaultManager.homeDirectoryForCurrentUser;
    if(PWMAllowedParent([NSURL fileURLWithPath:@"/System/Applications/Notes.app"]))return 0;
    if(PWMAllowedParent([home URLByAppendingPathComponent:@"Documents/private"]))return 0;
    if(PWMAllowedParent([home URLByAppendingPathComponent:@"Library/Caches/nested/private"]))return 0;
    if(!PWMAllowedParent([home URLByAppendingPathComponent:@"Library/Caches/com.example.test"]))return 0;
    struct proc_bsdinfo info={0};char path[PROC_PIDPATHINFO_MAXSIZE]={0};if(PWMProcessIdentity(1,&info,path)||PWMProcessIdentity(getpid(),&info,path))return 0;
    return 1;
}}
int pinwall_maintenance_file_fixture_test(void){@autoreleasepool{
    NSFileManager *fm=NSFileManager.defaultManager;NSURL *root=[[NSURL fileURLWithPath:NSTemporaryDirectory()] URLByAppendingPathComponent:[@"pinwall-maintenance-test-" stringByAppendingString:NSUUID.UUID.UUIDString]];
    NSError *error=nil;if(![fm createDirectoryAtURL:root withIntermediateDirectories:NO attributes:@{NSFilePosixPermissions:@0700} error:&error])return 0;
    NSURL *scan=[root URLByAppendingPathComponent:@"scan"],*outside=[root URLByAppendingPathComponent:@"outside"];
    BOOL ok=[fm createDirectoryAtURL:scan withIntermediateDirectories:NO attributes:nil error:NULL];
    ok=ok&&[[NSMutableData dataWithLength:128] writeToURL:outside atomically:YES];
    NSURL *file=[scan URLByAppendingPathComponent:@"keep"];ok=ok&&[[NSMutableData dataWithLength:32] writeToURL:file atomically:YES];
    ok=ok&&[fm createSymbolicLinkAtURL:[scan URLByAppendingPathComponent:@"link"] withDestinationURL:outside error:NULL];
    NSDictionary *size=PWMSize(scan);ok=ok&&[size[@"bytes"] unsignedLongLongValue]==32&&[size[@"complete"] boolValue]&&PWMIdentity([scan URLByAppendingPathComponent:@"link"])==nil;
    NSString *old=PWMIdentity(file);NSURL *replacement=[scan URLByAppendingPathComponent:@"replacement"];ok=ok&&[[NSMutableData dataWithLength:3] writeToURL:replacement atomically:YES];
    ok=ok&&[fm removeItemAtURL:file error:NULL]&&[fm moveItemAtURL:replacement toURL:file error:NULL]&&![old isEqual:PWMIdentity(file)];
    BOOL removed=[fm removeItemAtURL:root error:NULL];return ok&&removed?1:0;
}}
