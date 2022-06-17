/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { SliderSuperTab } from "../../slider";
import lottieLoader, { LottieLoader } from "../../../lib/rlottie/lottieLoader";
import { toast } from "../../toast";
import type { MyDialogFilter } from "../../../lib/storages/filters";
import type { DialogFilterSuggested, DialogFilter } from "../../../layer";
import type _rootScope from "../../../lib/rootScope";
import Button from "../../button";
import rootScope from "../../../lib/rootScope";
import AppEditFolderTab from "./editFolder";
import Row from "../../row";
import { SettingSection } from "..";
import { i18n, i18n_, LangPackKey, join } from "../../../lib/langPack";
import cancelEvent from "../../../helpers/dom/cancelEvent";
import { attachClickEvent } from "../../../helpers/dom/clickEvent";
import positionElementByIndex from "../../../helpers/dom/positionElementByIndex";
import RLottiePlayer from "../../../lib/rlottie/rlottiePlayer";
import wrapEmojiText from "../../../lib/richTextProcessor/wrapEmojiText";

export default class AppChatFoldersTab extends SliderSuperTab {
  private createFolderBtn: HTMLElement;
  private foldersSection: SettingSection;
  private suggestedSection: SettingSection;
  private stickerContainer: HTMLElement;
  private animation: RLottiePlayer;

  private filtersRendered: {[filterId: number]: Row} = {};
  private loadAnimationPromise: ReturnType<LottieLoader['waitForFirstFrame']>;

  private async renderFolder(dialogFilter: DialogFilterSuggested | MyDialogFilter, container?: HTMLElement, row?: Row) {
    let filter: MyDialogFilter;
    let description = '';
    let d: HTMLElement[] = [];
    if(dialogFilter._ === 'dialogFilterSuggested') {
      filter = dialogFilter.filter as MyDialogFilter;
      description = dialogFilter.description;
    } else {
      filter = dialogFilter;

      let enabledFilters = Object.keys(filter.pFlags).length;
      /* (['include_peers', 'exclude_peers'] as ['include_peers', 'exclude_peers']).forEach((key) => {
        enabledFilters += +!!filter[key].length;
      }); */
      
      if(enabledFilters === 1) {
        const pFlags = filter.pFlags;
        let k: LangPackKey;
        if(pFlags.contacts) k = 'FilterAllContacts';
        else if(pFlags.non_contacts) k = 'FilterAllNonContacts';
        else if(pFlags.groups) k = 'FilterAllGroups';
        else if(pFlags.broadcasts) k = 'FilterAllChannels';
        else if(pFlags.bots) k = 'FilterAllBots';

        if(k) {
          d.push(i18n(k));
        }
      }
      
      if(!d.length) {
        const folder = await this.managers.dialogsStorage.getFolderDialogs(filter.id);
        let chats = 0, channels = 0, groups = 0;
        await Promise.all(folder.map(async(dialog) => {
          if(await this.managers.appPeersManager.isAnyGroup(dialog.peerId)) groups++;
          else if(await this.managers.appPeersManager.isBroadcast(dialog.peerId)) channels++;
          else chats++;
        }));

        if(chats) d.push(i18n('Chats', [chats]));
        if(channels) d.push(i18n('Channels', [channels]));
        if(groups) d.push(i18n('Groups', [groups]));
      }
    }

    let div: HTMLElement;
    if(!row) {
      row = new Row({
        title: wrapEmojiText(filter.title),
        subtitle: description,
        clickable: true
      });

      if(d.length) {
        join(d).forEach((el) => {
          row.subtitle.append(el);
        });
      }
  
      if(dialogFilter._ === 'dialogFilter') {
        const filterId = filter.id;
        if(!this.filtersRendered.hasOwnProperty(filter.id)) {
          attachClickEvent(row.container, async() => {
            this.slider.createTab(AppEditFolderTab).open(await this.managers.filtersStorage.getFilter(filterId));
          }, {listenerSetter: this.listenerSetter});
        }

        this.filtersRendered[filter.id] = row;
      }
    } else {
      row.subtitle.textContent = '';
      join(d).forEach((el) => {
        row.subtitle.append(el);
      });
    }

    div = row.container;

    if((filter as MyDialogFilter).hasOwnProperty('orderIndex')) {
       // ! header will be at 0 index
      positionElementByIndex(div, div.parentElement || container, (filter as MyDialogFilter).orderIndex);
    } else if(container) container.append(div);
    
    return div;
  }

  protected async init() {
    this.container.classList.add('chat-folders-container');
    this.setTitle('ChatList.Filter.List.Title');

    this.scrollable.container.classList.add('chat-folders');

    this.stickerContainer = document.createElement('div');
    this.stickerContainer.classList.add('sticker-container');
    
    const caption = document.createElement('div');
    caption.classList.add('caption');
    i18n_({element: caption, key: 'ChatList.Filter.Header'});
    
    this.createFolderBtn = Button('btn-primary btn-color-primary btn-control tgico', {
      text: 'ChatList.Filter.NewTitle',
      icon: 'add'
    });

    this.foldersSection = new SettingSection({
      name: 'Filters'
    });
    this.foldersSection.container.style.display = 'none';

    this.suggestedSection = new SettingSection({
      name: 'FilterRecommended'
    });
    this.suggestedSection.container.style.display = 'none';

    this.scrollable.append(this.stickerContainer, caption, this.createFolderBtn, this.foldersSection.container, this.suggestedSection.container);

    attachClickEvent(this.createFolderBtn, async() => {
      const appConfig = await this.managers.apiManager.getAppConfig();
      if(Object.keys(this.filtersRendered).length >= (rootScope.premium ? appConfig.dialog_filters_limit_premium : appConfig.dialog_filters_limit_default)) {
        toast('Sorry, you can\'t create more folders.');
      } else {
        this.slider.createTab(AppEditFolderTab).open();
      }
    }, {listenerSetter: this.listenerSetter});

    const onFiltersContainerUpdate = () => {
      this.foldersSection.container.style.display = Object.keys(this.filtersRendered).length ? '' : 'none';
    };

    this.managers.filtersStorage.getDialogFilters().then(async(filters) => {
      for(const filter of filters) {
        await this.renderFolder(filter, this.foldersSection.content);
      }

      onFiltersContainerUpdate();
    });

    this.listenerSetter.add(rootScope)('filter_update', async(filter) => {
      if(this.filtersRendered.hasOwnProperty(filter.id)) {
        await this.renderFolder(filter, null, this.filtersRendered[filter.id]);
      } else {
        await this.renderFolder(filter, this.foldersSection.content);
      }

      onFiltersContainerUpdate();

      this.getSuggestedFilters();
    });

    this.listenerSetter.add(rootScope)('filter_delete', (filter) => {
      if(this.filtersRendered.hasOwnProperty(filter.id)) {
        /* for(const suggested of this.suggestedFilters) {
          if(deepEqual(suggested.filter, filter)) {
            
          }
        } */
        this.getSuggestedFilters();

        this.filtersRendered[filter.id].container.remove();
        delete this.filtersRendered[filter.id];
      }

      onFiltersContainerUpdate();
    });

    this.listenerSetter.add(rootScope)('filter_order', (order) => {
      order.forEach((filterId, idx) => {
        const container = this.filtersRendered[filterId].container;
        positionElementByIndex(container, container.parentElement, idx + 1); // ! + 1 due to header 
      });
    });

    this.loadAnimationPromise = lottieLoader.loadAnimationAsAsset({
      container: this.stickerContainer,
      loop: false,
      autoplay: false,
      width: 86,
      height: 86
    }, 'Folders_1').then((player) => {
      this.animation = player;

      return lottieLoader.waitForFirstFrame(player);
    });

    this.getSuggestedFilters()

    /* return Promise.all([
      this.loadAnimationPromise
    ]); */
    return this.loadAnimationPromise;
  }

  onOpenAfterTimeout() {
    this.loadAnimationPromise.then(() => {
      this.animation.autoplay = true;
      this.animation.play();
    });
  }

  private getSuggestedFilters() {
    return this.managers.filtersStorage.getSuggestedDialogsFilters().then(async(suggestedFilters) => {
      this.suggestedSection.container.style.display = suggestedFilters.length ? '' : 'none';
      Array.from(this.suggestedSection.content.children).slice(1).forEach((el) => el.remove());

      for(const filter of suggestedFilters) {
        const div = await this.renderFolder(filter);
        const button = Button('btn-primary btn-color-primary', {text: 'Add'});
        div.append(button);
        this.suggestedSection.content.append(div);

        attachClickEvent(button, (e) => {
          cancelEvent(e);

          if(Object.keys(this.filtersRendered).length >= 10) {
            toast('Sorry, you can\'t create more folders.');
            return;
          }

          button.setAttribute('disabled', 'true');

          const f = filter.filter as MyDialogFilter;
          f.includePeerIds = [];
          f.excludePeerIds = [];
          f.pinnedPeerIds = [];

          this.managers.filtersStorage.createDialogFilter(f, true).then((bool) => {
            if(bool) {
              div.remove();
            }
          }).finally(() => {
            button.removeAttribute('disabled');
          });
        }, {listenerSetter: this.listenerSetter});
      }
    });
  }
}
