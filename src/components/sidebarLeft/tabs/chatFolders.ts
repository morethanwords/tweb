import { SliderTab } from "../../slider";
import lottieLoader, { RLottiePlayer } from "../../../lib/lottieLoader";
import { RichTextProcessor } from "../../../lib/richtextprocessor";
import { cancelEvent, positionElementByIndex } from "../../../helpers/dom";
import { ripple } from "../../ripple";
import { toast } from "../../toast";
import type { ApiManagerProxy } from "../../../lib/mtproto/mtprotoworker";
import type { AppMessagesManager } from "../../../lib/appManagers/appMessagesManager";
import type { MyDialogFilter } from "../../../lib/storages/filters";
import type { AppPeersManager } from "../../../lib/appManagers/appPeersManager";
import type { AppSidebarLeft } from "..";
import type { DialogFilterSuggested, DialogFilter } from "../../../layer";
import type _rootScope from "../../../lib/rootScope";

export default class AppChatFoldersTab implements SliderTab {
  public container: HTMLElement;
  public createFolderBtn: HTMLElement;
  private foldersContainer: HTMLElement;
  private suggestedContainer: HTMLElement;
  private stickerContainer: HTMLElement;
  private animation: RLottiePlayer;

  private filtersRendered: {[filterID: number]: HTMLElement} = {};

  constructor(private appMessagesManager: AppMessagesManager, private appPeersManager: AppPeersManager, private appSidebarLeft: AppSidebarLeft, private apiManager: ApiManagerProxy, private rootScope: typeof _rootScope) {

  }

  private renderFolder(dialogFilter: DialogFilterSuggested | DialogFilter | MyDialogFilter, container?: HTMLElement, div: HTMLElement = document.createElement('div')) {
    let filter: DialogFilter | MyDialogFilter;
    let description = '';
    let d: string[] = [];
    if(dialogFilter._ == 'dialogFilterSuggested') {
      filter = dialogFilter.filter;
      description = dialogFilter.description;
    } else {
      filter = dialogFilter;
      description = '';

      const filterID = filter.id;
      if(!this.filtersRendered.hasOwnProperty(filter.id)) {
        div.addEventListener('click', () => {
          this.appSidebarLeft.editFolderTab.open(this.appMessagesManager.filtersStorage.filters[filterID]);
        });
      }

      this.filtersRendered[filter.id] = div;

      let enabledFilters = Object.keys(filter.pFlags).length;
      /* (['include_peers', 'exclude_peers'] as ['include_peers', 'exclude_peers']).forEach(key => {
        enabledFilters += +!!filter[key].length;
      }); */
      
      if(enabledFilters == 1) {
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
        const folder = this.appMessagesManager.dialogsStorage.getFolder(filter.id);
        let chats = 0, channels = 0, groups = 0;
        for(const dialog of folder) {
          if(this.appPeersManager.isAnyGroup(dialog.peerID)) groups++;
          else if(this.appPeersManager.isBroadcast(dialog.peerID)) channels++;
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

  init() {
    this.container = document.querySelector('.chat-folders-container');
    this.stickerContainer = this.container.querySelector('.sticker-container');
    this.foldersContainer = this.container.querySelector('.folders-my');
    this.suggestedContainer = this.container.querySelector('.folders-suggested');
    this.createFolderBtn = this.container.querySelector('.btn-create-folder');

    this.createFolderBtn.addEventListener('click', () => {
      if(Object.keys(this.filtersRendered).length >= 10) {
        toast('Sorry, you can\'t create more folders.');
      } else {
        this.appSidebarLeft.editFolderTab.open();
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

    this.appMessagesManager.filtersStorage.getDialogFilters().then(filters => {
      for(const filter of filters) {
        this.renderFolder(filter, this.foldersContainer);
      }
    });

    this.rootScope.on('filter_update', (e) => {
      const filter = e.detail;
      if(this.filtersRendered.hasOwnProperty(filter.id)) {
        this.renderFolder(filter, null, this.filtersRendered[filter.id]);
      } else {
        this.renderFolder(filter, this.foldersContainer);
      }

      this.getSuggestedFilters();
    });

    this.rootScope.on('filter_delete', (e) => {
      const filter = e.detail;
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

    this.rootScope.on('filter_order', (e) => {
      const order = e.detail;
      order.forEach((filterID, idx) => {
        const div = this.filtersRendered[filterID];
        positionElementByIndex(div, div.parentElement, idx + 1); // ! + 1 due to header 
      });
    });

    this.getSuggestedFilters();
  }

  private getSuggestedFilters() {
    this.apiManager.invokeApi('messages.getSuggestedDialogFilters').then(suggestedFilters => {
      this.suggestedContainer.style.display = suggestedFilters.length ? '' : 'none';
      Array.from(this.suggestedContainer.children).slice(1).forEach(el => el.remove());

      suggestedFilters.forEach(filter => {
        const div = this.renderFolder(filter);
        const button = document.createElement('button');
        button.classList.add('btn-primary');
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

          this.appMessagesManager.filtersStorage.createDialogFilter(filter.filter as any).then(bool => {
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
    if(this.init) {
      this.init();
      this.init = null;
    } else {
      if(this.animation) {
        this.animation.restart();
      }
    }
  }
}
