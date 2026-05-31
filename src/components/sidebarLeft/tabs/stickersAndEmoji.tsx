import {Component, onMount} from 'solid-js';
import assumeType from '@helpers/assumeType';
import createContextMenu from '@helpers/dom/createContextMenu';
import positionElementByIndex from '@helpers/dom/positionElementByIndex';
import Sortable from '@helpers/dom/sortable';
import {joinDeepPath} from '@helpers/object/setDeepProperty';
import {StickerSet, MessagesAllStickers} from '@layer';
import {i18n, LangPackKey} from '@lib/langPack';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import rootScope from '@lib/rootScope';
import CheckboxField from '@components/checkboxField';
import LazyLoadQueue from '@components/lazyLoadQueue';
import showStickersPopup from '@components/popups/stickers';
import Row from '@components/row';
import SettingSection from '@components/settingSection';
import wrapStickerSetThumb from '@components/wrappers/stickerSetThumb';
import wrapStickerToRow from '@components/wrappers/stickerToRow';
import {AppQuickReactionTab} from '@components/solidJsTabs/tabs';
import {useAppSettings} from '@stores/appSettings';
import {getStickerSetInputById} from '@lib/appManagers/utils/stickers/getStickerSetInput';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';

const StickersAndEmoji: Component = () => {
  const [tab] = useSuperTab();
  const [appSettings, setAppSettings] = useAppSettings();
  const promiseCollector = usePromiseCollector();

  onMount(() => {
    tab.container.classList.add('stickers-emoji-container');

    let p = {
      allStickers: tab.managers.appStickersManager.getAllStickers(),
      quickReaction: tab.managers.appReactionsManager.getQuickReaction()
    };

    const promises: Promise<any>[] = [];

    {
      const section = new SettingSection({caption: 'LoopAnimatedStickersInfo'});

      const suggestStickersRow = new Row({
        icon: 'lamp',
        titleLangKey: 'Stickers.SuggestStickers',
        clickable: true,
        listenerSetter: tab.listenerSetter,
        titleRightSecondary: true
      });

      const map: {[k in typeof appSettings.stickers.suggest]: LangPackKey} = {
        all: 'SuggestStickersAll',
        installed: 'SuggestStickersInstalled',
        none: 'SuggestStickersNone'
      };

      const setStickersSuggestDescription = () => {
        suggestStickersRow.titleRight.replaceChildren(i18n(map[appSettings.stickers.suggest]));
      };

      setStickersSuggestDescription();

      const setStickersSuggest = (value: typeof appSettings.stickers.suggest) => {
        if(appSettings.stickers.suggest === value) return;
        setAppSettings('stickers', 'suggest', value);
        setStickersSuggestDescription();
      };

      createContextMenu({
        buttons: [{
          icon: 'stickers_face',
          text: 'SuggestStickersAll',
          onClick: setStickersSuggest.bind(null, 'all')
        }, {
          icon: 'newprivate',
          text: 'SuggestStickersInstalled',
          onClick: setStickersSuggest.bind(null, 'installed')
        }, {
          icon: 'stop',
          text: 'SuggestStickersNone',
          onClick: setStickersSuggest.bind(null, 'none')
        }],
        listenTo: suggestStickersRow.container,
        middleware: tab.middlewareHelper.get(),
        listenForClick: true
      });

      const reactionsRow = new Row({
        titleLangKey: 'DoubleTapSetting',
        havePadding: true,
        clickable: () => {
          tab.slider.createTab(AppQuickReactionTab).open();
        },
        listenerSetter: tab.listenerSetter
      });

      const renderQuickReaction = () => {
        p.quickReaction.then((reaction) => {
          if(reaction._ === 'availableReaction') {
            return reaction.static_icon;
          } else {
            return tab.managers.appEmojiManager.getCustomEmojiDocument(reaction.document_id);
          }
        }).then((doc) => {
          wrapStickerToRow({
            row: reactionsRow,
            doc,
            size: 'small'
          });
        });
      };

      renderQuickReaction();

      tab.listenerSetter.add(rootScope)('quick_reaction', () => {
        p = {
          allStickers: tab.managers.appStickersManager.getAllStickers(),
          quickReaction: tab.managers.appReactionsManager.getQuickReaction()
        };
        renderQuickReaction();
      });

      const loopStickersRow = new Row({
        icon: 'flip',
        titleLangKey: 'InstalledStickers.LoopAnimated',
        checkboxField: new CheckboxField({
          name: 'loop',
          stateKey: joinDeepPath('settings', 'stickers', 'loop'),
          listenerSetter: tab.listenerSetter,
          toggle: true
        }),
        listenerSetter: tab.listenerSetter
      });

      section.content.append(
        reactionsRow.container,
        suggestStickersRow.container,
        loopStickersRow.container
      );

      tab.scrollable.append(section.container);
    }

    {
      const section = new SettingSection({name: 'Emoji'});

      const suggestEmojiRow = new Row({
        icon: 'lamp',
        titleLangKey: 'GeneralSettings.EmojiPrediction',
        checkboxField: new CheckboxField({
          name: 'suggest-emoji',
          stateKey: joinDeepPath('settings', 'emoji', 'suggest'),
          listenerSetter: tab.listenerSetter,
          toggle: true
        }),
        listenerSetter: tab.listenerSetter
      });
      const bigEmojiRow = new Row({
        icon: 'smile',
        titleLangKey: 'GeneralSettings.BigEmoji',
        checkboxField: new CheckboxField({
          name: 'emoji-big',
          stateKey: joinDeepPath('settings', 'emoji', 'big'),
          listenerSetter: tab.listenerSetter,
          toggle: true
        }),
        listenerSetter: tab.listenerSetter
      });

      section.content.append(
        suggestEmojiRow.container,
        bigEmojiRow.container
      );

      tab.scrollable.append(section.container);
    }

    {
      const section = new SettingSection({name: 'DynamicPackOrder', caption: 'DynamicPackOrderInfo'});

      const dynamicPackOrderRow = new Row({
        titleLangKey: 'DynamicPackOrder',
        icon: 'replace',
        checkboxField: new CheckboxField({
          name: 'dynamic-pack-order',
          stateKey: joinDeepPath('settings', 'stickers', 'dynamicPackOrder'),
          listenerSetter: tab.listenerSetter,
          toggle: true
        }),
        listenerSetter: tab.listenerSetter
      });

      section.content.append(
        dynamicPackOrderRow.container
      );

      tab.scrollable.append(section.container);
    }

    {
      const section = new SettingSection({name: 'Telegram.InstalledStickerPacksController', caption: 'StickersBotInfo'});

      const stickerSets: {[id: string]: Row} = {};

      const stickersContent = section.generateContentElement();

      const lazyLoadQueue = new LazyLoadQueue();
      const renderStickerSet = (stickerSet: StickerSet.stickerSet, method: 'append' | 'prepend' = 'append') => {
        const row = new Row({
          title: wrapEmojiText(stickerSet.title),
          subtitleLangKey: 'Stickers',
          subtitleLangArgs: [stickerSet.count],
          havePadding: true,
          clickable: () => {
            showStickersPopup(getStickerSetInputById(stickerSet));
          },
          listenerSetter: tab.listenerSetter
        });

        row.container.dataset.id = '' + stickerSet.id;

        row.makeSortable();

        stickerSets[stickerSet.id] = row;

        const div = document.createElement('div');
        div.classList.add('row-media');

        wrapStickerSetThumb({
          set: stickerSet,
          container: div,
          group: 'GENERAL-SETTINGS',
          lazyLoadQueue,
          width: 36,
          height: 36,
          autoplay: true,
          middleware: tab.middlewareHelper.get()
        });

        row.container.append(div);

        stickersContent[method](row.container);
      };

      const promise = p.allStickers.then((allStickers) => {
        assumeType<MessagesAllStickers.messagesAllStickers>(allStickers);
        const promises = allStickers.sets.map((stickerSet) => renderStickerSet(stickerSet));
        return Promise.all(promises);
      });

      promises.push(promise);

      tab.listenerSetter.add(rootScope)('stickers_installed', (set) => {
        if(!stickerSets[set.id]) {
          renderStickerSet(set, 'prepend');
        }
      });

      tab.listenerSetter.add(rootScope)('stickers_deleted', (set) => {
        if(stickerSets[set.id]) {
          stickerSets[set.id].container.remove();
          delete stickerSets[set.id];
        }
      });

      tab.listenerSetter.add(rootScope)('stickers_order', ({type, order}) => {
        if(type !== 'stickers') {
          return;
        }

        order.forEach((id, idx) => {
          const row = stickerSets[id];
          if(!row) {
            return;
          }

          positionElementByIndex(row.container, stickersContent, idx);
        });
      });

      tab.listenerSetter.add(rootScope)('stickers_top', (id) => {
        const row = stickerSets[id];
        if(!row) {
          return;
        }

        positionElementByIndex(row.container, stickersContent, 0);
      });

      new Sortable({
        list: stickersContent,
        middleware: tab.middlewareHelper.get(),
        onSort: (idx, newIdx) => {
          const order = Array.from(stickersContent.children).map((el) => (el as HTMLElement).dataset.id);
          tab.managers.appStickersManager.reorderStickerSets(order);
        }
      });

      tab.scrollable.append(section.container);
    }

    promiseCollector.collect(Promise.all(promises));
  });

  return null;
};

export default StickersAndEmoji;
