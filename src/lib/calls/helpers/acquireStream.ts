import getStream from '@lib/calls/helpers/getStream';
import stopTrack from '@lib/calls/helpers/stopTrack';

export type StreamAcquisition = {
  // Resolves to the live stream, or `undefined` if dispose() was called before
  // (or while) getUserMedia resolved. Rejects only on a real acquisition error
  // that happened while the stream was still wanted — once disposed, a rejection
  // is swallowed and surfaces as `undefined` instead.
  promise: Promise<MediaStream>,
  // Release the acquisition. Stops the stream's tracks if it has already
  // resolved; otherwise flags it so the stream is stopped the instant it
  // resolves. Idempotent, and safe to call before the stream exists.
  dispose: () => void
};

// `getStream` (getUserMedia under it) CAN'T be cancelled: by the time the
// promise resolves the device is already captured. So if the owner — a Solid
// component, a recorder — is torn down (close popup, switch chat) WHILE the
// acquire is in flight, the resolved stream is orphaned and the camera/mic
// stays live forever (hardware indicator stuck on): teardown ran before there
// was a stream to stop.
//
// This wraps `getStream` as a disposable handle. Crucially it returns
// SYNCHRONOUSLY — the caller gets `dispose` before the `await`, so it can wire
// it into its teardown (Solid `onCleanup`, a class release()/cleanup()...)
// up-front, closing the window. dispose() owns the stream's tracks: stops them
// now if resolved, or the moment they resolve if not. Owners WITHOUT
// authoritative lifecycle state should acquire camera/mic through here instead
// of raw `getStream` (the call instances do have such state and guard inline
// with `isClosing`, so they stay on `getStream`).
export default function acquireStream(
  constraints: MediaStreamConstraints,
  muted?: boolean
): StreamAcquisition {
  let disposed = false;
  let acquired: MediaStream | undefined;

  const promise = (async() => {
    let stream: MediaStream;
    try {
      stream = await getStream(constraints, muted);
    } catch(err) {
      // The owner already walked away — its error handler is gone, so swallow
      // the rejection and resolve like a (benign) disposed acquire rather than
      // surfacing a stale error / leaving it unhandled.
      if(disposed) return undefined;
      throw err;
    }

    // Torn down while getUserMedia was resolving — stop the orphaned stream and
    // hand back nothing.
    if(disposed) {
      stream.getTracks().forEach((track) => stopTrack(track));
      return undefined;
    }

    acquired = stream;
    return stream;
  })();

  const dispose = () => {
    disposed = true;
    if(acquired) {
      acquired.getTracks().forEach((track) => stopTrack(track));
      acquired = undefined;
    }
  };

  return {promise, dispose};
}
