import canVideoBeAnimated from '@appManagers/utils/docs/canVideoBeAnimated';
import {ButtonIconTsx} from '@components/buttonIconTsx';
import type {ButtonMenuSync} from '@components/buttonMenu';
import {IconTsx} from '@components/iconTsx';
import {EditingMediaState} from '@components/mediaEditor/context';
import {MediaEditorFinalResult} from '@components/mediaEditor/finalRender/createFinalResult';
import {ProgressCircleSVG} from '@components/progressCircleSVG';
import {StickerPreview} from '@components/stickerPreview';
import {animateImageToTarget} from '@helpers/animateImageToTarget';
import deferredPromise from '@helpers/cancellablePromise';
import contextMenuController from '@helpers/contextMenuController';
import {createPosterFromVideo} from '@helpers/createPoster';
import blurActiveElement from '@helpers/dom/blurActiveElement';
import createVideo from '@helpers/dom/createVideo';
import noop from '@helpers/noop';
import onMediaLoad from '@helpers/onMediaLoad';
import {positionFloatingMenu} from '@helpers/positionMenu';
import pause from '@helpers/schedulers/pause';
import {requestRAF} from '@helpers/solid/requestRAF';
import {wrapAsyncClickHandler} from '@helpers/wrapAsyncClickHandler';
import {useIsCleaned} from '@hooks/useIsCleaned';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {createEffect, createSignal, Match, on, onCleanup, Switch} from 'solid-js';
import styles from './mediaAttachment.module.scss';
import {useStickersDropdown} from './stickersDropdown';
import {AttachedMedia, AttachedVideo, SupportedMediaType} from './storeContext';


type PersistingState = {
  editingState: EditingMediaState;
  initialObjectUrl: string;
  initialFile: File;
  /**
   * Whether the source the editor was opened from is a video.
   * Needed when re-opening the editor for an edit.
   */
  isVideo: boolean;
};

type CreatingVideoState = {
  previewObjectUrl: string;
  editorResult: MediaEditorFinalResult;
  progress: () => number;
};

export const MediaAttachment = (props: {
  imgClass?: string;
  btnClass?: string;
  attachedMedia?: AttachedMedia;
  supportedMediaTypes?: SupportedMediaType[];
  onAttach?: (value: AttachedMedia | undefined) => void;
}) => {
  const {getFileAndOpenEditor, rootScope} = useHotReloadGuard();
  const supportsMedia = (media: SupportedMediaType) => props.supportedMediaTypes?.includes(media);

  const [img, setImg] = createSignal<HTMLImageElement>();
  const [videoPreviewImg, setVideoPreviewImg] = createSignal<HTMLImageElement>();
  const [videoEl, setVideoEl] = createSignal<HTMLVideoElement>();
  const [stickerEl, setStickerEl] = createSignal<HTMLDivElement>();
  const [btn, setBtn] = createSignal<HTMLElement>();

  const [creatingVideoState, setCreatingVideoState] = createSignal<CreatingVideoState>();

  let cancelAnimation: (reject?: boolean) => void;

  onCleanup(() => {
    cancelAnimation?.(true);

    const state = creatingVideoState();
    if(!state) return;
    // Abort any in-flight video render and free its preview URL.
    state.editorResult.cancel?.();
    state.editorResult.animatedPreview?.remove();
    URL.revokeObjectURL(state.previewObjectUrl);
  });

  const setStickersDropdownPivot = useStickersDropdown({
    onStickerClick: ({docId}) => {
      props.onAttach?.({type: 'sticker', docId});
    }
  });

  let persistingState: PersistingState;

  const isCleaned = useIsCleaned();

  const isAttachedGIF = () => props.attachedMedia?.type === 'video' && props.attachedMedia.isAnimated;

  const acceptMediaTypes = (): Array<'photo' | 'video'> => {
    const types: Array<'photo' | 'video'> = [];
    if(supportsMedia('photo')) types.push('photo');
    if(supportsMedia('video')) types.push('video');
    return types;
  };

  const onChoose = wrapAsyncClickHandler(async() => {
    blurActiveElement();

    // there is a dynamic import there
    await getFileAndOpenEditor({
      canImageResultInGIF: supportsMedia('gif'),
      acceptMediaTypes: acceptMediaTypes(),
      onFinish: (args) => handleFinish(args.editorResult, args.originalFile)
    });
  });

  const onChooseSticker = (pivot: HTMLElement | undefined) => {
    if(!pivot) return;
    blurActiveElement();
    setStickersDropdownPivot(pivot);
  };

  const onEdit = wrapAsyncClickHandler(async() => {
    if(!props.attachedMedia || !persistingState) return;
    if(props.attachedMedia.type !== 'photo' && props.attachedMedia.type !== 'video') return;

    const willAnimateFromVideo = props.attachedMedia.type === 'video';
    const wasInitiallyVideo = persistingState.isVideo;
    const sourceEl = willAnimateFromVideo ? videoEl() : img();
    if(!sourceEl) return;

    const sourceWidth = willAnimateFromVideo ? (sourceEl as HTMLVideoElement).videoWidth : (sourceEl as HTMLImageElement).naturalWidth;
    const sourceHeight = willAnimateFromVideo ? (sourceEl as HTMLVideoElement).videoHeight : (sourceEl as HTMLImageElement).naturalHeight;

    const {openMediaEditorFromMedia} = await import('@components/mediaEditor');

    openMediaEditorFromMedia({
      source: sourceEl,
      rect: sourceEl.getBoundingClientRect(),
      animatedCanvasSize: [sourceWidth, sourceHeight],
      mediaType: wasInitiallyVideo ? 'video' : 'image',
      mediaSrc: persistingState.initialObjectUrl,
      getMediaBlob: async() => persistingState.initialFile,
      managers: rootScope.managers,
      onEditFinish: handleFinish,
      editingMediaState: persistingState.editingState,
      onClose: noop,
      canImageResultInGIF: supportsMedia('gif')
    });
  });

  const handleFinish = async(editorResult: MediaEditorFinalResult, initialFile?: File) => {
    if(editorResult.isVideo) {
      await handleVideoFinish(editorResult, initialFile);
      return;
    }

    const result = await editorResult.getResult();
    const url = URL.createObjectURL(result.blob);

    initialFile ??= persistingState?.initialFile;

    persistingState = {
      editingState: editorResult.editingMediaState,
      initialObjectUrl: editorResult.originalSrc,
      initialFile,
      isVideo: false
    };

    props.onAttach?.({
      type: 'photo',
      objectUrl: url,
      blob: result.blob,
      width: editorResult.width,
      height: editorResult.height
    });

    if(!editorResult.animatedPreview) return;

    requestRAF(async() => {
      if(!img() || isCleaned()) {
        editorResult.animatedPreview.remove();
        return;
      }

      const {promise, cancel} = animateImageToTarget({
        animatedImg: editorResult.animatedPreview,
        target: img()
      });
      cancelAnimation = cancel;

      await promise.catch(noop);

      editorResult.animatedPreview.remove();
    });
  };

  const handleVideoFinish = async(editorResult: MediaEditorFinalResult, initialFile?: File) => {
    initialFile ??= persistingState?.initialFile;
    const isVideo = persistingState?.isVideo ?? initialFile?.type.startsWith('video/')

    persistingState = {
      editingState: editorResult.editingMediaState,
      initialObjectUrl: editorResult.originalSrc,
      initialFile,
      isVideo
    };

    // No-changes path: behave like the photo flow — no creation overlay or progress,
    // animate the preview into the attached <video> slot.
    if(!editorResult.creationProgress) {
      await handleUnchangedVideoFinish(editorResult);
      return;
    }

    const previewObjectUrl = URL.createObjectURL(editorResult.preview);
    const [progress] = editorResult.creationProgress;

    setCreatingVideoState({
      previewObjectUrl,
      editorResult,
      progress
    });

    // Block submit while video render is in progress.
    props.onAttach?.({type: 'pending'});

    const animateDeferred = deferredPromise<void>();

    if(editorResult.animatedPreview) {
      requestRAF(async() => {
        if(!videoPreviewImg() || isCleaned()) {
          editorResult.animatedPreview.remove();
          animateDeferred.reject();
          return;
        }

        const {promise, cancel} = animateImageToTarget({
          animatedImg: editorResult.animatedPreview,
          target: videoPreviewImg()
        });
        cancelAnimation = cancel;

        await promise.catch(() => animateDeferred.reject());

        editorResult.animatedPreview.remove();
        animateDeferred.resolve();
      });
    } else {
      animateDeferred.resolve();
    }

    let resultPayload: Awaited<ReturnType<MediaEditorFinalResult['getResult']>> | undefined;
    try {
      resultPayload = await editorResult.getResult();
      await animateDeferred;
    } catch(err) {
      // Cancelled or failed: revert to nothing attached.
      URL.revokeObjectURL(previewObjectUrl);
      setCreatingVideoState(undefined);
      props.onAttach?.(undefined);
      persistingState = undefined;
      editorResult.animatedPreview.remove();
      return;
    }

    if(isCleaned()) {
      URL.revokeObjectURL(previewObjectUrl);
      return;
    }

    // Probe the produced video to get dimensions/duration and a thumb if missing.
    const probeVideo = createVideo({});
    const videoObjectUrl = URL.createObjectURL(resultPayload.blob);
    probeVideo.src = videoObjectUrl;
    probeVideo.muted = true;
    probeVideo.autoplay = true;
    probeVideo.preload = 'metadata';

    probeVideo.addEventListener('timeupdate', () => {
      probeVideo.pause();
    }, {once: true});
    try {
      await onMediaLoad(probeVideo as HTMLMediaElement);
    } catch(err) {
      // Failed to probe; treat as cancel.
      URL.revokeObjectURL(previewObjectUrl);
      URL.revokeObjectURL(videoObjectUrl);
      setCreatingVideoState(undefined);
      props.onAttach?.(undefined);
      persistingState = undefined;
      return;
    }

    // A video is treated as a GIF only when gif uploads are allowed for this slot.
    const isAnimated = supportsMedia('gif') && canVideoBeAnimated({
      noSound: !resultPayload.hasSound,
      size: resultPayload.blob.size,
      isEditingMediaFromAlbum: false
    });

    const thumb = resultPayload.thumb || await createPosterFromVideo(probeVideo);
    const thumbUrl = URL.createObjectURL(thumb.blob);

    const attachedVideo: AttachedVideo = {
      type: 'video',
      objectUrl: videoObjectUrl,
      blob: resultPayload.blob,
      width: editorResult.width,
      height: editorResult.height,
      duration: probeVideo.duration,
      isAnimated,
      hasSound: resultPayload.hasSound,
      thumb: {
        url: thumbUrl,
        blob: thumb.blob,
        size: thumb.size,
        isCover: !isAnimated && !!resultPayload.thumb
      }
    };

    URL.revokeObjectURL(previewObjectUrl);
    setCreatingVideoState(undefined);
    props.onAttach?.(attachedVideo);
  };

  const handleUnchangedVideoFinish = async(editorResult: MediaEditorFinalResult) => {
    const resultPayload = await editorResult.getResult();

    if(isCleaned()) {
      editorResult.animatedPreview?.remove();
      return;
    }

    const videoObjectUrl = URL.createObjectURL(resultPayload.blob);

    // Probe to get duration; dimensions come from the editor result.
    const probeVideo = createVideo({});
    probeVideo.src = videoObjectUrl;
    probeVideo.muted = true;
    probeVideo.preload = 'metadata';
    try {
      await onMediaLoad(probeVideo as HTMLMediaElement);
    } catch(err) {
      URL.revokeObjectURL(videoObjectUrl);
      editorResult.animatedPreview?.remove();
      persistingState = undefined;
      return;
    }

    const isAnimated = supportsMedia('gif') && canVideoBeAnimated({
      noSound: !resultPayload.hasSound,
      size: resultPayload.blob.size,
      isEditingMediaFromAlbum: false
    });

    const thumb = resultPayload.thumb || await createPosterFromVideo(probeVideo);
    const thumbUrl = URL.createObjectURL(thumb.blob);

    const attachedVideo: AttachedVideo = {
      type: 'video',
      objectUrl: videoObjectUrl,
      blob: resultPayload.blob,
      width: editorResult.width,
      height: editorResult.height,
      duration: probeVideo.duration,
      isAnimated,
      hasSound: resultPayload.hasSound,
      thumb: {
        url: thumbUrl,
        blob: thumb.blob,
        size: thumb.size,
        isCover: !isAnimated && !!resultPayload.thumb
      }
    };

    props.onAttach?.(attachedVideo);

    if(!editorResult.animatedPreview) return;

    requestRAF(async() => {
      const target = videoEl();
      if(!target || isCleaned()) {
        editorResult.animatedPreview.remove();
        return;
      }

      const {promise, cancel} = animateImageToTarget({
        animatedImg: editorResult.animatedPreview,
        target
      });

      cancelAnimation = cancel;
      await promise.catch(noop);

      editorResult.animatedPreview.remove();
    });
  };

  const removeAttached = () => {
    props.onAttach?.(undefined);
    persistingState = undefined;
  };

  const mainMenuButtons: MenuButtons = [];
  if(supportsMedia('photo') || supportsMedia('video')) {
    mainMenuButtons.push({
      icon: 'image',
      text: !supportsMedia('video') ? 'AttachPhoto' : !supportsMedia('photo') ? 'AttachVideo' : 'Chat.Input.Attach.PhotoOrVideo',
      onClick: onChoose
    });
  }
  if(supportsMedia('sticker')) {
    mainMenuButtons.push({
      icon: 'stickers_face',
      text: 'AttachSticker',
      onClick: () => onChooseSticker(btn())
    });
  }

  const setMainMenuOpen = useMenu({
    pivot: btn,
    buttons: mainMenuButtons
  });

  const setIsPhotoMenuOpen = useMenu({
    pivot: img,
    buttons: [
      {
        icon: 'brush',
        text: 'EditThisPhoto',
        onClick: onEdit
      },
      {
        icon: 'replace',
        text: 'ReplacePhoto',
        onClick: onChoose
      },
      {
        icon: 'delete',
        text: 'Remove',
        onClick: removeAttached
      }
    ]
  });

  const setIsVideoMenuOpen = useMenu({
    pivot: videoEl,
    buttons: [
      {
        icon: 'brush',
        get text() {
          return isAttachedGIF() ? 'EditThisGIF' : 'EditThisVideo';
        },
        onClick: onEdit
      },
      {
        icon: 'replace',
        get text() {
          return isAttachedGIF() ? 'ReplaceGIF' : 'ReplaceVideo';
        },
        onClick: onChoose
      },
      {
        icon: 'delete',
        text: 'Remove',
        onClick: removeAttached
      }
    ]
  });

  const setIsStickerMenuOpen = useMenu({
    pivot: stickerEl,
    buttons: [
      {
        icon: 'replace',
        text: 'ReplaceSticker',
        onClick: () => onChooseSticker(stickerEl())
      },
      {
        icon: 'delete',
        text: 'Remove',
        onClick: () => {
          props.onAttach(undefined);
        }
      }
    ]
  });

  const onMainButtonClick = (e: MouseEvent) => {
    if(mainMenuButtons.length === 0) return;
    if(mainMenuButtons.length === 1) {
      mainMenuButtons[0].onClick(e);
      return;
    }
    setMainMenuOpen(true);
  };

  const onCancelCreation = (e: MouseEvent) => {
    e.stopPropagation();
    const state = creatingVideoState();
    state?.editorResult.cancel?.();
  };

  // Note: on img and video elements or their parents, keep on:click, as it is not canceled when this is rendered inside message bubbles
  return (
    <Switch>
      <Match when={creatingVideoState()} keyed>
        {(state) => (
          <div class={`${props.imgClass} ${styles.videoCreatingWrapper}`} on:click={onCancelCreation}>
            <img
              ref={setVideoPreviewImg}
              src={state.previewObjectUrl}
              alt=''
              class={styles.videoCreatingPreview}
            />
            <div class={styles.videoCreatingOverlay}>
              <div class={styles.videoCreatingProgress}>
                <ProgressCircleSVG
                  progress={state.progress()}
                  strokeThickness={1 / 8}
                  stroke='white'
                />
              </div>
              <div role='button' class={styles.videoCreatingCancel}>
                <IconTsx icon='close' class={styles.videoCreatingCancelIcon} />
              </div>
            </div>
          </div>
        )}
      </Match>
      <Match when={props.attachedMedia?.type === 'photo' && props.attachedMedia} keyed>
        {(attachedMedia) => (
          <img ref={setImg} class={props.imgClass} src={attachedMedia.objectUrl} alt='' on:click={() => setIsPhotoMenuOpen(true)} />
        )}
      </Match>
      <Match when={props.attachedMedia?.type === 'video' && props.attachedMedia} keyed>
        {(attachedMedia) => (
          <div
            class={`${props.imgClass} ${styles.videoAttachmentWrapper}`}
            on:click={() => setIsVideoMenuOpen(true)}
          >
            <video
              ref={setVideoEl}
              class={styles.videoAttachmentVideo}
              src={attachedMedia.objectUrl}
              muted
              playsinline
            />
            <div class={styles.videoAttachmentDim} />
            <div class={styles.videoAttachmentBadge}>
              {attachedMedia.isAnimated ?
                'GIF' :
                <IconTsx icon='play' class={styles.videoAttachmentBadgeIcon} />}
            </div>
          </div>
        )}
      </Match>
      <Match when={props.attachedMedia?.type === 'sticker' && props.attachedMedia} keyed>
        {(sticker) => (
          <StickerPreview
            docId={sticker.docId}
            class={props.imgClass}
            ref={setStickerEl}
            onClick={() => setIsStickerMenuOpen(true)}
          />
        )}
      </Match>
      <Match when>
        <ButtonIconTsx ref={setBtn} class={props.btnClass} icon='attach' onClick={onMainButtonClick} />
      </Match>
    </Switch>
  );
};

type MenuButtons = Parameters<typeof ButtonMenuSync>[0]['buttons'];

function useMenu(params: {
  buttons: MenuButtons;
  pivot: () => HTMLElement;
}) {
  const {ButtonMenuSync} = useHotReloadGuard();
  const [isMenuOpen, setIsMenuOpen] = createSignal(false);

  createEffect(on(isMenuOpen, (open) => {
    if(!open) return;

    const isCleaned = useIsCleaned();

    const buttonMenu = ButtonMenuSync({buttons: params.buttons});

    buttonMenu.style.position = 'fixed';
    buttonMenu.style.top = 'unset';

    document.body.appendChild(buttonMenu);

    requestRAF(() => {
      if(isCleaned()) return;

      positionFloatingMenu(params.pivot().getBoundingClientRect(), buttonMenu, 'right-center', [12, 0]);
      contextMenuController.openBtnMenu(buttonMenu, async() => {
        await pause(400);
        setIsMenuOpen(false);
      });
    });

    onCleanup(() => {
      buttonMenu.remove();
    });
  }));

  return setIsMenuOpen;
}
