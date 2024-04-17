/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {createEffect, createMemo, createSignal, onCleanup} from 'solid-js';
import {render} from 'solid-js/web';
import deferredPromise from '../../helpers/cancellablePromise';
import ListenerSetter from '../../helpers/listenerSetter';
import usePeerTranslation from '../../hooks/usePeerTranslation';
import {AppManagers} from '../../lib/appManagers/managers';
import I18n, {i18n} from '../../lib/langPack';
import {NULL_PEER_ID} from '../../lib/mtproto/mtproto_config';
import SearchIndex from '../../lib/searchIndex';
import Languages from '../../lib/tinyld/languages';
import {useAppState} from '../../stores/appState';
import ButtonMenuToggle from '../buttonMenuToggle';
import Icon from '../icon';
import PopupElement from '../popups';
import PopupPickUser from '../popups/pickUser';
import Row from '../row';
import Chat from './chat';
import PinnedContainer from './pinnedContainer';
import ChatTopbar from './topbar';

function pickLanguage() {
  const deferred = deferredPromise<TranslatableLanguageISO>();

  const index = new SearchIndex({ignoreCase: true});
  const map: Map<string, [string, string]> = new Map();
  Languages.forEach(([iso2, name]) => {
    const translated = I18n.format(`Language.${iso2}`, true);
    map.set(iso2, [name, translated]);
    index.indexObject(iso2, [iso2, name, translated].join(' '));
  });

  const popup = PopupElement.createPopup(
    PopupPickUser,
    {
      peerType: ['custom'],
      renderResultsFunc: (iso2s) => {
        iso2s.forEach((iso2) => {
          const [name, translated] = map.get(iso2 as any as string);
          const row = new Row({
            title: name,
            subtitle: translated,
            clickable: true
          });

          row.container.dataset.peerId = '' + iso2;
          popup.selector.list.append(row.container);
        });
      },
      placeholder: 'Search',
      getMoreCustom: async(q) => {
        const filtered = q ? [...index.search(q)] : Languages.map(([iso2]) => iso2);
        return {
          result: filtered as any,
          isEnd: true
        };
      },
      onSelect: (iso2) => {
        deferred.resolve(iso2 as any);
      },
      noPlaceholder: true
    }
  );

  popup.addEventListener('close', () => {
    deferred.reject();
  });

  return deferred;
}

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
      onClick: async() => {
        const iso2 = await pickLanguage();
        peerTranslation().setLanguage(iso2);
      }
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
            translation.toggle(!translation.enabled());
          }}
        >
          {Icon('premium_translate', 'pinned-translation-button-icon')}
          {peerTranslation().enabled() ?
            i18n('ShowOriginalButton') :
            i18n('TranslateToButton', [i18n(`Language.${peerTranslation().language()}`)])
          }
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
