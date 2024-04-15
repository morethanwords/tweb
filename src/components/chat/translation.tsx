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
import {i18n} from '../../lib/langPack';
import {NULL_PEER_ID} from '../../lib/mtproto/mtproto_config';
import {useFullPeer} from '../../stores/fullPeers';
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

    const [shouldShow, setShouldShow] = createSignal(false);

    const translateToLang = createMemo(() => usePeerTranslation(peerId())[0]());
    const fullPeer = useFullPeer(peerId);
    createEffect(() => {
      console.log('translations full peer', fullPeer());
      setShouldShow(!!fullPeer() && !fullPeer().pFlags.translations_disabled);
    });

    createEffect(() => {
      this.toggle(!shouldShow());
    });

    const listenerSetter = new ListenerSetter();
    onCleanup(() => listenerSetter.removeAll());
    const menu = ButtonMenuToggle({direction: 'bottom-left', buttons: [{
      icon: 'premium_translate',
      text: 'Chat.Translate.Menu.To',
      onClick: () => {}
    }, {
      icon: 'hand',
      text: 'DoNotTranslateLanguage',
      textArgs: [i18n('LanguageName')],
      onClick: () => {}
    }, {
      icon: 'crossround',
      text: 'Hide',
      onClick: () => {},
      separator: true
    }], listenerSetter});
    menu.classList.add('pinned-translation-menu', 'primary');
    return (
      <>
        <div
          class="pinned-translation-button"
          onClick={() => {
            const [translationLang, setTranslationLang] = usePeerTranslation(peerId());
            setTranslationLang(translationLang() ? undefined : 'en');
          }}
        >
          {Icon('premium_translate', 'pinned-translation-button-icon')}
          {translateToLang() ? i18n('ShowOriginalButton') : i18n('TranslateToButton', [i18n('LanguageName')])}
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
