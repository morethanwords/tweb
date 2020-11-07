import appSidebarLeft, { AppSidebarLeft } from "..";
import { deepEqual, copy } from "../../../helpers/object";
import appDialogsManager from "../../../lib/appManagers/appDialogsManager";
import appMessagesManager, { MyDialogFilter as DialogFilter } from "../../../lib/appManagers/appMessagesManager";
import lottieLoader, { RLottiePlayer } from "../../../lib/lottieLoader";
import { parseMenuButtonsTo } from "../../misc";
import { ripple } from "../../ripple";
import { SliderTab } from "../../slider";
import { toast } from "../../toast";

const MAX_FOLDER_NAME_LENGTH = 12;

export default class AppEditFolderTab implements SliderTab {
  public container: HTMLElement;
  private closeBtn: HTMLElement;
  private title: HTMLElement;
  private caption: HTMLElement;
  private stickerContainer: HTMLElement;

  private confirmBtn: HTMLElement;
  private menuBtn: HTMLElement;
  private deleteFolderBtn: HTMLElement;
  private nameInput: HTMLInputElement;

  private include_peers: HTMLElement;
  private exclude_peers: HTMLElement;
  private flags: {[k in 'contacts' | 'non_contacts' | 'groups' | 'broadcasts' | 'bots' | 'exclude_muted' | 'exclude_archived' | 'exclude_read']: HTMLElement} = {} as any;

  private animation: RLottiePlayer;
  private filter: DialogFilter;
  private originalFilter: DialogFilter;

  private type: 'edit' | 'create';

  init() {
    this.container = document.querySelector('.edit-folder-container');
    this.closeBtn = this.container.querySelector('.sidebar-close-button');
    this.title = this.container.querySelector('.sidebar-header__title');
    this.caption = this.container.querySelector('.caption');
    this.stickerContainer = this.container.querySelector('.sticker-container');

    this.confirmBtn = this.container.querySelector('.btn-confirm');
    this.menuBtn = this.container.querySelector('.btn-menu-toggle');
    this.deleteFolderBtn = this.menuBtn.querySelector('.menu-delete');
    this.nameInput = this.container.querySelector('#folder-name');

    this.include_peers = this.container.querySelector('.folder-list-included');
    this.exclude_peers = this.container.querySelector('.folder-list-excluded');

    const includedFlagsContainer = this.include_peers.querySelector('.folder-categories');
    const excludedFlagsContainer = this.exclude_peers.querySelector('.folder-categories');
    parseMenuButtonsTo(this.flags, includedFlagsContainer.children);
    parseMenuButtonsTo(this.flags, excludedFlagsContainer.children);

    includedFlagsContainer.firstElementChild.addEventListener('click', () => {
      appSidebarLeft.includedChatsTab.open(this.filter, 'included');
    });

    excludedFlagsContainer.firstElementChild.addEventListener('click', () => {
      appSidebarLeft.includedChatsTab.open(this.filter, 'excluded');
    });

    lottieLoader.loadAnimationFromURL({
      container: this.stickerContainer,
      loop: false,
      autoplay: true,
      width: 86,
      height: 86
    }, 'assets/img/Folders_2.tgs').then(player => {
      this.animation = player;
    });

    this.deleteFolderBtn.addEventListener('click', () => {
      this.deleteFolderBtn.setAttribute('disabled', 'true');
      appMessagesManager.filtersStorage.updateDialogFilter(this.filter, true).then(bool => {
        if(bool) {
          this.closeBtn.click();
        }
      }).finally(() => {
        this.deleteFolderBtn.removeAttribute('disabled');
      });
    });

    this.confirmBtn.addEventListener('click', () => {
      if(!this.nameInput.value.trim()) {
        this.nameInput.classList.add('error');
        return;
      }

      let include = (Array.from(includedFlagsContainer.children) as HTMLElement[]).slice(1).reduce((acc, el) => acc + +!el.style.display, 0);
      include += this.filter.include_peers.length;
      
      if(!include) {
        toast('Please choose at least one chat for this folder.');
        return;
      }

      this.confirmBtn.setAttribute('disabled', 'true');

      let promise: Promise<boolean>;
      if(!this.filter.id) {
        promise = appMessagesManager.filtersStorage.createDialogFilter(this.filter);
      } else {
        promise = appMessagesManager.filtersStorage.updateDialogFilter(this.filter);
      }

      promise.then(bool => {
        if(bool) {
          this.closeBtn.click();
        }
      }).catch(err => {
        if(err.type == 'DIALOG_FILTERS_TOO_MUCH') {
          toast('Sorry, you can\'t create more folders.');
        } else {
          console.error('updateDialogFilter error:', err);
        }
      }).finally(() => {
        this.confirmBtn.removeAttribute('disabled');
      });
    });
    
    this.nameInput.addEventListener('input', () => {
      if(this.nameInput.value.length > MAX_FOLDER_NAME_LENGTH) {
        this.nameInput.value = this.nameInput.value.slice(0, MAX_FOLDER_NAME_LENGTH);
        return;
      }

      this.filter.title = this.nameInput.value;
      this.nameInput.classList.remove('error');

      this.editCheckForChange();
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

  onCloseAfterTimeout() {
    Array.from(this.container.querySelectorAll('ul, .show-more')).forEach(el => el.remove());
  }

  private onCreateOpen() {
    this.caption.style.display = '';
    this.title.innerText = 'New Folder';
    this.menuBtn.classList.add('hide');
    this.confirmBtn.classList.remove('hide');
    this.nameInput.value = '';

    for(const flag in this.flags) {
      // @ts-ignore
      this.flags[flag].style.display = 'none';
    }
  }

  private onEditOpen() {
    this.caption.style.display = 'none';
    this.title.innerText = this.type == 'create' ? 'New Folder' : 'Edit Folder';

    if(this.type == 'edit') {
      this.menuBtn.classList.remove('hide');
      this.confirmBtn.classList.add('hide');
    }
    
    const filter = this.filter;
    this.nameInput.value = filter.title;

    for(const flag in this.flags) {
      // @ts-ignore
      this.flags[flag].style.display = !!filter.pFlags[flag] ? '' : 'none';
    }

    (['include_peers', 'exclude_peers'] as ['include_peers', 'exclude_peers']).forEach(key => {
      const container = this[key];
      const ul = document.createElement('ul');

      const peers = filter[key].slice();

      const renderMore = (_length: number) => {
        for(let i = 0, length = Math.min(peers.length, _length); i < length; ++i) {
          const peerID = peers.shift();

          const {dom} = appDialogsManager.addDialog(peerID, ul, false, false, undefined, true);
          dom.lastMessageSpan.parentElement.remove();
        }

        if(peers.length) {
          showMore.innerHTML = `<div class="tgico-down"></div><div>Show ${Math.min(20, peers.length)} more chat${peers.length > 1 ? 's' : ''}</div>`;
        } else if(showMore) {
          showMore.remove();
        }
      };
      
      container.append(ul);

      let showMore: HTMLElement;
      if(peers.length) {
        showMore = document.createElement('div');
        showMore.classList.add('show-more');
        showMore.addEventListener('click', () => renderMore(20));

        showMore.innerHTML = `<div class="tgico-down"></div><div>Show ${Math.min(20, peers.length)} more chat${peers.length > 1 ? 's' : ''}</div>`;
        ripple(showMore);
        container.append(showMore);
      }

      renderMore(4);
    });
  }

  editCheckForChange() {
    if(this.type == 'edit') {
      const changed = !deepEqual(this.originalFilter, this.filter);
      this.confirmBtn.classList.toggle('hide', !changed);
      this.menuBtn.classList.toggle('hide', changed);
    }
  };

  setFilter(filter: DialogFilter, firstTime: boolean) {
    // cleanup
    this.onCloseAfterTimeout();

    if(firstTime) {
      this.originalFilter = filter;
      this.filter = copy(filter);
    } else {
      this.filter = filter;
      this.onEditOpen();
      this.editCheckForChange();
    }
  }

  open(filter?: DialogFilter) {
    appSidebarLeft.selectTab(AppSidebarLeft.SLIDERITEMSIDS.editFolder);

    if(filter === undefined) {
      this.setFilter({
        _: 'dialogFilter',
        id: 0,
        title: '',
        pFlags: {},
        pinned_peers: [],
        include_peers: [],
        exclude_peers: []
      }, true);
      this.type = 'create';
      this.onCreateOpen();
    } else {
      this.setFilter(filter, true);
      this.type = 'edit';
      this.onEditOpen();
    }
  }
}