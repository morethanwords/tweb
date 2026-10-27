import type {GroupCallOutputSource} from '@appManagers/appGroupCallsManager';
import {GroupCallParticipant} from '@layer';
import I18n, {i18n} from '@lib/langPack';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import {getMiddleware} from '@helpers/middleware';
import safePlay from '@helpers/dom/safePlay';
import PeerTitle from '@components/peerTitle';
import getPeerTitle from '@components/wrappers/getPeerTitle';
import type {ActiveAccountNumber} from '@lib/accounts/types';
import {STANDARD_TRANSITION_EASING, STANDARD_TRANSITION_IN_TIME} from '@helpers/standardTransition';
import Icon from '@components/icon';
import liteMode from '@helpers/liteMode';
import Button from '@components/button';
import {avatarNew} from '@components/avatarNew';
import callVideoCanvasBlur from '@components/call/videoCanvasBlur';
import Modes from '@config/modes';
import {getGroupCallParticipantMutedState} from '.';
import GroupCallParticipantMutedIcon from '@components/groupCall/participantMutedIcon';
import GroupCallParticipantStatusElement from '@components/groupCall/participantStatus';
import {GROUP_CALL_DEFAULT_TILE_SIZE, GroupCallTileRect, GroupCallTileSize, getVideoBox} from '@components/groupCall/videoLayout';

export type GroupCallVideoTileType = 'video' | 'presentation';
export type GroupCallVideoTileGeometry = {rect: GroupCallTileRect, video: GroupCallTileSize};

const className = 'group-call-video-tile';
const AVATAR_SIZE = 80;
// how a tile moves, and whatever makes room for it moves with it
export const GROUP_CALL_MOVE_DURATION = STANDARD_TRANSITION_IN_TIME;
export const GROUP_CALL_MOVE_EASING = STANDARD_TRANSITION_EASING;
// A new layer of the same picture (the server switching qualities) moves nothing on screen.
const MIN_ASPECT_CHANGE = 0.01;

/**
 * One camera or screencast. Until its video has a frame to show — a tile is built from a fresh
 * clone of the call's element every time the panel opens — and while the sender pauses it, the
 * tile shows the participant's avatar instead of a black box; the video fades in over it.
 */
export default class GroupCallVideoTile {
  public readonly element: HTMLElement;
  public readonly peerId: PeerId;
  /** Where the grid last put it, in its host's coordinates. */
  public rect: GroupCallTileRect;
  public host: HTMLElement;
  /** How much of the frame filling the tile may cut away (getVideoBox). */
  public maxCrop: number;

  private readonly video: HTMLVideoElement;
  private readonly info: HTMLElement;
  private readonly mutedIcon: GroupCallParticipantMutedIcon;
  private readonly status: GroupCallParticipantStatusElement;
  private readonly middlewareHelper = getMiddleware();
  private participant: GroupCallParticipant;
  private pinIcon: HTMLElement;
  private peerName: string;
  private isPinned: boolean;
  private isSpeaking = false;
  private hasFrame = false;
  private isPaused = false;
  // the video's shape the current geometry was worked out for
  private placedAspect: number;
  // the picture covers the whole tile, the blur round it with it
  private videoFillsTile = false;

  /**
   * @param initialSize the picture's size where the call's own element already knows it: the clone
   * has no frame yet, and a 16:9 guess would reshape the tile once its first one arrived.
   * @param onSizeChange `animate` is off for the first frame, which only settles the tile.
   * @param accountNumber the call's, which the tab may not show meanwhile
   */
  constructor(
    public readonly source: GroupCallOutputSource,
    public readonly type: GroupCallVideoTileType,
    participant: GroupCallParticipant,
    video: HTMLVideoElement,
    private readonly onSizeChange: (animate: boolean) => void,
    private readonly initialSize?: GroupCallTileSize,
    accountNumber?: ActiveAccountNumber
  ) {
    this.peerId = getPeerId(participant.peer);

    // a native button only with the keyboard layer: it takes the focus on click
    const element = this.element = Button(className, {noRipple: true, asDiv: !Modes.a11y});
    element.classList.add('is-' + type);
    // what the participant menu opens for
    element.dataset.peerId = '' + this.peerId;

    const placeholder = document.createElement('div');
    placeholder.classList.add(className + '-placeholder');
    const avatar = avatarNew({
      middleware: this.middlewareHelper.get(),
      size: AVATAR_SIZE,
      isDialog: false,
      peerId: this.peerId,
      accountNumber
    });
    avatar.node.classList.add(className + '-avatar');
    placeholder.append(avatar.node);

    this.video = video;
    video.classList.add(className + '-video', 'call-video');
    video.muted = true;
    video.setAttribute('playsinline', 'true');

    const blurMiddleware = this.middlewareHelper.get();
    const blur = callVideoCanvasBlur(video, {
      isSeen: () => !this.videoFillsTile,
      isAlive: () => !!blurMiddleware()
    });
    blur.classList.add(className + '-blur');

    let peerTitleElement: HTMLElement;
    if(participant.pFlags.self) {
      peerTitleElement = i18n('VoiceChat.Status.You');
      peerTitleElement.classList.add('peer-title');
      this.peerName = I18n.format('VoiceChat.Status.You', true);
    } else {
      peerTitleElement = new PeerTitle({peerId: this.peerId, accountNumber}).element;
      // the title fills in later, so the name is asked for on its own
      const middleware = this.middlewareHelper.get();
      getPeerTitle({peerId: this.peerId, plainText: true, accountNumber}).then((name) => {
        if(!middleware()) return;
        this.peerName = name;
        this.updateAriaLabel();
      });
    }

    this.mutedIcon = new GroupCallParticipantMutedIcon(false);
    this.status = new GroupCallParticipantStatusElement([type]);

    const info = this.info = document.createElement('div');
    info.classList.add(className + '-info');
    const left = document.createElement('div');
    left.classList.add(className + '-info-left');
    left.append(peerTitleElement, this.status.container);
    const right = document.createElement('div');
    right.classList.add(className + '-info-right');
    right.append(this.mutedIcon.container);
    info.append(left, right);

    // the speaker's outline, over the picture
    const outline = document.createElement('div');
    outline.classList.add(className + '-outline');

    element.append(placeholder, blur, video, info, outline);

    this.watchFrames();
    this.updateParticipant(participant);
    this.updateAriaLabel();
  }

  /** The video's own size once it has one; until then the grid lays the tile out as 16:9. */
  public get size(): GroupCallTileSize {
    const {videoWidth, videoHeight} = this.video;
    if(this.hasFrame && videoWidth && videoHeight) {
      return {width: videoWidth, height: videoHeight};
    }

    return this.initialSize ?? GROUP_CALL_DEFAULT_TILE_SIZE;
  }

  public get aspect() {
    const {width, height} = this.size;
    return width / height;
  }

  /** The video changed its shape since the tile was placed: its box inside has to follow. */
  public get isReshaped() {
    const {placedAspect} = this;
    return placedAspect !== undefined && Math.abs(this.aspect - placedAspect) / placedAspect > MIN_ASPECT_CHANGE;
  }

  private watchFrames() {
    const {video} = this;
    const onFrame = () => {
      if(!video.videoWidth || this.hasFrame) {
        return;
      }

      this.hasFrame = true;
      this.updateClasses();
      if(this.isReshaped) {
        this.onSizeChange(false);
      }
    };

    if(video.readyState >= video.HAVE_CURRENT_DATA && video.videoWidth) {
      onFrame();
    } else {
      // the first frame actually painted, where the browser tells it; `loadeddata` otherwise
      video.requestVideoFrameCallback?.(onFrame);
      video.addEventListener('loadeddata', onFrame, {once: true});
    }

    // a phone turned on its side, a screencast of another window
    video.addEventListener('resize', () => {
      if(this.hasFrame && this.isReshaped) {
        this.onSizeChange(true);
      }
    });

    const track = (video.srcObject as MediaStream)?.getVideoTracks?.()[0];
    if(track) {
      const onMute = () => this.updateClasses();
      track.addEventListener('mute', onMute);
      track.addEventListener('unmute', onMute);
      this.middlewareHelper.get().onDestroy(() => {
        track.removeEventListener('mute', onMute);
        track.removeEventListener('unmute', onMute);
      });
    }

    if(video.paused) {
      safePlay(video);
    }
  }

  private updateClasses() {
    const track = (this.video.srcObject as MediaStream)?.getVideoTracks?.()[0];
    const showsVideo = this.hasFrame && !this.isPaused && !track?.muted;
    this.element.classList.toggle('has-video', showsVideo);
  }

  // The tile's accessible name: whose video it is, and what a click on it does.
  private updateAriaLabel() {
    const action = I18n.format(this.type === 'presentation' ?
      (this.isPinned ? 'VoiceChat.UnpinScreencast' : 'VoiceChat.PinScreencast') :
      (this.isPinned ? 'VoiceChat.UnpinVideo' : 'VoiceChat.PinVideo'), true);
    this.element.setAttribute('aria-label', this.peerName ? this.peerName + ', ' + action : action);
  }

  public updateParticipant(participant: GroupCallParticipant) {
    this.participant = participant;
    const state = getGroupCallParticipantMutedState(participant, this.isSpeaking);
    this.mutedIcon.setState(state);
    this.status.setState(state, participant);

    const isPaused = !!participant[this.type]?.pFlags?.paused;
    if(this.isPaused !== isPaused) {
      this.isPaused = isPaused;
      this.updateClasses();
    }
  }

  /** Actually speaking, by the audio level — outlined, the way the macOS app marks the speaker. */
  public setSpeaking(speaking: boolean) {
    if(this.isSpeaking === speaking) {
      return;
    }

    this.isSpeaking = speaking;
    this.element.classList.toggle('is-speaking', speaking);
    this.updateParticipant(this.participant);
  }

  public setPinned(pinned: boolean) {
    if(this.isPinned === pinned) {
      return;
    }

    this.isPinned = pinned;
    this.element.classList.toggle('is-pinned', pinned);
    this.updateAriaLabel();

    if(pinned) {
      this.pinIcon = Icon('pin', className + '-pin');
      this.pinIcon.setAttribute('aria-hidden', 'true');
      this.element.append(this.pinIcon);
    } else {
      this.pinIcon?.remove();
      this.pinIcon = undefined;
    }
  }

  /** Where it is on screen now — mid-move included — for the next move to start from. */
  public measure(): {rect: DOMRect, video: GroupCallTileSize} | undefined {
    if(!this.host) {
      return;
    }

    const rect = this.element.getBoundingClientRect();
    const video = this.video.getBoundingClientRect();
    return rect.width ? {rect, video: {width: video.width, height: video.height}} : undefined;
  }

  /**
   * Puts the tile at `rect` of `host`. The video is sized here rather than by `object-fit`, so a
   * move — from `from`, in the host's coordinates — animates the picture's own box with the tile's
   * and it never stretches on the way, whatever the two shapes and crops.
   */
  public place(host: HTMLElement, rect: GroupCallTileRect, maxCrop: number, from?: GroupCallVideoTileGeometry): Animation | undefined {
    const {element, video} = this;
    // moved within one task, so the video keeps playing
    if(element.parentElement !== host) {
      host.append(element);
    }

    this.host = host;
    this.rect = rect;
    this.maxCrop = maxCrop;
    this.placedAspect = this.aspect;

    const videoSize = getVideoBox(this.aspect, rect.width, rect.height, maxCrop);
    this.videoFillsTile = videoSize.width >= rect.width - .5 && videoSize.height >= rect.height - .5;
    const translate = `translate3d(${rect.x}px, ${rect.y}px, 0)`;
    element.style.transform = translate;
    element.style.width = rect.width + 'px';
    element.style.height = rect.height + 'px';
    video.style.width = videoSize.width + 'px';
    video.style.height = videoSize.height + 'px';

    if(!from) {
      return;
    }

    const options: KeyframeAnimationOptions = {duration: GROUP_CALL_MOVE_DURATION, easing: GROUP_CALL_MOVE_EASING};
    video.animate([
      {width: from.video.width + 'px', height: from.video.height + 'px'},
      {width: videoSize.width + 'px', height: videoSize.height + 'px'}
    ], options);
    return element.animate([{
      transform: `translate3d(${from.rect.x}px, ${from.rect.y}px, 0)`,
      width: from.rect.width + 'px',
      height: from.rect.height + 'px'
    }, {
      transform: translate,
      width: rect.width + 'px',
      height: rect.height + 'px'
    }], options);
  }

  /** Grows into its place, for a tile that was nowhere before (only fades in, with reduced animations). */
  public appear() {
    const translate = `translate3d(${this.rect.x}px, ${this.rect.y}px, 0)`;
    this.element.animate([
      {transform: this.shrunk(translate), opacity: 0},
      {transform: translate, opacity: 1}
    ], {duration: GROUP_CALL_MOVE_DURATION, easing: GROUP_CALL_MOVE_EASING});
  }

  private shrunk(translate: string) {
    return liteMode.isAvailable('motion') ? translate + ' scale(.8)' : translate;
  }

  public stopMoving() {
    this.element.getAnimations().forEach((animation) => animation.cancel());
    this.video.getAnimations().forEach((animation) => animation.cancel());
  }

  /** Fades out before it goes, unless `animate` is off. */
  public remove(animate: boolean) {
    if(!animate || !this.element.isConnected || !this.rect) {
      this.destroy();
      return;
    }

    this.stopMoving();
    const translate = `translate3d(${this.rect.x}px, ${this.rect.y}px, 0)`;
    const animation = this.element.animate([
      {transform: translate, opacity: 1},
      {transform: this.shrunk(translate), opacity: 0}
    ], {duration: GROUP_CALL_MOVE_DURATION, easing: GROUP_CALL_MOVE_EASING, fill: 'forwards'});
    animation.finished.then(() => this.destroy(), () => this.destroy());
  }

  public destroy() {
    this.middlewareHelper.destroy();
    this.mutedIcon.destroy();
    this.element.remove();
    this.video.srcObject = null;
  }
}
