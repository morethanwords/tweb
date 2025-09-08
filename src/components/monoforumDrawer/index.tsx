import {createEffect, createMemo, createSignal, onCleanup, Show} from 'solid-js';
import liteMode from '../../helpers/liteMode';
import {doubleRaf} from '../../helpers/schedulers';
import pause from '../../helpers/schedulers/pause';
import rootScope from '../../lib/rootScope';
import defineSolidElement, {PassedProps} from '../../lib/solidjs/defineSolidElement';
import {useHotReloadGuard} from '../../lib/solidjs/hotReloadGuard';
import {ButtonIconTsx} from '../buttonIconTsx';
import {PeerTitleTsx} from '../peerTitleTsx';
import Scrollable from '../scrollable';
import SortedDialogList from '../sortedDialogList';
import styles from './styles.module.scss';

if(import.meta.hot) import.meta.hot.accept();


type Props = {
  peerId: PeerId;
  onClose: () => void;
};

type Controls = {
  close: () => Promise<void>;
};

const MonoforumDrawer = defineSolidElement({
  name: 'monoforum-drawer',
  component: (props: PassedProps<Props>, _, controls: Controls) => {
    const {appDialogsManager, AutonomousMonoforumThreadList, appSidebarLeft, apiManagerProxy} = useHotReloadGuard();
    const canAnimate = () => liteMode.isAvailable('animations');

    props.element.classList.add(styles.Container);
    if(import.meta.hot) onCleanup(() => void props.element.classList.remove(styles.Container));

    const chat = createMemo(() => {
      const chat = apiManagerProxy.getChat(props.peerId.toChatId());
      if(chat?._ === 'channel' && chat?.pFlags?.monoforum) return chat;

      setTimeout(() => {
        props?.onClose(); // Should not happen, but let it be
      }, 0);
    });

    const initiallyHidden = canAnimate() && !appSidebarLeft.isCollapsed();
    const [isHidden, setIsHidden] = createSignal(initiallyHidden);

    createEffect(() => {
      if(!chat() || !initiallyHidden) return;
      if(canAnimate()) doubleRaf().then(() => setIsHidden(false));
    });

    const scrollable = new Scrollable();
    const autonomousList = new AutonomousMonoforumThreadList(props.peerId);
    autonomousList.scrollable = scrollable;
    autonomousList.sortedList = new SortedDialogList({
      itemSize: 72,
      appDialogsManager,
      scrollable: scrollable,
      managers: rootScope.managers,
      requestItemForIdx: autonomousList.requestItemForIdx,
      onListShrinked: autonomousList.onListShrinked,
      indexKey: 'index_0',
      monoforumParentPeerId: props.peerId
    });

    onCleanup(() => {
      autonomousList.destroy();
    });

    const list = autonomousList.sortedList.list;
    appDialogsManager.setListClickListener({list, onFound: null, withContext: true});
    scrollable.append(list);
    autonomousList.bindScrollable();


    autonomousList.onChatsScroll();

    function finishClose() {
      props.element.remove();
    }

    async function close() {
      try { props.onClose?.(); } catch{}

      if(!canAnimate()) return finishClose();

      if(!appSidebarLeft.isCollapsed()) setIsHidden(true);

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
          <div class={styles.ScrollableContainer}>
            {scrollable.container}
          </div>
        </div>
      </Show>
    );
  }
});

export type MonoforumDrawerInstance = InstanceType<typeof MonoforumDrawer>;

export default MonoforumDrawer;
