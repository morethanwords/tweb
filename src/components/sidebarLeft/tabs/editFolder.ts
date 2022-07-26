/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import appDialogsManager from "../../../lib/appManagers/appDialogsManager";
import { MyDialogFilter as DialogFilter } from "../../../lib/storages/filters";
import lottieLoader, { LottieLoader } from "../../../lib/rlottie/lottieLoader";
import { SliderSuperTab } from "../../slider";
import { toast } from "../../toast";
import InputField from "../../inputField";
import ButtonIcon from "../../buttonIcon";
import ButtonMenuToggle from "../../buttonMenuToggle";
import { ButtonMenuItemOptions } from "../../buttonMenu";
import Button from "../../button";
import AppIncludedChatsTab from "./includedChats";
import { i18n, LangPackKey } from "../../../lib/langPack";
import { SettingSection } from "..";
import PopupPeer from "../../popups/peer";
import RLottiePlayer from "../../../lib/rlottie/rlottiePlayer";
import copy from "../../../helpers/object/copy";
import deepEqual from "../../../helpers/object/deepEqual";
import documentFragmentToHTML from "../../../helpers/dom/documentFragmentToHTML";
import wrapDraftText from "../../../lib/richTextProcessor/wrapDraftText";
import filterAsync from "../../../helpers/array/filterAsync";
import { attachClickEvent } from "../../../helpers/dom/clickEvent";

const MAX_FOLDER_NAME_LENGTH = 12;

export default class AppEditFolderTab extends SliderSuperTab {
  private caption: HTMLElement;
  private stickerContainer: HTMLElement;

  private confirmBtn: HTMLElement;
  private menuBtn: HTMLElement;
  private nameInputField: InputField;

  private includePeerIds: SettingSection;
  private excludePeerIds: SettingSection;
  private flags: {[k in 'contacts' | 'non_contacts' | 'groups' | 'broadcasts' | 'bots' | 'exclude_muted' | 'exclude_archived' | 'exclude_read']: HTMLElement} = {} as any;

  private animation: RLottiePlayer;
  private filter: DialogFilter;
  private originalFilter: DialogFilter;

  private type: 'edit' | 'create';
  private loadAnimationPromise: ReturnType<LottieLoader['waitForFirstFrame']>;

  protected init() {
    this.container.classList.add('edit-folder-container');
    this.caption = document.createElement('div');
    this.caption.classList.add('caption');
    this.caption.append(i18n('FilterIncludeExcludeInfo'));
    this.stickerContainer = document.createElement('div');
    this.stickerContainer.classList.add('sticker-container');

    this.confirmBtn = ButtonIcon('check btn-confirm hide blue');
    const deleteFolderButton: ButtonMenuItemOptions = {
      icon: 'delete danger',
      text: 'FilterMenuDelete',
      onClick: () => {
        new PopupPeer('filter-delete', {
          titleLangKey: 'ChatList.Filter.Confirm.Remove.Header',
          descriptionLangKey: 'ChatList.Filter.Confirm.Remove.Text',
          buttons: [{
            langKey: 'Delete',
            callback: () => {
              deleteFolderButton.element.setAttribute('disabled', 'true');
              this.managers.filtersStorage.updateDialogFilter(this.filter, true).then((bool) => {
                if(bool) {
                  this.close();
                }
              }).finally(() => {
                deleteFolderButton.element.removeAttribute('disabled');
              });
            },
            isDanger: true
          }]
        }).show();
      }
    };
    this.menuBtn = ButtonMenuToggle({listenerSetter: this.listenerSetter}, 'bottom-left', [deleteFolderButton]);
    this.menuBtn.classList.add('hide');

    this.header.append(this.confirmBtn, this.menuBtn);

    const inputSection = new SettingSection({});

    const inputWrapper = document.createElement('div');
    inputWrapper.classList.add('input-wrapper');
    
    this.nameInputField = new InputField({
      label: 'FilterNameHint',
      maxLength: MAX_FOLDER_NAME_LENGTH
    });

    inputWrapper.append(this.nameInputField.container);
    inputSection.content.append(inputWrapper);

    const generateList = (className: string, h2Text: LangPackKey, buttons: {icon: string, name?: string, withRipple?: true, text: LangPackKey}[], to: any) => {
      const section = new SettingSection({
        name: h2Text,
        noDelimiter: true
      });

      section.container.classList.add('folder-list', className);

      const categories = section.generateContentElement();
      categories.classList.add('folder-categories');

      buttons.forEach((o) => {
        const button = Button('folder-category-button btn btn-primary btn-transparent', {
          icon: o.icon,
          text: o.text,
          noRipple: o.withRipple ? undefined : true
        });

        if(o.name) {
          to[o.name] = button;
        }

        categories.append(button);
      });

      return section;
    };

    this.includePeerIds = generateList('folder-list-included', 'FilterInclude', [{
      icon: 'add primary',
      text: 'ChatList.Filter.Include.AddChat',
      withRipple: true
    }, {
      text: 'ChatList.Filter.Contacts',
      icon: 'newprivate',
      name: 'contacts'
    }, {
      text: 'ChatList.Filter.NonContacts',
      icon: 'noncontacts',
      name: 'non_contacts'
    }, {
      text: 'ChatList.Filter.Groups',
      icon: 'group',
      name: 'groups'
    }, {
      text: 'ChatList.Filter.Channels',
      icon: 'channel',
      name: 'broadcasts'
    }, {
      text: 'ChatList.Filter.Bots',
      icon: 'bots',
      name: 'bots'
    }], this.flags);

    this.excludePeerIds = generateList('folder-list-excluded', 'FilterExclude', [{
      icon: 'minus primary',
      text: 'ChatList.Filter.Exclude.AddChat',
      withRipple: true
    }, {
      text: 'ChatList.Filter.MutedChats',
      icon: 'mute',
      name: 'exclude_muted'
    }, {
      text: 'ChatList.Filter.Archive',
      icon: 'archive',
      name: 'exclude_archived'
    }, {
      text: 'ChatList.Filter.ReadChats',
      icon: 'readchats',
      name: 'exclude_read'
    }], this.flags);

    this.scrollable.append(this.stickerContainer, this.caption, inputSection.container, this.includePeerIds.container, this.excludePeerIds.container);

    const includedFlagsContainer = this.includePeerIds.container.querySelector('.folder-categories');
    const excludedFlagsContainer = this.excludePeerIds.container.querySelector('.folder-categories');

    attachClickEvent(includedFlagsContainer.querySelector('.btn') as HTMLElement, () => {
      this.slider.createTab(AppIncludedChatsTab).open(this.filter, 'included', this);
    }, {listenerSetter: this.listenerSetter});

    attachClickEvent(excludedFlagsContainer.querySelector('.btn') as HTMLElement, () => {
      this.slider.createTab(AppIncludedChatsTab).open(this.filter, 'excluded', this);
    }, {listenerSetter: this.listenerSetter});

    attachClickEvent(this.confirmBtn, () => {
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
        promise = this.managers.filtersStorage.createDialogFilter(this.filter);
      } else {
        promise = this.managers.filtersStorage.updateDialogFilter(this.filter);
      }

      promise.then((bool) => {
        if(bool) {
          this.close();
        }
      }).catch((err) => {
        if(err.type === 'DIALOG_FILTERS_TOO_MUCH') {
          toast('Sorry, you can\'t create more folders.');
        } else {
          console.error('updateDialogFilter error:', err);
        }
      }).finally(() => {
        this.confirmBtn.removeAttribute('disabled');
      });
    }, {listenerSetter: this.listenerSetter});
    
    this.listenerSetter.add(this.nameInputField.input)('input', () => {
      this.filter.title = this.nameInputField.value;
      this.editCheckForChange();
    });

    const reloadMissingPromises: Promise<any>[] = this.type === 'edit' ? [
      this.managers.filtersStorage.reloadMissingPeerIds(this.filter.id, 'pinned_peers'),
      this.managers.filtersStorage.reloadMissingPeerIds(this.filter.id, 'include_peers'),
      this.managers.filtersStorage.reloadMissingPeerIds(this.filter.id, 'exclude_peers')
    ] : [];

    return Promise.all([
      this.loadAnimationPromise = lottieLoader.loadAnimationAsAsset({
        container: this.stickerContainer,
        loop: false,
        autoplay: false,
        width: 86,
        height: 86
      }, 'Folders_2').then((player) => {
        this.animation = player;

        return lottieLoader.waitForFirstFrame(player);
      }),

      ...reloadMissingPromises
    ]);
  }

  onOpenAfterTimeout() {
    this.loadAnimationPromise.then(() => {
      this.animation.autoplay = true;
      this.animation.play();
    });
  }

  private onCreateOpen() {
    // this.caption.style.display = '';
    this.setTitle('FilterNew');
    this.menuBtn.classList.add('hide');
    this.confirmBtn.classList.remove('hide');
    this.nameInputField.value = '';

    for(const flag in this.flags) {
      // @ts-ignore
      this.flags[flag].style.display = 'none';
    }
  }

  private onEditOpen() {
    // this.caption.style.display = 'none';
    this.setTitle(this.type === 'create' ? 'FilterNew' : 'FilterHeaderEdit');

    if(this.type === 'edit') {
      this.menuBtn.classList.remove('hide');
      this.confirmBtn.classList.add('hide');
    }
    
    const filter = this.filter;
    this.nameInputField.value = documentFragmentToHTML(wrapDraftText(filter.title));

    for(const flag in this.flags) {
      this.flags[flag as keyof AppEditFolderTab['flags']].style.display = !!filter.pFlags[flag as keyof AppEditFolderTab['flags']] ? '' : 'none';
    }

    (['includePeerIds' as const, 'excludePeerIds' as const]).forEach(async(key) => {
      const section = this[key];
      const ul = appDialogsManager.createChatList({ignoreClick: true});

      let peers = filter[key];

      // filter peers where we're kicked
      const hasPeer = async(peerId: PeerId) => {
        return !!(await this.managers.appMessagesManager.getDialogOnly(peerId)) || (peerId.isUser() ? (await this.managers.appUsersManager.getUser(peerId.toUserId()))._ === 'user' : false);
      };
      
      const filtered = await filterAsync(peers, (peerId) => hasPeer(peerId));
      peers.length = 0;
      peers.push(...filtered);

      peers = peers.slice();

      const renderMore = async(_length: number) => {
        for(let i = 0, length = Math.min(peers.length, _length); i < length; ++i) {
          const peerId = peers.shift();
          if(peerId.isUser() ? false : !(await this.managers.appMessagesManager.getDialogOnly(peerId))) {
            continue;
          }

          const {dom} = appDialogsManager.addDialogNew({
            peerId: peerId,
            container: ul,
            rippleEnabled: false,
            meAsSaved: true,
            avatarSize: 32
          });
          dom.lastMessageSpan.parentElement.remove();
        }

        if(peers.length) {
          showMore.lastElementChild.replaceWith(i18n('FilterShowMoreChats', [peers.length]));
        } else if(showMore) {
          showMore.remove();
        }
      };
      
      section.generateContentElement().append(ul);

      let showMore: HTMLElement;
      if(peers.length) {
        const content = section.generateContentElement();
        showMore = Button('folder-category-button btn btn-primary btn-transparent', {icon: 'down'});
        showMore.classList.add('load-more', 'rp-overflow');
        attachClickEvent(showMore, () => renderMore(20), {listenerSetter: this.listenerSetter});
        showMore.append(i18n('FilterShowMoreChats', [peers.length]));

        content.append(showMore);
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
    if(this.container) {
      // cleanup
      Array.from(this.container.querySelectorAll('ul, .load-more')).forEach((el) => el.remove());
    }

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
    if(filter === undefined) {
      this.setFilter({
        _: 'dialogFilter',
        id: 0,
        title: '',
        pFlags: {},
        pinned_peers: [],
        include_peers: [],
        exclude_peers: [],
        pinnedPeerIds: [],
        includePeerIds: [],
        excludePeerIds: []
      }, true);
      this.type = 'create';
    } else {
      this.setFilter(filter, true);
      this.type = 'edit';
    }

    return super.open().then(() => {
      if(this.type === 'edit') {
        this.setFilter(this.originalFilter, true);
        this.onEditOpen();
      } else {
        this.onCreateOpen();
      }
    });
  }
}
