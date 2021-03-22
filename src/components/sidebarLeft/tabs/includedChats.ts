import { SliderSuperTab } from "../../slider";
import AppSelectPeers from "../../appSelectPeers";
import appDialogsManager from "../../../lib/appManagers/appDialogsManager";
import appPeersManager from "../../../lib/appManagers/appPeersManager";
import appUsersManager from "../../../lib/appManagers/appUsersManager";
import { MyDialogFilter as DialogFilter } from "../../../lib/storages/filters";
import rootScope from "../../../lib/rootScope";
import { copy } from "../../../helpers/object";
import ButtonIcon from "../../buttonIcon";
import CheckboxField from "../../checkboxField";
import Button from "../../button";
import AppEditFolderTab from "./editFolder";
import { i18n, LangPackKey, _i18n } from "../../../lib/langPack";

export default class AppIncludedChatsTab extends SliderSuperTab {
  private editFolderTab: AppEditFolderTab;
  private confirmBtn: HTMLElement;

  private selector: AppSelectPeers;
  private type: 'included' | 'excluded';
  private filter: DialogFilter;
  private originalFilter: DialogFilter;

  init() {
    this.content.remove();
    this.container.classList.add('included-chatlist-container');
    this.confirmBtn = ButtonIcon('check btn-confirm blue', {noRipple: true});
    this.confirmBtn.style.display = 'none';

    this.header.append(this.confirmBtn);

    this.confirmBtn.addEventListener('click', () => {
      const selected = this.selector.getSelected();

      //this.filter.pFlags = {};

      if(this.type === 'included') {
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

      if(this.type === 'included') {
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

      const other = this.type === 'included' ? 'exclude_peers' : 'include_peers';
      this.filter[other] = this.filter[other].filter(peerId => {
        return !peers.includes(peerId);
      });
      
      this.filter[this.type === 'included' ? 'include_peers' : 'exclude_peers'] = peers;
      //this.filter.pinned_peers = this.filter.pinned_peers.filter(peerId => this.filter.include_peers.includes(peerId));

      this.editFolderTab.setFilter(this.filter, false);
      this.close();
    });
  }

  checkbox(selected?: boolean) {
    const checkboxField = new CheckboxField({
      round: true
    });
    if(selected) {
      checkboxField.input.checked = selected;
    }

    return checkboxField.label;
  }

  renderResults = async(peerIds: number[]) => {
    //const other = this.type === 'included' ? this.filter.exclude_peers : this.filter.include_peers;

    await appUsersManager.getContacts();
    peerIds.forEach(peerId => {
      //if(other.includes(peerId)) return;

      const {dom} = appDialogsManager.addDialogNew({
        dialog: peerId,
        container: this.selector.scrollable,
        drawStatus: false,
        rippleEnabled: true,
        avatarSize: 46
      });

      const selected = this.selector.selected.has(peerId);
      dom.containerEl.append(this.checkbox(selected));
      if(selected) dom.listEl.classList.add('active');

      /* let subtitle: LangPackKey;

      if(peerId > 0) {
        if(peerId === rootScope.myId) {
          subtitle = 'Chat with yourself';
        } else if(appUsersManager.isBot(peerId)) {
          subtitle = 'Bot';
        } else {
          subtitle = appUsersManager.contactsList.has(peerId) ? 'Contact' : 'Non-Contact';
        }
      } else {
        subtitle = appPeersManager.isBroadcast(peerId) ? 'Channel' : 'Group';
      }

      _i18n(dom.lastMessageSpan, subtitle); */
    });
  };

  onOpen() {
    if(this.init) {
      this.init();
      this.init = null;
    }

    this.confirmBtn.style.display = this.type === 'excluded' ? '' : 'none';
    this.setTitle(this.type === 'included' ? 'FilterAlwaysShow' : 'FilterNeverShow');

    const filter = this.filter;

    const fragment = document.createDocumentFragment();
    const dd = document.createElement('div');
    dd.classList.add('sidebar-left-h2');
    _i18n(dd, 'FilterChatTypes');
    
    const categories = document.createElement('div');
    categories.classList.add('folder-categories');

    let details: {[flag: string]: {ico: string, text: LangPackKey}};
    if(this.type === 'excluded') {
      details = {
        exclude_muted: {ico: 'mute', text: 'ChatList.Filter.MutedChats'},
        exclude_archived: {ico: 'archive', text: 'ChatList.Filter.Archive'},
        exclude_read: {ico: 'readchats', text: 'ChatList.Filter.ReadChats'}
      };
    } else {
      details = {
        contacts: {ico: 'newprivate', text: 'ChatList.Filter.Contacts'},
        non_contacts: {ico: 'noncontacts', text: 'ChatList.Filter.NonContacts'},
        groups: {ico: 'group', text: 'ChatList.Filter.Groups'},
        broadcasts: {ico: 'newchannel', text: 'ChatList.Filter.Channels'},
        bots: {ico: 'bots', text: 'ChatList.Filter.Bots'}
      };
    }

    const f = document.createDocumentFragment();
    for(const key in details) {
      const button = Button('btn-primary btn-transparent folder-category-button', {icon: details[key].ico, text: details[key].text});
      button.dataset.peerId = key;
      button.append(this.checkbox());
      f.append(button);
    }
    categories.append(f);

    const hr = document.createElement('hr');
    hr.style.margin = '7px 0 9px';

    const d = document.createElement('div');
    d.classList.add('sidebar-left-h2');
    _i18n(d, 'FilterChats');

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
      const div = _add(peerId, details[peerId] ? i18n(details[peerId].text) : undefined, scroll);
      if(details[peerId]) {
        div.querySelector('avatar-element').classList.add('tgico-' + details[peerId].ico);
      }
      return div;
    };

    this.selector.list.parentElement.insertBefore(fragment, this.selector.list);

    this.selector.addInitial(selectedPeers);

    for(const flag in filter.pFlags) {
      // @ts-ignore
      if(details.hasOwnProperty(flag) && !!filter.pFlags[flag]) {
        (categories.querySelector(`[data-peer-id="${flag}"]`) as HTMLElement).click();
      }
    }
  }

  onSelectChange = (length: number) => {
    //const changed = !deepEqual(this.filter, this.originalFilter);
    if(this.type === 'included') {
      this.confirmBtn.style.display = length ? '' : 'none';
    }
  };

  onCloseAfterTimeout() {
    if(this.selector) {
      this.selector.container.remove();
      this.selector = null;
    }

    return super.onCloseAfterTimeout();
  }

  /**
   * Do not ignore arguments!
   */
  public open(filter?: DialogFilter, type?: 'included' | 'excluded', editFolderTab?: AppIncludedChatsTab['editFolderTab']) {
    this.originalFilter = filter;
    this.filter = copy(this.originalFilter);
    this.type = type;
    this.editFolderTab = editFolderTab;
    
    return super.open();
  }
}
