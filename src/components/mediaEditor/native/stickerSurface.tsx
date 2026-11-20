import {createSignal, onMount, Show} from 'solid-js';
import StickersTab from '@components/mediaEditor/tabs/stickersTab';
import {TabContentContext} from '@components/mediaEditor/tabs/tabContent';
import {useMediaEditorContext} from '@components/mediaEditor/context';
import {getImageLayerImporter} from '@components/mediaEditor/imageLayer/insert';
import useIsMobile from '@components/mediaEditor/useIsMobile';
import {i18n} from '@lib/langPack';
import A11yButton from '@components/a11yButton';
import photoStyles from '@components/mediaEditor/imageLayer/photoButton.module.scss';

export default function NativeStickerSurface(props: {class: string; scrollClass: string}) {
  const context = useMediaEditorContext();
  const mobile = useIsMobile();
  let container: HTMLDivElement;
  let thumbStripHost: HTMLDivElement;
  const [ready, setReady] = createSignal(false);
  const [scrollAmount, setScrollAmount] = createSignal(0);
  onMount(() => setReady(true));
  return <div class={`${props.class} media-editor-native__sticker-surface`}>
    <Show when={mobile() && !context.isEditingForAvatar}>
      <A11yButton class={photoStyles.button} onClick={() => void getImageLayerImporter(context)?.choose(container.ownerDocument)}>
        {i18n('AttachPhoto')}
      </A11yButton>
    </Show>
    <div ref={thumbStripHost} class="media-editor-native__sticker-thumbs" />
    <div ref={container} class={props.scrollClass} onScroll={() => setScrollAmount(container.scrollTop)}>
      <Show when={ready()}>
        <TabContentContext.Provider value={{container: () => container, scrollAmount, thumbStripHost: () => thumbStripHost}}>
          <StickersTab />
        </TabContentContext.Provider>
      </Show>
    </div>
  </div>;
}
