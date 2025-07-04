import {createEffect, onCleanup, onMount} from 'solid-js';
import {render} from 'solid-js/web';

import {doubleRaf} from '../../helpers/schedulers';
import {AppManagers} from '../../lib/appManagers/managers';
import {i18n} from '../../lib/langPack';
import type SolidJSHotReloadGuardProvider from '../../lib/solidjs/hotReloadGuardProvider';

import appNavigationController, {NavigationItem} from '../appNavigationController';
import confirmationPopup from '../confirmationPopup';

import MainCanvas from './canvas/mainCanvas';
import MediaEditorContext, {createContextValue, EditingMediaState} from './context';
import {createFinalResult, MediaEditorFinalResult} from './finalRender/createFinalResult';
import FinishButton from './finishButton';
import Toolbar from './toolbar';
import {MediaType, NumberPair} from './types';
import {delay, withCurrentOwner} from './utils';

import './mediaEditor.scss';


export type MediaEditorProps = {
  onClose: (hasGif: boolean) => void;
  managers: AppManagers;
  onEditFinish: (result: MediaEditorFinalResult) => void;
  onCanvasReady: (canvas: HTMLCanvasElement) => Promise<void>;
  onImageRendered: () => void;
  mediaSrc: string;
  mediaType: MediaType;
  mediaBlob: Blob;
  mediaSize: NumberPair;
  editingMediaState?: EditingMediaState
};

export function MediaEditor(props: MediaEditorProps) {
  const contextValue = createContextValue(props);

  const {editorState, hasModifications} = contextValue;

  let overlay: HTMLDivElement;

  onMount(() => {
    (async() => {
      overlay.classList.add('media-editor__overlay--hidden');
      await doubleRaf();
      overlay.classList.remove('media-editor__overlay--hidden');
    })();

    const navigationItem: NavigationItem = {
      type: 'popup',
      onPop: () => handleClose()
    };
    appNavigationController.pushItem(navigationItem);

    overlay.focus();

    onCleanup(() => {
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
    overlay.classList.add('media-editor__overlay--hidden');
    await delay(200);
    props.onClose(hasGif);
  }

  function handleClose(finished = false, hasGif = false) {
    if(finished || !hasModifications()) {
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
      <div ref={overlay} class="media-editor__overlay night">
        <div class="media-editor__container">
          {(() => {
            // Need to be inside context
            const handleFinish = withCurrentOwner(async() => {
              if(isFinishing) return;
              isFinishing = true;

              const result = await createFinalResult()
              .finally(() => { isFinishing = false; });

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
  const element = document.createElement('div');
  document.body.append(element);

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
