// Local, bounded AVFoundation import/export; no network assets or microphone use.
#import <AVFoundation/AVFoundation.h>
#import <AppKit/AppKit.h>
#include <stdatomic.h>
static atomic_ullong PWVideoEpoch;
static atomic_bool PWVideoBusy;
static _Atomic(float) PWVideoProgress;
static AVAsset *PWVideoAsset;
static AVAssetExportSession *PWVideoExport;
static BOOL PWVideoLoading,PWVideoCompleted,PWVideoDetached;
static NSObject *PWVideoOwner(void){static NSObject *owner;static dispatch_once_t once;dispatch_once(&once,^{owner=[NSObject new];});return owner;}
unsigned long long pinwall_video_generation(void){return atomic_load(&PWVideoEpoch);}
void pinwall_video_clear(void){atomic_fetch_add(&PWVideoEpoch,1);@synchronized(PWVideoOwner()){[PWVideoAsset cancelLoading];[PWVideoExport cancelExport];}}
static BOOL PWVideoCancelled(unsigned long long epoch){return epoch!=atomic_load(&PWVideoEpoch);}
static NSDictionary *PWVideoFail(NSString *code){return @{@"error":code};}
static NSDictionary *PWVideoInspect(AVAsset *asset){
    double duration=CMTimeGetSeconds(asset.duration);NSArray<AVAssetTrack *> *videos=[asset tracksWithMediaType:AVMediaTypeVideo];
    if(!asset.playable||asset.hasProtectedContent||videos.count!=1||!isfinite(duration)||duration<=0||duration>1800)return PWVideoFail(@"video_invalid");
    AVAssetTrack *track=videos.firstObject;CGRect frame=CGRectApplyAffineTransform((CGRect){CGPointZero,track.naturalSize},track.preferredTransform);
    double width=ceil(fabs(frame.size.width)),height=ceil(fabs(frame.size.height));
    if(!isfinite(width)||!isfinite(height)||width<1||height<1||width>4096||height>4096||width*height>16000000||track.nominalFrameRate>120)return PWVideoFail(@"video_limit");
    return @{@"duration":@(duration),@"width":@(width),@"height":@(height),@"hasAudio":@((BOOL)([asset tracksWithMediaType:AVMediaTypeAudio].count>0))};
}
static NSDictionary *PWVideoWork(NSDictionary *request){
    unsigned long long epoch=[request[@"epoch"] unsignedLongLongValue];if(PWVideoCancelled(epoch))return PWVideoFail(@"tool_cancelled");
    NSString *path=request[@"path"];if(![path isKindOfClass:NSString.class]||!path.isAbsolutePath)return PWVideoFail(@"video_invalid");
    AVURLAsset *asset=[AVURLAsset URLAssetWithURL:[NSURL fileURLWithPath:path] options:@{AVURLAssetPreferPreciseDurationAndTimingKey:@YES,AVURLAssetReferenceRestrictionsKey:@(AVAssetReferenceRestrictionForbidAll)}];
    @synchronized(PWVideoOwner()){PWVideoAsset=asset;PWVideoLoading=YES;PWVideoDetached=NO;}
    dispatch_semaphore_t loaded=dispatch_semaphore_create(0);NSArray *keys=@[@"duration",@"tracks",@"playable",@"hasProtectedContent"];
    [asset loadValuesAsynchronouslyForKeys:keys completionHandler:^{@synchronized(PWVideoOwner()){PWVideoLoading=NO;if(PWVideoDetached&&!PWVideoExport){PWVideoAsset=nil;PWVideoDetached=NO;atomic_store(&PWVideoBusy,NO);}}dispatch_semaphore_signal(loaded);}];
    CFAbsoluteTime deadline=CFAbsoluteTimeGetCurrent()+10;
    while(dispatch_semaphore_wait(loaded,dispatch_time(DISPATCH_TIME_NOW,50*NSEC_PER_MSEC))){if(PWVideoCancelled(epoch)||CFAbsoluteTimeGetCurrent()>deadline){[asset cancelLoading];return PWVideoFail(PWVideoCancelled(epoch)?@"tool_cancelled":@"video_timeout");}}
    if(PWVideoCancelled(epoch))return PWVideoFail(@"tool_cancelled");
    for(NSString *key in keys)if([asset statusOfValueForKey:key error:NULL]!=AVKeyValueStatusLoaded)return PWVideoFail(@"video_invalid");
    NSDictionary *info=PWVideoInspect(asset);if(info[@"error"]||[request[@"method"] isEqual:@"inspect"])return info;
    double start=[request[@"start"] doubleValue],end=[request[@"end"] doubleValue],duration=[info[@"duration"] doubleValue];
    if(!isfinite(start)||!isfinite(end)||start<0||end>duration+0.001||end-start<0.1||end-start>600)return PWVideoFail(@"video_invalid_range");
    NSDictionary *presets=@{@"480":AVAssetExportPreset640x480,@"720":AVAssetExportPreset1280x720,@"1080":AVAssetExportPreset1920x1080};NSString *preset=presets[request[@"resolution"]];
    NSString *output=request[@"output"],*format=request[@"format"];
    if(!preset||![output isKindOfClass:NSString.class]||!output.isAbsolutePath||!([format isEqual:@"mp4"]||[format isEqual:@"mov"]))return PWVideoFail(@"video_invalid");
    AVMutableComposition *composition=[AVMutableComposition composition];CMTimeRange range=CMTimeRangeFromTimeToTime(CMTimeMakeWithSeconds(start,600),CMTimeMakeWithSeconds(end,600));
    NSMutableArray<AVAssetTrack *> *tracks=[NSMutableArray arrayWithArray:[asset tracksWithMediaType:AVMediaTypeVideo]];
    if(![request[@"muted"] boolValue]){NSArray *audio=[asset tracksWithMediaType:AVMediaTypeAudio];if(audio.count>8)return PWVideoFail(@"video_limit");[tracks addObjectsFromArray:audio];}
    for(AVAssetTrack *track in tracks){AVMutableCompositionTrack *destination=[composition addMutableTrackWithMediaType:track.mediaType preferredTrackID:kCMPersistentTrackID_Invalid];NSError *error=nil;
        if(!destination||![destination insertTimeRange:range ofTrack:track atTime:kCMTimeZero error:&error])return PWVideoFail(@"video_export_failed");destination.preferredTransform=track.preferredTransform;
    }
    if(![[AVAssetExportSession exportPresetsCompatibleWithAsset:composition] containsObject:preset])return PWVideoFail(@"video_format");
    AVAssetExportSession *export=[[AVAssetExportSession alloc] initWithAsset:composition presetName:preset];if(!export)return PWVideoFail(@"video_export_failed");
    NSString *type=[format isEqual:@"mp4"]?AVFileTypeMPEG4:AVFileTypeQuickTimeMovie;
    if(![export.supportedFileTypes containsObject:type])return PWVideoFail(@"video_format");
    export.outputURL=[NSURL fileURLWithPath:output];export.outputFileType=type;export.metadata=@[];export.shouldOptimizeForNetworkUse=YES;if(@available(macOS 10.14,*))export.fileLengthLimit=512*1024*1024;
    @synchronized(PWVideoOwner()){PWVideoExport=export;PWVideoCompleted=NO;}
    if(PWVideoCancelled(epoch)){[export cancelExport];@synchronized(PWVideoOwner()){PWVideoCompleted=YES;}return PWVideoFail(@"tool_cancelled");}
    dispatch_semaphore_t finished=dispatch_semaphore_create(0);[export exportAsynchronouslyWithCompletionHandler:^{@synchronized(PWVideoOwner()){PWVideoCompleted=YES;if(PWVideoDetached){PWVideoExport=nil;PWVideoAsset=nil;PWVideoDetached=NO;atomic_store(&PWVideoBusy,NO);}}dispatch_semaphore_signal(finished);}];deadline=CFAbsoluteTimeGetCurrent()+600;
    while(dispatch_semaphore_wait(finished,dispatch_time(DISPATCH_TIME_NOW,100*NSEC_PER_MSEC))){atomic_store(&PWVideoProgress,export.progress);
        if(PWVideoCancelled(epoch)||CFAbsoluteTimeGetCurrent()>deadline){[export cancelExport];return PWVideoFail(PWVideoCancelled(epoch)?@"tool_cancelled":@"video_timeout");}
    }
    if(PWVideoCancelled(epoch))return PWVideoFail(@"tool_cancelled");if(export.status!=AVAssetExportSessionStatusCompleted)return PWVideoFail(@"video_export_failed");
    atomic_store(&PWVideoProgress,1);return @{@"ok":@YES};
}
NSDictionary *pinwall_video_request(NSDictionary *request){
    if([request[@"method"] isEqual:@"capturePermission"]){
        if(PWVideoCancelled([request[@"epoch"] unsignedLongLongValue]))return PWVideoFail(@"tool_cancelled");
        if(@available(macOS 10.15,*)){if(!CGPreflightScreenCaptureAccess()){CGRequestScreenCaptureAccess();return PWVideoFail(@"desktop_screen_denied");}return @{@"ok":@YES};}return PWVideoFail(@"desktop_unsupported");
    }
    if([request[@"method"] isEqual:@"status"])return @{@"busy":@((BOOL)atomic_load(&PWVideoBusy)),@"progress":@(atomic_load(&PWVideoProgress))};
    bool expected=false;if(!atomic_compare_exchange_strong(&PWVideoBusy,&expected,YES))return PWVideoFail(@"video_busy");
    @try {atomic_store(&PWVideoProgress,0);return PWVideoWork(request);}
    @finally {@synchronized(PWVideoOwner()){if(PWVideoLoading||(PWVideoExport&&!PWVideoCompleted)){PWVideoDetached=YES;}else{PWVideoAsset=nil;PWVideoExport=nil;atomic_store(&PWVideoBusy,NO);}}}
}
// Test-only caller supplies its private temporary path; never invoked by renderer DTOs.
int pinwall_video_fixture(const char *path){@autoreleasepool{
    NSURL *url=[NSURL fileURLWithPath:[NSString stringWithUTF8String:path]];NSError *error=nil;
    AVAssetWriter *writer=[[AVAssetWriter alloc] initWithURL:url fileType:AVFileTypeQuickTimeMovie error:&error];if(!writer)return 0;
    AVAssetWriterInput *input=[AVAssetWriterInput assetWriterInputWithMediaType:AVMediaTypeVideo outputSettings:@{AVVideoCodecKey:AVVideoCodecTypeH264,AVVideoWidthKey:@320,AVVideoHeightKey:@240}];
    AVAssetWriterInputPixelBufferAdaptor *adaptor=[AVAssetWriterInputPixelBufferAdaptor assetWriterInputPixelBufferAdaptorWithAssetWriterInput:input sourcePixelBufferAttributes:@{(id)kCVPixelBufferPixelFormatTypeKey:@(kCVPixelFormatType_32ARGB),(id)kCVPixelBufferWidthKey:@320,(id)kCVPixelBufferHeightKey:@240}];
    if(![writer canAddInput:input])return 0;[writer addInput:input];if(![writer startWriting])return 0;[writer startSessionAtSourceTime:kCMTimeZero];
    for(int i=0;i<24;i++){CFAbsoluteTime deadline=CFAbsoluteTimeGetCurrent()+5;while(!input.readyForMoreMediaData){if(CFAbsoluteTimeGetCurrent()>deadline){[writer cancelWriting];return 0;}[NSThread sleepForTimeInterval:0.01];}
        CVPixelBufferRef pixel=NULL;if(CVPixelBufferCreate(kCFAllocatorDefault,320,240,kCVPixelFormatType_32ARGB,NULL,&pixel)!=kCVReturnSuccess){[writer cancelWriting];return 0;}
        CVPixelBufferLockBaseAddress(pixel,0);unsigned char *bytes=CVPixelBufferGetBaseAddress(pixel);size_t stride=CVPixelBufferGetBytesPerRow(pixel);
        for(unsigned y=0;y<240;y++)for(unsigned x=0;x<320;x++){unsigned char *p=bytes+y*stride+x*4;p[0]=255;p[1]=(unsigned char)(x+i);p[2]=(unsigned char)y;p[3]=64;}
        CVPixelBufferUnlockBaseAddress(pixel,0);BOOL appended=[adaptor appendPixelBuffer:pixel withPresentationTime:CMTimeMake(i,12)];CVPixelBufferRelease(pixel);if(!appended){[writer cancelWriting];return 0;}
    }
    [input markAsFinished];[writer endSessionAtSourceTime:CMTimeMake(24,12)];dispatch_semaphore_t completed=dispatch_semaphore_create(0);[writer finishWritingWithCompletionHandler:^{dispatch_semaphore_signal(completed);}];
    if(dispatch_semaphore_wait(completed,dispatch_time(DISPATCH_TIME_NOW,10*NSEC_PER_SEC))){[writer cancelWriting];return 0;}return writer.status==AVAssetWriterStatusCompleted?1:0;
}}
