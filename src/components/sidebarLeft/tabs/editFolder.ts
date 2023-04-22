/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {MyDialogFilter} from '../../../lib/storages/filters';
import appDialogsManager from '../../../lib/appManagers/appDialogsManager';
import lottieLoader, {LottieLoader} from '../../../lib/rlottie/lottieLoader';
import {SliderSuperTab} from '../../slider';
import {toast, toastNew} from '../../toast';
import InputField from '../../inputField';
import ButtonIcon from '../../buttonIcon';
import ButtonMenuToggle from '../../buttonMenuToggle';
import {ButtonMenuItemOptions} from '../../buttonMenu';
import Button from '../../button';
import AppIncludedChatsTab from './includedChats';
import {i18n, LangPackKey} from '../../../lib/langPack';
import RLottiePlayer from '../../../lib/rlottie/rlottiePlayer';
import copy from '../../../helpers/object/copy';
import deepEqual from '../../../helpers/object/deepEqual';
import wrapDraftText from '../../../lib/richTextProcessor/wrapDraftText';
import filterAsync from '../../../helpers/array/filterAsync';
import {attachClickEvent} from '../../../helpers/dom/clickEvent';
import SettingSection from '../../settingSection';
import {DialogFilter, ExportedChatlistInvite} from '../../../layer';
import rootScope from '../../../lib/rootScope';
import confirmationPopup from '../../confirmationPopup';
import Row from '../../row';
import createContextMenu from '../../../helpers/dom/createContextMenu';
import findUpClassName from '../../../helpers/dom/findUpClassName';
import {copyTextToClipboard} from '../../../helpers/clipboard';
import wrapEmojiText from '../../../lib/richTextProcessor/wrapEmojiText';
import AppSharedFolderTab from './sharedFolder';
import showLimitPopup from '../../popups/limit';
import toggleDisability from '../../../helpers/dom/toggleDisability';
import PopupSharedFolderInvite from '../../popups/sharedFolderInvite';
import PopupElement from '../../popups';

const MAX_FOLDER_NAME_LENGTH = 12;

type EditFolderButton = {
  icon: string,
  name?: keyof DialogFilter.dialogFilter['pFlags'],
  withRipple?: true,
  text: LangPackKey
};

export default class AppEditFolderTab extends SliderSuperTab {
  private caption: HTMLElement;
  private stickerContainer: HTMLElement;

  private confirmBtn: HTMLElement;
  private menuBtn: HTMLElement;
  private nameInputField: InputField;

  private includePeerIds: SettingSection;
  private excludePeerIds: SettingSection;
  private inviteLinks: SettingSection;
  private flags: {[k in 'contacts' | 'non_contacts' | 'groups' | 'broadcasts' | 'bots' | 'exclude_muted' | 'exclude_archived' | 'exclude_read']: HTMLElement} = {} as any;

  private includePeerIdsButtons: EditFolderButton[];
  private excludePeerIdsButtons: EditFolderButton[];
  private inviteLinksCreate: HTMLElement;
  private animation: RLottiePlayer;
  private filter: MyDialogFilter;
  private originalFilter: MyDialogFilter;

  private type: 'edit' | 'create';
  private loadAnimationPromise: ReturnType<LottieLoader['waitForFirstFrame']>;

  private tempId: number;

  private showMoreClicked: {[key in 'includePeerIds' | 'excludePeerIds']?: boolean}

  public static getInitArgs() {
    return {
      animationData: lottieLoader.loadAnimationFromURLManually('Folders_2')
    };
  }

  public static async deleteFolder(filterId: number) {
    const filter = await rootScope.managers.filtersStorage.getFilter(filterId);
    if(filter?._ === 'dialogFilterChatlist' && !filter.pFlags.has_my_invites) {
      PopupElement.createPopup(PopupSharedFolderInvite, {
        filter,
        deleting: true
      });

      return;
    }

    await confirmationPopup({
      titleLangKey: 'ChatList.Filter.Confirm.Remove.Header',
      descriptionLangKey: (filter as DialogFilter.dialogFilterChatlist).pFlags.has_my_invites ? 'RemoveSharedFolder' : 'ChatList.Filter.Confirm.Remove.Text',
      button: {
        langKey: 'Delete',
        isDanger: true
      }
    });

    return rootScope.managers.filtersStorage.updateDialogFilter(
      {
        _: 'dialogFilter',
        id: filterId
      } as DialogFilter.dialogFilter,
      true
    );
  }

  public init(p: ReturnType<typeof AppEditFolderTab['getInitArgs']> = AppEditFolderTab.getInitArgs()) {
    this.container.classList.add('edit-folder-container');
    this.caption = document.createElement('div');
    this.caption.classList.add('caption');
    this.caption.append(i18n('FilterIncludeExcludeInfo'));
    this.stickerContainer = document.createElement('div');
    this.stickerContainer.classList.add('sticker-container');

    this.tempId = 0;
    this.showMoreClicked = {};

    this.confirmBtn = ButtonIcon('check btn-confirm hide blue');
    let deleting = false;
    const deleteFolderButton: ButtonMenuItemOptions = {
      icon: 'delete danger',
      text: 'FilterMenuDelete',
      onClick: () => {
        if(deleting) {
          return;
        }

        AppEditFolderTab.deleteFolder(this.filter.id).then(() => {
          this.close();
        }).finally(() => {
          deleting = false;
        });
      }
    };
    this.menuBtn = ButtonMenuToggle({
      listenerSetter: this.listenerSetter,
      direction: 'bottom-left',
      buttons: [deleteFolderButton]
    });
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

    const generateList = (
      className: string,
      h2Text: LangPackKey,
      buttons: EditFolderButton[],
      to: any,
      caption?: LangPackKey
    ) => {
      const section = new SettingSection({
        name: h2Text,
        caption,
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

    this.includePeerIds = generateList('folder-list-included', 'FilterInclude', this.includePeerIdsButtons = [{
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
    }], this.flags, 'FilterIncludeInfo');

    this.excludePeerIds = generateList('folder-list-excluded', 'FilterExclude', this.excludePeerIdsButtons = [{
      icon: 'minus primary',
      text: 'FilterRemoveChats',
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
    }], this.flags, 'FilterExcludeInfo');

    this.inviteLinks = generateList('folder-list-links', 'InviteLinks', [{
      icon: 'add primary',
      text: 'SharedFolder.CreateLink',
      withRipple: true
    }], {}, 'SharedFolder.Description');

    this.scrollable.append(
      this.stickerContainer,
      this.caption,
      inputSection.container,
      this.includePeerIds.container,
      this.excludePeerIds.container,
      this.inviteLinks.container
    );

    this.toggleExcludedPeers();
    const includedFlagsContainer = this.includePeerIds.container.querySelector('.folder-categories');
    const excludedFlagsContainer = this.excludePeerIds.container.querySelector('.folder-categories');
    this.inviteLinksCreate = this.inviteLinks.container.querySelector('.btn') as HTMLElement;

    attachClickEvent(includedFlagsContainer.querySelector('.btn') as HTMLElement, () => {
      this.slider.createTab(AppIncludedChatsTab).open(this.filter, 'included', this);
    }, {listenerSetter: this.listenerSetter});

    attachClickEvent(excludedFlagsContainer.querySelector('.btn') as HTMLElement, () => {
      this.slider.createTab(AppIncludedChatsTab).open(this.filter, 'excluded', this);
    }, {listenerSetter: this.listenerSetter});

    const confirmEditing = (closeAfter?: boolean) => {
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
        toastNew({langPackKey: 'EditFolder.Toast.ChooseChat'});
        return;
      }

      this.confirmBtn.setAttribute('disabled', 'true');

      let promise: Promise<DialogFilter>;
      if(!this.filter.id) {
        promise = this.managers.filtersStorage.createDialogFilter(this.filter);
      } else {
        if(closeAfter) {
          postponeFilterUpdate = true;
        }

        promise = this.managers.filtersStorage.updateDialogFilter(this.filter);
      }

      return promise.then((dialogFilter) => {
        if(closeAfter) {
          this.close();
        }

        return dialogFilter;
      }).catch((err: ApiError) => {
        postponeFilterUpdate = false;
        if(postponedFilterUpdate) {
          this.updateFilter(postponedFilterUpdate);
          postponedFilterUpdate = undefined;
        }

        if(err.type === 'DIALOG_FILTERS_TOO_MUCH') {
          showLimitPopup('folders');
        } else {
          console.error('updateDialogFilter error:', err);
        }

        throw err;
      }).finally(() => {
        this.confirmBtn.removeAttribute('disabled');
      });
    };

    attachClickEvent(this.confirmBtn, () => {
      confirmEditing(true);
    }, {listenerSetter: this.listenerSetter});

    let postponedFilterUpdate: DialogFilter.dialogFilterChatlist | DialogFilter.dialogFilter;
    let postponeFilterUpdate = false;

    this.listenerSetter.add(rootScope)('filter_update', (filter) => {
      if(this.filter.id === filter.id) {
        if(postponeFilterUpdate) {
          postponedFilterUpdate = filter;
        } else {
          this.updateFilter(filter);
        }
      }
    });

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
      this.managers.apiManager.getLimit('chatlistInvites'),
      this.managers.apiManager.getLimit('chatlistInvites', true),

      this.loadAnimationPromise = p.animationData.then(async(cb) => {
        const player = await cb({
          container: this.stickerContainer,
          loop: false,
          autoplay: false,
          width: 86,
          height: 86
        });

        this.animation = player;

        return lottieLoader.waitForFirstFrame(player);
      }),

      ...reloadMissingPromises
    ]).then(([chatlistInvitesLimit, chatlistInvitesPremiumLimit]) => {
      if(this.type === 'edit') {
        this.setFilter(this.originalFilter, true);
        this.onEditOpen();
      } else {
        this.setInitFilter();
        this.onCreateOpen();
      }

      this.managers.filtersStorage.getExportedInvites(this.filter.id).catch((err: ApiError) => {
        if(err.type === 'FILTER_NOT_SUPPORTED') {
          return [] as ExportedChatlistInvite[];
        }

        throw err;
      }).then((chatlistInvites) => {
        console.log(chatlistInvites);

        const CLASS_NAME = 'usernames';

        const content = this.inviteLinks.generateContentElement();
        const map: Map<HTMLElement, ExportedChatlistInvite> = new Map();
        const invitesMap: Map<string, Row> = new Map();

        const onLinksLengthChange = () => {
          this.inviteLinksCreate.classList.toggle('hide', map.size >= chatlistInvitesPremiumLimit);
        };

        const onLinkDeletion = (link: ExportedChatlistInvite) => {
          const row = invitesMap.get(link.url);
          if(row) {
            row.container.remove();
            invitesMap.delete(link.url);
            map.delete(row.container);
            onLinksLengthChange();
          }
        };

        const updateLink = (row: Row, chatlistInvite: ExportedChatlistInvite) => {
          const title = chatlistInvite.title && chatlistInvite.title !== this.filter.title ?
            wrapEmojiText(chatlistInvite.title) :
            chatlistInvite.url.replace(/(.+?):\/\//, '');
          const subtitle = i18n('SharedFolder.Includes', [i18n('Chats', [chatlistInvite.peers.length])]);
          row.title.replaceChildren(title);
          row.subtitle.replaceChildren(subtitle);
        };

        const wrapLink = (chatlistInvite: ExportedChatlistInvite) => {
          const row = new Row({
            title: true,
            subtitle: true,
            clickable: true
          });

          updateLink(row, chatlistInvite);

          row.container.classList.add(CLASS_NAME + '-username', 'active');
          const media = row.createMedia('medium');
          media.classList.add(CLASS_NAME + '-username-icon', 'tgico');

          content.append(row.container);
          map.set(row.container, chatlistInvite);
          invitesMap.set(chatlistInvite.url, row);
          onLinksLengthChange();
        };

        let target: HTMLElement;
        createContextMenu({
          buttons: [{
            icon: 'copy',
            text: 'CopyLink',
            onClick: () => copyTextToClipboard(map.get(target).url)
          }, {
            icon: 'delete danger',
            text: 'Delete',
            onClick: () => {
              const chatlistInvite = map.get(target);
              this.managers.filtersStorage.deleteExportedInvite(
                this.filter.id,
                chatlistInvite.url
              ).then(() => {
                onLinkDeletion(chatlistInvite);
              });
            }
          }],
          listenTo: content,
          listenerSetter: this.listenerSetter,
          findElement: (e) => findUpClassName(e.target, 'row'),
          onOpen: (_target) => target = _target
        });

        attachClickEvent(this.inviteLinksCreate, async() => {
          if(map.size >= chatlistInvitesLimit) {
            showLimitPopup('chatlistInvites');
            return;
          }

          if(!this.filter.title) {
            toastNew({langPackKey: 'SharedFolder.Toast.NeedName'});
            return;
          }

          const pFlags = (this.filter as DialogFilter.dialogFilter).pFlags;
          if(pFlags) {
            const found = [this.includePeerIdsButtons, this.excludePeerIdsButtons].some((buttons) => {
              return buttons.some((button) => !!pFlags[button.name]);
            });

            if(found) {
              toastNew({langPackKey: 'SharedFolder.Toast.NoTypes'});
              return;
            }
          }

          if((this.filter as DialogFilter.dialogFilter).excludePeerIds?.length) {
            toastNew({langPackKey: 'SharedFolder.Toast.NoExcluded'});
            return;
          }

          const toggle = toggleDisability([this.inviteLinksCreate], true);
          try {
            const result = confirmEditing(false);
            if(!(result instanceof Promise)) {
              throw '';
            }

            const filter = await result as DialogFilter.dialogFilter;
            this.updateFilter(filter);
            this.type = 'edit';
            this.originalFilter = filter;
            this.editCheckForChange();
          } catch(err) {
            toggle();
            return;
          }

          this.managers.filtersStorage.exportChatlistInvite({
            ...this.filter,
            _: 'dialogFilterChatlist',
            ...({pFlags: this.filter._ === 'dialogFilter' ? {has_my_invites: true} : this.filter.pFlags})
          }).then((exportedChatlistInvite) => {
            toggle();
            openChatlistInvite(exportedChatlistInvite.invite).finally(() => {
              wrapLink(exportedChatlistInvite.invite);
            });
          }, (err: ApiError) => {
            toggle();
            if(err.type === 'INVITES_TOO_MUCH' || err.type === 'FILTERS_TOO_MUCH' || err.type === 'CHATLISTS_TOO_MUCH') {
              showLimitPopup('chatlistInvites');
              return;
            } else if(err.type === 'PEERS_LIST_EMPTY' || err.type === 'CHAT_ADMIN_REQUIRED') {
              openChatlistInvite();
              return;
            }

            throw err;
          });
        }, {listenerSetter: this.listenerSetter});

        const openChatlistInvite = (chatlistInvite?: ExportedChatlistInvite) => {
          const row = invitesMap.get(chatlistInvite?.url);
          const tab = this.slider.createTab(AppSharedFolderTab);
          tab.filter = this.filter as DialogFilter.dialogFilterChatlist;
          tab.chatlistInvite = chatlistInvite;
          tab.eventListener.addEventListener('delete', () => {
            onLinkDeletion(chatlistInvite);
          });
          tab.eventListener.addEventListener('edit', (chatlistInvite) => {
            map.set(row.container, chatlistInvite);
            updateLink(row, chatlistInvite);
          });

          return tab.open();
        };

        attachClickEvent(content, (e) => {
          const target = findUpClassName(e.target, 'row');
          const chatlistInvite = map.get(target as HTMLElement);
          if(!chatlistInvite) {
            return;
          }

          openChatlistInvite(chatlistInvite);
        }, {listenerSetter: this.listenerSetter});

        chatlistInvites.forEach(wrapLink);
      });
    });
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

    for(const flag in this.flags) {
      // @ts-ignore
      this.flags[flag].style.display = 'none';
    }
  }

  private onEditOpen() {
    const tempId = ++this.tempId;
    this.setTitle(this.type === 'create' ? 'FilterNew' : 'FilterHeaderEdit');

    if(this.type === 'edit') {
      this.menuBtn.classList.remove('hide');
      this.confirmBtn.classList.add('hide');
    }

    const filter = this.filter;
    this.nameInputField.value = wrapDraftText(filter.title);

    const pFlags = (filter as DialogFilter.dialogFilter).pFlags;
    for(const flag in this.flags) {
      const good = !!pFlags?.[flag as keyof AppEditFolderTab['flags']];
      this.flags[flag as keyof AppEditFolderTab['flags']].style.display = good ? '' : 'none';
    }

    const promises = [
      'includePeerIds' as const,
      'excludePeerIds' as const
    ].map(async(key) => {
      let peers = (filter as DialogFilter.dialogFilter)[key];
      if(!peers) {
        return;
      }

      const section = this[key];
      const ul = appDialogsManager.createChatList({ignoreClick: true});

      // filter peers where we're kicked
      const hasPeer = async(peerId: PeerId) => {
        return !!(await this.managers.appMessagesManager.getDialogOnly(peerId)) || (peerId.isUser() ? (await this.managers.appUsersManager.getUser(peerId.toUserId()))._ === 'user' : false);
      };

      const filtered = await filterAsync(peers, (peerId) => hasPeer(peerId));
      peers.length = 0;
      peers.push(...filtered);

      peers = peers.slice();

      const renderMore = async(_length: number) => {
        const peerIds = peers.splice(0, _length);
        const filtered = await filterAsync(peerIds, async(peerId) => {
          return peerId.isUser() ? true : !!await this.managers.appMessagesManager.getDialogOnly(peerId);
        });

        if(tempId !== this.tempId) return;

        const loadPromises: Promise<any>[] = [];
        const containers = filtered.map((peerId) => {
          const {dom} = appDialogsManager.addDialogNew({
            peerId,
            rippleEnabled: false,
            meAsSaved: true,
            avatarSize: 'small',
            loadPromises,
            autonomous: true
          });
          dom.lastMessageSpan.parentElement.remove();
          return dom.containerEl;
        });

        await Promise.all(loadPromises);
        if(tempId !== this.tempId) return;
        ul.append(...containers);

        if(showMore) {
          if(peers.length) {
            showMore.lastElementChild.replaceWith(i18n('FilterShowMoreChats', [peers.length]));
            showMore.classList.remove('hide');
          } else {
            showMore.remove();
          }
        }
      };

      let showMore: HTMLElement;
      if(peers.length && !this.showMoreClicked[key]) {
        showMore = Button('folder-category-button btn btn-primary btn-transparent hide', {icon: 'down'});
        showMore.classList.add('load-more', 'rp-overflow');
        attachClickEvent(showMore, () => {
          this.showMoreClicked[key] = true;
          renderMore(Infinity);
        }, {listenerSetter: this.listenerSetter});
        showMore.append(i18n('FilterShowMoreChats', [peers.length]));
      }

      return renderMore(this.showMoreClicked[key] ? Infinity : 4).then(() => {
        if(tempId !== this.tempId) return;

        return () => {
          section.generateContentElement().append(ul);

          if(showMore && peers.length) {
            const content = section.generateContentElement();
            content.append(showMore);
          }
        };
      });
    });

    return Promise.all(promises).then((callbacks) => {
      if(tempId !== this.tempId) return;

      this.toggleExcludedPeers();

      if(this.container) {
        // cleanup
        Array.from(this.container.querySelectorAll('.chatlist, .load-more')).forEach((el) => el.parentElement.remove());
      }

      callbacks.forEach((callback) => callback?.());
    });
  }

  editCheckForChange() {
    if(this.type === 'edit') {
      const changed = !deepEqual(
        {...this.originalFilter, updatedTime: 0, localId: 0},
        {...this.filter, updatedTime: 0, localId: 0}
      );
      this.confirmBtn.classList.toggle('hide', !changed);
      this.menuBtn.classList.toggle('hide', changed);
    }
  };

  setFilter(filter: MyDialogFilter, firstTime: boolean) {
    if(firstTime) {
      this.originalFilter = filter;
      this.filter = copy(filter);
    } else {
      this.filter = filter;
      this.onEditOpen();
      this.editCheckForChange();
    }
  }

  public setInitFilter(filter?: MyDialogFilter) {
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
  }

  private toggleExcludedPeers() {
    this.excludePeerIds.container.classList.toggle('hide', this.filter?._ === 'dialogFilterChatlist');
  }

  private updateFilter(filter: DialogFilter.dialogFilterChatlist | DialogFilter.dialogFilter) {
    this.setFilter(filter, false);
  }
}
