/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import forEachReverse from '../../../helpers/array/forEachReverse';
import assumeType from '../../../helpers/assumeType';
import createContextMenu from '../../../helpers/dom/createContextMenu';
import positionElementByIndex from '../../../helpers/dom/positionElementByIndex';
import Sortable from '../../../helpers/dom/sortable';
import {joinDeepPath} from '../../../helpers/object/setDeepProperty';
import {StickerSet, MessagesAllStickers} from '../../../layer';
import {i18n, LangPackKey} from '../../../lib/langPack';
import wrapEmojiText from '../../../lib/richTextProcessor/wrapEmojiText';
import rootScope from '../../../lib/rootScope';
import CheckboxField from '../../checkboxField';
import LazyLoadQueue from '../../lazyLoadQueue';
import PopupElement from '../../popups';
import PopupStickers from '../../popups/stickers';
import Row, {CreateRowFromCheckboxField} from '../../row';
import SettingSection from '../../settingSection';
import SliderSuperTab from '../../sliderTab';
import wrapStickerSetThumb from '../../wrappers/stickerSetThumb';
import wrapStickerToRow from '../../wrappers/stickerToRow';
import AppQuickReactionTab from './quickReaction';

export default class AppStickersAndEmojiTab extends SliderSuperTab {
  public static getInitArgs() {
    return {
      allStickers: rootScope.managers.appStickersManager.getAllStickers(),
      quickReaction: rootScope.managers.appReactionsManager.getQuickReaction()
    };
  }

  public init(p: ReturnType<typeof AppStickersAndEmojiTab['getInitArgs']>) {
    this.container.classList.add('stickers-emoji-container');
    this.setTitle('StickersName');

    const promises: Promise<any>[] = [];

    {
      const section = new SettingSection({caption: 'LoopAnimatedStickersInfo'});

      const suggestStickersRow = new Row({
        icon: 'lamp',
        titleLangKey: 'Stickers.SuggestStickers',
        clickable: true,
        listenerSetter: this.listenerSetter,
        titleRightSecondary: true
      });

      const map: {[k in typeof rootScope.settings.stickers.suggest]: LangPackKey} = {
        all: 'SuggestStickersAll',
        installed: 'SuggestStickersInstalled',
        none: 'SuggestStickersNone'
      };

      const setStickersSuggestDescription = () => {
        suggestStickersRow.titleRight.replaceChildren(i18n(map[rootScope.settings.stickers.suggest]));
      };

      setStickersSuggestDescription();

      const setStickersSuggest = (value: typeof rootScope.settings.stickers.suggest) => {
        if(rootScope.settings.stickers.suggest === value) return;
        rootScope.settings.stickers.suggest = value;
        setStickersSuggestDescription();
        return this.managers.appStateManager.setByKey(joinDeepPath('settings', 'stickers', 'suggest'), value);
      };

      createContextMenu({
        buttons: [{
          icon: 'stickers_face',
          text: 'SuggestStickersAll',
          onClick: setStickersSuggest.bind(this, 'all')
        }, {
          icon: 'newprivate',
          text: 'SuggestStickersInstalled',
          onClick: setStickersSuggest.bind(this, 'installed')
        }, {
          icon: 'stop',
          text: 'SuggestStickersNone',
          onClick: setStickersSuggest.bind(this, 'none')
        }],
        listenTo: suggestStickersRow.container,
        middleware: this.middlewareHelper.get(),
        listenForClick: true
      });

      const reactionsRow = new Row({
        titleLangKey: 'DoubleTapSetting',
        havePadding: true,
        clickable: () => {
          this.slider.createTab(AppQuickReactionTab).open();
        },
        listenerSetter: this.listenerSetter
      });

      const renderQuickReaction = () => {
        p.quickReaction.then((reaction) => {
          if(reaction._ === 'availableReaction') {
            return reaction.static_icon;
          } else {
            return this.managers.appEmojiManager.getCustomEmojiDocument(reaction.document_id);
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

      this.listenerSetter.add(rootScope)('quick_reaction', () => {
        p = AppStickersAndEmojiTab.getInitArgs();
        renderQuickReaction();
      });

      const loopStickersRow = new Row({
        icon: 'flip',
        titleLangKey: 'InstalledStickers.LoopAnimated',
        checkboxField: new CheckboxField({
          name: 'loop',
          stateKey: joinDeepPath('settings', 'stickers', 'loop'),
          listenerSetter: this.listenerSetter,
          toggle: true
        }),
        listenerSetter: this.listenerSetter
      });

      section.content.append(
        reactionsRow.container,
        suggestStickersRow.container,
        loopStickersRow.container
      );

      this.scrollable.append(section.container);
    }

    {
      const section = new SettingSection({name: 'Emoji'});

      const suggestEmojiRow = new Row({
        icon: 'lamp',
        titleLangKey: 'GeneralSettings.EmojiPrediction',
        checkboxField: new CheckboxField({
          name: 'suggest-emoji',
          stateKey: joinDeepPath('settings', 'emoji', 'suggest'),
          listenerSetter: this.listenerSetter,
          toggle: true
        }),
        listenerSetter: this.listenerSetter
      });
      const bigEmojiRow = new Row({
        icon: 'smile',
        titleLangKey: 'GeneralSettings.BigEmoji',
        checkboxField: new CheckboxField({
          name: 'emoji-big',
          stateKey: joinDeepPath('settings', 'emoji', 'big'),
          listenerSetter: this.listenerSetter,
          toggle: true
        }),
        listenerSetter: this.listenerSetter
      });

      section.content.append(
        suggestEmojiRow.container,
        bigEmojiRow.container
      );

      this.scrollable.append(section.container);
    }

    {
      const section = new SettingSection({name: 'DynamicPackOrder', caption: 'DynamicPackOrderInfo'});

      const dynamicPackOrderRow = new Row({
        titleLangKey: 'DynamicPackOrder',
        icon: 'replace',
        checkboxField: new CheckboxField({
          name: 'dynamic-pack-order',
          stateKey: joinDeepPath('settings', 'stickers', 'dynamicPackOrder'),
          listenerSetter: this.listenerSetter,
          toggle: true
        }),
        listenerSetter: this.listenerSetter
      });

      section.content.append(
        dynamicPackOrderRow.container
      );

      this.scrollable.append(section.container);
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
            PopupElement.createPopup(PopupStickers, {id: stickerSet.id, access_hash: stickerSet.access_hash}).show();
          },
          listenerSetter: this.listenerSetter
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
          middleware: this.middlewareHelper.get()
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

      this.listenerSetter.add(rootScope)('stickers_installed', (set) => {
        if(!stickerSets[set.id]) {
          renderStickerSet(set, 'prepend');
        }
      });

      this.listenerSetter.add(rootScope)('stickers_deleted', (set) => {
        if(stickerSets[set.id]) {
          stickerSets[set.id].container.remove();
          delete stickerSets[set.id];
        }
      });

      this.listenerSetter.add(rootScope)('stickers_order', ({type, order}) => {
        if(type !== 'stickers') {
          return;
        }

        order.forEach((id, idx) => {
          const row = stickerSets[id];
          if(!row) {
            return;
          }

          positionElementByIndex(row.container, stickersContent, idx)
        });
      });

      this.listenerSetter.add(rootScope)('stickers_top', (id) => {
        const row = stickerSets[id];
        if(!row) {
          return;
        }

        positionElementByIndex(row.container, stickersContent, 0);
      });

      new Sortable({
        list: stickersContent,
        middleware: this.middlewareHelper.get(),
        onSort: (idx, newIdx) => {
          const order = Array.from(stickersContent.children).map((el) => (el as HTMLElement).dataset.id);
          this.managers.appStickersManager.reorderStickerSets(order);
        }
      });

      this.scrollable.append(section.container);
    }

    return Promise.all(promises);
  }
}
