import appNavigationController, {NavigationItem} from '@components/appNavigationController';
import {getOverlayRoot} from '@helpers/appWindow';
import confirmationPopup from '@components/confirmationPopup';
import MainCanvas from '@components/mediaEditor/canvas/mainCanvas';
import MediaEditorContext, {createContextValue, EditingMediaState} from '@components/mediaEditor/context';
import {createFinalResult, MediaEditorFinalResult} from '@components/mediaEditor/finalRender/createFinalResult';
import FinishButton from '@components/mediaEditor/finishButton';
import '@components/mediaEditor/mediaEditor.scss';
import Toolbar from '@components/mediaEditor/toolbar';
import {MediaType} from '@components/mediaEditor/types';
import {delay} from '@components/mediaEditor/utils';
import createFocusTrap, {FocusTrap} from '@helpers/dom/focusTrap';
import overlayCounter from '@helpers/overlayCounter';
import {doubleRaf} from '@helpers/schedulers';
import {withCurrentOwner} from '@helpers/solid/withCurrentOwner';
import I18n, {i18n} from '@lib/langPack';
import {AppManagers} from '@lib/managers';
import type SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import {createEffect, onCleanup, onMount} from 'solid-js';
import {render} from 'solid-js/web';


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
  // Output encoding for a still-image result. Caller-controlled so the editor
  // isn't locked to one format/quality (e.g. newMedia compresses heavy photos,
  // avatars stay near-lossless). Defaults to JPEG at the browser's default quality.
  imageType?: 'image/jpeg' | 'image/png';
  imageQuality?: number;
};

export function MediaEditor(props: MediaEditorProps) {
  const contextValue = createContextValue(props);

  const {editorState, canFinish} = contextValue;

  let overlay: HTMLDivElement;
  let focusTrap: FocusTrap;
  let isClosing = false;
  let isDestroyed = false;

  let isOverlayCounterCleaned = false;

  function cleanupOverlayCounter() {
    if(isOverlayCounterCleaned) return;

    overlayCounter.isDarkOverlayActive = false;
    isOverlayCounterCleaned = true;
  }

  onMount(() => {
    const ownerDocument = overlay.ownerDocument;
    const previouslyFocused = ownerDocument.activeElement as HTMLElement;
    focusTrap = createFocusTrap(overlay);

    void (async() => {
      overlay.classList.add('media-editor__overlay--hidden');
      overlay.setAttribute('aria-hidden', 'true');
      await doubleRaf();

      if(isClosing || isDestroyed) return;

      overlay.classList.remove('media-editor__overlay--hidden');
      overlay.removeAttribute('aria-hidden');
      const closeButton = overlay.querySelector<HTMLButtonElement>('.media-editor__topbar > button:not([disabled])');
      focusTrap.activate(previouslyFocused, closeButton);
    })();

    const navigationItem: NavigationItem = {
      type: 'popup',
      noBlurOnPop: true,
      onPop: () => handleClose()
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
    isClosing = true;
    focusTrap?.deactivate();
    overlay.classList.add('media-editor__overlay--hidden');
    overlay.setAttribute('aria-hidden', 'true');
    await delay(200);
    props.onClose(hasGif);
  }

  function handleClose(finished = false, hasGif = false) {
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

  return (
    <MediaEditorContext.Provider value={contextValue}>
      <div
        ref={overlay}
        class="media-editor__overlay night"
        role="dialog"
        aria-modal="true"
        aria-busy={!editorState.isReady}
        aria-label={I18n.format('Edit', true)}
        tabindex={-1}
      >
        <div class="media-editor__container">
          {(() => {
            // Need to be inside context
            const handleFinish = withCurrentOwner(async() => {
              if(isFinishing) return;
              isFinishing = true;

              const result = await createFinalResult()
              .finally(() => { isFinishing = false; });

              cleanupOverlayCounter();
              props.onEditFinish(result);
              handleClose(true, result.isVideo);
            });

            return (
              <>
                <MainCanvas />
                <Toolbar onClose={handleClose} onFinish={handleFinish} />
                <FinishButton onClick={handleFinish} />
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

  function onClose(hasGif: boolean) {
    props.onClose(hasGif);
    dispose();
    element.remove();
  }
}
