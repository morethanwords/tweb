import appSidebarLeft, { AppSidebarLeft } from "..";
import { deepEqual, copy } from "../../../helpers/object";
import appDialogsManager from "../../../lib/appManagers/appDialogsManager";
import { MyDialogFilter as DialogFilter } from "../../../lib/storages/filters";
import lottieLoader, { RLottiePlayer } from "../../../lib/lottieLoader";
import { parseMenuButtonsTo } from "../../misc";
import { ripple } from "../../ripple";
import { SliderTab, SliderSuperTab } from "../../slider";
import { toast } from "../../toast";
import appMessagesManager from "../../../lib/appManagers/appMessagesManager";
import { attachClickEvent } from "../../../helpers/dom";
import InputField from "../../inputField";
import RichTextProcessor from "../../../lib/richtextprocessor";
import ButtonIcon from "../../buttonIcon";
import ButtonMenuToggle from "../../buttonMenuToggle";
import { ButtonMenuItemOptions } from "../../buttonMenu";
import Button from "../../button";

const MAX_FOLDER_NAME_LENGTH = 12;

export default class AppEditFolderTab extends SliderSuperTab {
  private caption: HTMLElement;
  private stickerContainer: HTMLElement;

  private confirmBtn: HTMLElement;
  private menuBtn: HTMLElement;
  private nameInputField: InputField;

  private include_peers: HTMLElement;
  private exclude_peers: HTMLElement;
  private flags: {[k in 'contacts' | 'non_contacts' | 'groups' | 'broadcasts' | 'bots' | 'exclude_muted' | 'exclude_archived' | 'exclude_read']: HTMLElement} = {} as any;

  private animation: RLottiePlayer;
  private filter: DialogFilter;
  private originalFilter: DialogFilter;

  private type: 'edit' | 'create';

  constructor(appSidebarLeft: AppSidebarLeft) {
    super(appSidebarLeft);
  }

  protected init() {
    this.container.classList.add('edit-folder-container');
    this.caption = document.createElement('div');
    this.caption.classList.add('caption');
    this.caption.innerHTML = `Choose chats and types of chats that will<br>appear and never appear in this folder.`;
    this.stickerContainer = document.createElement('div');
    this.stickerContainer.classList.add('sticker-container');

    this.confirmBtn = ButtonIcon('check btn-confirm hide blue');
    const deleteFolderButton: ButtonMenuItemOptions = {
      icon: 'delete danger',
      text: 'Delete Folder',
      onClick: () => {
        deleteFolderButton.element.setAttribute('disabled', 'true');
        appMessagesManager.filtersStorage.updateDialogFilter(this.filter, true).then(bool => {
          if(bool) {
            this.close();
          }
        }).finally(() => {
          deleteFolderButton.element.removeAttribute('disabled');
        });
      }
    };
    this.menuBtn = ButtonMenuToggle({}, 'bottom-left', [deleteFolderButton]);
    this.menuBtn.classList.add('hide');

    this.header.append(this.confirmBtn, this.menuBtn);

    const inputWrapper = document.createElement('div');
    inputWrapper.classList.add('input-wrapper');
    
    this.nameInputField = new InputField({
      label: 'Folder Name',
      maxLength: MAX_FOLDER_NAME_LENGTH
    });

    inputWrapper.append(this.nameInputField.container);

    const generateList = (className: string, h2Text: string, buttons: {icon: string, name?: string, withRipple?: true, text: string}[], to: any) => {
      const container = document.createElement('div');
      container.classList.add('folder-list', className);

      const h2 = document.createElement('div');
      h2.classList.add('sidebar-left-h2');
      h2.innerHTML = h2Text;

      const categories = document.createElement('div');
      categories.classList.add('folder-categories');

      buttons.forEach(o => {
        const button = Button('folder-category-button btn btn-primary btn-transparent', {
          icon: o.icon,
          text: o.text,
          noRipple: o.withRipple ? undefined : true,
          rippleSquare: true
        });

        if(o.name) {
          to[o.name] = button;
        }

        categories.append(button);
      });

      container.append(h2, categories);

      return container;
    };

    this.include_peers = generateList('folder-list-included', 'Included chats', [{
      icon: 'add primary',
      text: 'Add Chats',
      withRipple: true
    }, {
      text: 'Contacts',
      icon: 'newprivate',
      name: 'contacts'
    }, {
      text: 'Non-Contacts',
      icon: 'noncontacts',
      name: 'non_contacts'
    }, {
      text: 'Groups',
      icon: 'group',
      name: 'groups'
    }, {
      text: 'Channels',
      icon: 'channel',
      name: 'broadcasts'
    }, {
      text: 'Bots',
      icon: 'bots',
      name: 'bots'
    }], this.flags);

    this.exclude_peers = generateList('folder-list-excluded', 'Excluded chats', [{
      icon: 'minus primary',
      text: 'Remove Chats',
      withRipple: true
    }, {
      text: 'Muted',
      icon: 'mute',
      name: 'exclude_muted'
    }, {
      text: 'Archived',
      icon: 'archive',
      name: 'exclude_archived'
    }, {
      text: 'Read',
      icon: 'readchats',
      name: 'exclude_read'
    }], this.flags);

    this.scrollable.append(this.stickerContainer, this.caption, inputWrapper, this.include_peers, this.exclude_peers);

    const includedFlagsContainer = this.include_peers.querySelector('.folder-categories');
    const excludedFlagsContainer = this.exclude_peers.querySelector('.folder-categories');

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

    this.confirmBtn.addEventListener('click', () => {
      if(this.nameInputField.input.classList.contains('error')) {
        return;
      }

      if(!this.nameInputField.value.trim()) {
        this.nameInputField.input.classList.add('error');
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
          this.close();
        }
      }).catch(err => {
        if(err.type === 'DIALOG_FILTERS_TOO_MUCH') {
          toast('Sorry, you can\'t create more folders.');
        } else {
          console.error('updateDialogFilter error:', err);
        }
      }).finally(() => {
        this.confirmBtn.removeAttribute('disabled');
      });
    });
    
    this.nameInputField.input.addEventListener('input', () => {
      this.filter.title = this.nameInputField.value;
      this.editCheckForChange();
    });
  }

  onOpen() {
    if(this.animation) {
      this.animation.restart();
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
    this.nameInputField.value = '';

    for(const flag in this.flags) {
      // @ts-ignore
      this.flags[flag].style.display = 'none';
    }
  }

  private onEditOpen() {
    this.caption.style.display = 'none';
    this.title.innerText = this.type === 'create' ? 'New Folder' : 'Edit Folder';

    if(this.type === 'edit') {
      this.menuBtn.classList.remove('hide');
      this.confirmBtn.classList.add('hide');
    }
    
    const filter = this.filter;
    this.nameInputField.value = RichTextProcessor.wrapDraftText(filter.title);

    for(const flag in this.flags) {
      this.flags[flag as keyof AppEditFolderTab['flags']].style.display = !!filter.pFlags[flag as keyof AppEditFolderTab['flags']] ? '' : 'none';
    }

    (['include_peers', 'exclude_peers'] as ['include_peers', 'exclude_peers']).forEach(key => {
      const container = this[key];
      const ul = document.createElement('ul');

      const peers = filter[key].slice();

      const renderMore = (_length: number) => {
        for(let i = 0, length = Math.min(peers.length, _length); i < length; ++i) {
          const peerId = peers.shift();

          const {dom} = appDialogsManager.addDialogNew({
            dialog: peerId,
            container: ul,
            drawStatus: false,
            rippleEnabled: false,
            meAsSaved: true,
            avatarSize: 32
          });
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
    if(this.type === 'edit') {
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

  public open(filter?: DialogFilter) {
    const ret = super.open();
    
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

    return ret;
  }
}