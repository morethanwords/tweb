import positionElementByIndex from '@helpers/dom/positionElementByIndex';
import replaceContent from '@helpers/dom/replaceContent';
import {fastRaf} from '@helpers/schedulers';
import SortedList, {SortedElementBase} from '@helpers/sortedList';
import appDialogsManager, {DialogDom, AppDialogsManager, DialogElementSize} from '@lib/appDialogsManager';
import {getGroupCallParticipantMutedState} from '.';
import GroupCallParticipantMutedIcon from '@components/groupCall/participantMutedIcon';
import GroupCallParticipantStatusElement from '@components/groupCall/participantStatus';
import type GroupCallInstance from '@lib/calls/groupCallInstance';
import type LazyLoadQueue from '@components/lazyLoadQueue';
import {MiddlewareHelper, getMiddleware} from '@helpers/middleware';

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
  private liveElements = new Set<SortedParticipant>();
  private destroyed = false;
  private generation = 0;

  constructor(private instance: GroupCallInstance) {
    super({
      getIndex: async(element) => (await this.instance.getParticipantByPeerId(element.id)).date,
      onDelete: (element) => {
        element.dom.listEl.remove();
        this.onElementDestroy(element);
      },
      onUpdate: async(element) => {
        const generation = this.generation;
        try {
          const participant = await this.instance.getParticipantByPeerId(element.id);
          if(this.destroyed || this.generation !== generation || this.get(element.id) !== element) return;

          const state = getGroupCallParticipantMutedState(participant);
          // On the e2e chain but absent from the SFU roster: has the call key,
          // isn't connected to the media. See conferenceMembership.ts.
          const withAccess = this.instance.isMemberWithAccess(element.id);

          element.dom.listEl.classList.toggle('is-with-access', withAccess);
          element.mutedIcon.setState(state);
          element.status.setState(state, participant, withAccess);
        } catch(err) {
          if(!this.destroyed && this.generation === generation && this.get(element.id) === element) {
            console.error('group call participant row update failed', err);
          }
        }
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
        this.liveElements.add(base as SortedParticipant);

        return base as SortedParticipant;
      },
      updateElementWith: fastRaf
    });

    this.list = appDialogsManager.createChatList(this.createChatListOptions);
  }

  public destroy() {
    if(this.destroyed) return;
    this.destroyed = true;
    ++this.generation;
    const elements = Array.from(this.liveElements);
    super.clear();
    elements.forEach((element) => {
      element.dom.listEl.remove();
      this.onElementDestroy(element);
    });
  }

  protected onElementDestroy(element: SortedParticipant) {
    if(!this.liveElements.delete(element)) return;
    element.mutedIcon.destroy();
    element.middlewareHelper.destroy();
  }
}
