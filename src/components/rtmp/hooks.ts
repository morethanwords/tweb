import {createSignal} from 'solid-js';
import rtmpCallsController, {RtmpCallInstance} from '../../lib/calls/rtmpCallsController';
import {subscribeOn} from '../../helpers/solid/subscribeOn';
import {NULL_PEER_ID} from '../../lib/mtproto/mtproto_config';

export function useCurrentRtmpCall() {
  const [call, setCall] = createSignal<RtmpCallInstance>(rtmpCallsController.currentCall, {equals: false});
  const [peerId, setPeerId] = createSignal<PeerId>(NULL_PEER_ID);

  subscribeOn(rtmpCallsController)('currentCallChanged', (call) => {
    setCall(call);
    setPeerId(call?.peerId);
  });

  subscribeOn(rtmpCallsController)('startedJoining', (peerId) => {
    setPeerId(peerId);
  });

  return {call, peerId};
}
