/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {attachClickEvent} from '../helpers/dom/clickEvent';
import findUpAsChild from '../helpers/dom/findUpAsChild';
import placeCaretAtEnd from '../helpers/dom/placeCaretAtEnd';
import positionElementByIndex from '../helpers/dom/positionElementByIndex';
import Sortable from '../helpers/dom/sortable';
import ListenerSetter from '../helpers/listenerSetter';
import {Middleware} from '../helpers/middleware';
import noop from '../helpers/noop';
import SortedList, {SortedElementBase} from '../helpers/sortedList';
import {Chat, User, Username} from '../layer';
import {i18n, LangPackKey} from '../lib/langPack';
import rootScope from '../lib/rootScope';
import confirmationPopup from './confirmationPopup';
import Row from './row';
import SettingSection from './settingSection';
import {UsernameInputField} from './usernameInputField';

export default class UsernamesSection extends SettingSection {
  // public section: SettingSection;

  constructor(options: {
    peerId: PeerId,
    peer: Chat.channel | User.user,
    listenerSetter: ListenerSetter,
    usernameInputField: UsernameInputField,
    middleware: Middleware
  }) {
    /* const section = this.section = new SettingSection */super({
      name: 'UsernamesProfileHeader',
      caption: !options.peerId.isUser() ? 'UsernamesChannelHelp' : 'UsernamesProfileHelp'
    });

    const {peerId, peer, usernameInputField, listenerSetter, middleware} = options;
    const managers = rootScope.managers;
    const channelId = peerId.isUser() ? undefined : peerId.toChatId();

    const section = this;

    const CLASS_NAME = 'usernames';
    const list = document.createElement('div');
    list.classList.add(CLASS_NAME);

    let _usernames: Username[];

    interface SortedUsername extends SortedElementBase<string> {
      row: Row
    }

    const sortedList = new SortedList<SortedUsername>({
      getIndex: (element) => _usernames.length - _usernames.findIndex((username) => username.username === element.id),
      onDelete: (element) => {
        element.row.container.remove();
      },
      onSort: (element, idx) => {
        positionElementByIndex(element.row.container, list, idx);
      },
      onElementCreate: (base) => {
        const username = _usernames.find((username) => username.username === base.id);
        const row = new Row({
          title: '@' + username.username,
          subtitle: true,
          clickable: true
        });

        const editable = !!username.pFlags.editable;
        const active = !!username.pFlags.active;

        if(editable) row.container.dataset.editable = '1';
        row.container.dataset.username = username.username;
        row.container.classList.add(CLASS_NAME + '-username');
        row.subtitle.classList.add(CLASS_NAME + '-username-status');
        const media = row.createMedia('medium');
        media.classList.add(CLASS_NAME + '-username-icon', 'tgico');

        row.makeSortable();

        changeActive(row, active);

        (base as SortedUsername).row = row;

        return base as SortedUsername;
      }
    });

    const changeActive = (row: Row, active: boolean) => {
      row.subtitle.replaceChildren(i18n(row.container.dataset.editable ? 'UsernameLinkEditable' : (active ? 'UsernameLinkActive' : 'UsernameLinkInactive')));
      row.container.classList.toggle('active', active);
      row.toggleSorting(active);
    };

    const applyUsernames = (usernames: Username[] = []) => {
      _usernames = usernames;

      sortedList.getAll().forEach((element) => {
        if(!usernames.some((username) => username.username === element.id)) {
          sortedList.delete(element.id);
        }
      });

      usernames.forEach((username) => {
        if(!sortedList.has(username.username)) {
          sortedList.add(username.username);
        } else {
          const element = sortedList.get(username.username);
          sortedList.update(username.username, element);
          changeActive(element.row, !!username.pFlags.active);
        }
      });

      section.container.classList.toggle('hide', !sortedList.getAll().size);
    };

    applyUsernames(peer.usernames);

    listenerSetter.add(rootScope)('peer_title_edit', async({peerId: _peerId}) => {
      if(_peerId !== peerId) {
        return;
      }

      const peer = await managers.appPeersManager.getPeer(peerId);
      applyUsernames((peer as User.user).usernames);
    });

    let cancelClick = false;
    attachClickEvent(list, async(e) => {
      if(cancelClick) {
        cancelClick = false;
        return;
      }

      const container = findUpAsChild(e.target as HTMLElement, list);
      if(!container) {
        return;
      }

      if(container.dataset.editable) {
        placeCaretAtEnd(usernameInputField.input, true, true);
        return;
      }

      const username = container.dataset.username;

      const active = container.classList.contains('active');
      let titleLangKey: LangPackKey, descriptionLangKey: LangPackKey;
      if(active) {
        titleLangKey = 'UsernameDeactivateLink';
        descriptionLangKey = channelId ? 'UsernameDeactivateLinkChannelMessage' : 'UsernameDeactivateLinkProfileMessage';
      } else {
        titleLangKey = 'UsernameActivateLink';
        descriptionLangKey = channelId ? 'UsernameActivateLinkChannelMessage' : 'UsernameActivateLinkProfileMessage';
      }

      try {
        await confirmationPopup({
          titleLangKey,
          descriptionLangKey,
          button: {
            langKey: active ? 'Hide' : 'Show'
          }
        });
      } catch(err) {
        return;
      }

      const newActive = !active;
      let promise: Promise<boolean>;
      if(channelId) {
        promise = managers.appChatsManager.toggleUsername(channelId, username, newActive);
      } else {
        promise = managers.appUsersManager.toggleUsername(username, newActive);
      }

      promise.catch((err: ApiError) => {
        if(err.type === 'USERNAMES_ACTIVE_TOO_MUCH') {
          confirmationPopup({
            titleLangKey: 'UsernameActivateErrorTitle',
            descriptionLangKey: 'UsernameActivateErrorMessage',
            button: {langKey: 'OK', isCancel: true}
          }).catch(noop);
        } else {
          console.error('turn username error', err);
        }
      });
    });

    new Sortable({
      list,
      middleware,
      onSort: (idx, newIdx) => {
        const username = _usernames.splice(idx, 1)[0];
        _usernames.splice(newIdx, 0, username);
        sortedList.updateList();
        // can't just update particular element, have to change indexes
        // sortedList.update(username.username);

        const usernames = _usernames.filter((username) => username.pFlags.active).map((username) => username.username);
        if(channelId) {
          managers.appChatsManager.reorderUsernames(channelId, usernames);
        } else {
          managers.appUsersManager.reorderUsernames(usernames);
        }
      }
    });

    section.content.append(list);
  }
}
