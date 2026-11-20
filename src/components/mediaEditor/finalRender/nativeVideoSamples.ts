import type {VideoSample, VideoSampleSink} from 'mediabunny';

/** Explicit schedule. Last sample ends exactly at duration. */
export function* nativeVideoFrameSchedule(duration: number, fps: number) {
  if(!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(fps) || fps <= 0) throw new RangeError('Invalid native video timing');
  const end = Math.round(duration * 1e6);
  for(let index = 0; index < Math.ceil(duration * fps - 1e-8); index++) {
    const timestamp = Math.round(index / fps * 1e6);
    const next = Math.min(end, Math.round((index + 1) / fps * 1e6));
    if(next > timestamp) yield {timestamp, duration: next - timestamp};
  }
}

/** One sequential decode pass, with at most a current sample and one lookahead
 * owned here, in addition to the installed sink's bounded decode queue (4).
 * samplesAtTimestamps can clone a held frame for every query in a long gap
 * before yielding once. Never send the output clock to that query pipeline.
 *
 * Samples yielded here are BORROWED until the next iteration: only this
 * generator closes them. A held frame is reused without cloning or seeking.
 * Returning/throwing in the consumer closes both held samples and the sink.
 */
export async function* nativeVideoSamples(sink: VideoSampleSink, duration: number, fps: number, check: () => void) {
  check();
  const frames = nativeVideoFrameSchedule(duration, fps);
  // Validate the schedule before starting the sink's eager decode pump.
  let frame = frames.next();
  const samples = sink.samples(0, duration);
  let current: VideoSample;
  let next: VideoSample;
  try {
    const first = await samples.next();
    if(first.done !== true) next = first.value;
    while(frame.done !== true) {
      check();
      const time = frame.value.timestamp / 1e6;
      while(next && next.timestamp - time <= 1e-10) {
        current?.close();
        current = next;
        next = undefined;
        const following = await samples.next();
        if(following.done !== true) next = following.value;
        check();
      }
      if(!current) throw new Error('Source frame unavailable');
      yield {sample: current, ...frame.value};
      frame = frames.next();
    }
  } finally {
    current?.close();
    next?.close();
    await samples.return();
  }
}
