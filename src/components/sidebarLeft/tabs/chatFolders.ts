import { SliderSuperTab } from "../../slider";
import lottieLoader, { RLottiePlayer } from "../../../lib/lottieLoader";
import { RichTextProcessor } from "../../../lib/richtextprocessor";
import { attachClickEvent, cancelEvent, positionElementByIndex } from "../../../helpers/dom";
import { toast } from "../../toast";
import type { MyDialogFilter } from "../../../lib/storages/filters";
import type { DialogFilterSuggested, DialogFilter } from "../../../layer";
import type _rootScope from "../../../lib/rootScope";
import type { BroadcastEvents } from "../../../lib/rootScope";
import Button from "../../button";
import appMessagesManager from "../../../lib/appManagers/appMessagesManager";
import appPeersManager from "../../../lib/appManagers/appPeersManager";
import apiManager from "../../../lib/mtproto/mtprotoworker";
import rootScope from "../../../lib/rootScope";
import AppEditFolderTab from "./editFolder";
import Row from "../../row";
import { SettingSection } from "..";
import { i18n, i18n_, LangPackKey } from "../../../lib/langPack";

export default class AppChatFoldersTab extends SliderSuperTab {
  private createFolderBtn: HTMLElement;
  private foldersSection: SettingSection;
  private suggestedSection: SettingSection;
  private stickerContainer: HTMLElement;
  private animation: RLottiePlayer;

  private filtersRendered: {[filterId: number]: HTMLElement} = {};

  private renderFolder(dialogFilter: DialogFilterSuggested | DialogFilter | MyDialogFilter, container?: HTMLElement, div?: HTMLElement) {
    let filter: DialogFilter | MyDialogFilter;
    let description = '';
    let d: HTMLElement[] = [];
    if(dialogFilter._ === 'dialogFilterSuggested') {
      filter = dialogFilter.filter;
      description = dialogFilter.description;
    } else {
      filter = dialogFilter;

      let enabledFilters = Object.keys(filter.pFlags).length;
      /* (['include_peers', 'exclude_peers'] as ['include_peers', 'exclude_peers']).forEach(key => {
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
        else if(pFlags.exclude_muted) k = 'FilterAllUnmuted';
        else if(pFlags.exclude_read) k = 'FilterAllUnread';
        else if(pFlags.exclude_archived) k = 'FilterAllUnarchived';
        d.push(i18n(k));
      } else {
        const folder = appMessagesManager.dialogsStorage.getFolder(filter.id);
        let chats = 0, channels = 0, groups = 0;
        for(const dialog of folder) {
          if(appPeersManager.isAnyGroup(dialog.peerId)) groups++;
          else if(appPeersManager.isBroadcast(dialog.peerId)) channels++;
          else chats++;
        }

        if(chats) d.push(i18n('Chats', [chats]));
        if(channels) d.push(i18n('Channels', [channels]));
        if(groups) d.push(i18n('Groups', [groups]));
      }
    }

    if(!div) {
      const row = new Row({
        title: RichTextProcessor.wrapEmojiText(filter.title),
        subtitle: description,
        clickable: true
      });

      if(d.length) {
        let arr: HTMLElement[] = d.slice(0, 1);
        for(let i = 1; i < d.length; ++i) {
          const isLast = (d.length - 1) === i;
          const delimiterKey: LangPackKey = isLast ? 'WordDelimiterLast' : 'WordDelimiter';
          arr.push(i18n(delimiterKey));
          arr.push(d[i]);
        }

        arr.forEach(el => {
          row.subtitle.append(el);
        });
      }
  
      div = row.container;

      if(dialogFilter._ === 'dialogFilter') {
        const filterId = filter.id;
        if(!this.filtersRendered.hasOwnProperty(filter.id)) {
          attachClickEvent(div, () => {
            new AppEditFolderTab(this.slider).open(appMessagesManager.filtersStorage.filters[filterId]);
          }, {listenerSetter: this.listenerSetter});
        }

        this.filtersRendered[filter.id] = div;
      }
    }

    if((filter as MyDialogFilter).hasOwnProperty('orderIndex')) {
       // ! header will be at 0 index
      positionElementByIndex(div, div.parentElement || container, (filter as MyDialogFilter).orderIndex);
    } else if(container) container.append(div);
    
    return div;
  }

  protected init() {
    this.container.classList.add('chat-folders-container');
    this.setTitle('ChatList.Filter.List.Title');

    this.scrollable.container.classList.add('chat-folders');

    this.stickerContainer = document.createElement('div');
    this.stickerContainer.classList.add('sticker-container');
    
    const caption = document.createElement('div');
    caption.classList.add('caption');
    i18n_({element: caption, key: 'ChatList.Filter.Header'});
    
    this.createFolderBtn = Button('btn-primary btn-color-primary btn-create-folder', {
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

    attachClickEvent(this.createFolderBtn, () => {
      if(Object.keys(this.filtersRendered).length >= 10) {
        toast('Sorry, you can\'t create more folders.');
      } else {
        new AppEditFolderTab(this.slider).open();
      }
    }, {listenerSetter: this.listenerSetter});

    lottieLoader.loadAnimationFromURL({
      container: this.stickerContainer,
      loop: false,
      autoplay: true,
      width: 86,
      height: 86
    }, 'assets/img/Folders_1.tgs').then(player => {
      this.animation = player;
    });

    const onFiltersContainerUpdate = () => {
      this.foldersSection.container.style.display = Object.keys(this.filtersRendered).length ? '' : 'none';
    };

    appMessagesManager.filtersStorage.getDialogFilters().then(filters => {
      for(const filter of filters) {
        this.renderFolder(filter, this.foldersSection.content);
      }

      onFiltersContainerUpdate();
    });

    this.listenerSetter.add(rootScope, 'filter_update', (e) => {
      const filter = e;
      if(this.filtersRendered.hasOwnProperty(filter.id)) {
        this.renderFolder(filter, null, this.filtersRendered[filter.id]);
      } else {
        this.renderFolder(filter, this.foldersSection.content);
      }

      onFiltersContainerUpdate();

      this.getSuggestedFilters();
    });

    this.listenerSetter.add(rootScope, 'filter_delete', (e) => {
      const filter = e;
      if(this.filtersRendered.hasOwnProperty(filter.id)) {
        /* for(const suggested of this.suggestedFilters) {
          if(deepEqual(suggested.filter, filter)) {
            
          }
        } */
        this.getSuggestedFilters();

        this.filtersRendered[filter.id].remove();
        delete this.filtersRendered[filter.id]
      }

      onFiltersContainerUpdate();
    });

    this.listenerSetter.add(rootScope, 'filter_order', (e: BroadcastEvents['filter_order']) => {
      const order = e;
      order.forEach((filterId, idx) => {
        const div = this.filtersRendered[filterId];
        positionElementByIndex(div, div.parentElement, idx + 1); // ! + 1 due to header 
      });
    });

    this.getSuggestedFilters();
  }

  private getSuggestedFilters() {
    apiManager.invokeApi('messages.getSuggestedDialogFilters').then(suggestedFilters => {
      this.suggestedSection.container.style.display = suggestedFilters.length ? '' : 'none';
      Array.from(this.suggestedSection.content.children).slice(1).forEach(el => el.remove());

      suggestedFilters.forEach(filter => {
        const div = this.renderFolder(filter);
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

          appMessagesManager.filtersStorage.createDialogFilter(filter.filter as any).then(bool => {
            if(bool) {
              div.remove();
            }
          }).finally(() => {
            button.removeAttribute('disabled');
          });
        }, {listenerSetter: this.listenerSetter});
      });
    });
  }

  onOpen() {
    if(this.animation) {
      this.animation.restart();
    }
  }
}
