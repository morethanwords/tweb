import {TLDeserialization} from '../mtproto/tl_utils';

export interface VideoStreamEvent {
  offsetValue: number;
  endpointId: string;
  rotation: number;
  extra: number;
}

export interface VideoStreamInfo {
  contentOffset: number;
  container: string;
  activeMask: number;
  events: VideoStreamEvent[];
  bytes: Uint8Array;
}

export function parseVideoStreamInfo(buf: Uint8Array) {
  const originalBuf = buf;
  if(buf.length % 4 !== 0) {
    buf = buf.subarray(0, buf.length - buf.length % 4);
  }
  const r = new TLDeserialization(buf);

  if(r.fetchInt() !== -1590787827) { // 0xa12e810d
    throw new Error('Invalid video stream info');
  }
  const container = r.fetchString();
  const activeMask = r.fetchInt();
  const eventCount = r.fetchInt();

  const events = new Array(eventCount);
  for(let i = 0; i < eventCount; i++) {
    events[i] = {
      offsetValue: r.fetchInt(),
      endpointId: r.fetchString(),
      rotation: r.fetchInt(),
      extra: r.fetchInt()
    };
  }

  return {
    contentOffset: r.getOffset(),
    container,
    activeMask,
    events,
    bytes: originalBuf
  };
}
