import canVideoBeAnimated from '@appManagers/utils/docs/canVideoBeAnimated';
import {getOverlayRoot} from '@helpers/appWindow';
import {ButtonIconTsx} from '@components/buttonIconTsx';
import type {ButtonMenuSync} from '@components/buttonMenu';
import {IconTsx} from '@components/iconTsx';
import {EditingMediaState} from '@components/mediaEditor/context';
import {MediaEditorFinalResult} from '@components/mediaEditor/finalRender/createFinalResult';
import {MAX_EDITABLE_VIDEO_SIZE, supportsVideoEncoding} from '@components/mediaEditor/support';
import {ProgressCircleSVG} from '@components/progressCircleSVG';
import {StickerPreview} from '@components/stickerPreview';
import PhotoTsx from '@components/wrappers/photoTsx';
import {animateImageToTarget} from '@helpers/animateImageToTarget';
import deferredPromise from '@helpers/cancellablePromise';
import contextMenuController from '@helpers/contextMenuController';
import {createPosterFromVideo} from '@helpers/createPoster';
import blurActiveElement from '@helpers/dom/blurActiveElement';
import createVideo from '@helpers/dom/createVideo';
import noop from '@helpers/noop';
import onMediaLoad from '@helpers/onMediaLoad';
import detectVideoHasSound from '@helpers/video/detectVideoHasSound';
import {positionFloatingMenu} from '@helpers/positionMenu';
import pause from '@helpers/schedulers/pause';
import {requestRAF} from '@helpers/solid/requestRAF';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import classNames from '@helpers/string/classNames';
import {wrapAsyncClickHandler} from '@helpers/wrapAsyncClickHandler';
import {useIsCleaned} from '@hooks/useIsCleaned';
import apiManagerProxy from '@lib/apiManagerProxy';
import I18n from '@lib/langPack';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {createEffect, createMemo, createResource, createSignal, Match, on, onCleanup, Switch} from 'solid-js';
import {unwrap} from 'solid-js/store';
import {openPollLinkEditorPopup} from '../pollLink';
import styles from './mediaAttachment.module.scss';
import {useStickersDropdown} from './stickersDropdown';
import {AttachedLink, AttachedMedia, AttachedVideo, SupportedMediaType} from './storeContext';


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
  onLinkPopupClose?: () => void;
}) => {
  const {getFileAndOpenEditor, rootScope, HotReloadGuard} = useHotReloadGuard();
  const supportsMedia = (media: SupportedMediaType) => props.supportedMediaTypes?.includes(media);

  const [img, setImg] = createSignal<HTMLImageElement>();
  const [videoPreviewImg, setVideoPreviewImg] = createSignal<HTMLImageElement>();
  const [videoEl, setVideoEl] = createSignal<HTMLVideoElement>();
  const [stickerEl, setStickerEl] = createSignal<HTMLDivElement>();
  const [linkEl, setLinkEl] = createSignal<HTMLButtonElement>();
  const [btn, setBtn] = createSignal<HTMLElement>();

  const [creatingVideoState, setCreatingVideoState] = createSignal<CreatingVideoState>();

  const isCleaned = useIsCleaned();
  let operationToken = 0;
  let cancelAnimation: (reject?: boolean) => void;

  const invalidateOperation = () => {
    ++operationToken;
    cancelAnimation?.(true);
    cancelAnimation = undefined;

    const state = creatingVideoState();
    if(state) {
      state.editorResult.cancel?.();
      state.editorResult.animatedPreview?.remove();
      URL.revokeObjectURL(state.previewObjectUrl);
      setCreatingVideoState(undefined);
    }
  };

  const startOperation = () => {
    invalidateOperation();
    return operationToken;
  };

  const isOperationCurrent = (token: number) => token === operationToken && !isCleaned();

  createEffect(on(() => props.attachedMedia?.type, (type, previousType) => {
    if(type !== undefined || previousType === undefined) return;
    invalidateOperation();
  }));

  const setStickersDropdownPivot = useStickersDropdown({
    onStickerClick: ({docId}) => {
      startOperation();
      props.onAttach?.({type: 'sticker', docId});
    }
  });

  let persistingState: PersistingState;
  const replacePersistingState = (next?: PersistingState) => {
    const previousUrl = persistingState?.initialObjectUrl;
    if(previousUrl && previousUrl !== next?.initialObjectUrl) {
      URL.revokeObjectURL(previousUrl);
    }

    persistingState = next;
  };

  onCleanup(() => {
    invalidateOperation();
    replacePersistingState(undefined);
  });

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
      // Videos above the editable size limit are attached directly without going through the editor.
      shouldOpenEditor: (file) => !(file.type.startsWith('video/') && file.size > MAX_EDITABLE_VIDEO_SIZE),
      onSkipEditor: (file) => void attachVideoDirectly(file, startOperation()),
      onFinish: (args) => handleFinish(args.editorResult, args.originalFile, startOperation())
    });
  });

  const attachVideoDirectly = async(file: File, token: number) => {
    const videoObjectUrl = await apiManagerProxy.invoke('createObjectURL', file);
    if(!isOperationCurrent(token)) {
      URL.revokeObjectURL(videoObjectUrl);
      return;
    }

    const probeVideo = createVideo({});
    probeVideo.src = videoObjectUrl;
    probeVideo.muted = true;
    probeVideo.preload = 'metadata';

    try {
      await onMediaLoad(probeVideo as HTMLMediaElement);
    } catch(err) {
      URL.revokeObjectURL(videoObjectUrl);
      return;
    }

    if(!isOperationCurrent(token)) {
      URL.revokeObjectURL(videoObjectUrl);
      return;
    }

    const hasSound = await detectVideoHasSound(probeVideo).catch(() => true);

    if(!isOperationCurrent(token)) {
      URL.revokeObjectURL(videoObjectUrl);
      return;
    }

    const isAnimated = supportsMedia('gif') && canVideoBeAnimated({
      noSound: !hasSound,
      size: file.size,
      isEditingMediaFromAlbum: false
    });

    let poster: Awaited<ReturnType<typeof createPosterFromVideo>>;
    let thumbUrl: string;
    try {
      poster = await createPosterFromVideo(probeVideo);
      thumbUrl = await apiManagerProxy.invoke('createObjectURL', poster.blob);
    } catch(err) {
      URL.revokeObjectURL(videoObjectUrl);
      return;
    }

    if(!isOperationCurrent(token)) {
      URL.revokeObjectURL(videoObjectUrl);
      URL.revokeObjectURL(thumbUrl);
      return;
    }

    const attachedVideo: AttachedVideo = {
      type: 'video',
      objectUrl: videoObjectUrl,
      blob: file,
      width: probeVideo.videoWidth,
      height: probeVideo.videoHeight,
      duration: probeVideo.duration,
      isAnimated,
      hasSound,
      thumb: {
        url: thumbUrl,
        blob: poster.blob,
        size: poster.size,
        isCover: !isAnimated
      }
    };

    replacePersistingState(undefined);
    props.onAttach?.(attachedVideo);
  };

  const onChooseSticker = (pivot: HTMLElement | undefined) => {
    if(!pivot) return;
    blurActiveElement();
    setStickersDropdownPivot(pivot);
  };

  const getAttachedLink = (): AttachedLink | undefined =>
    props.attachedMedia?.type === 'link' ? props.attachedMedia : undefined;

  const resolveLinkPreview = async(url: string, token: number) => {
    const preview = await rootScope.managers.appWebPagesManager.getWebPagePreview(url).catch((): undefined => undefined);
    if(!preview || !isOperationCurrent(token)) return;

    const attachedLink = getAttachedLink();
    if(!attachedLink || attachedLink.url !== url) return;

    const canonicalUrl = preview.webpage._ === 'webPage' && preview.webpage.url ? preview.webpage.url : url;
    props.onAttach?.({
      ...attachedLink,
      url: canonicalUrl,
      preview
    });
  };

  const onChooseLink = () => {
    blurActiveElement();

    openPollLinkEditorPopup({
      initialUrl: getAttachedLink()?.url,
      onClose: props.onLinkPopupClose,
      onSubmit: (url) => {
        const attachedLink = getAttachedLink();
        if(attachedLink?.url !== url) {
          props.onAttach?.({type: 'link', url});
        } else if(!attachedLink.preview) {
          void resolveLinkPreview(url, startOperation());
        }
      }
    }, HotReloadGuard);
  };

  createEffect(on(() => {
    const attachedLink = getAttachedLink();
    return attachedLink && !attachedLink.preview ? attachedLink.url : undefined;
  }, (url) => {
    if(url) void resolveLinkPreview(url, startOperation());
  }));

  createEffect(() => {
    const attachedLink = getAttachedLink();
    const webpage = attachedLink?.preview?.webpage;
    if(!webpage || webpage._ === 'webPageNotModified' || !webpage.id) return;

    const webpageId = webpage.id;
    const refreshPreview = async(onlyIfResolved = false) => {
      const updatedWebPage = await rootScope.managers.appWebPagesManager.getCachedWebPage(webpageId);
      if(!updatedWebPage || (onlyIfResolved && updatedWebPage._ === 'webPagePending')) return;

      const currentLink = getAttachedLink();
      const currentWebPage = currentLink?.preview?.webpage;
      if(!currentWebPage || currentWebPage._ === 'webPageNotModified' || currentWebPage.id !== webpageId) return;

      props.onAttach?.({
        ...currentLink,
        url: updatedWebPage._ === 'webPage' && updatedWebPage.url ? updatedWebPage.url : currentLink.url,
        preview: {
          ...currentLink.preview,
          webpage: updatedWebPage
        }
      });
    };

    if(webpage._ === 'webPagePending') void refreshPreview(true);

    subscribeOn(rootScope)('webpage_updated', ({id}) => {
      if(id !== webpageId) return;
      void refreshPreview();
    });
  });

  const onEdit = wrapAsyncClickHandler(async() => {
    if(!props.attachedMedia || !persistingState) return;
    if(props.attachedMedia.type !== 'photo' && props.attachedMedia.type !== 'video') return;

    const editingState = persistingState;
    const willAnimateFromVideo = props.attachedMedia.type === 'video';
    const wasInitiallyVideo = editingState.isVideo;
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
      mediaSrc: editingState.initialObjectUrl,
      getMediaBlob: async() => editingState.initialFile,
      managers: rootScope.managers,
      onEditFinish: (editorResult) => handleFinish(editorResult, editingState.initialFile, startOperation()),
      editingMediaState: editingState.editingState,
      onClose: noop,
      canImageResultInGIF: supportsMedia('gif')
    });
  });

  const handleFinish = async(editorResult: MediaEditorFinalResult, initialFile: File | undefined, token: number) => {
    if(editorResult.isVideo) {
      await handleVideoFinish(editorResult, initialFile, token);
      return;
    }

    let result: Awaited<ReturnType<MediaEditorFinalResult['getResult']>>;
    try {
      result = await editorResult.getResult();
    } catch(err) {
      editorResult.animatedPreview?.remove();
      return;
    }
    if(!isOperationCurrent(token)) {
      editorResult.animatedPreview?.remove();
      return;
    }

    const url = await apiManagerProxy.invoke('createObjectURL', result.blob);
    if(!isOperationCurrent(token)) {
      URL.revokeObjectURL(url);
      editorResult.animatedPreview?.remove();
      return;
    }

    initialFile ??= persistingState?.initialFile;

    replacePersistingState({
      editingState: editorResult.editingMediaState,
      initialObjectUrl: editorResult.originalSrc,
      initialFile,
      isVideo: false
    });

    props.onAttach?.({
      type: 'photo',
      objectUrl: url,
      blob: result.blob,
      width: editorResult.width,
      height: editorResult.height
    });

    if(!editorResult.animatedPreview) return;

    requestRAF(async() => {
      if(!img() || !isOperationCurrent(token)) {
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

  const handleVideoFinish = async(editorResult: MediaEditorFinalResult, initialFile: File | undefined, token: number) => {
    if(!isOperationCurrent(token)) {
      editorResult.animatedPreview?.remove();
      return;
    }

    initialFile ??= persistingState?.initialFile;
    const isVideo = persistingState?.isVideo ?? initialFile?.type.startsWith('video/');

    const nextPersistingState: PersistingState = {
      editingState: editorResult.editingMediaState,
      initialObjectUrl: editorResult.originalSrc,
      initialFile,
      isVideo
    };

    // No-changes path: behave like the photo flow — no creation overlay or progress,
    // animate the preview into the attached <video> slot.
    if(!editorResult.creationProgress) {
      await handleUnchangedVideoFinish(editorResult, token, nextPersistingState);
      return;
    }

    const previewObjectUrl = await apiManagerProxy.invoke('createObjectURL', editorResult.preview);
    if(!isOperationCurrent(token)) {
      URL.revokeObjectURL(previewObjectUrl);
      editorResult.animatedPreview?.remove();
      return;
    }

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
        if(!videoPreviewImg() || !isOperationCurrent(token)) {
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
      if(creatingVideoState()?.editorResult === editorResult) {
        setCreatingVideoState(undefined);
      }
      if(isOperationCurrent(token)) {
        props.onAttach?.(undefined);
        replacePersistingState(undefined);
      }
      editorResult.animatedPreview?.remove();
      return;
    }

    if(!isOperationCurrent(token)) {
      URL.revokeObjectURL(previewObjectUrl);
      if(creatingVideoState()?.editorResult === editorResult) {
        setCreatingVideoState(undefined);
      }
      return;
    }

    // Probe the produced video to get dimensions/duration and a thumb if missing.
    const probeVideo = createVideo({});
    const videoObjectUrl = await apiManagerProxy.invoke('createObjectURL', resultPayload.blob);
    if(!isOperationCurrent(token)) {
      URL.revokeObjectURL(previewObjectUrl);
      URL.revokeObjectURL(videoObjectUrl);
      if(creatingVideoState()?.editorResult === editorResult) {
        setCreatingVideoState(undefined);
      }
      return;
    }

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
      if(creatingVideoState()?.editorResult === editorResult) {
        setCreatingVideoState(undefined);
      }
      if(isOperationCurrent(token)) {
        props.onAttach?.(undefined);
        replacePersistingState(undefined);
      }
      return;
    }

    if(!isOperationCurrent(token)) {
      URL.revokeObjectURL(previewObjectUrl);
      URL.revokeObjectURL(videoObjectUrl);
      if(creatingVideoState()?.editorResult === editorResult) {
        setCreatingVideoState(undefined);
      }
      return;
    }

    // A video is treated as a GIF only when gif uploads are allowed for this slot.
    const isAnimated = supportsMedia('gif') && canVideoBeAnimated({
      noSound: !resultPayload.hasSound,
      size: resultPayload.blob.size,
      isEditingMediaFromAlbum: false
    });

    let thumb: NonNullable<typeof resultPayload.thumb>;
    let thumbUrl: string;
    try {
      thumb = resultPayload.thumb || await createPosterFromVideo(probeVideo);
      thumbUrl = await apiManagerProxy.invoke('createObjectURL', thumb.blob);
    } catch(err) {
      URL.revokeObjectURL(previewObjectUrl);
      URL.revokeObjectURL(videoObjectUrl);
      if(creatingVideoState()?.editorResult === editorResult) {
        setCreatingVideoState(undefined);
      }
      if(isOperationCurrent(token)) {
        props.onAttach?.(undefined);
        replacePersistingState(undefined);
      }
      editorResult.animatedPreview?.remove();
      return;
    }

    if(!isOperationCurrent(token)) {
      URL.revokeObjectURL(previewObjectUrl);
      URL.revokeObjectURL(videoObjectUrl);
      URL.revokeObjectURL(thumbUrl);
      if(creatingVideoState()?.editorResult === editorResult) {
        setCreatingVideoState(undefined);
      }
      return;
    }

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
    if(creatingVideoState()?.editorResult === editorResult) {
      setCreatingVideoState(undefined);
    }
    replacePersistingState(nextPersistingState);
    props.onAttach?.(attachedVideo);
  };

  const handleUnchangedVideoFinish = async(
    editorResult: MediaEditorFinalResult,
    token: number,
    nextPersistingState: PersistingState
  ) => {
    let resultPayload: Awaited<ReturnType<MediaEditorFinalResult['getResult']>>;
    try {
      resultPayload = await editorResult.getResult();
    } catch(err) {
      editorResult.animatedPreview?.remove();
      return;
    }

    if(!isOperationCurrent(token)) {
      editorResult.animatedPreview?.remove();
      return;
    }

    const videoObjectUrl = await apiManagerProxy.invoke('createObjectURL', resultPayload.blob);
    if(!isOperationCurrent(token)) {
      URL.revokeObjectURL(videoObjectUrl);
      editorResult.animatedPreview?.remove();
      return;
    }

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
      return;
    }

    if(!isOperationCurrent(token)) {
      URL.revokeObjectURL(videoObjectUrl);
      editorResult.animatedPreview?.remove();
      return;
    }

    const isAnimated = supportsMedia('gif') && canVideoBeAnimated({
      noSound: !resultPayload.hasSound,
      size: resultPayload.blob.size,
      isEditingMediaFromAlbum: false
    });

    let thumb: NonNullable<typeof resultPayload.thumb>;
    let thumbUrl: string;
    try {
      thumb = resultPayload.thumb || await createPosterFromVideo(probeVideo);
      thumbUrl = await apiManagerProxy.invoke('createObjectURL', thumb.blob);
    } catch(err) {
      URL.revokeObjectURL(videoObjectUrl);
      editorResult.animatedPreview?.remove();
      return;
    }

    if(!isOperationCurrent(token)) {
      URL.revokeObjectURL(videoObjectUrl);
      URL.revokeObjectURL(thumbUrl);
      editorResult.animatedPreview?.remove();
      return;
    }

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

    replacePersistingState(nextPersistingState);
    props.onAttach?.(attachedVideo);

    if(!editorResult.animatedPreview) return;

    requestRAF(async() => {
      const target = videoEl();
      if(!target || !isOperationCurrent(token)) {
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
    invalidateOperation();
    props.onAttach?.(undefined);
    replacePersistingState(undefined);
  };

  const mainMenuButtons = createMemo(() => {
    const result: MenuButtons = [];

    if(supportsMedia('photo') || supportsMedia('video')) {
      result.push({
        icon: 'image',
        text: !supportsMedia('video') ? 'AttachPhoto' : !supportsMedia('photo') ? 'AttachVideo' : 'Chat.Input.Attach.PhotoOrVideo',
        onClick: onChoose
      });
    }

    if(supportsMedia('sticker')) {
      result.push({
        icon: 'stickers_face',
        text: 'AttachSticker',
        onClick: () => onChooseSticker(btn())
      });
    }

    if(supportsMedia('link')) {
      result.push({
        icon: 'link',
        text: 'Chat.Poll.AttachLink',
        onClick: onChooseLink
      });
    }

    return result;
  });

  const setMainMenuOpen = useMenu({
    pivot: btn,
    buttons: mainMenuButtons
  });

  const setIsPhotoMenuOpen = useMenu({
    pivot: img,
    buttons: () => [
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
    buttons: () => [
      ...(persistingState ? [{
        icon: 'brush',
        get text() {
          return isAttachedGIF() ? 'EditThisGIF' : 'EditThisVideo';
        },
        onClick: onEdit
      }] as MenuButtons : []),
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
    buttons: () => [
      {
        icon: 'replace',
        text: 'ReplaceSticker',
        onClick: () => onChooseSticker(stickerEl())
      },
      {
        icon: 'delete',
        text: 'Remove',
        onClick: removeAttached
      }
    ]
  });

  const setIsLinkMenuOpen = useMenu({
    pivot: linkEl,
    buttons: () => [
      {
        icon: 'edit',
        text: 'Edit',
        onClick: onChooseLink
      },
      {
        icon: 'delete',
        text: 'Remove',
        onClick: removeAttached
      }
    ]
  });

  const onMainButtonClick = (e: MouseEvent) => {
    if(mainMenuButtons().length === 0) return;
    if(mainMenuButtons().length === 1) {
      mainMenuButtons()[0].onClick(e);
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
      <Match when={props.attachedMedia?.type === 'link' && props.attachedMedia} keyed>
        {(link) => {
          const photo = () => {
            const webpage = link.preview?.webpage;
            return webpage?._ === 'webPage' && webpage.photo?._ === 'photo' ? unwrap(webpage.photo) : undefined;
          };

          return (
            <button
              type='button'
              aria-label={I18n.i18n('Chat.Poll.AttachLink').textContent}
              ref={setLinkEl}
              class={classNames(props.imgClass, styles.linkAttachment)}
              classList={{[styles.withPhoto]: !!photo()}}
              on:click={() => setIsLinkMenuOpen(true)}
            >
              <Switch>
                <Match when={photo()} keyed>
                  {(photo) => (
                    <PhotoTsx
                      class={classNames(styles.linkAttachmentPhoto, 'media-container-cover')}
                      photo={photo}
                      boxWidth={40}
                      boxHeight={40}
                      withoutPreloader
                    />
                  )}
                </Match>
              </Switch>
              <div class={styles.linkAttachmentDim} />
              <IconTsx icon='link' class={styles.linkAttachmentIcon} />
            </button>
          );
        }}
      </Match>
      <Match when>
        <ButtonIconTsx ref={setBtn} class={props.btnClass} icon='attach' onClick={onMainButtonClick} />
      </Match>
    </Switch>
  );
};

type MenuButtons = Parameters<typeof ButtonMenuSync>[0]['buttons'];

function useMenu(args: {
  buttons: () => MenuButtons;
  pivot: () => HTMLElement;
}) {
  const {ButtonMenuSync} = useHotReloadGuard();
  const [isMenuOpen, setIsMenuOpen] = createSignal(false);

  createEffect(on(isMenuOpen, (open) => {
    if(!open) return;

    const isCleaned = useIsCleaned();

    const buttonMenu = ButtonMenuSync({buttons: args.buttons()});

    buttonMenu.style.position = 'fixed';
    buttonMenu.style.top = 'unset';

    getOverlayRoot().appendChild(buttonMenu);

    requestRAF(() => {
      if(isCleaned()) return;

      positionFloatingMenu(args.pivot().getBoundingClientRect(), buttonMenu, 'right-center', [12, 0]);
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
