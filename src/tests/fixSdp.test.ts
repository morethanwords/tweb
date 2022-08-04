import fixLocalOffer from '../lib/calls/helpers/fixLocalOffer';
import data from '../mock/webrtc/data';
import sdp from '../mock/webrtc/sdp';

const offer: RTCSessionDescriptionInit = {type: 'offer', sdp};

test('fix SDP', () => {
  const fixed = fixLocalOffer({
    offer,
    data
  });

  // console.log(fixed.offer.sdp);

  expect(fixed.offer).toEqual(fixed.offer);
});
