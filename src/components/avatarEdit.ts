import Icon from '@components/icon';
import {animateImageToTarget} from '@helpers/animateImageToTarget';
import type {CancellablePromise} from '@helpers/cancellablePromise';
import {createImageAndURLFromBlob} from '@helpers/createImageAndURLFromBlob';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import {getFileAndOpenEditor} from '@helpers/getFileAndOpenEditor';
import type {InputFile, Photo} from '@layer';
import type {AppManagers} from '@lib/managers';
import appDownloadManager from '@lib/appDownloadManager';
import choosePhotoSize from '@appManagers/utils/photos/choosePhotoSize';
import chooseProfileVideoSize from '@appManagers/utils/photos/chooseProfileVideoSize';
import rootScope from '@lib/rootScope';
import {render} from 'solid-js/web';
import {MediaEditorFinalResult} from './mediaEditor/finalRender/createFinalResult';
import RenderProgressCircle from './mediaEditor/renderProgressCircle';
import {snapToViewport} from './mediaEditor/utils';

export type AvatarEditPayload = {
  file: () => CancellablePromise<InputFile>;
  video?: () => CancellablePromise<InputFile>;
  videoStartTs?: number;
};

type Options = {
  isForum?: boolean;
};

// video_start_ts (the cover frame) in seconds relative to the *trimmed* clip
// start, clamped within the clip. videoThumbnailPosition / videoCrop* are 0..1
// normalised over the *entire* source, so convert against the source duration.
function computeVideoStartTs(editorResult: MediaEditorFinalResult): number {
  const editing = editorResult.editingMediaState;
  const sourceDuration = editorResult.videoDuration || 0;
  const trimStartSec = editing.videoCropStart * sourceDuration;
  const coverSec = editing.videoThumbnailPosition * sourceDuration;
  const clipLengthSec = editing.videoCropLength * sourceDuration;
  return Math.min(Math.max(0, coverSec - trimStartSec), clipLengthSec);
}

// Converts a finished media-editor result into upload thunks (cover JPEG +
// optional MP4 + video_start_ts), without touching any preview canvas. Shared
// by the contact-photo / fallback-photo flows that upload directly.
export async function mediaEditorResultToAvatarPayload(
  editorResult: MediaEditorFinalResult,
  namePrefix = 'avatar'
): Promise<AvatarEditPayload | undefined> {
  const resultPayload = await editorResult.getResult();

  if(editorResult.isVideo) {
    if(!resultPayload.thumb) return undefined;
    const videoStartTs = computeVideoStartTs(editorResult);
    return {
      file: () => appDownloadManager.upload(resultPayload.thumb.blob, namePrefix + '-cover.jpg'),
      video: () => appDownloadManager.upload(resultPayload.blob, namePrefix + '.mp4'),
      videoStartTs
    };
  }

  return {
    file: () => appDownloadManager.upload(resultPayload.blob, namePrefix + '.jpg')
  };
}

type AvatarUploadMode = 'self' | 'fallback' | {userId: UserId; suggest?: boolean};

// Shared tail of every "edited avatar → upload" flow: turn the editor result
// into upload thunks, surface cancellable progress, then upload as the right
// kind of photo (own / fallback / contact / suggested).
async function handleAvatarEditorResult(opts: {
  result: MediaEditorFinalResult;
  managers: AppManagers;
  mode: AvatarUploadMode;
  // Fired once the upload starts, with a cancellable progress source (suitable
  // for ProgressivePreloader.attachPromise); cancelling it aborts the upload.
  onUploadStart?: (progress: CancellablePromise<InputFile>) => void;
  onUploaded?: () => void;
}) {
  const {result, managers, mode} = opts;
  // Drop the full-screen preview right away; the encode + upload run in the
  // background and the target avatar (if any) shows the upload progress.
  result.animatedPreview?.remove();

  const namePrefix = mode === 'self' ? 'avatar' :
    mode === 'fallback' ? 'fallback' :
    (mode.suggest ? 'suggest' : 'personal');

  const payload = await mediaEditorResultToAvatarPayload(result, namePrefix);
  if(!payload) return;

  const filePromise = payload.file();
  const videoPromise = payload.video?.();
  // The bigger upload (video, if any) drives the visible progress; cancel
  // aborts BOTH. Capture original cancels before overriding (progressSource
  // is one of these promises, so reading its cancel after would recurse).
  const progressSource = videoPromise || filePromise;
  const fileCancel = filePromise.cancel?.bind(filePromise);
  const videoCancel = videoPromise?.cancel?.bind(videoPromise);
  progressSource.cancel = () => {
    fileCancel?.();
    videoCancel?.();
  };
  opts.onUploadStart?.(progressSource);

  let file: InputFile, video: InputFile;
  try {
    [file, video] = await Promise.all([filePromise, videoPromise]);
  } catch{
    return; // cancelled or upload failed
  }

  if(mode === 'self') {
    await managers.appProfileManager.uploadProfilePhoto({
      file, video, videoStartTs: payload.videoStartTs
    });
  } else if(mode === 'fallback') {
    await managers.appProfileManager.uploadProfilePhoto({
      file, video, videoStartTs: payload.videoStartTs, fallback: true
    });
  } else {
    await managers.appProfileManager.uploadContactProfilePhoto({
      userId: mode.userId,
      file, video, videoStartTs: payload.videoStartTs,
      // "Set photo for X" (personal photo, only the current user sees it) needs
      // save:true for the server to actually apply + persist it. Suggesting only
      // sends the suggestion message (save stays false). Mirrors the official
      // clients (Android: set → suggest=F/save=T; suggest → suggest=T/save=F).
      suggest: mode.suggest || undefined,
      save: mode.suggest ? undefined : true
    });
  }
  opts.onUploaded?.();
}

// High-level helper: open the file picker + editor, then upload the result as a
// contact photo (personal or suggested) or as the user's own fallback photo.
export function pickAvatarAndUpload(opts: {
  managers: AppManagers;
  isForum?: boolean;
  mode: 'fallback' | {userId: UserId; suggest?: boolean};
  onUploadStart?: (progress: CancellablePromise<InputFile>) => void;
  onUploaded?: () => void;
}) {
  getFileAndOpenEditor({
    isEditingForAvatar: true,
    isEditingForumAvatar: opts.isForum,
    acceptMediaTypes: ['photo', 'video'],
    onFinish: ({editorResult}) => handleAvatarEditorResult({
      result: editorResult,
      managers: opts.managers,
      mode: opts.mode,
      onUploadStart: opts.onUploadStart,
      onUploaded: opts.onUploaded
    })
  });
}

// High-level helper: download an existing photo, open the avatar editor on it,
// and on confirm set the (edited) result as the user's OWN profile photo. Used
// to accept a suggested profile photo on the receiving side.
export async function editAndSetOwnAvatar(opts: {
  managers: AppManagers;
  photo: Photo.photo;
  isForum?: boolean;
  onUploadStart?: (progress: CancellablePromise<InputFile>) => void;
  onUploaded?: () => void;
}) {
  // Animated (video) suggested photo → download the full video variant and open
  // the editor in video mode, so accepting keeps the animation. Static → image.
  const videoSize = opts.photo.video_sizes?.length ? chooseProfileVideoSize(opts.photo, 'full') : undefined;
  let file: File;
  if(videoSize) {
    const blob = await appDownloadManager.downloadMedia({media: opts.photo, thumb: videoSize});
    file = new File([blob], 'suggested.mp4', {type: 'video/mp4'});
  } else {
    const size = choosePhotoSize(opts.photo, 1280, 1280, true);
    const blob = await appDownloadManager.downloadMedia({media: opts.photo, thumb: size});
    file = new File([blob], 'suggested.jpg', {type: blob.type || 'image/jpeg'});
  }

  return openAvatarEditorWithFile(file, {
    isForum: opts.isForum,
    onFinish: (editorResult) => handleAvatarEditorResult({
      result: editorResult,
      managers: opts.managers,
      mode: 'self',
      onUploadStart: opts.onUploadStart,
      onUploaded: opts.onUploaded
    })
  });
}

// Opens the avatar media editor on an already-obtained file/blob (no picker).
// Used when editing an existing photo (e.g. accepting a suggested profile photo).
export async function openAvatarEditorWithFile(
  file: File | Blob,
  {isForum, onFinish, dontCreatePreview}: {
    isForum?: boolean;
    dontCreatePreview?: boolean;
    onFinish: (editorResult: MediaEditorFinalResult) => void;
  }
) {
  const isVideo = file.type.startsWith('video/');

  let mediaSrc: string;
  if(isVideo) {
    mediaSrc = URL.createObjectURL(file);
  } else {
    const imgResult = await createImageAndURLFromBlob(file);
    if(!imgResult.ok) return;
    mediaSrc = imgResult.url;
  }

  const {openMediaEditorFromMediaRaw} = await import('@components/mediaEditor');

  openMediaEditorFromMediaRaw({
    isEditingForAvatar: true,
    isEditingForumAvatar: isForum,
    isVideoAvatarMode: isVideo,
    canFinishWithoutChanges: true,
    canImageResultInGIF: false,
    getMediaBlob: async() => file,
    managers: rootScope.managers,
    mediaSrc,
    mediaType: isVideo ? 'video' : 'image',
    initialTab: isVideo ? 'adjustments' : 'crop',
    onEditFinish: onFinish,
    dontCreatePreview,
    onClose: () => { }
  });
}

export default class AvatarEdit {
  public container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private icon: HTMLSpanElement;

  constructor(onChange: (payload: AvatarEditPayload) => void, options?: Options) {
    this.container = document.createElement('div');
    this.container.classList.add('avatar-edit');

    this.canvas = document.createElement('canvas');
    this.canvas.classList.add('avatar-edit-canvas');

    this.icon = Icon('cameraadd', 'avatar-edit-icon');

    this.container.append(this.canvas, this.icon);

    attachClickEvent(this.container, () => {
      getFileAndOpenEditor({
        isEditingForAvatar: true,
        isEditingForumAvatar: options?.isForum,
        acceptMediaTypes: ['photo', 'video'],
        onFinish: ({editorResult}) => {
          finishFromResult({
            result: editorResult,
            onChange,
            canvas: this.canvas
          })
        }
      });
    });
  }

  public clear() {
    const ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}

type FinishFromResultArgs = {
  result: MediaEditorFinalResult;
  canvas: HTMLCanvasElement;
  onChange: (payload: AvatarEditPayload) => void;
};

async function finishFromResult({result: editorResult, canvas, onChange}: FinishFromResultArgs) {
  // Video: don't block on the (real-time) encode here — fly the preview into the
  // avatar and show the progress ring on the avatar itself, encoding in the bg.
  if(editorResult.isVideo) {
    await finishFromVideoResult({editorResult, canvas, onChange});
    return;
  }

  const earlyDispose = () => {
    editorResult.animatedPreview?.remove();
  };

  const resultPayload = await editorResult.getResult();

  if(!editorResult.animatedPreview) return void earlyDispose();

  const imgResult = await createImageAndURLFromBlob(resultPayload.blob);
  if(!imgResult.ok) return earlyDispose();

  const img = imgResult.img;

  const animatedImg = editorResult.animatedPreview;
  await animateImageToTarget({animatedImg, target: canvas, targetIsRound: true}).promise;

  const [width, height] = snapToViewport(1, editorResult.width, editorResult.height);

  [canvas.width, canvas.height] = [width, height];

  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.fillRect(0, 0, width, height);

  // Doing this now prevents the avatar blinking to the old one
  onChange({
    file: () => appDownloadManager.upload(resultPayload.blob)
  });

  await animatedImg.animate({
    opacity: [1, 0]
  }, {
    duration: 200,
    fill: 'forwards'
  }).finished;

  animatedImg.remove();
}

async function finishFromVideoResult({
  editorResult,
  canvas,
  onChange
}: {
  editorResult: MediaEditorFinalResult;
  canvas: HTMLCanvasElement;
  onChange: (payload: AvatarEditPayload) => void;
}) {
  // Fly the full-screen preview into the avatar circle straight away — we have
  // the preview frame immediately, so there's no need to wait for the encode.
  // The editor has already started closing.
  const animatedImg = editorResult.animatedPreview;
  let ringCleanup: (() => void) | undefined;
  if(animatedImg) {
    await animateImageToTarget({animatedImg, target: canvas, targetIsRound: true}).promise;
    // Spin an encode-progress ring centered on the avatar while the video
    // renders in the background, so nothing ever looks frozen.
    ringCleanup = spawnAvatarProgressRing(animatedImg, editorResult.creationProgress);
  }

  // Now wait for the real-time video encode to finish (it was kicked off inside
  // createFinalResult and keeps running after the editor closed).
  let resultPayload: Awaited<ReturnType<MediaEditorFinalResult['getResult']>> | undefined;
  try {
    resultPayload = await editorResult.getResult();
  } catch{}

  if(!resultPayload?.thumb) {
    ringCleanup?.();
    animatedImg?.remove();
    return;
  }

  const videoStartTs = computeVideoStartTs(editorResult);

  // Paint the avatar canvas with the real cover thumb (sits behind the preview).
  const thumbImg = await createImageAndURLFromBlob(resultPayload.thumb.blob);
  if(thumbImg.ok) {
    const [width, height] = snapToViewport(1, editorResult.width, editorResult.height);
    [canvas.width, canvas.height] = [width, height];
    const ctx = canvas.getContext('2d');
    ctx.drawImage(thumbImg.img, 0, 0, width, height);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, 0, width, height);
  }

  onChange({
    file: () => appDownloadManager.upload(resultPayload.thumb.blob, 'cover.jpg'),
    video: () => appDownloadManager.upload(resultPayload.blob, 'avatar.mp4'),
    videoStartTs
  });

  // Drop the ring and fade the preview out to reveal the canvas thumb.
  ringCleanup?.();
  if(animatedImg) {
    await animatedImg.animate({
      opacity: [1, 0]
    }, {
      duration: 200,
      fill: 'forwards'
    }).finished;
    animatedImg.remove();
  }
}

// Mounts a render-progress ring centered over `anchor` (the preview that has
// just flown into the avatar). Returns a cleanup that unmounts it (tearing down
// the reactive read of the progress signal).
function spawnAvatarProgressRing(
  anchor: HTMLElement,
  creationProgress: MediaEditorFinalResult['creationProgress']
): () => void {
  if(!creationProgress) return () => {};

  const bcr = anchor.getBoundingClientRect();
  const container = document.createElement('div');
  container.style.cssText =
    `position:fixed;left:${bcr.left + bcr.width / 2}px;top:${bcr.top + bcr.height / 2}px;` +
    `width:${bcr.width}px;height:${bcr.height}px;transform:translate(-50%, -50%);` +
    'z-index:1001;pointer-events:none';
  document.body.append(container);

  const dispose = render(() => RenderProgressCircle({creationProgress}), container);

  return () => {
    dispose();
    container.remove();
  };
}
