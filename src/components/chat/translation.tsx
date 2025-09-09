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
import usePremium from '../../stores/premium';
import ButtonMenuToggle from '../buttonMenuToggle';
import Icon from '../icon';
import PopupElement from '../popups';
import PopupPickUser from '../popups/pickUser';
import PopupPremium from '../popups/premium';
import Row from '../row';
import Chat from './chat';
import PinnedContainer from './pinnedContainer';
import ChatTopbar from './topbar';
import {useAppSettings} from '../../stores/appSettings';
import {toastNew} from '../toast';
import {usePeer} from '../../stores/peers';
import {Chat as MTChat} from '../../layer';

export function pickLanguage<T extends boolean>(
  multi?: T,
  selected?: Array<TranslatableLanguageISO>
): T extends true ? Promise<TranslatableLanguageISO[]> : Promise<TranslatableLanguageISO> {
  const deferred = deferredPromise<TranslatableLanguageISO>();

  const index = new SearchIndex({ignoreCase: true});
  const map: Map<string, [string, string]> = new Map();
  Languages.forEach(([iso2, name]) => {
    const translated = I18n.format(`Language.${iso2}`, true);
    map.set(iso2, [name, translated]);
    index.indexObjectArray(iso2, [iso2, name, translated]);
  });

  const popup = PopupElement.createPopup(
    PopupPickUser,
    {
      peerType: ['custom'],
      renderResultsFunc: (iso2s) => {
        iso2s.forEach((iso2) => {
          const [name, translated] = map.get(iso2 as any as string);
          const row = new Row({
            title: translated,
            subtitle: name,
            clickable: true,
            havePadding: multi
          });

          if(multi) {
            row.container.append(popup.selector.checkbox(popup.selector.selected.has(iso2)));
          }
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
      onSelect: !multi ? deferred.resolve.bind(deferred) as any : undefined,
      onMultiSelect: multi ? deferred.resolve.bind(deferred) as any : undefined,
      titleLangKey: multi ? 'Telegram.LanguageViewController' : undefined,
      checkboxSide: 'left',
      noPlaceholder: true
    }
  );

  popup.addEventListener('close', () => {
    deferred.reject();
  });

  if(selected) {
    const _add = popup.selector.add.bind(popup.selector);
    popup.selector.add = ({key, scroll}) => {
      const ret = _add({
        key: key,
        title: i18n(`Language.${key as TranslatableLanguageISO}`),
        scroll,
        // fallbackIcon: 'close'
        fallbackIcon: 'check'
      });
      return ret;
    };

    popup.selector.addInitial(selected);
  }

  return deferred as any;
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
    const isPremium = usePremium();

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
    const menu = ButtonMenuToggle({
      direction: 'bottom-left',
      buttons: [{
        icon: 'premium_translate',
        text: 'Chat.Translate.Menu.To',
        onClick: async() => {
          const iso2 = await pickLanguage(false);
          peerTranslation().setLanguage(iso2);
        },
        verify: isPremium
      }, {
        icon: 'hand',
        textElement: i.element,
        onClick: () => {
          const [_, setAppSettings] = useAppSettings();
          setAppSettings('translations', 'doNotTranslate', (arr) => [...arr, peerTranslation().peerLanguage()]);
        },
        verify: isPremium,
        separatorDown: true
      }, {
        icon: 'crossround',
        text: 'Hide',
        onClick: () => {
          const peer = usePeer(peerId());
          toastNew({
            langPackKey: (peer as MTChat.channel).pFlags.broadcast ?
              'TranslationBarHiddenChannel' :
              'TranslationBarHidden'
          });
          this.managers.appTranslationsManager.togglePeerTranslations(peerId(), true);
        }
      }],
      listenerSetter
    });
    menu.classList.add('pinned-translation-menu', 'primary');
    return (
      <>
        <div
          class="pinned-translation-button"
          onClick={() => {
            const translation = peerTranslation();
            if(!translation.canTranslate()) {
              PopupPremium.show({feature: 'translations'});
              return;
            }

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
