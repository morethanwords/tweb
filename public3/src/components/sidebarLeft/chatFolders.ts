import { SliderTab } from "../slider";
import lottieLoader, { RLottiePlayer } from "../../lib/lottieLoader";
import apiManager from "../../lib/mtproto/mtprotoworker";
import appMessagesManager, { DialogFilter } from "../../lib/appManagers/appMessagesManager";
import { RichTextProcessor } from "../../lib/richtextprocessor";
import appPeersManager from "../../lib/appManagers/appPeersManager";
import { ripple } from "../misc";
import { $rootScope, cancelEvent } from "../../lib/utils";
import appSidebarLeft from "../../lib/appManagers/appSidebarLeft";

type DialogFilterSuggested = {
  _: 'dialogFilterSuggested',
  filter: DialogFilter,
  description: string
};

export default class AppChatFoldersTab implements SliderTab {
  public container: HTMLElement;
  public createFolderBtn: HTMLElement;
  private foldersContainer: HTMLElement;
  private suggestedContainer: HTMLElement;
  private stickerContainer: HTMLElement;
  private animation: RLottiePlayer;

  private filtersRendered: {[filterID: number]: HTMLElement} = {};

  private renderFolder(dialogFilter: DialogFilterSuggested | DialogFilter, container?: HTMLElement, div: HTMLElement = document.createElement('div')) {
    let filter: DialogFilter;
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
          appSidebarLeft.editFolderTab.open(appMessagesManager.filtersStorage.filters[filterID]);
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
        const folder = appMessagesManager.dialogsStorage.getFolder(filter.id);
        let chats = 0, channels = 0, groups = 0;
        for(const dialog of folder) {
          if(appPeersManager.isAnyGroup(dialog.peerID)) groups++;
          else if(appPeersManager.isBroadcast(dialog.peerID)) channels++;
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

    if(container) container.append(div);
    return div;
  }

  init() {
    this.container = document.querySelector('.chat-folders-container');
    this.stickerContainer = this.container.querySelector('.sticker-container');
    this.foldersContainer = this.container.querySelector('.folders-my');
    this.suggestedContainer = this.container.querySelector('.folders-suggested');
    this.createFolderBtn = this.container.querySelector('.btn-create-folder');

    this.createFolderBtn.addEventListener('click', () => {
      appSidebarLeft.editFolderTab.open();
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
      for(const filterID in filters) {
        const filter = filters[filterID];
        this.renderFolder(filter, this.foldersContainer);
      }
    });

    $rootScope.$on('filter_update', (e: CustomEvent) => {
      const filter: DialogFilter = e.detail;
      if(this.filtersRendered.hasOwnProperty(filter.id)) {
        this.renderFolder(filter, null, this.filtersRendered[filter.id]);
      } else {
        this.renderFolder(filter, this.foldersContainer);
      }

      this.getSuggestedFilters();
    });

    $rootScope.$on('filter_delete', (e: CustomEvent) => {
      const filter: DialogFilter = e.detail;
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

    this.getSuggestedFilters();
  }

  private getSuggestedFilters() {
    apiManager.invokeApi('messages.getSuggestedDialogFilters').then(suggestedFilters => {
      this.suggestedContainer.style.display = suggestedFilters.length ? '' : 'none';
      Array.from(this.suggestedContainer.children).slice(1).forEach(el => el.remove());

      (suggestedFilters as DialogFilterSuggested[]).forEach(filter => {
        const div = this.renderFolder(filter);
        const button = document.createElement('button');
        button.classList.add('btn-primary');
        button.innerText = 'Add';
        div.append(button);
        this.suggestedContainer.append(div);

        button.addEventListener('click', (e) => {
          cancelEvent(e);
          button.setAttribute('disabled', 'true');

          appMessagesManager.filtersStorage.createDialogFilter(filter.filter).then(bool => {
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
