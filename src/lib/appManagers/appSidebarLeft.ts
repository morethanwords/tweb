import { logger } from "../polyfill";
import { scrollable } from "../../components/misc";
import appMessagesManager from "./appMessagesManager";
import appDialogsManager from "./appDialogsManager";

class AppSidebarLeft {
  private sidebarEl = document.querySelector('.page-chats .chats-container') as HTMLDivElement;
  private searchInput = document.getElementById('global-search') as HTMLInputElement;
  private toolsBtn = this.sidebarEl.querySelector('.sidebar-tools-button') as HTMLButtonElement;
  private searchContainer = this.sidebarEl.querySelector('#search-container') as HTMLDivElement;

  private listsContainer: HTMLDivElement = null;
  private searchMessagesList: HTMLUListElement = null;

  private log = logger('SL');

  private peerID = 0;

  private searchPromise: Promise<void> = null;

  constructor() {
    this.listsContainer = scrollable(this.searchContainer);
    this.searchMessagesList = document.createElement('ul');

    this.searchContainer.append(this.listsContainer);

    appDialogsManager.setListClickListener(this.searchMessagesList);

    this.searchInput.addEventListener('focus', (e) => {
      this.toolsBtn.classList.remove('tgico-menu');
      this.toolsBtn.classList.add('tgico-back');
      this.searchContainer.classList.add('active');

      if(!this.searchInput.value) {
        this.searchMessagesList.innerHTML = '';
      }

      this.searchInput.addEventListener('blur', (e) => {
        if(!this.searchInput.value) {
          this.toolsBtn.classList.add('tgico-menu');
          this.toolsBtn.classList.remove('tgico-back');
          this.searchContainer.classList.remove('active');
        }

        this.peerID = 0;
      }, {once: true});
    });

    this.searchInput.addEventListener('input', (e) => {
      //console.log('messageInput input', this.innerText, serializeNodes(Array.from(messageInput.childNodes)));
      let value = this.searchInput.value;
      this.log('input', value);

      if(this.listsContainer.contains(this.searchMessagesList)) {
        this.listsContainer.removeChild(this.searchMessagesList)
      }

      if(!value.trim()) {
        return;
      }

      appMessagesManager.getSearch(this.peerID, value, null, 0, 20).then(res => {
        if(this.searchInput.value != value) {
          return;
        }

        this.log('input search result:', res);
        
        let {count, history} = res;

        this.searchMessagesList.innerHTML = '';

        history.forEach((msgID: number) => {
          let message = appMessagesManager.getMessage(msgID);
          let originalDialog = appMessagesManager.getDialogByPeerID(message.peerID)[0];

          if(!originalDialog) {
            this.log.warn('no original dialog by message:', msgID);
            return;
          }

          let {dialog, dom} = appDialogsManager.addDialog(originalDialog, this.searchMessagesList, false);
          appDialogsManager.setLastMessage(dialog, message, dom);
        });

        this.listsContainer.append(this.searchMessagesList);
      });
    });

    this.toolsBtn.addEventListener('click', () => {
      if(this.toolsBtn.classList.contains('tgico-back')) {
        this.searchInput.value = '';
        this.toolsBtn.classList.add('tgico-menu');
        this.toolsBtn.classList.remove('tgico-back');
        this.searchContainer.classList.remove('active');
      }
    });
  }

  public beginSearch(peerID?: number) {
    if(peerID) {
      this.peerID = peerID;
    }

    this.searchInput.focus();
  }
}

export default new AppSidebarLeft();
