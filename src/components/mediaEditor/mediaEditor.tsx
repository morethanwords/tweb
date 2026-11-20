import appNavigationController, {NavigationItem} from '@components/appNavigationController';
import {getOverlayRoot} from '@helpers/appWindow';
import confirmationPopup from '@components/confirmationPopup';
import MainCanvas from '@components/mediaEditor/canvas/mainCanvas';
import MediaEditorContext, {createContextValue, EditingMediaState} from '@components/mediaEditor/context';
import {createFinalResult, MediaEditorFinalResult} from '@components/mediaEditor/finalRender/createFinalResult';
import FinishButton from '@components/mediaEditor/finishButton';
import '@components/mediaEditor/mediaEditor.scss';
import Toolbar from '@components/mediaEditor/toolbar';
import useHistoryShortcuts from '@components/mediaEditor/useHistoryShortcuts';
import useIsMobile from '@components/mediaEditor/useIsMobile';
import createModeCheckpoint from '@components/mediaEditor/createModeCheckpoint';
import AndroidControls from '@components/mediaEditor/native/androidControls';
import DesktopControls from '@components/mediaEditor/native/desktopControls';
import {addEditorShape} from '@components/mediaEditor/shapes';
import {AndroidEditorStage, EditorShape, MediaType} from '@components/mediaEditor/types';
import {delay} from '@components/mediaEditor/utils';
import createFocusTrap, {FocusTrap} from '@helpers/dom/focusTrap';
import Modes from '@config/modes';
import overlayCounter from '@helpers/overlayCounter';
import {doubleRaf} from '@helpers/schedulers';
import {withCurrentOwner} from '@helpers/solid/withCurrentOwner';
import I18n, {i18n} from '@lib/langPack';
import {AppManagers} from '@lib/managers';
import type SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import {batch, createEffect, createSignal, on, onCleanup, onMount, Show} from 'solid-js';
import {render} from 'solid-js/web';
import {trackOpenMediaEditor} from '@components/mediaEditor/openEditors';
import {createImageLayerImporter} from '@components/mediaEditor/imageLayer/insert';
import {imageLayerSession} from '@components/mediaEditor/imageLayer/session';
import {createImageLayerTransferConsumer, isSingleStaticImageTransfer} from '@components/mediaEditor/imageLayer/transfer';
import {dispatchTransferConsumer, registerTransferConsumer} from '@helpers/dom/transferConsumer';
import androidAdjustmentHasChanges from '@components/mediaEditor/native/androidAdjustmentHasChanges';
import {unwrap} from 'solid-js/store';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';
import {getManagersSession, isSessionLeaving} from '@lib/accounts/getCurrentAccount';
import type {PopupPeerHandle} from '@components/popups/peer';


export type MediaEditorProps = {
  onClose: (hasGif: boolean) => void;
  managers: AppManagers;
  onEditFinish: (result: MediaEditorFinalResult) => void;
  onCanvasReady: (canvas: HTMLCanvasElement) => Promise<void>;
  onImageRendered: () => void;
  mediaSrc: string;
  mediaType: MediaType;
  getMediaBlob: () => Promise<Blob | null>;
  editingMediaState?: EditingMediaState;
  isEditingForAvatar?: boolean;
  isEditingForumAvatar?: boolean;
  canFinishWithoutChanges?: boolean;
  isVideoAvatarMode?: boolean;
  canImageResultInGIF?: boolean;
  dontCreatePreview?: boolean;
  initialTab?: string;
  attachmentCaption?: HTMLElement;
  attachmentTitle?: HTMLElement;
  // Output encoding for a still-image result. Caller-controlled so the editor
  // isn't locked to one format/quality (e.g. newMedia compresses heavy photos,
  // avatars stay near-lossless). Defaults to JPEG at the browser's default quality.
  imageType?: 'image/jpeg' | 'image/png';
  imageQuality?: number;
};

export function MediaEditor(props: MediaEditorProps) {
  const contextValue = createContextValue(props);

  const {editorState, canFinish} = contextValue;
  const isMobile = useIsMobile();
  const [stage, setStage] = createSignal<AndroidEditorStage>(isMobile() ? 'preview' : 'crop');
  const checkpoint = createModeCheckpoint(contextValue);
  const adjustmentManagers = bindManagersToSession(props.managers);
  const adjustmentSession = getManagersSession(adjustmentManagers);
  let adjustmentEntry: EditingMediaState['adjustments'];
  let adjustmentConfirmation: PopupPeerHandle;
  let adjustmentConfirmationPending = false;
  const [textFinishError, setTextFinishError] = createSignal<string>();
  const reportTextFinishError = (error: unknown) => {
    if((error as Error)?.name !== 'AbortError') setTextFinishError(String(error));
  };
  const chooseShape = (shape: EditorShape, filled: boolean, draw = true) => {
    if(contextValue.nativePaint) {
      contextValue.nativePaint.selectShape(shape, filled);
      editorState.currentTab = 'brush';
      return;
    }
    editorState.drawingShape = {shape, filled};
    editorState.currentTab = draw ? 'shapes' : 'layers';
    if(!draw) addEditorShape(contextValue, shape, filled);
  };
  if(!props.isEditingForAvatar) {
    editorState.currentTab = isMobile() ? 'preview' : 'crop';
    editorState.cropTabAnimationProgress = isMobile() ? 0 : 1;
  }

  function enterStage(next: AndroidEditorStage) {
    if(adjustmentConfirmationPending || editorState.isMoving || !editorState.isReady) return;
    checkpoint.begin();
    if(next === 'adjustments') adjustmentEntry = structuredClone(unwrap(contextValue.mediaState.adjustments));
    batch(() => {
      setStage(next);
      editorState.currentTab = next === 'paint' ? 'brush' : next;
      editorState.selectedResizableLayer = undefined;
    });
  }

  function leaveStage(apply: boolean) {
    if(adjustmentConfirmationPending) return false;
    if(editorState.isMoving) return false;
    imageImporter.cancel();
    if(apply) {
      if(isFinishing) return false;
      const work = contextValue.textSessions.finish();
      if(work) {
        isFinishing = true;
        work.then(() => {
          if(!disposed && !isClosing) completeLeaveStage(true);
        }).catch(reportTextFinishError).finally(() => { isFinishing = false; });
        return false;
      }
    } else contextValue.textSessions.cancel();
    return completeLeaveStage(apply);
  }

  function cancelAndroidStage() {
    if(stage() !== 'adjustments') return leaveStage(false);
    if(disposed || isClosing || isFinishing || editorState.isMoving || adjustmentConfirmationPending || isSessionLeaving(adjustmentSession)) return false;
    if(!androidAdjustmentHasChanges(contextValue.mediaState.adjustments, adjustmentEntry)) return leaveStage(false);
    adjustmentConfirmationPending = true;
    confirmationPopup({
      managers: adjustmentManagers,
      title: i18n('MediaEditor.DiscardChanges'),
      description: i18n('MediaEditor.DiscardWarning'),
      button: {text: i18n('Discard')},
      onPopup: popup => { adjustmentConfirmation = popup; }
    }).then(() => {
      adjustmentConfirmationPending = false;
      if(!disposed && !isClosing && !isSessionLeaving(adjustmentSession) && isMobile() && stage() === 'adjustments') leaveStage(false);
    }, () => {}).finally(() => {
      adjustmentConfirmationPending = false;
      adjustmentConfirmation = undefined;
    });
    return false;
  }

  function completeLeaveStage(apply: boolean) {
    if(apply && contextValue.nativePaint && !contextValue.nativePaint.finishShape()) return false;
    if(apply) checkpoint.apply();
    else checkpoint.cancel();
    batch(() => {
      const next = isMobile() ? 'preview' : 'crop';
      setStage(next);
      editorState.currentTab = next;
      editorState.selectedResizableLayer = undefined;
    });
    return false;
  }

  createEffect(on(isMobile, (mobile) => {
    if(props.isEditingForAvatar) return;
    // A responsive shell switch is not a document edit or a new editor session.
    if(stage() === 'paint') return;
    const complete = () => {
      if(disposed || isClosing) return;
      checkpoint.apply();
      const next = mobile ? 'preview' : 'crop';
      setStage(next);
      editorState.currentTab = next;
    };
    const work = contextValue.textSessions.finish();
    if(work) {
      work.then(complete).catch(reportTextFinishError);
      return;
    }
    complete();
  }, {defer: true}));

  let overlay: HTMLDivElement;
  let focusTrap: FocusTrap;
  let isClosing = false;
  let isDestroyed = false;
  const imageImporter = createImageLayerImporter(contextValue, {
    mobile: isMobile,
    valid: () => !disposed && !isClosing && !isFinishing && editorState.isReady && !editorState.isMoving,
    enterPaint: () => { if(stage() !== 'paint') enterStage('paint'); },
    report: reportTextFinishError
  });
  const imageTransferEnabled = () => !props.isEditingForAvatar && !isMobile() && !disposed && !isClosing &&
    !isFinishing && editorState.isReady && !editorState.isMoving && editorState.editingTextLayer === undefined;
  const consumeImageTransfer = createImageLayerTransferConsumer({
    enabled: imageTransferEnabled,
    consume: event => { void imageImporter.fromEvent(event); }
  });
  const handleImageTransfer = (event: ClipboardEvent | DragEvent) => { dispatchTransferConsumer(event); };

  createEffect(on(() => [stage(), isMobile()], () => {
    if(!Modes.a11y) return;
    // A native mode replaces its buttons; do not leave keyboard focus on the body.
    queueMicrotask(() => {
      if(!overlay?.isConnected || isClosing || isDestroyed) return;
      if(overlay.contains(overlay.ownerDocument.activeElement)) return;
      overlay.querySelector<HTMLElement>('[data-editor-cancel]')?.focus({preventScroll: true});
    });
  }, {defer: true}));

  let isOverlayCounterCleaned = false;

  function cleanupOverlayCounter() {
    if(isOverlayCounterCleaned) return;

    overlayCounter.isDarkOverlayActive = false;
    isOverlayCounterCleaned = true;
  }

  onMount(() => {
    const ownerDocument = overlay.ownerDocument;
    onCleanup(registerTransferConsumer(ownerDocument, consumeImageTransfer));
    const previouslyFocused = ownerDocument.activeElement as HTMLElement;
    focusTrap = createFocusTrap(overlay);

    void (async() => {
      overlay.classList.add('media-editor__overlay--hidden');
      overlay.setAttribute('aria-hidden', 'true');
      await doubleRaf();
      if(!Modes.a11y) overlay.focus();

      if(isClosing || isDestroyed) return;

      overlay.classList.remove('media-editor__overlay--hidden');
      overlay.removeAttribute('aria-hidden');
      const closeButton = overlay.querySelector<HTMLElement>('[data-editor-cancel], .media-editor__topbar > button:not([disabled])');
      focusTrap.activate(previouslyFocused, closeButton);
    })();

    const navigationItem: NavigationItem = {
      type: 'popup',
      noBlurOnPop: Modes.a11y,
      onPop: () => {
        if(!props.isEditingForAvatar && (stage() === 'paint' || isMobile() && stage() !== 'preview')) {
          return isMobile() ? cancelAndroidStage() : leaveStage(false);
        }
        return props.isEditingForAvatar || isMobile() ? handleClose() : handleClose(true);
      }
    };
    appNavigationController.pushItem(navigationItem);
    overlayCounter.isDarkOverlayActive = true;

    onCleanup(() => {
      isDestroyed = true;
      focusTrap.deactivate();
      cleanupOverlayCounter();
      appNavigationController.removeItem(navigationItem);
    });
  });

  createEffect(() => {
    if(!editorState.imageCanvas) return;

    (async() =>{
      await props.onCanvasReady(editorState.imageCanvas);
      editorState.isReady = true;
    })();
  });

  createEffect(() => {
    if(!editorState.renderingPayload) return;
    props.onImageRendered();
  });

  async function performClose(hasGif = false) {
    imageImporter.cancel();
    contextValue.textSessions.cancel();
    isClosing = true;
    focusTrap?.deactivate();
    overlay.classList.add('media-editor__overlay--hidden');
    overlay.setAttribute('aria-hidden', 'true');
    await delay(200);
    props.onClose(hasGif);
  }

  function handleClose(finished = false, hasGif = false) {
    if(adjustmentConfirmationPending) return false;
    if(finished || !canFinish()) {
      performClose(hasGif);
      return;
    }

    confirmationPopup({
      title: i18n('MediaEditor.DiscardChanges'),
      description: i18n('MediaEditor.DiscardWarning'),
      button: {
        text: i18n('Discard')
      }
    }).then(() => performClose(), () => {});

    return false;
  }

  let isFinishing = false;
  // * closed from outside while the result was being made (an account switch): nobody is left to take it
  let disposed = false;
  onCleanup(() => {
    disposed = true;
    adjustmentConfirmation?.hide();
    imageImporter.cancel();
    imageLayerSession(contextValue).close();
    contextValue.textSessions.cancel();
  });

  return (
    <MediaEditorContext.Provider value={contextValue}>
      <div
        ref={overlay}
        class="media-editor__overlay night"
        classList={{
          'media-editor__overlay--native': !props.isEditingForAvatar,
          'media-editor__overlay--desktop': !props.isEditingForAvatar && !isMobile()
        }}
        role="dialog"
        aria-modal="true"
        aria-busy={!editorState.isReady || editorState.isMoving}
        aria-label={I18n.format('Edit', true)}
        tabindex={Modes.a11y ? -1 : undefined}
        onPaste={handleImageTransfer}
        onDrop={handleImageTransfer}
        onDragOver={event => {
          if(imageTransferEnabled() && isSingleStaticImageTransfer(event)) {
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = 'copy';
          }
        }}
      >
        <div
          class="media-editor__container"
          classList={{'media-editor__container--native': !props.isEditingForAvatar}}
          data-editor-platform={!props.isEditingForAvatar ? isMobile() ? 'android' : 'desktop' : undefined}
          data-editor-stage={!props.isEditingForAvatar ? stage() : undefined}
        >
          <Show when={textFinishError()}>
            <div role="alert" title={textFinishError()}>{i18n('Error.AnError')} {textFinishError()}</div>
          </Show>
          {(() => {
            // Need to be inside context
            const handleFinish = withCurrentOwner(async() => {
              if(isFinishing || adjustmentConfirmationPending || !editorState.isReady || editorState.isMoving) return;
              isFinishing = true;
              setTextFinishError(undefined);
              let result: MediaEditorFinalResult;
              try {
                result = await createFinalResult();
              } catch(error) {
                reportTextFinishError(error);
                return;
              } finally {
                isFinishing = false;
              }
              if(disposed) {
                // * what it made is let go: the preview flying over the screens, a video still encoding
                result.animatedPreview?.remove();
                result.cancel?.();
                return;
              }

              cleanupOverlayCounter();
              props.onEditFinish(result);
              handleClose(true, result.isVideo);
            });

            // Pointer and keyboard share the current stage's publication/apply/export path.
            const desktopDone = () => stage() === 'paint' ? leaveStage(true) : handleFinish();
            const shortcuts = useHistoryShortcuts({
              enabled: () => !props.isEditingForAvatar && !isMobile() && (props.mediaType === 'image' || props.mediaType === 'video'),
              available: () => !disposed && !isClosing && !isFinishing && !adjustmentConfirmationPending && !isSessionLeaving(adjustmentSession),
              onDone: desktopDone
            });
            return (
              <>
                <MainCanvas />
                <Show when={props.isEditingForAvatar} fallback={
                  <Show when={isMobile()} fallback={
                    <>
                    <Show when={props.attachmentCaption && stage() !== 'paint'}>
                      <div class="media-editor__attachment-caption">{props.attachmentCaption}</div>
                    </Show>
                    <DesktopControls
                      stage={stage() === 'paint' ? 'paint' : 'transform'}
                      onCancel={() => stage() === 'paint' ? leaveStage(false) : handleClose(true)}
                      onDone={desktopDone}
                      shortcuts={shortcuts}
                      onPaint={() => enterStage('paint')}
                      onShape={chooseShape}
                    />
                    </>
                  }>
                    <AndroidControls
                      stage={stage()}
                      caption={props.attachmentCaption}
                      title={props.attachmentTitle}
                      onStage={enterStage}
                      onCancel={() => stage() === 'preview' ? handleClose() : cancelAndroidStage()}
                      onDone={() => stage() === 'preview' ? handleFinish() : leaveStage(true)}
                      onShape={chooseShape}
                    />
                  </Show>
                }>
                  <Toolbar onClose={() => handleClose()} onFinish={handleFinish} />
                  <FinishButton onClick={handleFinish} />
                </Show>
              </>
            );
          })()}
        </div>
      </div>
    </MediaEditorContext.Provider>
  );
}

export function openMediaEditor(props: MediaEditorProps, HotReloadGuardProvider: typeof SolidJSHotReloadGuardProvider) {
  const overlayRoot = getOverlayRoot();
  const element = overlayRoot.ownerDocument.createElement('div');
  overlayRoot.append(element);

  const dispose = render(() => (
    <HotReloadGuardProvider>
      <MediaEditor {...props} onClose={onClose} />
    </HotReloadGuardProvider>
  ), element);

  const stopTracking = trackOpenMediaEditor(() => onClose(false));

  function onClose(hasGif: boolean) {
    stopTracking();
    props.onClose(hasGif);
    dispose();
    element.remove();
  }
}
