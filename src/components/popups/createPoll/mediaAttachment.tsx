import {ButtonIconTsx} from '@components/buttonIconTsx';
import SimpleFormField from '@components/simpleFormField';
import {animateImageToTarget} from '@helpers/animateImageToTarget';
import {requestRAF} from '@helpers/solid/requestRAF';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {createEffect, createSignal, onCleanup, Show} from 'solid-js';
import {createStore} from 'solid-js/store';
import styles from './styles.module.scss';


type MediaAttachmentStore = {
  hasAttachment: boolean;
  attachmentUrl?: string;
};

export const MediaAttachment = () => {
  const {getFileAndOpenEditor} = useHotReloadGuard();

  const [store, setStore] = createStore<MediaAttachmentStore>({hasAttachment: false});

  const [img, setImg] = createSignal<HTMLImageElement>();

  const onClick = () => {
    getFileAndOpenEditor({
      onFinish: async(editorResult) => {
        if(editorResult.isVideo || !editorResult.animatedPreview) return;

        const result = await editorResult.getResult();
        setStore({hasAttachment: true, attachmentUrl: URL.createObjectURL(result.blob)});

        requestRAF(async() => {
          await animateImageToTarget({
            animatedImg: editorResult.animatedPreview,
            target: img()
          });
          editorResult.animatedPreview.remove();
        });
      }
    });
  };

  createEffect(() => {
    if(!store.attachmentUrl) return;

    onCleanup(() => {
      URL.revokeObjectURL(store.attachmentUrl);
    });
  });

  return (
    <SimpleFormField.SideContent class={styles.sideContentWithFixedIcon} first={!store.hasAttachment} last>
      <Show when={!store.hasAttachment}>
        <ButtonIconTsx icon='attach' onClick={onClick} />
      </Show>
      <Show when={store.hasAttachment}>
        <img ref={setImg} class={styles.mediaAttachmentImage} src={store.attachmentUrl} alt='' />
      </Show>
    </SimpleFormField.SideContent>
  );
};
