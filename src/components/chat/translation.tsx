/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {createEffect, createMemo, createSignal, onCleanup} from 'solid-js';
import {render} from 'solid-js/web';
import ListenerSetter from '../../helpers/listenerSetter';
import usePeerTranslation from '../../hooks/usePeerTranslation';
import {AppManagers} from '../../lib/appManagers/managers';
import I18n, {i18n} from '../../lib/langPack';
import {NULL_PEER_ID} from '../../lib/mtproto/mtproto_config';
import {useAppState} from '../../stores/appState';
import ButtonMenuToggle from '../buttonMenuToggle';
import Icon from '../icon';
import Chat from './chat';
import PinnedContainer from './pinnedContainer';
import ChatTopbar from './topbar';

export default class ChatTranslation extends PinnedContainer {
  private dispose: () => void;
  private peerId: () => PeerId;
  public setPeerId: (peerId: PeerId) => void;

  constructor(protected topbar: ChatTopbar, protected chat: Chat, protected managers: AppManagers) {
    super({
      topbar,
      chat,
      listenerSetter: topbar.listenerSetter,
      className: 'translation',
      floating: true,
      height: 42
    });

    [this.peerId, this.setPeerId] = createSignal<PeerId>(NULL_PEER_ID);
    this.dispose = render(() => this.init(), this.container);
  }

  private init() {
    const {peerId} = this;

    const i = new I18n.IntlElement({
      key: 'DoNotTranslateLanguage'
    });

    const peerTranslation = createMemo(() => usePeerTranslation(peerId()));

    createEffect(() => {
      i.compareAndUpdate({args: [
        i18n(`Language.${peerTranslation().peerLanguage()}`)
      ]});
    });

    createEffect(() => {
      this.toggle(!peerTranslation().shouldShow());
    });

    const listenerSetter = new ListenerSetter();
    onCleanup(() => listenerSetter.removeAll());
    const menu = ButtonMenuToggle({direction: 'bottom-left', buttons: [{
      icon: 'premium_translate',
      text: 'Chat.Translate.Menu.To',
      onClick: () => {}
    }, {
      icon: 'hand',
      textElement: i.element,
      onClick: () => {
        const [_, setAppState] = useAppState();
        setAppState('doNotTranslate', (arr) => [...arr, peerTranslation().peerLanguage()]);
      }
    }, {
      icon: 'crossround',
      text: 'Hide',
      onClick: () => {
        this.managers.appTranslationsManager.togglePeerTranslations(peerId(), true);
      },
      separator: true
    }], listenerSetter});
    menu.classList.add('pinned-translation-menu', 'primary');
    return (
      <>
        <div
          class="pinned-translation-button"
          onClick={() => {
            const translation = peerTranslation();
            translation.set(translation.language() ? undefined : 'en');
          }}
        >
          {Icon('premium_translate', 'pinned-translation-button-icon')}
          {peerTranslation().language() ? i18n('ShowOriginalButton') : i18n('TranslateToButton', [i18n('LanguageName')])}
        </div>
        {menu}
      </>
    );
  }

  public destroy() {
    super.destroy();
    this.dispose();
  }
}
