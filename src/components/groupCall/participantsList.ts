import positionElementByIndex from '@helpers/dom/positionElementByIndex';
import whichChild from '@helpers/dom/whichChild';
import createListGlide from '@helpers/dom/createListGlide';
import findUpClassName from '@helpers/dom/findUpClassName';
import replaceContent from '@helpers/dom/replaceContent';
import {fastRaf} from '@helpers/schedulers';
import SortedList, {SortedElementBase} from '@helpers/sortedList';
import {AppDialogsManager} from '@lib/appDialogsManager';
import {DialogDom, DialogElementSize, DIALOG_AVATAR_SIZES} from '@components/dialogElement';
import {GROUP_CALL_PARTICIPANT_MUTED_STATE, getColorByMutedState, getGroupCallParticipantMutedState} from '.';
import GroupCallParticipantMutedIcon from '@components/groupCall/participantMutedIcon';
import GroupCallAvatarBlobs from '@components/groupCall/avatarBlobs';
import GroupCallParticipantStatusElement from '@components/groupCall/participantStatus';
import type GroupCallInstance from '@lib/calls/groupCallInstance';
import type {GroupCallParticipant} from '@layer';
import type LazyLoadQueue from '@components/lazyLoadQueue';
import {MiddlewareHelper, getMiddleware} from '@helpers/middleware';
import liteMode from '@helpers/liteMode';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';

interface SortedParticipant extends SortedElementBase<PeerId> {
  dom: DialogDom,
  mutedIcon: GroupCallParticipantMutedIcon,
  status: GroupCallParticipantStatusElement,
  middlewareHelper: MiddlewareHelper,
  blobs?: GroupCallAvatarBlobs
}

export default class GroupCallParticipantsList extends SortedList<SortedParticipant> {
  public list: HTMLUListElement;

  protected lazyLoadQueue: LazyLoadQueue;
  protected avatarSize: DialogElementSize = 'abitbigger';
  protected rippleEnabled = true;
  protected autonomous = true;
  protected createChatListOptions: Parameters<AppDialogsManager['createChatList']>[0] = {/* new: true,  */dialogSize: 72};
  private liveElements = new Set<SortedParticipant>();
  // rows slide to their new places, as the chat list's do
  private glide: ReturnType<typeof createListGlide>;
  private destroyed = false;
  private generation = 0;
  private participants = new Map<PeerId, GroupCallParticipant>();

  constructor(private instance: GroupCallInstance) {
    super({
      getIndex: async(element) => (await this.getParticipant(element.id)).date,
      onDelete: (element) => {
        this.participants.delete(element.id);
        this.glide.mutate(() => element.dom.listEl.remove());
        this.onElementDestroy(element);
      },
      onUpdate: async(element) => {
        const generation = this.generation;
        try {
          const participant = await this.getParticipant(element.id);
          if(this.destroyed || this.generation !== generation || this.get(element.id) !== element) return;

          const speaking = this.instance.isSpeaking(element.id);
          const state = getGroupCallParticipantMutedState(participant, speaking);
          // On the e2e chain but absent from the SFU roster: has the call key,
          // isn't connected to the media. See conferenceMembership.ts.
          const withAccess = this.instance.isMemberWithAccess(element.id);

          element.dom.listEl.classList.toggle('is-with-access', withAccess);
          element.mutedIcon.setState(state);
          element.status.setState(state, participant, withAccess);
          this.updateBlobs(element, speaking, state);
        } catch(err) {
          if(!this.destroyed && this.generation === generation && this.get(element.id) === element) {
            console.error('group call participant row update failed', err);
          }
        }
      },
      onSort: (element, idx) => {
        const {listEl} = element.dom;
        const prevPos = listEl.parentElement === this.list ? whichChild(listEl) : -1;
        if(prevPos !== idx) {
          this.glide.mutate(() => positionElementByIndex(listEl, this.list, idx, prevPos));
        }
      },
      onElementCreate: (base) => {
        const middlewareHelper = getMiddleware();
        const {dom} = hotReloadGuard.appDialogsManager.addDialogNew({
          peerId: base.id,
          container: false,
          avatarSize: this.avatarSize,
          autonomous: this.autonomous,
          meAsSaved: false,
          rippleEnabled: this.rippleEnabled,
          accountNumber: this.instance.accountNumber,
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

    this.list = hotReloadGuard.appDialogsManager.createChatList(this.createChatListOptions);
    this.glide = createListGlide(this.list, {
      movingClassName: 'is-moving',
      liftedClassName: 'is-lifted',
      getViewport: () => findUpClassName(this.list, 'scrollable')
    });
  }

  /** The participant a row shows from now on, handed in with its update. */
  public setParticipant(peerId: PeerId, participant: GroupCallParticipant) {
    this.participants.set(peerId, participant);
  }

  // Reading a row's participant from the instance copies the whole roster out of the worker: a
  // speaking change, which comes several times a second, re-renders the row from the one it has.
  private getParticipant(peerId: PeerId) {
    return this.participants.get(peerId) ?? this.instance.getParticipantRow(peerId);
  }

  /** Rows come and go without sliding until the returned callback: the list's first fill. */
  public blockGlide() {
    return this.glide.block();
  }

  // Speaking changes only a row's icon colour and status line: re-render it
  // without re-sorting the list.
  public refreshState(peerId: PeerId) {
    const element = this.get(peerId);
    if(element && !this.destroyed) {
      this.onUpdate(element);
    }
  }

  // Someone muted for us still speaks: their waves go red, as on macOS.
  private updateBlobs(element: SortedParticipant, speaking: boolean, state: GROUP_CALL_PARTICIPANT_MUTED_STATE) {
    const states = GROUP_CALL_PARTICIPANT_MUTED_STATE;
    const shown = speaking && (state === states.SPEAKING || state === states.MUTED_FOR_ME);
    let {blobs} = element;
    if(!blobs) {
      // * nor any canvas for waves that would not show
      if(!shown || !liteMode.isAvailable('motion')) {
        return;
      }

      // made on the first word and dropped with the last wave: most rows never need a canvas
      const avatar = element.dom.avatarEl.node;
      const created = blobs = element.blobs = new GroupCallAvatarBlobs({
        avatar,
        radius: DIALOG_AVATAR_SIZES[this.avatarSize] / 2,
        readLevel: () => this.instance.getAudioLevel(element.id),
        onGone: () => {
          if(element.blobs === created) {
            element.blobs = undefined;
            created.destroy();
            created.canvas.remove();
          }
        }
      });
      avatar.before(blobs.canvas);
    }

    if(shown) {
      blobs.setColor(getColorByMutedState(state));
    }

    blobs.setHidden(!shown);
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
    element.blobs?.destroy();
    element.middlewareHelper.destroy();
  }
}
