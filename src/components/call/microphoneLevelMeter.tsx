import {createEffect, createSignal, on, onCleanup, onMount} from 'solid-js';
import getAudioConstraints from '@lib/calls/helpers/getAudioConstraints';
import getStream from '@lib/calls/helpers/getStream';

// A live microphone level meter. Acquires its own MediaStream so the user
// can confirm "is my mic actually working" outside an active call — the bar
// fills proportionally to the captured amplitude and re-acquires when the
// `deviceId` prop changes.
//
// We intentionally re-request the stream instead of piggy-backing on an
// existing call's StreamManager: the meter is mounted in places where a call
// may not be running (Speakers and Camera settings tab), and a parallel
// MediaStream is cheap on every browser that supports `enumerateDevices`.

export type MicrophoneLevelMeterProps = {
  deviceId?: string,
  // Visual height in px. The meter spans 100% of the parent's width.
  height?: number
};

export default function MicrophoneLevelMeter(props: MicrophoneLevelMeterProps) {
  // 0..1 amplitude; the bar's width = amplitude * 100%.
  const [amplitude, setAmplitude] = createSignal(0);
  const [error, setError] = createSignal<string | undefined>(undefined);

  let raf: number | undefined;
  let context: AudioContext | undefined;
  let source: MediaStreamAudioSourceNode | undefined;
  let analyser: AnalyserNode | undefined;
  let stream: MediaStream | undefined;
  let buffer: Uint8Array | undefined;
  let canceled = false;

  const teardown = () => {
    if(raf !== undefined) {
      cancelAnimationFrame(raf);
      raf = undefined;
    }
    if(source) {
      try { source.disconnect(); } catch(_) {}
      source = undefined;
    }
    if(analyser) {
      try { analyser.disconnect(); } catch(_) {}
      analyser = undefined;
    }
    if(stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = undefined;
    }
    if(context) {
      // suspend instead of close — closing makes follow-up re-acquires racy
      // because creating a new AudioContext requires user gesture on some
      // browsers, and we may re-mount after a device change.
      context.suspend().catch(() => {});
      context = undefined;
    }
    setAmplitude(0);
  };

  const start = async() => {
    teardown();
    canceled = false;
    setError(undefined);

    try {
      // `getStream` self-heals a stale persisted mic id (clears appSettings,
      // retries with the default) so the meter doesn't lock on an error.
      stream = await getStream({
        audio: getAudioConstraints(props.deviceId)
      });
    } catch(err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      return;
    }

    if(canceled) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    context = new Ctor();
    source = context.createMediaStreamSource(stream);
    analyser = context.createAnalyser();
    analyser.fftSize = 256;
    // Tight smoothing keeps the meter visibly responsive — the default 0.8
    // washes out short syllables into a slow ramp.
    analyser.smoothingTimeConstant = 0.2;
    source.connect(analyser);
    buffer = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      if(!analyser || !buffer) return;
      // Cast to `Uint8Array<ArrayBuffer>` for getByteFrequencyData — TS infers
      // the buffer's backing type as `ArrayBufferLike` (which includes
      // SharedArrayBuffer), but AnalyserNode only accepts ArrayBuffer-backed
      // typed arrays. The cast is safe because `new Uint8Array(number)`
      // always allocates a plain ArrayBuffer.
      analyser.getByteFrequencyData(buffer as Uint8Array<ArrayBuffer>);
      // Use the loudest bin (rather than the average): the eye reads peaks
      // as "the mic heard me", whereas averaged level looks dead at typical
      // speech volumes.
      let peak = 0;
      for(let i = 0; i < buffer.length; i++) {
        if(buffer[i] > peak) peak = buffer[i];
      }
      setAmplitude(peak / 255);
      raf = requestAnimationFrame(tick);
    };
    tick();
  };

  onMount(() => {
    start();
    onCleanup(() => {
      canceled = true;
      teardown();
    });
  });

  // Re-acquire when the selected mic changes. `defer: true` so we don't
  // double-start on mount.
  createEffect(on(() => props.deviceId, () => {
    start();
  }, {defer: true}));

  const height = props.height ?? 8;

  return (
    <div
      class="microphone-level-meter"
      style={{height: height + 'px'}}
      title={error() || undefined}
    >
      <div
        class="microphone-level-meter__fill"
        style={{
          width: (amplitude() * 100) + '%',
          opacity: error() ? '0.3' : '1'
        }}
      />
    </div>
  );
}
