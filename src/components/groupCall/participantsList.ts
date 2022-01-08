/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import positionElementByIndex from "../../helpers/dom/positionElementByIndex";
import replaceContent from "../../helpers/dom/replaceContent";
import { fastRaf } from "../../helpers/schedulers";
import SortedList, { SortedElementBase } from "../../helpers/sortedList";
import { GroupCallParticipant } from "../../layer";
import appDialogsManager, { DialogDom, AppDialogsManager } from "../../lib/appManagers/appDialogsManager";
import { LazyLoadQueueIntersector } from "../lazyLoadQueue";
import { getGroupCallParticipantMutedState } from ".";
import GroupCallParticipantMutedIcon from "./participantMutedIcon";
import GroupCallParticipantStatusElement from "./participantStatus";
import type GroupCallInstance from "../../lib/calls/groupCallInstance";

interface SortedParticipant extends SortedElementBase {
  dom: DialogDom,
  participant: GroupCallParticipant,
  mutedIcon: GroupCallParticipantMutedIcon,
  status: GroupCallParticipantStatusElement
}

export default class GroupCallParticipantsList extends SortedList<SortedParticipant> {
  public list: HTMLUListElement;
  
  protected lazyLoadQueue: LazyLoadQueueIntersector;
  protected avatarSize = 54;
  protected rippleEnabled = true;
  protected autonomous = true;
  protected createChatListOptions: Parameters<AppDialogsManager['createChatList']>[0] = {/* new: true,  */dialogSize: 72};

  constructor(private instance: GroupCallInstance) {
    super({
      getIndex: (element) => element.participant.date,
      onDelete: (element) => {
        element.dom.listEl.remove();
        this.onElementDestroy(element);
      },
      onUpdate: (element) => {
        const {participant} = element;

        const state = getGroupCallParticipantMutedState(participant);

        element.mutedIcon.setState(state);
        element.status.setState(state, participant);
      },
      onSort: (element, idx) => {
        positionElementByIndex(element.dom.listEl, this.list, idx);
      },
      onElementCreate: (base) => {
        const {dom} = appDialogsManager.addDialogNew({
          dialog: base.id,
          container: false,
          drawStatus: false,
          avatarSize: this.avatarSize,
          autonomous: this.autonomous,
          meAsSaved: false,
          rippleEnabled: this.rippleEnabled,
          lazyLoadQueue: this.lazyLoadQueue
        });

        const className = 'group-call-participant';
        dom.listEl.classList.add(className);

        const participant = instance.participants.get(base.id);
        const mutedState = getGroupCallParticipantMutedState(participant);

        const mutedIcon = new GroupCallParticipantMutedIcon(true);
        const status = new GroupCallParticipantStatusElement(['presentation', 'video']);
        
        mutedIcon.setState(mutedState);
        status.setState(mutedState, participant);

        replaceContent(dom.lastMessageSpan, status.container);
        dom.listEl.append(mutedIcon.container);

        (base as SortedParticipant).dom = dom;
        (base as SortedParticipant).participant = participant;
        (base as SortedParticipant).mutedIcon = mutedIcon;
        (base as SortedParticipant).status = status;

        return base as SortedParticipant;
      },
      updateElementWith: fastRaf
    });

    this.list = appDialogsManager.createChatList(this.createChatListOptions);
  }

  public destroy() {
    this.elements.forEach((element) => {
      this.onElementDestroy(element);
    });
  }

  protected onElementDestroy(element: SortedParticipant) {
    element.mutedIcon.destroy();
  }
}
