//import { logger } from "../polyfill";
import appDialogsManager from "./appDialogsManager";
import { $rootScope } from "../utils";
import appImManager from "./appImManager";
import AppSearch, { SearchGroup } from "../../components/appSearch";
import { parseMenuButtonsTo } from "../../components/misc";
import appUsersManager from "./appUsersManager";
import Scrollable from "../../components/scrollable_new";
import appPeersManager from "../appManagers/appPeersManager";
import AvatarElement from "../../components/avatar";
import AppNewChannelTab from "../../components/sidebarLeft/newChannel";
import AppAddMembersTab from "../../components/sidebarLeft/addMembers";
import AppContactsTab from "../../components/sidebarLeft/contacts";
import AppNewGroupTab from "../../components/sidebarLeft/newGroup";
import AppSettingsTab from "../../components/sidebarLeft/settings";
import AppEditProfileTab from "../../components/sidebarLeft/editProfile";
import SidebarSlider from "../../components/slider";
import SearchInput from "../../components/searchInput";

AvatarElement;

const newChannelTab = new AppNewChannelTab();
const addMembersTab = new AppAddMembersTab();
const contactsTab = new AppContactsTab();
const newGroupTab = new AppNewGroupTab();
const settingsTab = new AppSettingsTab();
const editProfileTab = new AppEditProfileTab();

export class AppSidebarLeft extends SidebarSlider {
  public static SLIDERITEMSIDS = {
    archived: 1,
    contacts: 2,
    newChannel: 3,
    addMembers: 4,
    newGroup: 5,
    settings: 6,
    editProfile: 7,
  };

  private toolsBtn: HTMLButtonElement;
  private backBtn: HTMLButtonElement;
  private searchContainer: HTMLDivElement;
  //private searchInput = document.getElementById('global-search') as HTMLInputElement;
  private searchInput: SearchInput;
  
  private menuEl: HTMLElement;
  private buttons: {
    newGroup: HTMLButtonElement,
    contacts: HTMLButtonElement,
    archived: HTMLButtonElement,
    saved: HTMLButtonElement,
    settings: HTMLButtonElement,
    help: HTMLButtonElement
  } = {} as any;
  public archivedCount: HTMLSpanElement;

  private newBtnMenu: HTMLElement;
  private newButtons: {
    channel: HTMLButtonElement,
    group: HTMLButtonElement,
    privateChat: HTMLButtonElement,
  } = {} as any;

  public newChannelTab: AppNewChannelTab;
  public addMembersTab: AppAddMembersTab;
  public contactsTab: AppContactsTab;
  public newGroupTab: AppNewGroupTab;
  public settingsTab: AppSettingsTab;
  public editProfileTab: AppEditProfileTab;

  //private log = logger('SL');

  private searchGroups = {
    contacts: new SearchGroup('Contacts and Chats', 'contacts'),
    globalContacts: new SearchGroup('Global Search', 'contacts'),
    messages: new SearchGroup('Global Search', 'messages'),
    people: new SearchGroup('People', 'contacts', false, 'search-group-people'),
    recent: new SearchGroup('Recent', 'contacts', false, 'search-group-recent')
  };
  private globalSearch: AppSearch;

  constructor() {
    super(document.getElementById('column-left') as HTMLDivElement, {
      //[AppSidebarLeft.SLIDERITEMSIDS.archived]: ,
      [AppSidebarLeft.SLIDERITEMSIDS.newChannel]: newChannelTab,
      [AppSidebarLeft.SLIDERITEMSIDS.contacts]: contactsTab,
      [AppSidebarLeft.SLIDERITEMSIDS.addMembers]: addMembersTab,
      [AppSidebarLeft.SLIDERITEMSIDS.newGroup]: newGroupTab,
      [AppSidebarLeft.SLIDERITEMSIDS.settings]: settingsTab,
      [AppSidebarLeft.SLIDERITEMSIDS.editProfile]: editProfileTab,
    });

    this.searchInput = new SearchInput('Telegram Search');
    this.sidebarEl.querySelector('.item-main .sidebar-header').append(this.searchInput.container);

    this.toolsBtn = this.sidebarEl.querySelector('.sidebar-tools-button') as HTMLButtonElement;
    this.backBtn = this.sidebarEl.querySelector('.sidebar-back-button') as HTMLButtonElement;
    this.searchContainer = this.sidebarEl.querySelector('#search-container') as HTMLDivElement;

    this.newChannelTab = newChannelTab;
    this.addMembersTab = addMembersTab;
    this.contactsTab = contactsTab;
    this.newGroupTab = newGroupTab;
    this.settingsTab = settingsTab;
    this.editProfileTab = editProfileTab;

    this.menuEl = this.toolsBtn.querySelector('.btn-menu');
    this.newBtnMenu = this.sidebarEl.querySelector('#new-menu');

    this.globalSearch = new AppSearch(this.searchContainer, this.searchInput, this.searchGroups);

    let peopleContainer = document.createElement('div');
    peopleContainer.classList.add('search-group-scrollable');
    peopleContainer.append(this.searchGroups.people.list);
    this.searchGroups.people.container.append(peopleContainer);
    let peopleScrollable = new Scrollable(peopleContainer, 'x');

    parseMenuButtonsTo(this.buttons, this.menuEl.children);
    parseMenuButtonsTo(this.newButtons, this.newBtnMenu.firstElementChild.children);

    this.archivedCount = this.buttons.archived.querySelector('.archived-count') as HTMLSpanElement;

    this.buttons.saved.addEventListener('click', (e) => {
      ///////this.log('savedbtn click');
      setTimeout(() => { // menu doesn't close if no timeout (lol)
        appImManager.setPeer(appImManager.myID);
      }, 0);
    });
    
    this.buttons.archived.addEventListener('click', (e) => {
      this.selectTab(AppSidebarLeft.SLIDERITEMSIDS.archived);
    });

    this.buttons.contacts.addEventListener('click', (e) => {
      this.contactsTab.openContacts();
    });

    this.buttons.settings.addEventListener('click', () => {
      this.settingsTab.fillElements();
      this.selectTab(AppSidebarLeft.SLIDERITEMSIDS.settings);
    });

    this.searchInput.input.addEventListener('focus', (e) => {
      this.toolsBtn.classList.remove('active');
      this.backBtn.classList.add('active');
      this.searchContainer.classList.remove('hide');
      void this.searchContainer.offsetWidth; // reflow
      this.searchContainer.classList.add('active');

      /* this.searchInput.addEventListener('blur', (e) => {
        if(!this.searchInput.value) {
          this.toolsBtn.classList.add('active');
          this.backBtn.classList.remove('active');
          this.backBtn.click();
        }
      }, {once: true}); */
    });

    this.backBtn.addEventListener('click', (e) => {
      appDialogsManager.chatsArchivedContainer.classList.remove('active');
      this.toolsBtn.classList.add('active');
      this.backBtn.classList.remove('active');
      this.searchContainer.classList.remove('active');

      setTimeout(() => {
        this.searchContainer.classList.add('hide');
        this.globalSearch.reset();

        this.searchGroups.people.setActive();
        //this.searchGroups.recent.setActive();
      }, 150);
    });

    this.newButtons.channel.addEventListener('click', (e) => {
      this.selectTab(AppSidebarLeft.SLIDERITEMSIDS.newChannel);
    });

    [this.newButtons.group, this.buttons.newGroup].forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.addMembersTab.init(0, 'chat', false, (peerIDs) => {
          this.newGroupTab.init(peerIDs);
        });
      });
    });

    $rootScope.$on('dialogs_archived_unread', (e: CustomEvent) => {
      this.archivedCount.innerText = '' + e.detail.count;
    });

    appUsersManager.getTopPeers().then(categories => {
      //console.log('got top categories:', categories);

      let category = categories[0];
      if(!category || !category.peers) {
        return;
      }
      
      category.peers.forEach((topPeer: {
        _: 'topPeer',
        peer: any,
        rating: number
      }) => {
        let peerID = appPeersManager.getPeerID(topPeer.peer);
        let {dialog, dom} = appDialogsManager.addDialog(peerID, this.searchGroups.people.list, false, true, true);

        this.searchGroups.people.setActive();
      });
    });
  }
}

const appSidebarLeft = new AppSidebarLeft();
(window as any).appSidebarLeft = appSidebarLeft;
export default appSidebarLeft;
