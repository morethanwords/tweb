import {ButtonIconTsx} from '@components/buttonIconTsx';
import {animateImageToTarget} from '@helpers/animateImageToTarget';
import {requestRAF} from '@helpers/solid/requestRAF';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {createEffect, createSignal, onCleanup, Show} from 'solid-js';


export const MediaAttachment = (props: {
  imgClass?: string;
  btnClass?: string;
  objectUrl?: string;
  onChange?: (url: string | undefined) => void;
}) => {
  const {getFileAndOpenEditor} = useHotReloadGuard();

  const [img, setImg] = createSignal<HTMLImageElement>();

  const onClick = () => {
    getFileAndOpenEditor({
      onFinish: async(editorResult) => {
        if(editorResult.isVideo || !editorResult.animatedPreview) return;

        const result = await editorResult.getResult();
        const url = URL.createObjectURL(result.blob);
        props.onChange?.(url);

        requestRAF(async() => {
          if(!img()) {
            editorResult.animatedPreview.remove();
            return;
          }

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
    if(!props.objectUrl) return;

    onCleanup(() => {
      URL.revokeObjectURL(props.objectUrl);
    });
  });

  return (
    <>
      <Show when={!props.objectUrl}>
        <ButtonIconTsx class={props.btnClass} icon='attach' onClick={onClick} />
      </Show>
      <Show when={props.objectUrl}>
        <img ref={setImg} class={props.imgClass} src={props.objectUrl} alt='' />
      </Show>
    </>
  );
};
