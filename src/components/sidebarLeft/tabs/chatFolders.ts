import { SliderSuperTab } from "../../slider";
import lottieLoader, { RLottiePlayer } from "../../../lib/lottieLoader";
import { RichTextProcessor } from "../../../lib/richtextprocessor";
import { cancelEvent, positionElementByIndex } from "../../../helpers/dom";
import { ripple } from "../../ripple";
import { toast } from "../../toast";
import type { MyDialogFilter } from "../../../lib/storages/filters";
import type { DialogFilterSuggested, DialogFilter } from "../../../layer";
import type _rootScope from "../../../lib/rootScope";
import Button from "../../button";
import appMessagesManager from "../../../lib/appManagers/appMessagesManager";
import appPeersManager from "../../../lib/appManagers/appPeersManager";
import apiManager from "../../../lib/mtproto/mtprotoworker";
import rootScope from "../../../lib/rootScope";
import AppEditFolderTab from "./editFolder";

export default class AppChatFoldersTab extends SliderSuperTab {
  public createFolderBtn: HTMLElement;
  private foldersContainer: HTMLElement;
  private suggestedContainer: HTMLElement;
  private stickerContainer: HTMLElement;
  private animation: RLottiePlayer;

  private filtersRendered: {[filterId: number]: HTMLElement} = {};

  private renderFolder(dialogFilter: DialogFilterSuggested | DialogFilter | MyDialogFilter, container?: HTMLElement, div: HTMLElement = document.createElement('div')) {
    let filter: DialogFilter | MyDialogFilter;
    let description = '';
    let d: string[] = [];
    if(dialogFilter._ === 'dialogFilterSuggested') {
      filter = dialogFilter.filter;
      description = dialogFilter.description;
    } else {
      filter = dialogFilter;
      description = '';

      const filterId = filter.id;
      if(!this.filtersRendered.hasOwnProperty(filter.id)) {
        div.addEventListener('click', () => {
          new AppEditFolderTab(this.slider).open(appMessagesManager.filtersStorage.filters[filterId]);
        });
      }

      this.filtersRendered[filter.id] = div;

      let enabledFilters = Object.keys(filter.pFlags).length;
      /* (['include_peers', 'exclude_peers'] as ['include_peers', 'exclude_peers']).forEach(key => {
        enabledFilters += +!!filter[key].length;
      }); */
      
      if(enabledFilters === 1) {
        description = 'All ';

        const pFlags = filter.pFlags;
        if(pFlags.contacts) description += 'Contacts';
        else if(pFlags.non_contacts) description += 'Non-Contacts';
        else if(pFlags.groups) description += 'Groups';
        else if(pFlags.broadcasts) description += 'Channels';
        else if(pFlags.bots) description += 'Bots';
        else if(pFlags.exclude_muted) description += 'Unmuted';
        else if(pFlags.exclude_read) description += 'Unread';
        else if(pFlags.exclude_archived) description += 'Unarchived';
        d.push(description);
      } else {
        const folder = appMessagesManager.dialogsStorage.getFolder(filter.id);
        let chats = 0, channels = 0, groups = 0;
        for(const dialog of folder) {
          if(appPeersManager.isAnyGroup(dialog.peerId)) groups++;
          else if(appPeersManager.isBroadcast(dialog.peerId)) channels++;
          else chats++;
        }

        if(chats) d.push(chats + ' chats');
        if(channels) d.push(channels + ' channels');
        if(groups) d.push(groups + ' groups');
      }
    }

    div.classList.add('category', 'rp-square');
    div.innerHTML = `
      <div>
        <p>${RichTextProcessor.wrapEmojiText(filter.title)}</p>
        <p>${d.length ? d.join(', ') : description}</p>
      </div>
    `;
    ripple(div);

    if((filter as MyDialogFilter).hasOwnProperty('orderIndex')) {
       // ! header will be at 0 index
      positionElementByIndex(div, div.parentElement || container, (filter as MyDialogFilter).orderIndex);
    } else if(container) container.append(div);
    
    return div;
  }

  protected init() {
    this.container.classList.add('chat-folders-container');
    this.title.innerText = 'Chat Folders';

    this.scrollable.container.classList.add('chat-folders');

    this.stickerContainer = document.createElement('div');
    this.stickerContainer.classList.add('sticker-container');
    
    const caption = document.createElement('div');
    caption.classList.add('caption');
    caption.innerHTML = `Create folders for different groups of chats<br>and quickly switch between them.`;
    
    this.createFolderBtn = Button('btn-primary btn-color-primary btn-create-folder', {
      text: 'Create Folder',
      icon: 'add'
    });

    this.foldersContainer = document.createElement('div');
    this.foldersContainer.classList.add('folders-my');

    const foldersH2 = document.createElement('div');
    foldersH2.classList.add('sidebar-left-h2');
    foldersH2.innerText = 'Folders';

    this.foldersContainer.append(foldersH2);

    this.suggestedContainer = document.createElement('div');
    this.suggestedContainer.classList.add('folders-suggested');
    this.suggestedContainer.style.display = 'none';

    const suggestedH2 = document.createElement('div');
    suggestedH2.classList.add('sidebar-left-h2');
    suggestedH2.innerText = 'Recommended folders';

    this.suggestedContainer.append(suggestedH2);

    this.scrollable.append(this.stickerContainer, caption, this.createFolderBtn, document.createElement('hr'), this.foldersContainer, document.createElement('hr'), this.suggestedContainer);

    this.createFolderBtn.addEventListener('click', () => {
      if(Object.keys(this.filtersRendered).length >= 10) {
        toast('Sorry, you can\'t create more folders.');
      } else {
        new AppEditFolderTab(this.slider).open();
      }
    });

    lottieLoader.loadAnimationFromURL({
      container: this.stickerContainer,
      loop: false,
      autoplay: true,
      width: 86,
      height: 86
    }, 'assets/img/Folders_1.tgs').then(player => {
      this.animation = player;
    });

    appMessagesManager.filtersStorage.getDialogFilters().then(filters => {
      for(const filter of filters) {
        this.renderFolder(filter, this.foldersContainer);
      }
    });

    rootScope.on('filter_update', (e) => {
      const filter = e;
      if(this.filtersRendered.hasOwnProperty(filter.id)) {
        this.renderFolder(filter, null, this.filtersRendered[filter.id]);
      } else {
        this.renderFolder(filter, this.foldersContainer);
      }

      this.getSuggestedFilters();
    });

    rootScope.on('filter_delete', (e) => {
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
    });

    rootScope.on('filter_order', (e) => {
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
      this.suggestedContainer.style.display = suggestedFilters.length ? '' : 'none';
      Array.from(this.suggestedContainer.children).slice(1).forEach(el => el.remove());

      suggestedFilters.forEach(filter => {
        const div = this.renderFolder(filter);
        const button = document.createElement('button');
        button.classList.add('btn-primary', 'btn-color-primary');
        button.innerText = 'Add';
        div.append(button);
        this.suggestedContainer.append(div);

        button.addEventListener('click', (e) => {
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
        });
      });
    });
  }

  onOpen() {
    if(this.animation) {
      this.animation.restart();
    }
  }
}
