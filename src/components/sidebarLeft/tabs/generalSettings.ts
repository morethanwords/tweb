/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { SliderSuperTab } from "../../slider"
import { generateSection } from "..";
import RangeSelector from "../../rangeSelector";
import Button from "../../button";
import CheckboxField from "../../checkboxField";
import RadioField from "../../radioField";
import appStateManager from "../../../lib/appManagers/appStateManager";
import rootScope from "../../../lib/rootScope";
import { isApple } from "../../../helpers/userAgent";
import Row from "../../row";
import AppBackgroundTab from "./background";
import { LangPackKey, _i18n } from "../../../lib/langPack";
import { attachClickEvent } from "../../../helpers/dom/clickEvent";
import appStickersManager from "../../../lib/appManagers/appStickersManager";
import assumeType from "../../../helpers/assumeType";
import { MessagesAllStickers, StickerSet } from "../../../layer";
import RichTextProcessor from "../../../lib/richtextprocessor";
import { wrapStickerSetThumb } from "../../wrappers";
import LazyLoadQueue from "../../lazyLoadQueue";
import PopupStickers from "../../popups/stickers";

export class RangeSettingSelector {
  public container: HTMLDivElement;
  private range: RangeSelector;

  public onChange: (value: number) => void;

  constructor(name: LangPackKey, step: number, initialValue: number, minValue: number, maxValue: number) {
    const BASE_CLASS = 'range-setting-selector';
    this.container = document.createElement('div');
    this.container.classList.add(BASE_CLASS);

    const details = document.createElement('div');
    details.classList.add(BASE_CLASS + '-details');

    const nameDiv = document.createElement('div');
    nameDiv.classList.add(BASE_CLASS + '-name');
    _i18n(nameDiv, name);

    const valueDiv = document.createElement('div');
    valueDiv.classList.add(BASE_CLASS + '-value');
    valueDiv.innerHTML = '' + initialValue;

    details.append(nameDiv, valueDiv);

    this.range = new RangeSelector(step, initialValue, minValue, maxValue);
    this.range.setListeners();
    this.range.setHandlers({
      onScrub: value => {
        if(this.onChange) {
          this.onChange(value);
        }

        //console.log('font size scrub:', value);
        valueDiv.innerText = '' + value;
      }
    });

    this.container.append(details, this.range.container);
  }
}

export default class AppGeneralSettingsTab extends SliderSuperTab {
  init() {
    this.container.classList.add('general-settings-container');
    this.setTitle('General');

    const section = generateSection.bind(null, this.scrollable);

    {
      const container = section('Settings');
      
      const range = new RangeSettingSelector('TextSize', 1, rootScope.settings.messagesTextSize, 12, 20);
      range.onChange = (value) => {
        appStateManager.setByKey('settings.messagesTextSize', value);
      };

      const chatBackgroundButton = Button('btn-primary btn-transparent', {icon: 'image', text: 'ChatBackground'});

      attachClickEvent(chatBackgroundButton, () => {
        new AppBackgroundTab(this.slider).open();
      });

      const animationsCheckboxField = new CheckboxField({
        text: 'EnableAnimations', 
        name: 'animations', 
        stateKey: 'settings.animationsEnabled',
        withRipple: true
      });
      
      container.append(range.container, chatBackgroundButton, animationsCheckboxField.label);
    }

    {
      const container = section('General.Keyboard');

      const form = document.createElement('form');

      const enterRow = new Row({
        radioField: new RadioField({
          langKey: 'General.SendShortcut.Enter', 
          name: 'send-shortcut', 
          value: 'enter', 
          stateKey: 'settings.sendShortcut'
        }),
        subtitleLangKey: 'General.SendShortcut.NewLine.ShiftEnter'
      });

      const ctrlEnterRow = new Row({
        radioField: new RadioField({
          name: 'send-shortcut',
          value: 'ctrlEnter', 
          stateKey: 'settings.sendShortcut'
        }),
        subtitleLangKey: 'General.SendShortcut.NewLine.Enter'
      });
      _i18n(ctrlEnterRow.radioField.main, 'General.SendShortcut.CtrlEnter', [isApple ? '⌘' : 'Ctrl']);
      
      form.append(enterRow.container, ctrlEnterRow.container);
      container.append(form);
    }

    {
      const container = section('AutoDownloadMedia');
      //container.classList.add('sidebar-left-section-disabled');

      const contactsCheckboxField = new CheckboxField({
        text: 'AutodownloadContacts', 
        name: 'contacts',
        stateKey: 'settings.autoDownload.contacts',
        withRipple: true
      });
      const privateCheckboxField = new CheckboxField({
        text: 'AutodownloadPrivateChats', 
        name: 'private',
        stateKey: 'settings.autoDownload.private',
        withRipple: true
      });
      const groupsCheckboxField = new CheckboxField({
        text: 'AutodownloadGroupChats', 
        name: 'groups',
        stateKey: 'settings.autoDownload.groups',
        withRipple: true
      });
      const channelsCheckboxField = new CheckboxField({
        text: 'AutodownloadChannels', 
        name: 'channels',
        stateKey: 'settings.autoDownload.channels',
        withRipple: true
      });

      container.append(contactsCheckboxField.label, privateCheckboxField.label, groupsCheckboxField.label, channelsCheckboxField.label);
    }

    {
      const container = section('General.AutoplayMedia');
      //container.classList.add('sidebar-left-section-disabled');

      const gifsCheckboxField = new CheckboxField({
        text: 'AutoplayGIF', 
        name: 'gifs', 
        stateKey: 'settings.autoPlay.gifs',
        withRipple: true
      });
      const videosCheckboxField = new CheckboxField({
        text: 'AutoplayVideo', 
        name: 'videos', 
        stateKey: 'settings.autoPlay.videos',
        withRipple: true
      });

      container.append(gifsCheckboxField.label, videosCheckboxField.label);
    }

    {
      const container = section('Emoji');

      const suggestCheckboxField = new CheckboxField({
        text: 'GeneralSettings.EmojiPrediction', 
        name: 'suggest-emoji', 
        stateKey: 'settings.emoji.suggest',
        withRipple: true
      });
      const bigCheckboxField = new CheckboxField({
        text: 'GeneralSettings.BigEmoji', 
        name: 'emoji-big', 
        stateKey: 'settings.emoji.big',
        withRipple: true
      });

      container.append(suggestCheckboxField.label, bigCheckboxField.label);
    }
    
    {
      const container = section('Telegram.InstalledStickerPacksController');

      const suggestCheckboxField = new CheckboxField({
        text: 'Stickers.SuggestStickers', 
        name: 'suggest', 
        stateKey: 'settings.stickers.suggest',
        withRipple: true
      });
      const loopCheckboxField = new CheckboxField({
        text: 'InstalledStickers.LoopAnimated', 
        name: 'loop', 
        stateKey: 'settings.stickers.loop',
        withRipple: true
      });

      const stickerSets: {[id: string]: Row} = {};

      const lazyLoadQueue = new LazyLoadQueue();
      const renderStickerSet = (stickerSet: StickerSet.stickerSet, method: 'append' | 'prepend' = 'append') => {
        const row = new Row({
          title: RichTextProcessor.wrapEmojiText(stickerSet.title),
          subtitleLangKey: 'Stickers',
          subtitleLangArgs: [stickerSet.count],
          havePadding: true,
          clickable: () => {
            new PopupStickers({id: stickerSet.id, access_hash: stickerSet.access_hash}).show();
          }
        });

        stickerSets[stickerSet.id] = row;

        const div = document.createElement('div');
        div.classList.add('row-media');

        wrapStickerSetThumb({
          set: stickerSet,
          container: div,
          group: 'GENERAL-SETTINGS',
          lazyLoadQueue,
          width: 48,
          height: 48,
          autoplay: true
        });

        row.container.append(div);

        container[method](row.container);
      };

      appStickersManager.getAllStickers().then(allStickers => {
        assumeType<MessagesAllStickers.messagesAllStickers>(allStickers);
        for(const stickerSet of allStickers.sets) {
          renderStickerSet(stickerSet);
        }
      });

      this.listenerSetter.add(rootScope)('stickers_installed', (e) => {
        const set: StickerSet.stickerSet = e;
        
        if(!stickerSets[set.id]) {
          renderStickerSet(set, 'prepend');
        }
      });
  
      this.listenerSetter.add(rootScope)('stickers_deleted', (e) => {
        const set: StickerSet.stickerSet = e;
        
        if(stickerSets[set.id]) {
          stickerSets[set.id].container.remove();
          delete stickerSets[set.id];
        }
      });

      container.append(suggestCheckboxField.label, loopCheckboxField.label);
    }
  }

  onOpen() {
    if(this.init) {
      this.init();
      this.init = null;
    }
  }
}
