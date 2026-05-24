import {Accessor, createEffect, createMemo, createSignal} from 'solid-js';
import deferredPromise from '@helpers/cancellablePromise';
import ListenerSetter from '@helpers/listenerSetter';
import usePeerTranslation from '@hooks/usePeerTranslation';
import {AppManagers} from '@lib/managers';
import I18n, {i18n} from '@lib/langPack';
import {NULL_PEER_ID} from '@appManagers/constants';
import SearchIndex from '@lib/searchIndex';
import Languages from '@lib/tinyld/languages';
import usePremium from '@stores/premium';
import ButtonMenuToggle from '@components/buttonMenuToggle';
import Icon from '@components/icon';
import showPickUserPopup from '@components/popups/pickUser';
import PopupPremium from '@components/popups/premium';
import Row from '@components/row';
import Chat from '@components/chat/chat';
import ChatTopbar from '@components/chat/topbar';
import {useAppSettings} from '@stores/appSettings';
import {toastNew} from '@components/toast';
import {usePeer} from '@stores/peers';
import {Chat as MTChat} from '@layer';
import TopbarPlate, {createTopbarPlate, TopbarPlateController} from '@components/chat/topbarPlate';

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

  const popup = showPickUserPopup({
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
    onSelect: (results) => {
      const keys = results.map(({key}) => key);
      deferred.resolve(multi ? keys as any : keys[0]);
    },
    multiSelect: multi,
    titleLangKey: 'Telegram.LanguageViewController',
    checkboxSide: 'left',
    noPlaceholder: true,
    onClose: () => deferred.reject(),
    footerButtonProps: {
      children: i18n('Save')
    }
  });

  if(selected) {
    const _add = popup.selector.add.bind(popup.selector);
    popup.selector.add = ({key, scroll}) => {
      const ret = _add({
        key: key,
        title: i18n(`Language.${key as TranslatableLanguageISO}`),
        scroll,
        fallbackIcon: 'check'
      });
      return ret;
    };

    popup.selector.addInitial(selected);
  }

  return deferred as any;
}

export type ChatTranslationPlate = TopbarPlateController & {
  setPeerId: (peerId: PeerId) => void
};

/**
 * Top-level component so solid-refresh can swap it on HMR. The plate
 * factory's closure state (the peerId signal) is preserved because the
 * factory isn't re-invoked when this file hot-updates.
 */
function TranslationPlateBody(props: {
  peerId: Accessor<PeerId>,
  managers: AppManagers,
  setHidden: (hidden: boolean) => void
}) {
  const i = new I18n.IntlElement({key: 'DoNotTranslateLanguage'});

  const peerTranslation = createMemo(() => usePeerTranslation(props.peerId()));
  const isPremium = usePremium();

  createEffect(() => {
    i.compareAndUpdate({args: [i18n(`Language.${peerTranslation().peerLanguage()}`)]});
  });

  createEffect(() => props.setHidden(!peerTranslation().shouldShow()));

  const listenerSetter = new ListenerSetter();
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
        const peer = usePeer(props.peerId());
        toastNew({
          langPackKey: (peer as MTChat.channel).pFlags.broadcast ?
            'TranslationBarHiddenChannel' :
            'TranslationBarHidden'
        });
        props.managers.appTranslationsManager.togglePeerTranslations(props.peerId(), true);
      }
    }],
    listenerSetter
  });
  menu.classList.add('pinned-translation-menu');

  return (
    <>
      <TopbarPlate.PrimaryButton
        onClick={() => {
          const translation = peerTranslation();
          if(!translation.canTranslate()) {
            PopupPremium.show({feature: 'translations'});
            return;
          }
          translation.toggle(!translation.enabled());
        }}
      >
        {Icon('premium_translate', 'pinned-translation-primary-button-icon')}
        {peerTranslation().enabled() ?
          i18n('ShowOriginalButton') :
          i18n('TranslateToButton', [i18n(`Language.${peerTranslation().language()}`)])
        }
      </TopbarPlate.PrimaryButton>
      {menu}
    </>
  );
}

export default function createChatTranslationPlate(
  topbar: ChatTopbar,
  chat: Chat,
  managers: AppManagers
): ChatTranslationPlate {
  const [peerId, setPeerIdSignal] = createSignal<PeerId>(NULL_PEER_ID);

  const plate = createTopbarPlate({
    modifier: 'translation',
    height: 48,
    onVisibilityChange: () => topbar.setFloating(),
    render: ({setHidden}) => <TranslationPlateBody peerId={peerId} managers={managers} setHidden={setHidden} />
  });

  return {
    ...plate,
    setPeerId: (next) => setPeerIdSignal(next)
  };
}
