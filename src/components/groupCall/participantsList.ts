/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import positionElementByIndex from '../../helpers/dom/positionElementByIndex';
import replaceContent from '../../helpers/dom/replaceContent';
import {fastRaf} from '../../helpers/schedulers';
import SortedList, {SortedElementBase} from '../../helpers/sortedList';
import appDialogsManager, {DialogDom, AppDialogsManager, DialogElementSize} from '../../lib/appManagers/appDialogsManager';
import {getGroupCallParticipantMutedState} from '.';
import GroupCallParticipantMutedIcon from './participantMutedIcon';
import GroupCallParticipantStatusElement from './participantStatus';
import type GroupCallInstance from '../../lib/calls/groupCallInstance';
import type LazyLoadQueue from '../lazyLoadQueue';
import {MiddlewareHelper, getMiddleware} from '../../helpers/middleware';

interface SortedParticipant extends SortedElementBase<PeerId> {
  dom: DialogDom,
  mutedIcon: GroupCallParticipantMutedIcon,
  status: GroupCallParticipantStatusElement,
  middlewareHelper: MiddlewareHelper
}

export default class GroupCallParticipantsList extends SortedList<SortedParticipant> {
  public list: HTMLUListElement;

  protected lazyLoadQueue: LazyLoadQueue;
  protected avatarSize: DialogElementSize = 'abitbigger';
  protected rippleEnabled = true;
  protected autonomous = true;
  protected createChatListOptions: Parameters<AppDialogsManager['createChatList']>[0] = {/* new: true,  */dialogSize: 72};

  constructor(private instance: GroupCallInstance) {
    super({
      getIndex: async(element) => (await this.instance.getParticipantByPeerId(element.id)).date,
      onDelete: (element) => {
        element.dom.listEl.remove();
        this.onElementDestroy(element);
      },
      onUpdate: async(element) => {
        const participant = await this.instance.getParticipantByPeerId(element.id);
        const state = getGroupCallParticipantMutedState(participant);

        element.mutedIcon.setState(state);
        element.status.setState(state, participant);
      },
      onSort: (element, idx) => {
        positionElementByIndex(element.dom.listEl, this.list, idx);
      },
      onElementCreate: (base) => {
        const middlewareHelper = getMiddleware();
        const {dom} = appDialogsManager.addDialogNew({
          peerId: base.id,
          container: false,
          avatarSize: this.avatarSize,
          autonomous: this.autonomous,
          meAsSaved: false,
          rippleEnabled: this.rippleEnabled,
          wrapOptions: {
            lazyLoadQueue: this.lazyLoadQueue,
            middleware: middlewareHelper.get()
          }
        });

        const className = 'group-call-participant';
        dom.listEl.classList.add(className);

        const mutedIcon = new GroupCallParticipantMutedIcon(true);
        const status = new GroupCallParticipantStatusElement(['presentation', 'video']);
        replaceContent(dom.lastMessageSpan, status.container);
        dom.listEl.append(mutedIcon.container);
        (base as SortedParticipant).mutedIcon = mutedIcon;
        (base as SortedParticipant).status = status;
        (base as SortedParticipant).middlewareHelper = middlewareHelper;

        /* instance.getParticipantByPeerId(base.id).then((participant) => {
          const mutedState = getGroupCallParticipantMutedState(participant);

          mutedIcon.setState(mutedState);
          status.setState(mutedState, participant);
        }); */

        (base as SortedParticipant).dom = dom;

        return base as SortedParticipant;
      },
      updateElementWith: fastRaf
    });

    this.list = appDialogsManager.createChatList(this.createChatListOptions);
  }

  public destroy() {
    super.clear();
    this.elements.forEach((element) => {
      this.onElementDestroy(element);
    });
  }

  protected onElementDestroy(element: SortedParticipant) {
    element.mutedIcon.destroy();
    element.middlewareHelper.destroy();
  }
}
