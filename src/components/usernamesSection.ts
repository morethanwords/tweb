/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import IS_TOUCH_SUPPORTED from '../environment/touchSupport';
import cancelEvent from '../helpers/dom/cancelEvent';
import {attachClickEvent} from '../helpers/dom/clickEvent';
import findUpAsChild from '../helpers/dom/findUpAsChild';
import placeCaretAtEnd from '../helpers/dom/placeCaretAtEnd';
import positionElementByIndex from '../helpers/dom/positionElementByIndex';
import whichChild from '../helpers/dom/whichChild';
import ListenerSetter from '../helpers/listenerSetter';
import {Middleware} from '../helpers/middleware';
import noop from '../helpers/noop';
import clamp from '../helpers/number/clamp';
import pause from '../helpers/schedulers/pause';
import SortedList, {SortedElementBase} from '../helpers/sortedList';
import {Chat, User, Username} from '../layer';
import {i18n, LangPackKey} from '../lib/langPack';
import rootScope from '../lib/rootScope';
import confirmationPopup from './confirmationPopup';
import Row from './row';
import SettingSection from './settingSection';
import SwipeHandler from './swipeHandler';
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

        const sortIcon = document.createElement('span');
        row.container.classList.add('row-sortable', 'tgico');
        sortIcon.classList.add('row-sortable-icon', 'tgico-menu');
        row.container.append(sortIcon);

        changeActive(row, active);

        (base as SortedUsername).row = row;

        return base as SortedUsername;
      }
    });

    const changeActive = (row: Row, active: boolean) => {
      row.subtitle.replaceChildren(i18n(row.container.dataset.editable ? 'UsernameLinkEditable' : (active ? 'UsernameLinkActive' : 'UsernameLinkInactive')));
      row.container.classList.toggle('active', active);
      row.container.classList.toggle('cant-sort', !active);
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

    const getSortableTarget = (target: HTMLElement) => {
      if(!target) {
        return;
      }

      let child = findUpAsChild(target as HTMLElement, list);
      if(child && child.classList.contains('cant-sort')) {
        child = undefined;
      }

      return child;
    };

    let element: HTMLElement,
      elementRect: DOMRect,
      containerRect: DOMRect,
      minY: number,
      maxY: number,
      siblings: HTMLElement[];
    const swipeHandler = new SwipeHandler({
      element: list,
      onSwipe: (xDiff, yDiff) => {
        yDiff = clamp(-yDiff, minY, maxY);
        element.style.transform = `translateY(${yDiff}px)`;
        const count = Math.round(Math.abs(yDiff) / elementRect.height);
        const lastSiblings = siblings;
        siblings = [];
        const property = yDiff < 0 ? 'previousElementSibling' : 'nextElementSibling';
        let sibling = element[property] as HTMLElement;
        for(let i = 0; i < count; ++i) {
          if(getSortableTarget(sibling)) {
            siblings.push(sibling);
            sibling = sibling[property] as HTMLElement;
          } else {
            break;
          }
        }

        (lastSiblings || []).forEach((sibling) => {
          if(!siblings.includes(sibling)) {
            sibling.style.transform = '';
          }
        });

        siblings.forEach((sibling) => {
          const y = elementRect.height * (yDiff < 0 ? 1 : -1);
          sibling.style.transform = `translateY(${y}px)`;
        });
      },
      verifyTouchTarget: (e) => {
        if(list.classList.contains('is-reordering')) {
          return false;
        }

        element = getSortableTarget(e.target as HTMLElement);
        return !!element/*  && pause(150).then(() => true) */;
      },
      onFirstSwipe: () => {
        list.classList.add('is-reordering');
        element.classList.add('is-dragging', 'no-transition');
        swipeHandler.setCursor('grabbing');
        elementRect = element.getBoundingClientRect();
        containerRect = list.getBoundingClientRect();

        minY = containerRect.top - elementRect.top;
        maxY = containerRect.bottom - elementRect.bottom;
      },
      onReset: async() => {
        const length = siblings.length;
        const move = length && length * (siblings[0].previousElementSibling === element ? 1 : -1);
        const idx = whichChild(element);
        const newIdx = idx + move;

        element.classList.remove('no-transition');
        element.style.transform = move ? `translateY(${move * elementRect.height}px)` : '';
        swipeHandler.setCursor('');

        if(!IS_TOUCH_SUPPORTED) {
          attachClickEvent(document.body, cancelEvent, {capture: true, once: true});
        }

        if(rootScope.settings.animationsEnabled) {
          await pause(250);
        }

        list.classList.remove('is-reordering');
        element.classList.remove('is-dragging');
        positionElementByIndex(element, list, newIdx, idx);
        [element, ...siblings].forEach((element) => {
          element.style.transform = '';
        });

        element =
          siblings =
          elementRect =
          containerRect =
          minY =
          maxY =
          undefined;

        // cancelClick = true;

        if(!move) {
          return;
        }

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
      },
      setCursorTo: document.body,
      middleware: middleware,
      withDelay: true
    });

    section.content.append(list);
  }
}
