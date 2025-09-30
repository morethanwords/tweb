import {createEffect, createMemo, createResource, createSignal, onCleanup, Show} from 'solid-js';
import liteMode from '../../helpers/liteMode';
import {doubleRaf} from '../../helpers/schedulers';
import pause from '../../helpers/schedulers/pause';
import {attachHotClassName} from '../../helpers/solid/classname';
import {I18nTsx} from '../../helpers/solid/i18n';
import type {AutonomousMonoforumThreadList} from '../../lib/appManagers/appDialogsManager';
import defineSolidElement, {PassedProps} from '../../lib/solidjs/defineSolidElement';
import {useHotReloadGuard} from '../../lib/solidjs/hotReloadGuard';
import {ButtonIconTsx} from '../buttonIconTsx';
import {PeerTitleTsx} from '../peerTitleTsx';
import createMonoforumDialogsList from './list';
import styles from './styles.module.scss';

if(import.meta.hot) import.meta.hot.accept();


type Props = {
  peerId: PeerId;
  onClose: () => void;
};

type Controls = {
  autonomousList: AutonomousMonoforumThreadList;
  close: () => Promise<void>;
};

const MonoforumDrawer = defineSolidElement({
  name: 'monoforum-drawer',
  component: (props: PassedProps<Props>, _, controls: Controls) => {
    const {appDialogsManager, AutonomousMonoforumThreadList, appSidebarLeft, apiManagerProxy, rootScope} = useHotReloadGuard();
    const canAnimate = () => liteMode.isAvailable('animations');

    attachHotClassName(props.element, styles.Container);

    const chat = createMemo(() => {
      const chat = apiManagerProxy.getChat(props.peerId.toChatId());
      if(chat?._ === 'channel' && chat?.pFlags?.monoforum) return chat;

      setTimeout(() => {
        props?.onClose(); // Should not happen, but let it be
      }, 0);
    });

    const [dialogs] = createResource(() => rootScope.managers.monoforumDialogsStorage.getDialogs({parentPeerId: props.peerId, limit: 1}));

    const initiallyHidden = canAnimate() && !appSidebarLeft.isCollapsed();
    const [isHidden, setIsHidden] = createSignal(initiallyHidden);

    createEffect(() => {
      if(!chat() || !initiallyHidden) return;
      if(canAnimate()) doubleRaf().then(() => setIsHidden(false));
    });

    const autonomousList = createMonoforumDialogsList({peerId: props.peerId, appDialogsManager, AutonomousMonoforumThreadList})

    controls.autonomousList = autonomousList;

    onCleanup(() => {
      autonomousList.destroy();
    });

    const list = autonomousList.sortedList.list;
    appDialogsManager.setListClickListener({list, onFound: null, withContext: true});


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
    autonomousList.onEmpty = close;

    const closeListener = (e: MouseEvent) => {
      if(e.target === props.element) close();
    };

    props.element.addEventListener('click', closeListener);
    onCleanup(() => props.element.removeEventListener('click', closeListener));

    return (
      <Show when={chat()}>
        <div
          class={styles.InnerContainer}
          classList={{
            [styles.hidden]: isHidden()
          }}
        >
          <div class={`sidebar-header ${styles.Header}`}>
            <ButtonIconTsx class='sidebar-close-button' icon='close' noRipple onClick={close} />
            <div class={styles.TitleContainer}>
              <PeerTitleTsx class={styles.Title} peerId={props.peerId} />
              <div class={styles.Subtitle}>
                <I18nTsx key='ChannelDirectMessages.ThreadsCount' args={[dialogs() ? dialogs().count + '' : '~']} />
              </div>
            </div>
          </div>
          <div class={styles.ScrollableContainer}>
            {autonomousList.scrollable.container}
          </div>
        </div>
      </Show>
    );
  }
});

export type MonoforumDrawerInstance = InstanceType<typeof MonoforumDrawer>;

export default MonoforumDrawer;
