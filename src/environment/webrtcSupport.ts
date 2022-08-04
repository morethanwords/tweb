import {IS_FIREFOX} from './userAgent';

const IS_WEBRTC_SUPPORTED = !!(typeof(RTCPeerConnection) !== 'undefined' && !IS_FIREFOX);

export default IS_WEBRTC_SUPPORTED;
