import {createRoot, createSignal} from 'solid-js';
import type {CancellablePromise} from '@helpers/cancellablePromise';
import type {InputFile} from '@layer';

// Tracks in-flight profile-photo uploads per peer so the big collapsible
// profile avatar (PeerProfileAvatars) can show a cancellable progress ring and
// lock itself collapsed while the upload runs.

export type AvatarUploadEntry = {
  // A CancellablePromise suitable for ProgressivePreloader.attachPromise:
  // exposes addNotifyListener({done,total}) for progress + cancel() for abort.
  promise: CancellablePromise<any>;
};

const [map, setMap] = createRoot(() => createSignal<Map<PeerId, AvatarUploadEntry>>(new Map()));

export const avatarUploads = map;

export function getAvatarUpload(peerId: PeerId) {
  return map().get(peerId);
}

function setEntry(peerId: PeerId, entry: AvatarUploadEntry | null) {
  setMap((prev) => {
    const next = new Map(prev);
    if(entry) next.set(peerId, entry);
    else next.delete(peerId);
    return next;
  });
}

// Register a profile-photo upload. `file` is the JPEG (always present); `video`
// is the optional MP4. The bigger of the two (video, if any) drives the visible
// progress; cancelling aborts BOTH.
export function trackAvatarUpload(peerId: PeerId, promises: {
  file?: CancellablePromise<InputFile>,
  video?: CancellablePromise<InputFile>
}) {
  const progressSource = promises.video || promises.file;
  if(!progressSource) return;

  // Capture the ORIGINAL cancels before overriding — progressSource is one of
  // these promises, so reading its cancel after the override would recurse.
  const fileCancel = promises.file?.cancel?.bind(promises.file);
  const videoCancel = promises.video?.cancel?.bind(promises.video);
  // ProgressivePreloader.onClick calls promise.cancel() — make it abort both.
  progressSource.cancel = () => {
    fileCancel?.();
    videoCancel?.();
  };

  setEntry(peerId, {promise: progressSource});

  Promise.all([promises.file, promises.video].filter(Boolean))
  .catch(() => {})
  .finally(() => setEntry(peerId, null));
}
