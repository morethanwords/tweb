import {Component} from 'solid-js';
import type {MyDialogFilter} from '@lib/storages/filters';
import appDialogsManager from '@lib/appDialogsManager';
import {LottieLoader} from '@lib/lottie/lottieLoader';
import {toastNew} from '@components/toast';
import InputField from '@components/inputField';
import ButtonIcon from '@components/buttonIcon';
import ButtonMenuToggle from '@components/buttonMenuToggle';
import {ButtonMenuItemOptions} from '@components/buttonMenu';
import Button from '@components/button';
import {AppIncludedChatsTab} from '@components/solidJsTabs/tabs';
import {i18n, LangPackKey} from '@lib/langPack';
import LottiePlayer from '@lib/lottie/lottiePlayer';
import copy from '@helpers/object/copy';
import deepEqual from '@helpers/object/deepEqual';
import filterAsync from '@helpers/array/filterAsync';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import SettingSection from '@components/settingSection';
import {DialogFilter, ExportedChatlistInvite} from '@layer';
import rootScope from '@lib/rootScope';
import {useAppSettings} from '@stores/appSettings';
import Row from '@components/row';
import createContextMenu from '@helpers/dom/createContextMenu';
import findUpClassName from '@helpers/dom/findUpClassName';
import {copyTextToClipboard} from '@helpers/clipboard';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import {AppSharedFolderTab} from '@components/solidJsTabs/tabs';
import showLimitPopup from '@components/popups/limit';
import toggleDisability from '@helpers/dom/toggleDisability';
import Icon from '@components/icon';
import EditFolderInput from '@components/sidebarLeft/tabs/editFolderInput';
import getRichValueWithCaret from '@helpers/dom/getRichValueWithCaret';
import trimRichText from '@lib/richTextProcessor/trimRichText';
import {deleteFolder} from './editFolderShared';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import type {AppEditFolderTab} from '@components/solidJsTabs/tabs';

type EditFolderButton = {
  icon: Icon,
  name?: keyof DialogFilter.dialogFilter['pFlags'],
  withRipple?: true,
  text: LangPackKey
};

type EditFolderFlags = {[k in 'contacts' | 'non_contacts' | 'groups' | 'broadcasts' | 'bots' | 'exclude_muted' | 'exclude_archived' | 'exclude_read']: HTMLElement};

const EditFolder: Component = () => {
  const [tab] = useSuperTab<typeof AppEditFolderTab>();
  const promiseCollector = usePromiseCollector();
  const {HotReloadGuard, lottieLoader} = useHotReloadGuard();
  const p = tab.payload;

  const flags: EditFolderFlags = {} as any;
  let includePeerIdsButtons: EditFolderButton[];
  let excludePeerIdsButtons: EditFolderButton[];
  let animation: LottiePlayer;
  let filter: MyDialogFilter;
  let originalFilter: MyDialogFilter;
  let type: 'edit' | 'create';
  let loadAnimationPromise: ReturnType<LottieLoader['waitForFirstFrame']>;
  let tempId = 0;
  let showMoreClicked: {[key in 'includePeerIds' | 'excludePeerIds']?: boolean} = {};

  const editCheckForChange = () => {
    if(type === 'edit') {
      const changed = !deepEqual(
        {...originalFilter, updatedTime: 0, localId: 0},
        {...filter, updatedTime: 0, localId: 0}
      );
      confirmBtn.classList.toggle('hide', !changed);
      menuBtn.classList.toggle('hide', changed);
    }
  };

  const toggleExcludedPeers = () => {
    excludePeerIds.container.classList.toggle('hide', filter?._ === 'dialogFilterChatlist');
  };

  const onCreateOpen = () => {
    // this.caption.style.display = '';
    tab.title.replaceChildren(i18n('FilterNew'));
    menuBtn.classList.add('hide');
    confirmBtn.classList.remove('hide');

    for(const flag in flags) {
      // @ts-ignore
      flags[flag].style.display = 'none';
    }
  };

  const onEditOpen = () => {
    const _tempId = ++tempId;
    tab.title.replaceChildren(i18n(type === 'create' ? 'FilterNew' : 'FilterHeaderEdit'));

    if(type === 'edit') {
      menuBtn.classList.remove('hide');
      confirmBtn.classList.add('hide');
    }

    const _filter = filter;

    nameInputField.feedProps<false>({
      value: _filter.title
    });

    const pFlags = (_filter as DialogFilter.dialogFilter).pFlags;
    for(const flag in flags) {
      const good = !!pFlags?.[flag as keyof EditFolderFlags];
      flags[flag as keyof EditFolderFlags].style.display = good ? '' : 'none';
    }

    const promises = [
      'includePeerIds' as const,
      'excludePeerIds' as const
    ].map(async(key) => {
      let peers = (_filter as DialogFilter.dialogFilter)[key];
      if(!peers) {
        return;
      }

      const section = key === 'includePeerIds' ? includePeerIds : excludePeerIds;
      const ul = appDialogsManager.createChatList({ignoreClick: true});

      // filter peers where we're kicked
      const hasPeer = async(peerId: PeerId) => {
        return !!(await tab.managers.appMessagesManager.getDialogOnly(peerId)) || (peerId.isUser() ? (await tab.managers.appUsersManager.getUser(peerId.toUserId()))._ === 'user' : false);
      };

      const filtered = await filterAsync(peers, (peerId) => hasPeer(peerId));
      peers.length = 0;
      peers.push(...filtered);

      peers = peers.slice();

      const renderMore = async(_length: number) => {
        const peerIds = peers.splice(0, _length);
        const filtered = await filterAsync(peerIds, async(peerId) => {
          return peerId.isUser() ? true : !!await tab.managers.appMessagesManager.getDialogOnly(peerId);
        });

        if(_tempId !== tempId) return;

        const loadPromises: Promise<any>[] = [];
        const containers = filtered.map((peerId) => {
          const dialogElement = appDialogsManager.addDialogNew({
            peerId,
            rippleEnabled: false,
            meAsSaved: true,
            avatarSize: 'small',
            loadPromises,
            autonomous: true,
            wrapOptions: {
              middleware: tab.middlewareHelper.get()
            }
          });
          (dialogElement.container as any).dialogElement = dialogElement;
          const {dom} = dialogElement;
          dom.lastMessageSpan.parentElement.remove();
          return dom.containerEl;
        });

        await Promise.all(loadPromises);
        if(_tempId !== tempId) return;
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
      if(peers.length && !showMoreClicked[key]) {
        showMore = Button('folder-category-button btn btn-primary btn-transparent hide', {icon: 'down'});
        showMore.classList.add('load-more', 'rp-overflow');
        attachClickEvent(showMore, () => {
          showMoreClicked[key] = true;
          renderMore(Infinity);
        }, {listenerSetter: tab.listenerSetter});
        showMore.append(i18n('FilterShowMoreChats', [peers.length]));
      }

      return renderMore(showMoreClicked[key] ? Infinity : 4).then(() => {
        if(_tempId !== tempId) return;

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
      if(_tempId !== tempId) return;

      toggleExcludedPeers();

      if(tab.container) {
        // cleanup
        Array.from(tab.container.querySelectorAll('.chatlist, .load-more')).forEach((el) => el.parentElement.remove());
      }

      callbacks.forEach((callback) => callback?.());
    });
  };

  const setFilter = (_filter: MyDialogFilter, firstTime: boolean) => {
    if(firstTime) {
      originalFilter = _filter;
      filter = copy(_filter);
    } else {
      filter = _filter;
      onEditOpen();
      editCheckForChange();
    }
  };

  const setInitFilter = (_filter?: MyDialogFilter) => {
    if(_filter === undefined) {
      setFilter({
        _: 'dialogFilter',
        id: 0,
        title: {_: 'textWithEntities', text: '', entities: []},
        pFlags: {},
        pinned_peers: [],
        include_peers: [],
        exclude_peers: [],
        pinnedPeerIds: [],
        includePeerIds: [],
        excludePeerIds: []
      }, true);
      type = 'create';
    } else {
      setFilter(_filter, true);
      type = 'edit';
    }
  };

  const updateFilter = (_filter: DialogFilter.dialogFilterChatlist | DialogFilter.dialogFilter) => {
    setFilter(_filter, false);
  };

  (tab as any)._onOpenAfterTimeout = () => {
    loadAnimationPromise.then(() => {
      animation.autoplay = true;
      animation.play();
    });
  };

  if(p.initFilter !== undefined) {
    setInitFilter(p.initFilter);
  }

  tab.container.classList.add('edit-folder-container');
  const caption = document.createElement('div');
  caption.classList.add('caption');
  caption.append(i18n('FilterIncludeExcludeInfo'));
  const stickerContainer = document.createElement('div');
  stickerContainer.classList.add('sticker-container');

  tempId = 0;
  showMoreClicked = {};

  const confirmBtn = ButtonIcon('check btn-confirm hide blue');
  let deleting = false;
  const deleteFolderButton: ButtonMenuItemOptions = {
    icon: 'delete',
    className: 'danger',
    text: 'FilterMenuDelete',
    onClick: () => {
      if(deleting) {
        return;
      }

      deleteFolder(filter.id).then(() => {
        tab.close();
      }).finally(() => {
        deleting = false;
      });
    }
  };
  const menuBtn = ButtonMenuToggle({
    listenerSetter: tab.listenerSetter,
    direction: 'bottom-left',
    buttons: [deleteFolderButton]
  });
  menuBtn.classList.add('hide');

  tab.header.append(confirmBtn, menuBtn);

  const [appSettings] = useAppSettings();
  const hasFoldersSidebar = appSettings.tabsInSidebar;
  const inputSection = new SettingSection({
    caption: hasFoldersSidebar ? 'EditFolder.EmojiAsIconTip' : undefined
  });

  const nameInputField = new EditFolderInput;
  nameInputField.HotReloadGuard = HotReloadGuard;
  nameInputField.classList.add('input-wrapper');
  nameInputField.feedProps({
    onInput: () => {
      const {value, entities} = getRichValueWithCaret(nameInputField.controls.inputField.input);
      filter.title = {_: 'textWithEntities', ...trimRichText(value || '', entities || [])};
      editCheckForChange();
    }
  });

  inputSection.content.append(nameInputField);

  const generateList = (
    className: string,
    h2Text: LangPackKey,
    buttons: EditFolderButton[],
    to: any,
    captionKey?: LangPackKey
  ) => {
    const section = new SettingSection({
      name: h2Text,
      caption: captionKey,
      noDelimiter: true
    });

    section.container.classList.add('folder-list', className);

    const categories = section.generateContentElement();
    categories.classList.add('folder-categories');

    buttons.forEach((o, idx) => {
      const button = Button('folder-category-button btn btn-primary btn-transparent' + (idx === 0 ? ' primary' : ' disable-hover'), {
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

  const includePeerIds = generateList('folder-list-included', 'FilterInclude', includePeerIdsButtons = [{
    icon: 'add',
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
  }], flags, 'FilterIncludeInfo');

  const excludePeerIds = generateList('folder-list-excluded', 'FilterExclude', excludePeerIdsButtons = [{
    icon: 'minus',
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
  }], flags, 'FilterExcludeInfo');

  const inviteLinks = generateList('folder-list-links', 'InviteLinks', [{
    icon: 'add',
    text: 'SharedFolder.CreateLink',
    withRipple: true
  }], {}, 'SharedFolder.Description');

  tab.scrollable.append(
    stickerContainer,
    caption,
    inputSection.container,
    includePeerIds.container,
    excludePeerIds.container,
    inviteLinks.container
  );

  toggleExcludedPeers();
  const includedFlagsContainer = includePeerIds.container.querySelector('.folder-categories');
  const excludedFlagsContainer = excludePeerIds.container.querySelector('.folder-categories');
  const inviteLinksCreate = inviteLinks.container.querySelector('.btn') as HTMLElement;

  attachClickEvent(includedFlagsContainer.querySelector('.btn') as HTMLElement, () => {
    tab.slider.createTab(AppIncludedChatsTab).open({filter, type: 'included', onSetFilter: (f) => setFilter(f, false)});
  }, {listenerSetter: tab.listenerSetter});

  attachClickEvent(excludedFlagsContainer.querySelector('.btn') as HTMLElement, () => {
    tab.slider.createTab(AppIncludedChatsTab).open({filter, type: 'excluded', onSetFilter: (f) => setFilter(f, false)});
  }, {listenerSetter: tab.listenerSetter});

  const confirmEditing = (closeAfter?: boolean) => {
    if(nameInputField.controls?.inputField?.input.classList.contains('error') ?? true) {
      return;
    }

    if(!nameInputField.controls?.inputField?.value.trim()) {
      nameInputField.controls?.inputField?.input.classList.add('error');
      return;
    }

    let include = (Array.from(includedFlagsContainer.children) as HTMLElement[]).slice(1).reduce((acc, el) => acc + +!el.style.display, 0);
    include += filter.include_peers.length;

    if(!include) {
      toastNew({langPackKey: 'EditFolder.Toast.ChooseChat'});
      return;
    }

    confirmBtn.setAttribute('disabled', 'true');

    let promise: Promise<DialogFilter>;
    if(!filter.id) {
      promise = tab.managers.filtersStorage.createDialogFilter(filter);
    } else {
      if(closeAfter) {
        postponeFilterUpdate = true;
      }

      promise = tab.managers.filtersStorage.updateDialogFilter(filter);
    }

    return promise.then((dialogFilter) => {
      if(closeAfter) {
        tab.close();
      }

      return dialogFilter;
    }).catch((err: ApiError) => {
      postponeFilterUpdate = false;
      if(postponedFilterUpdate) {
        updateFilter(postponedFilterUpdate);
        postponedFilterUpdate = undefined;
      }

      if(err.type === 'DIALOG_FILTERS_TOO_MUCH') {
        showLimitPopup('folders');
      } else {
        console.error('updateDialogFilter error:', err);
      }

      throw err;
    }).finally(() => {
      confirmBtn.removeAttribute('disabled');
    });
  };

  attachClickEvent(confirmBtn, () => {
    confirmEditing(true);
  }, {listenerSetter: tab.listenerSetter});

  let postponedFilterUpdate: DialogFilter.dialogFilterChatlist | DialogFilter.dialogFilter;
  let postponeFilterUpdate = false;

  tab.listenerSetter.add(rootScope)('filter_update', (updatedFilter) => {
    if(filter.id === updatedFilter.id) {
      if(postponeFilterUpdate) {
        postponedFilterUpdate = updatedFilter;
      } else {
        updateFilter(updatedFilter);
      }
    }
  });

  const reloadMissingPromises: Promise<any>[] = type === 'edit' ? [
    tab.managers.filtersStorage.reloadMissingPeerIds(filter.id, 'pinned_peers'),
    tab.managers.filtersStorage.reloadMissingPeerIds(filter.id, 'include_peers'),
    tab.managers.filtersStorage.reloadMissingPeerIds(filter.id, 'exclude_peers')
  ] : [];

  promiseCollector.collect(Promise.all([
    tab.managers.apiManager.getLimit('chatlistInvites'),
    tab.managers.apiManager.getLimit('chatlistInvites', true),

    loadAnimationPromise = p.animationData.then(async(cb) => {
      const player = await cb({
        container: stickerContainer,
        loop: false,
        autoplay: false,
        width: 86,
        height: 86
      });

      animation = player;

      return lottieLoader.waitForFirstFrame(player);
    }),

    ...reloadMissingPromises
  ]).then(([chatlistInvitesLimit, chatlistInvitesPremiumLimit]) => {
    if(type === 'edit') {
      setFilter(originalFilter, true);
      onEditOpen();
    } else {
      setInitFilter();
      onCreateOpen();
    }

    tab.managers.filtersStorage.getExportedInvites(filter.id).catch((err: ApiError) => {
      if(err.type === 'FILTER_NOT_SUPPORTED') {
        return [] as ExportedChatlistInvite[];
      }

      throw err;
    }).then((chatlistInvites) => {
      const CLASS_NAME = 'usernames';

      const content = inviteLinks.generateContentElement();
      const map: Map<HTMLElement, ExportedChatlistInvite> = new Map();
      const invitesMap: Map<string, Row> = new Map();

      const onLinksLengthChange = () => {
        inviteLinksCreate.classList.toggle('hide', map.size >= chatlistInvitesPremiumLimit);
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
        const title = chatlistInvite.title && chatlistInvite.title !== filter.title.text ?
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
        media.classList.add(CLASS_NAME + '-username-icon');
        media.append(Icon('link'));

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
          icon: 'delete',
          className: 'danger',
          text: 'Delete',
          onClick: () => {
            const chatlistInvite = map.get(target);
            tab.managers.filtersStorage.deleteExportedInvite(
              filter.id,
              chatlistInvite.url
            ).then(() => {
              onLinkDeletion(chatlistInvite);
            });
          }
        }],
        listenTo: content,
        listenerSetter: tab.listenerSetter,
        findElement: (e) => findUpClassName(e.target, 'row'),
        onOpen: (e, _target) => target = _target
      });

      attachClickEvent(inviteLinksCreate, async() => {
        if(map.size >= chatlistInvitesLimit) {
          showLimitPopup('chatlistInvites');
          return;
        }

        if(!filter.title) {
          toastNew({langPackKey: 'SharedFolder.Toast.NeedName'});
          return;
        }

        const pFlags = (filter as DialogFilter.dialogFilter).pFlags;
        if(pFlags) {
          const found = [includePeerIdsButtons, excludePeerIdsButtons].some((buttons) => {
            return buttons.some((button) => !!pFlags[button.name]);
          });

          if(found) {
            toastNew({langPackKey: 'SharedFolder.Toast.NoTypes'});
            return;
          }
        }

        if((filter as DialogFilter.dialogFilter).excludePeerIds?.length) {
          toastNew({langPackKey: 'SharedFolder.Toast.NoExcluded'});
          return;
        }

        const toggle = toggleDisability([inviteLinksCreate], true);
        try {
          const result = confirmEditing(false);
          if(!(result instanceof Promise)) {
            throw '';
          }

          const f = await result as DialogFilter.dialogFilter;
          updateFilter(f);
          type = 'edit';
          originalFilter = f;
          editCheckForChange();
        } catch(err) {
          toggle();
          return;
        }

        tab.managers.filtersStorage.exportChatlistInvite({
          ...filter,
          _: 'dialogFilterChatlist',
          ...({pFlags: filter._ === 'dialogFilter' ? {has_my_invites: true} : filter.pFlags})
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
      }, {listenerSetter: tab.listenerSetter});

      const openChatlistInvite = (chatlistInvite?: ExportedChatlistInvite) => {
        const row = invitesMap.get(chatlistInvite?.url);
        const sharedTab = tab.slider.createTab(AppSharedFolderTab);
        sharedTab.eventListener.addEventListener('delete', () => {
          onLinkDeletion(chatlistInvite);
        });
        sharedTab.eventListener.addEventListener('edit', (chatlistInvite) => {
          map.set(row.container, chatlistInvite);
          updateLink(row, chatlistInvite);
        });

        return sharedTab.open({filter: filter as DialogFilter.dialogFilterChatlist, chatlistInvite});
      };

      attachClickEvent(content, (e) => {
        const target = findUpClassName(e.target, 'row');
        const chatlistInvite = map.get(target as HTMLElement);
        if(!chatlistInvite) {
          return;
        }

        openChatlistInvite(chatlistInvite);
      }, {listenerSetter: tab.listenerSetter});

      chatlistInvites.forEach(wrapLink);
    });
  }));

  return null;
};

export default EditFolder;
