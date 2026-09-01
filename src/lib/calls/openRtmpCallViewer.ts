import {AppMediaViewerRtmp} from '@components/mediaViewer/rtmp';
import {logger} from '@lib/logger';
import rtmpCallsController from '@lib/calls/rtmpCallsController';

const log = logger('RTMP-VIEWER');

export default async function openRtmpCallViewer(peerId: PeerId): Promise<void> {
  const joinedCall = rtmpCallsController.currentCall;
  if(!joinedCall) throw new Error('Cannot open RTMP viewer without an accepted call');

  const activeViewer = AppMediaViewerRtmp.activeInstance;
  if(activeViewer) {
    if(activeViewer.isAttachedToCall(joinedCall)) return;
    await activeViewer.closeWithoutLeaving();
    if(rtmpCallsController.currentCall !== joinedCall) {
      throw new Error('RTMP call changed while replacing its viewer');
    }
  }

  let viewer: AppMediaViewerRtmp | undefined;
  try {
    const shareUrl = await AppMediaViewerRtmp.getShareUrl(peerId.toChatId());
    viewer = new AppMediaViewerRtmp(shareUrl);
    await viewer.openMedia({
      peerId,
      isAdmin: joinedCall.admin
    });
  } catch(err) {
    // Opening happens after phone.joinGroupCall has accepted the source. Keep
    // this compensation inside the global call-transition reservation and
    // target only the instance whose viewer failed; a newer call must survive.
    try {
      await rtmpCallsController.leaveCall(false, joinedCall);
    } catch(leaveError) {
      log.error('leave after RTMP viewer open failure failed', leaveError);
    }
    if(viewer) {
      try {
        // Release only this partially-created viewer. Its ordinary close()
        // leaves whichever RTMP call is current, which could be a newer call
        // if recovery replaced the failed instance while openMedia awaited.
        await viewer.closeWithoutLeaving();
      } catch(closeError) {
        log.error('RTMP viewer cleanup after open failure failed', closeError);
      }
    }
    throw err;
  }
}
