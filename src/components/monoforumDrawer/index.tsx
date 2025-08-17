import {createEffect, createResource, createSignal, onCleanup, Show} from 'solid-js';
import liteMode from '../../helpers/liteMode';
import {doubleRaf} from '../../helpers/schedulers';
import pause from '../../helpers/schedulers/pause';
import rootScope from '../../lib/rootScope';
import defineSolidElement, {PassedProps} from '../../lib/solidjs/defineSolidElement';
import {ButtonIconTsx} from '../buttonIconTsx';
import {PeerTitleTsx} from '../peerTitleTsx';
import styles from './styles.module.scss';

if(import.meta.hot) import.meta.hot.accept();


type Props = {
  peerId: PeerId;
  onCloseFinish: () => void;
};

type Controls = {
  close: () => Promise<void>;
};

const MonoforumDrawer = defineSolidElement({
  name: 'monoforum-drawer',
  component: (props: PassedProps<Props>, _, controls: Controls) => {
    const canAnimate = () => liteMode.isAvailable('animations');

    props.element.classList.add(styles.Container);
    if(import.meta.hot) onCleanup(() => void props.element.classList.remove(styles.Container));

    const [chat] = createResource(async() => {
      const chat = await rootScope.managers.appChatsManager.getChat(props.peerId.toChatId());
      if(chat?._ === 'channel' && chat?.pFlags?.monoforum) return chat;

      props?.onCloseFinish(); // Should not happen, but let it be
    });

    const [isHidden, setIsHidden] = createSignal(canAnimate());

    createEffect(() => {
      if(!chat()) return;
      if(canAnimate()) doubleRaf().then(() => setIsHidden(false));
    });

    function finishClose() {
      props.element.remove();
      props.onCloseFinish?.();
    }

    async function close() {
      if(!canAnimate()) return finishClose();

      setIsHidden(true);
      await pause(200);
      finishClose();
    }

    controls.close = close;

    return (
      <Show when={chat()}>
        <div
          class={styles.InnerContainer}
          classList={{
            [styles.hidden]: isHidden()
          }}
        >
          <div class={`sidebar-header ${styles.Header}`}>
            <ButtonIconTsx class='sidebar-close-button' icon='close' onClick={close} />
            <PeerTitleTsx class={styles.Title} peerId={props.peerId} />
            <ButtonIconTsx icon='more' />
          </div>
        </div>
      </Show>
    );
  }
});

export type MonoforumDrawerInstance = InstanceType<typeof MonoforumDrawer>;

export default MonoforumDrawer;
