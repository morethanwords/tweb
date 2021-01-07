import { SliderTab, SliderSuperTab } from "../../slider";
import AppSelectPeers from "../../appSelectPeers";
import appSidebarLeft, { AppSidebarLeft } from "..";
import appDialogsManager from "../../../lib/appManagers/appDialogsManager";
import appPeersManager from "../../../lib/appManagers/appPeersManager";
import appUsersManager from "../../../lib/appManagers/appUsersManager";
import { MyDialogFilter as DialogFilter } from "../../../lib/storages/filters";
import rootScope from "../../../lib/rootScope";
import { copy } from "../../../helpers/object";
import ButtonIcon from "../../buttonIcon";
import { FocusDirection } from "../../../helpers/fastSmoothScroll";
import { fastRaf } from "../../../helpers/schedulers";

export default class AppIncludedChatsTab extends SliderSuperTab {
  private confirmBtn: HTMLElement;

  private selector: AppSelectPeers;
  private type: 'included' | 'excluded';
  private filter: DialogFilter;
  private originalFilter: DialogFilter;

  constructor(appSidebarLeft: AppSidebarLeft) {
    super(appSidebarLeft);
  }

  init() {
    this.content.remove();
    this.container.classList.add('included-chatlist-container');
    this.confirmBtn = ButtonIcon('check1 btn-confirm', {noRipple: true});
    this.confirmBtn.style.display = 'none';

    this.header.append(this.confirmBtn);

    this.confirmBtn.addEventListener('click', () => {
      const selected = this.selector.getSelected();

      //this.filter.pFlags = {};

      if(this.type == 'included') {
        for(const key in this.filter.pFlags) {
          if(key.indexOf('exclude_') === 0) {
            continue;
          }

          // @ts-ignore
          delete this.filter.pFlags[key];
        }
      } else {
        for(const key in this.filter.pFlags) {
          if(key.indexOf('exclude_') !== 0) {
            continue;
          }

          // @ts-ignore
          delete this.filter.pFlags[key];
        }
      }

      const peers: number[] = [];
      for(const key of selected) {
        if(typeof(key) === 'number') {
          peers.push(key);
        } else {
          // @ts-ignore
          this.filter.pFlags[key] = true;
        }
      }

      if(this.type == 'included') {
        this.filter.pinned_peers = this.filter.pinned_peers.filter(peerId => {
          return peers.includes(peerId); // * because I have pinned peer in include_peers too
          /* const index = peers.indexOf(peerId);
          if(index !== -1) {
            peers.splice(index, 1);
            return true;
          } else {
            return false;
          } */
        });
      } else {
        this.filter.pinned_peers = this.filter.pinned_peers.filter(peerId => {
          return !peers.includes(peerId);
        });
      }

      const other = this.type == 'included' ? 'exclude_peers' : 'include_peers';
      this.filter[other] = this.filter[other].filter(peerId => {
        return !peers.includes(peerId);
      });
      
      this.filter[this.type == 'included' ? 'include_peers' : 'exclude_peers'] = peers;
      //this.filter.pinned_peers = this.filter.pinned_peers.filter(peerId => this.filter.include_peers.includes(peerId));

      appSidebarLeft.editFolderTab.setFilter(this.filter, false);
      this.close();
    });
  }

  checkbox(selected?: boolean) {
    return `<div class="checkbox"><label class="checkbox-field"><input type="checkbox" ${selected ? 'checked' : ''}><span></span></label></div>`;
  }

  renderResults = async(peerIds: number[]) => {
    //const other = this.type == 'included' ? this.filter.exclude_peers : this.filter.include_peers;

    await appUsersManager.getContacts();
    peerIds.forEach(peerId => {
      //if(other.includes(peerId)) return;

      const {dom} = appDialogsManager.addDialogNew({
        dialog: peerId,
        container: this.selector.scrollable,
        drawStatus: false,
        rippleEnabled: false,
        avatarSize: 46
      });

      const selected = this.selector.selected.has(peerId);
      dom.containerEl.insertAdjacentHTML('beforeend', this.checkbox(selected));
      if(selected) dom.listEl.classList.add('active');

      let subtitle = '';

      if(peerId > 0) {
        if(peerId == rootScope.myId) {
          subtitle = 'Chat with yourself';
        } else if(appUsersManager.isBot(peerId)) {
          subtitle = 'Bot';
        } else {
          subtitle = appUsersManager.contactsList.has(peerId) ? 'Contact' : 'Non-Contact';
        }
      } else {
        subtitle = appPeersManager.isBroadcast(peerId) ? 'Channel' : 'Group';
      }

      dom.lastMessageSpan.innerHTML = subtitle;
    });
  };

  onOpen() {
    if(this.init) {
      this.init();
      this.init = null;
    }

    this.confirmBtn.style.display = this.type == 'excluded' ? '' : 'none';
    this.title.innerText = this.type == 'included' ? 'Included Chats' : 'Excluded Chats';

    const filter = this.filter;

    const fragment = document.createDocumentFragment();
    const dd = document.createElement('div');
    dd.classList.add('sidebar-left-h2');
    dd.innerText = 'Chat types';
    
    const categories = document.createElement('div');
    categories.classList.add('folder-categories');

    let details: {[flag: string]: {ico: string, text: string}};
    if(this.type == 'excluded') {
      details = {
        exclude_muted: {ico: 'mute', text: 'Muted'},
        exclude_archived: {ico: 'archive', text: 'Archived'},
        exclude_read: {ico: 'readchats', text: 'Read'}
      };
    } else {
      details = {
        contacts: {ico: 'newprivate', text: 'Contacts'},
        non_contacts: {ico: 'noncontacts', text: 'Non-Contacts'},
        groups: {ico: 'group', text: 'Groups'},
        broadcasts: {ico: 'newchannel', text: 'Channels'},
        bots: {ico: 'bots', text: 'Bots'}
      };
    }

    let html = '';
    for(const key in details) {
      html += `<button class="folder-category-button btn-primary btn-transparent tgico-${details[key].ico}" data-peerId="${key}">${details[key].text}${this.checkbox()}</button>`;
    }
    categories.innerHTML = html;

    const hr = document.createElement('hr');
    hr.style.margin = '7px 0 9px';

    const d = document.createElement('div');
    d.classList.add('sidebar-left-h2');
    d.innerText = 'Chats';

    fragment.append(dd, categories, hr, d);

    /////////////////

    const selectedPeers = (this.type === 'included' ? filter.include_peers : filter.exclude_peers).slice();

    this.selector = new AppSelectPeers({
      appendTo: this.container, 
      onChange: this.onSelectChange, 
      peerType: ['dialogs'], 
      renderResultsFunc: this.renderResults
    });
    this.selector.selected = new Set(selectedPeers);
    this.selector.input.placeholder = 'Search';

    const _add = this.selector.add.bind(this.selector);
    this.selector.add = (peerId, title, scroll) => {
      const div = _add(peerId, details[peerId]?.text, scroll);
      if(details[peerId]) {
        div.querySelector('avatar-element').classList.add('tgico-' + details[peerId].ico);
      }
      return div;
    };

    this.selector.list.parentElement.insertBefore(fragment, this.selector.list);

    fastRaf(() => {
      this.selector.addInitial(selectedPeers);
    });

    for(const flag in filter.pFlags) {
      // @ts-ignore
      if(details.hasOwnProperty(flag) && !!filter.pFlags[flag]) {
        (categories.querySelector(`[data-peerId="${flag}"]`) as HTMLElement).click();
      }
    }
  }

  onSelectChange = (length: number) => {
    //const changed = !deepEqual(this.filter, this.originalFilter);
    if(this.type == 'included') {
      this.confirmBtn.style.display = length ? '' : 'none';
    }
  };

  onCloseAfterTimeout() {
    if(this.selector) {
      this.selector.container.remove();
      this.selector = null;
    }
  }

  /**
   * Do not ignore arguments!
   */
  public open(filter?: DialogFilter, type?: 'included' | 'excluded') {
    this.originalFilter = filter;
    this.filter = copy(this.originalFilter);
    this.type = type;
    
    return super.open();
  }
}