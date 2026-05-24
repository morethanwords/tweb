import {ButtonIconTsx} from '@components/buttonIconTsx';
import type {ButtonMenuSync} from '@components/buttonMenu';
import {EditingMediaState} from '@components/mediaEditor/context';
import {MediaEditorFinalResult} from '@components/mediaEditor/finalRender/createFinalResult';
import {animateImageToTarget} from '@helpers/animateImageToTarget';
import contextMenuController from '@helpers/contextMenuController';
import blurActiveElement from '@helpers/dom/blurActiveElement';
import noop from '@helpers/noop';
import {positionFloatingMenu} from '@helpers/positionMenu';
import pause from '@helpers/schedulers/pause';
import {requestRAF} from '@helpers/solid/requestRAF';
import {wrapAsyncClickHandler} from '@helpers/wrapAsyncClickHandler';
import {useIsCleaned} from '@hooks/useIsCleaned';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {createEffect, createSignal, on, onCleanup, Show} from 'solid-js';
import {AttachedMedia} from './storeContext';
import {useStickersDropdown} from './stickersDropdown';


export const MediaAttachment = (props: {
  imgClass?: string;
  btnClass?: string;
  attachedMedia?: AttachedMedia;
  onAttach?: (value: AttachedMedia | undefined) => void;
}) => {
  const {getFileAndOpenEditor, rootScope} = useHotReloadGuard();

  const [img, setImg] = createSignal<HTMLImageElement>();
  const [btn, setBtn] = createSignal<HTMLElement>();

  const setStickersDropdownPivot = useStickersDropdown({
    onStickerClick: () => {}
  });

  type OriginalValues = {
    editingState: EditingMediaState;
    objectUrl: string;
    file: File;
  };

  let originalValues: OriginalValues;

  const isCleaned = useIsCleaned();

  const onChoose = wrapAsyncClickHandler(async() => {
    blurActiveElement();

    // there is a dynamic import there
    await getFileAndOpenEditor({
      onFinish: (args) => handleFinish(args.editorResult, args.originalFile)
    });
  });

  const onEdit = wrapAsyncClickHandler(async() => {
    if(!img() || !props.attachedMedia || !originalValues) return;

    const {openMediaEditorFromMedia} = await import('@components/mediaEditor');

    openMediaEditorFromMedia({
      source: img(),
      rect: img().getBoundingClientRect(),
      animatedCanvasSize: [img().naturalWidth, img().naturalHeight],
      mediaType: 'image',
      mediaSrc: originalValues.objectUrl,
      getMediaBlob: async() => originalValues.file,
      managers: rootScope.managers,
      onEditFinish: handleFinish,
      editingMediaState: originalValues.editingState,
      onClose: noop,
      canImageResultInGIF: false
    });
  });

  const handleFinish = async(editorResult: MediaEditorFinalResult, originalFile?: File) => {
    if(editorResult.isVideo || !editorResult.animatedPreview) return;

    const result = await editorResult.getResult();
    const url = URL.createObjectURL(result.blob);

    originalFile ??= originalValues.file;

    originalValues = {
      editingState: editorResult.editingMediaState,
      objectUrl: editorResult.originalSrc,
      file: originalFile
    };

    props.onAttach?.({
      type: 'photo',
      objectUrl: url,
      blob: result.blob,
      width: editorResult.width,
      height: editorResult.height
    });

    requestRAF(async() => {
      if(!img() || isCleaned()) {
        editorResult.animatedPreview.remove();
        return;
      }

      await animateImageToTarget({
        animatedImg: editorResult.animatedPreview,
        target: img()
      });

      editorResult.animatedPreview.remove();
    });
  };

  const setMainMenuOpen = useMenu({
    pivot: btn,
    buttons: [
      {
        icon: 'image',
        text: 'AttachPhoto',
        onClick: onChoose
      },
      {
        icon: 'stickers_face',
        text: 'AttachSticker',
        onClick: () => setStickersDropdownPivot(btn())
      }
    ]
  });

  const setIsPhotoMenuOpen= useMenu({
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
        onClick: () => {
          props.onAttach(undefined);
          originalValues = undefined;
        }
      }
    ]
  });

  return (
    <>
      <Show when={!props.attachedMedia}>
        <ButtonIconTsx ref={setBtn} class={props.btnClass} icon='attach' onClick={() => setMainMenuOpen(true)} />
      </Show>
      <Show when={props.attachedMedia?.objectUrl}>
        <img ref={setImg} class={props.imgClass} src={props.attachedMedia.objectUrl} alt='' on:click={() => setIsPhotoMenuOpen(true)} />
      </Show>
    </>
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
