/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

/* @refresh reload */

import {animateSingle, cancelAnimationByKey} from '../../helpers/animation';
import cancelEvent from '../../helpers/dom/cancelEvent';
import overlayCounter from '../../helpers/overlayCounter';
import throttle from '../../helpers/schedulers/throttle';
import classNames from '../../helpers/string/classNames';
import windowSize from '../../helpers/windowSize';
import {Document, DocumentAttribute, GeoPoint, MediaArea, MessageMedia, Photo, Reaction, StoryItem, StoryView, User, UserStories} from '../../layer';
import animationIntersector from '../animationIntersector';
import appNavigationController, {NavigationItem} from '../appNavigationController';
import ButtonCorner from '../buttonCorner';
import PeerTitle from '../peerTitle';
import SwipeHandler from '../swipeHandler';
import styles from './viewer.module.scss';
import {createSignal, createEffect, JSX, For, Accessor, onCleanup, createMemo, mergeProps, createContext, useContext, Context, ParentComponent, splitProps, untrack, on, getOwner, runWithOwner, createRoot, ParentProps, Suspense, batch, Signal, onMount, Setter, createReaction, Show} from 'solid-js';
import {unwrap} from 'solid-js/store';
import {assign, Portal} from 'solid-js/web';
import {Transition} from 'solid-transition-group';
import rootScope from '../../lib/rootScope';
import ListenerSetter from '../../helpers/listenerSetter';
import {getMiddleware} from '../../helpers/middleware';
import wrapRichText from '../../lib/richTextProcessor/wrapRichText';
import wrapMessageEntities from '../../lib/richTextProcessor/wrapMessageEntities';
import tsNow from '../../helpers/tsNow';
import {LangPackKey, i18n, joinElementsWith} from '../../lib/langPack';
import formatDuration, {DurationType} from '../../helpers/formatDuration';
import {easeOutCubicApply} from '../../helpers/easing/easeOutCubic';
import findUpClassName from '../../helpers/dom/findUpClassName';
import findUpAsChild from '../../helpers/dom/findUpAsChild';
import {onMediaCaptionClick} from '../appMediaViewer';
import InputFieldAnimated from '../inputFieldAnimated';
import ChatInput from '../chat/input';
import appImManager from '../../lib/appManagers/appImManager';
import Chat from '../chat/chat';
import middlewarePromise from '../../helpers/middlewarePromise';
import emoticonsDropdown from '../emoticonsDropdown';
import PopupPickUser from '../popups/pickUser';
import ButtonMenuToggle from '../buttonMenuToggle';
import getPeerActiveUsernames from '../../lib/appManagers/utils/peers/getPeerActiveUsernames';
import {copyTextToClipboard} from '../../helpers/clipboard';
import {toastNew} from '../toast';
import debounce from '../../helpers/schedulers/debounce';
import appDownloadManager from '../../lib/appManagers/appDownloadManager';
import getMediaFromMessage from '../../lib/appManagers/utils/messages/getMediaFromMessage';
import confirmationPopup from '../confirmationPopup';
import {formatDateAccordingToTodayNew, formatFullSentTime} from '../../helpers/date';
import getVisibleRect from '../../helpers/dom/getVisibleRect';
import onMediaLoad from '../../helpers/onMediaLoad';
import {AvatarNew} from '../avatarNew';
import documentFragmentToNodes from '../../helpers/dom/documentFragmentToNodes';
import clamp from '../../helpers/number/clamp';
import {SERVICE_PEER_ID} from '../../lib/mtproto/mtproto_config';
import idleController from '../../helpers/idleController';
import OverlayClickHandler from '../../helpers/overlayClickHandler';
import getStoryPrivacyType, {StoryPrivacyType} from '../../lib/appManagers/utils/stories/privacyType';
import wrapPeerTitle from '../wrappers/peerTitle';
import SetTransition from '../singleTransition';
import StackedAvatars from '../stackedAvatars';
import PopupElement from '../popups';
import {processDialogElementForReaction} from '../popups/reactedList';
import PopupReportMessages from '../popups/reportMessages';
import IS_TOUCH_SUPPORTED from '../../environment/touchSupport';
import focusInput from '../../helpers/dom/focusInput';
import {wrapStoryMedia} from './preview';
import {StoriesContextPeerState, useStories, StoriesProvider} from './store';
import createUnifiedSignal from '../../helpers/solid/createUnifiedSignal';
import setBlankToAnchor from '../../lib/richTextProcessor/setBlankToAnchor';
import liteMode from '../../helpers/liteMode';
import Icon from '../icon';
import {ChatReactionsMenu} from '../chat/reactionsMenu';
import setCurrentTime from '../../helpers/dom/setCurrentTime';
import ReactionElement from '../chat/reaction';
import blurActiveElement from '../../helpers/dom/blurActiveElement';
import apiManagerProxy from '../../lib/mtproto/mtprotoworker';
import reactionsEqual from '../../lib/appManagers/utils/reactions/reactionsEqual';
import wrapSticker from '../wrappers/sticker';
import createContextMenu from '../../helpers/dom/createContextMenu';
import {joinDeepPath} from '../../helpers/object/setDeepProperty';
import isTargetAnInput from '../../helpers/dom/isTargetAnInput';
import {setQuizHint} from '../poll';
import {attachClickEvent} from '../../helpers/dom/clickEvent';

export const STORY_DURATION = 5e3;
const STORY_HEADER_AVATAR_SIZE = 32;
const STORY_SCALE_SMALL = 0.33;
let CHANGELOG_PEER_ID = SERVICE_PEER_ID;

rootScope.addEventListener('app_config', (appConfig) => {
  const userId = appConfig.stories_changelog_user_id;
  CHANGELOG_PEER_ID = userId ? userId.toPeerId(false) : SERVICE_PEER_ID;
});

const x = new OverlayClickHandler(undefined, true);

const createCleaner = () => {
  const [clean, setClean] = createSignal(false);
  onCleanup(() => setClean(true));
  return clean;
};

export const createMiddleware = () => {
  const middleware = getMiddleware();
  onCleanup(() => middleware.destroy());
  return middleware;
};

const ButtonIconTsx = (props: {icon?: Icon, noRipple?: boolean} & JSX.HTMLAttributes<HTMLButtonElement>) => {
  const [, rest] = splitProps(props, ['icon', 'noRipple']);
  return (
    <button {...rest} class={classNames('btn-icon', props.class)} tabIndex={-1}>
      {props.icon ? Icon(props.icon) : props.children}
    </button>
  );
};

const MessageInputField = (props: {}) => {
  const inputField = new InputFieldAnimated({
    placeholder: 'PreviewSender.CaptionPlaceholder',
    name: 'message',
    withLinebreaks: true
  });

  inputField.input.classList.replace('input-field-input', 'input-message-input');
  inputField.inputFake.classList.replace('input-field-input', 'input-message-input');

  return (
    <div class="input-message-container">
      {inputField.input}
      {inputField.inputFake}
    </div>
  );
};

export function createListenerSetter() {
  const listenerSetter = new ListenerSetter();
  onCleanup(() => listenerSetter.removeAll());
  return listenerSetter;
}

const StorySlides = (props: {
  state: StoriesContextPeerState,
  index: Accessor<number>,
  currentStory: Accessor<StoryItem>,
  splitByDays?: boolean
}) => {
  let storyIndex: Accessor<number>, storiesForSlides: Accessor<StoryItem[]>;
  if(props.splitByDays) {
    const getStoryDateTimestamp = (storyItem: StoryItem.storyItem) => {
      const timestamp = storyItem.date;
      const date = new Date(timestamp * 1000);
      date.setHours(0, 0, 0);
      return date.getTime();
    };

    const storiesSplittedByDays = createMemo(() => {
      const stories = props.state.stories;
      const days: Record<number, StoryItem[]> = {};
      (stories as StoryItem.storyItem[]).forEach((story) => {
        const dateTimestamp = getStoryDateTimestamp(story);
        (days[dateTimestamp] ??= []).push(story);
      });
      return days;
    });

    storiesForSlides = createMemo(() => {
      const days = storiesSplittedByDays();
      const story = props.currentStory();
      const dateTimestamp = getStoryDateTimestamp(story as StoryItem.storyItem);
      return days[dateTimestamp];
    });

    storyIndex = createMemo(() => {
      const story = props.currentStory();
      const stories = storiesForSlides();
      // return props.state.index;
      return stories.indexOf(story);
    });
  } else {
    storiesForSlides = () => props.state.stories;
    storyIndex = () => props.state.index;
  }

  const slides = (
    <For each={storiesForSlides()}>
      {(_, i) => <StorySlide {...mergeProps(props, {slideIndex: i, storyIndex})} />}
    </For>
  );

  return slides;
};

const StorySlide = (props: {
  slideIndex: Accessor<number>,
  state: StoriesContextPeerState,
  storyIndex: Accessor<number>,
  index: Accessor<number>
}) => {
  const [progress, setProgress] = createSignal(0);
  const [stories] = useStories();

  const calculateAndSetProgress = () => {
    const elapsedTime = Date.now() - stories.startTime;
    const progress = elapsedTime / stories.storyDuration;
    setProgress(progress);
  };

  const onTick = () => {
    if(
      stories.peer !== props.state ||
      props.storyIndex() !== props.slideIndex() ||
      stories.paused
    ) {
      onPause();
      return false;
    }

    // if(stories.paused) {
    //   return true;
    // }

    calculateAndSetProgress();
    return true;
  };

  const onPause = () => {
    cancelAnimationByKey(ret);
  };

  const onPlay = () => {
    animateSingle(onTick, ret);
  };

  createEffect(() => { // on peer change
    if(stories.peer !== props.state) {
      onPause();
      return;
    }

    createEffect(on( // on story change
      () => [props.storyIndex(), props.slideIndex()],
      ([storyIndex, slideIndex]) => {
        const isActive = storyIndex === slideIndex;
        if(isActive) {
          setProgress(undefined);

          createEffect(() => { // on story toggle
            if(stories.paused || stories.buffering) {
              onPause();
            } else {
              onPlay();
            }
          });
        } else {
          onPause();
          setProgress(storyIndex > slideIndex ? 1 : undefined);
        }
      })
    );
  });

  const ret = (
    <div
      class={styles.ViewerStorySlidesSlide}
      // classList={{[styles.active]: index() > slideIndex()}}
      style={progress() !== undefined ? {'--progress': Math.min(100, progress() * 100) + '%'} : {}}
    />
  );

  return ret;
};

const DEFAULT_REACTION_EMOTICON = '❤';
const isDefaultReaction = (reaction: Reaction) => (reaction as Reaction.reactionEmoji)?.emoticon === DEFAULT_REACTION_EMOTICON;

const StoryInput = (props: {
  state: StoriesContextPeerState,
  currentStory: Accessor<StoryItem>,
  isActive: Accessor<boolean>,
  focusedSignal: Signal<boolean>,
  sendingReaction: Accessor<HTMLElement>,
  inputEmptySignal: Signal<boolean>,
  inputMenuOpenSignal: Signal<boolean>,
  isPublic: Accessor<boolean>,
  sendReaction: (reaction: Reaction, target: HTMLElement) => void,
  shareStory: () => void,
  reaction: Accessor<JSX.Element>,
  copyStoryLink: () => void,
  contextMenuOptions: Partial<Parameters<typeof createContextMenu>[0]>,
  onMessageSent: () => void
}) => {
  const [stories, actions] = useStories();
  const [focused, setFocused] = props.focusedSignal;
  const [inputEmpty, setInputEmpty] = props.inputEmptySignal;
  const [inputMenuOpen, setInputMenuOpen] = props.inputMenuOpenSignal;
  const [recording, setRecording] = createSignal(false);
  const middlewareHelper = createMiddleware();
  const middleware = middlewareHelper.get();

  createEffect(() => {
    const reaction = (props.currentStory() as StoryItem.storyItem).sent_reaction;
    if(!reaction) {
      return;
    }

    const target = untrack(() => props.sendingReaction());
    if(!target || target !== btnReactionEl) {
      return;
    }

    ReactionElement.fireAroundAnimation({
      middleware: createMiddleware().get(),
      reaction,
      sizes: {
        genericEffect: 26,
        genericEffectSize: 100,
        size: 22 + 18,
        effectSize: 80
      },
      stickerContainer: target,
      cache: target as any
    });
  });

  const chat = new Chat(appImManager, rootScope.managers, false, {elements: true, sharedMedia: true});
  chat.setType('stories');

  const onReactionClick = async() => {
    const story = props.currentStory() as StoryItem.storyItem;
    const isNewReaction = !story.sent_reaction;
    const reaction: Reaction = !isNewReaction ? undefined : {_: 'reactionEmoji', emoticon: DEFAULT_REACTION_EMOTICON};
    props.sendReaction(reaction, btnReactionEl);
  };

  let btnReactionEl: HTMLButtonElement;
  const btnReaction = (
    <ButtonIconTsx
      ref={btnReactionEl}
      onClick={onReactionClick}
      tabIndex={-1}
      class="btn-circle btn-reaction chat-input-secondary-button chat-secondary-button"
      noRipple={true}
    >
      {props.reaction()}
    </ButtonIconTsx>
  );

  const input = chat.input = new ChatInput(chat, appImManager, rootScope.managers, 'stories-input');
  input.noRipple = true;
  input.btnReaction = btnReactionEl;
  input.excludeParts = {
    replyMarkup: true,
    scheduled: true,
    downButton: true,
    reply: true,
    forwardOptions: true,
    mentionButton: true,
    attachMenu: true,
    commandsHelper: true,
    botCommands: true
  };
  input.globalMentions = true;
  input.getMiddleware = (...args) => middleware.create().get(...args);

  // const onMouseDown = (e: MouseEvent) => {
  //   if(
  //     focused() &&
  //     !findUpClassName(e.target, styles.ViewerStoryPrivacy) &&
  //     !findUpClassName(e.target, 'btn-icon') &&
  //     !findUpClassName(e.target, styles.small) &&
  //     !findUpAsChild(e.target as HTMLElement, input.emoticonsDropdown.getElement())
  //   ) {
  //     document.addEventListener('click', cancelEvent, {capture: true, once: true});
  //   }

  //   onFocusChange(false);
  // };

  const onClick = (e: MouseEvent) => {
    // if(!inputEmpty()) {
    //   return;
    // }

    const target = e.target as HTMLElement;
    const good = !findUpClassName(target, styles.ViewerStoryReactions) && (
      findUpClassName(target, styles.ViewerStory) ||
      target.classList.contains(styles.Viewer)
    );
    if(!good) {
      return;
    }

    cancelEvent(e);
    setFocused(false);
  };

  onCleanup(() => {
    if(navigationItem) {
      appNavigationController.removeItem(navigationItem);
      navigationItem = undefined;
    }
  });

  let navigationItem: NavigationItem;
  createEffect(
    on(
      () => focused(),
      (focused) => {
        if(focused) {
          playAfterFocus = !stories.paused;
          // document.addEventListener('mousedown', onMouseDown, {capture: true, once: true});
          document.addEventListener('click', onClick, {capture: true});
          appNavigationController.pushItem(navigationItem = {
            type: 'stories-focus',
            onPop: () => {
              setFocused(false);
            }
          });
        } else {
          // document.removeEventListener('mousedown', onMouseDown, {capture: true});
          document.removeEventListener('click', onClick, {capture: true});
          appNavigationController.removeItem(navigationItem);
          navigationItem = undefined;
        }

        actions.toggle(focused ? false : playAfterFocus);
        input.freezeFocused(focused);
        input.chatInput.classList.toggle('is-focused', focused);
        // input.setShrinking(!focused);
      }
    )
  );

  let playAfterFocus = false;
  input.onFocusChange = (_focused: boolean) => {
    if(input.emoticonsDropdown.isActive()) {
      return;
    }

    if(!_focused) {
      return;
    }

    setFocused(_focused);
  };

  let playAfter = false;
  const onMenuToggle = (open: boolean) => {
    if(open) {
      playAfter = !stories.paused;
    }

    actions.toggle(open ? false : playAfter);
    setInputMenuOpen(open);
  };
  input.onMenuToggle/*  = input.onRecording */ = onMenuToggle;
  input.construct();
  input.constructPeerHelpers();
  // input.setShrinking(true);
  // input.chatInput.classList.add(styles.hideOnSmall);
  // input.rowsWrapper.classList.add('night');
  input.messageInput.dataset.textColor = 'white';

  createEffect(() => {
    input.replyToStoryId = props.currentStory().id;
  });

  createEffect(() => {
    if(props.isActive()) {
      const onOpen = (): void => (onMenuToggle(true)/* , setFocused(true) */, undefined);
      const onClose = (): void => (onMenuToggle(false)/* , setFocused(false) */, undefined);
      emoticonsDropdown.addEventListener('open', onOpen);
      emoticonsDropdown.addEventListener('close', onClose);
      emoticonsDropdown.chatInput = input;

      onCleanup(() => {
        emoticonsDropdown.removeEventListener('open', onOpen);
        emoticonsDropdown.removeEventListener('close', onClose);
      });
    }
  });

  createEffect(() => {
    input.chatInput.classList.toggle('is-private', !props.isPublic());
    input.setCanForwardStory(props.isPublic());
  });

  createEffect(() => {
    const [_focused, _recording, isPublic] = [focused(), recording(), props.isPublic()];
    const isReactionButtonVisible = !_focused;
    const isMainButtonVisible = _focused ? true : isPublic;
    const isRecordingButtonVisible = _recording;
    const visibleButtons = Math.min(2, [
      isReactionButtonVisible,
      isMainButtonVisible,
      isRecordingButtonVisible
    ].reduce((acc, v) => acc + +v, 0));
    const chatInputSize = 48;
    const chatInputBtnSendMargin = 8;
    const focusOffset = 135;
    const width = stories.width - (chatInputSize + chatInputBtnSendMargin) * visibleButtons + (_focused ? focusOffset : 0);
    input.rowsWrapper.style.setProperty('width', width + 'px', 'important');
    input.chatInput.classList.toggle('is-focused', _focused);
  });

  chat.peerId = props.state.peerId;
  chat.onChangePeer({
    peerId: props.state.peerId,
    type: 'stories'
  }, middlewarePromise(middleware)).then(() => {
    chat.finishPeerChange({
      peerId: props.state.peerId,
      middleware
    });
  });

  onCleanup(() => {
    input.onFocusChange =
      input.onFileSelection =
      input.onMenuToggle =
      input.onRecording =
      input.onUpdateSendBtn =
      input.onMessageSent2 =
      input.forwardStoryCallback =
      undefined;
    middlewareHelper.destroy();
    chat.destroy();
  });

  input.onFileSelection = (promise) => {
    onMenuToggle(true);
    promise.finally(() => {
      onMenuToggle(false);
    });
  };

  input.onUpdateSendBtn = (icon) => {
    setInputEmpty(icon === 'record' || icon === 'forward');
  };

  input.onMessageSent2 = () => {
    blurActiveElement();
    setFocused(false);
    props.onMessageSent();
  };

  input.forwardStoryCallback = (e) => {
    const story = props.currentStory() as StoryItem.storyItem;
    if(story.pFlags.noforwards) {
      const {open} = createContextMenu({
        buttons: [{
          icon: 'copy',
          text: 'CopyLink',
          onClick: props.copyStoryLink
        }],
        listenTo: input.btnSendContainer,
        ...props.contextMenuOptions
      });
      open(e);
    } else {
      props.shareStory();
    }
  };

  input.onRecording = (recording) => {
    setRecording(recording);
  };

  return input.chatInput;
};

const JOINER = ' • ';

const KEEP_TOOLTIP = true;
const tooltipOverlayClickHandler = new OverlayClickHandler(undefined, true);
const showTooltip = ({
  element,
  container = element.parentElement,
  vertical,
  text,
  textElement,
  paddingX = 0,
  centerVertically,
  onClose
}: {
  element: HTMLElement,
  container?: HTMLElement,
  vertical: 'top' | 'bottom',
  text?: LangPackKey,
  textElement?: HTMLElement,
  paddingX?: number,
  centerVertically?: boolean,
  onClose?: () => void
}) => {
  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();

  const mountOn = document.body;
  let close: () => void;
  createRoot((dispose) => {
    const [getRect, setRect] = createSignal<DOMRect>();

    const getStyle = (): JSX.CSSProperties => {
      const css: JSX.CSSProperties = {
        'max-width': Math.min(containerRect.width - paddingX * 2, 320) + 'px'
      };

      const rect = getRect();
      if(!rect) {
        return css;
      }

      const minX = Math.min(containerRect.left + paddingX, containerRect.right);
      const maxX = Math.max(containerRect.left, containerRect.right - Math.min(containerRect.width, rect.width) - paddingX);

      const centerX = elementRect.left + (elementRect.width - rect.width) / 2;
      const left = clamp(centerX, minX, maxX);
      const verticalOffset = 12;
      if(vertical === 'top') css.top = (centerVertically ? elementRect.top + elementRect.height / 2 : elementRect.top) - rect.height - verticalOffset + 'px';
      else css.top = elementRect.bottom + verticalOffset + 'px';
      css.left = left + 'px';

      const notchCenterX = elementRect.left + (elementRect.width - 19) / 2;
      css['--notch-offset'] = notchCenterX - left + 'px';

      return css;
    };

    let div: HTMLDivElement;
    const tooltip = (
      <div
        ref={div}
        class={classNames('tooltip', 'tooltip-' + vertical)}
        style={getStyle()}
      >
        <div class="tooltip-part tooltip-background"></div>
        <span class="tooltip-part tooltip-notch"></span>
        <div class="tooltip-part tooltip-text">{textElement}</div>
      </div>
    );

    <Portal mount={mountOn}>
      {tooltip}
    </Portal>

    onMount(() => {
      setRect(div.getBoundingClientRect());
      div.classList.add('mounted');
      SetTransition({
        element: div,
        className: 'is-visible',
        duration: 200,
        useRafs: 2,
        forwards: true
      });
    });

    let closed = false;
    const onToggle = (open: boolean) => {
      if(open) {
        return;
      }

      closed = true;
      clearTimeout(timeout);
      SetTransition({
        element: div,
        className: 'is-visible',
        duration: 200,
        forwards: false,
        onTransitionEnd: () => {
          onClose?.();
          dispose();
        }
      });
    };

    close = () => {
      if(closed) {
        return;
      }

      tooltipOverlayClickHandler.close();
    };

    const timeout = KEEP_TOOLTIP ? 0 : window.setTimeout(close, 3000);

    tooltipOverlayClickHandler.open(mountOn);
    tooltipOverlayClickHandler.addEventListener('toggle', onToggle, {once: true});
  });

  return {close};
};

const Stories = (props: {
  state: StoriesContextPeerState,
  index: Accessor<number>,
  splitByDays?: boolean,
  pinned?: boolean,
  onReady?: () => void,
  close: (callback: () => void) => void
}) => {
  const avatar = AvatarNew({
    size: STORY_HEADER_AVATAR_SIZE,
    peerId: props.state.peerId,
    isDialog: false
  });
  avatar.node.classList.add(styles.ViewerStoryHeaderAvatar);
  const isMe = rootScope.myId === props.state.peerId;
  const peerTitle = !isMe && new PeerTitle();
  let peerTitleElement: HTMLElement;
  if(peerTitle) {
    peerTitle.update({peerId: props.state.peerId, dialog: false});
    peerTitleElement = peerTitle.element;
  } else {
    peerTitleElement = i18n('YourStory');
  }

  peerTitleElement.classList.add(styles.ViewerStoryHeaderName);

  const bindOnAnyPopupClose = (wasPlaying = !stories.paused) => () => onAnyPopupClose(wasPlaying);
  const onAnyPopupClose = (wasPlaying: boolean) => {
    if(wasPlaying) {
      actions.play();
    }
  };

  const onShareClick = (wasPlaying = !stories.paused) => {
    actions.pause();
    const popup = PopupPickUser.createSharingPicker(async(peerId) => {
      const storyPeerId = props.state.peerId;
      const inputUser = await rootScope.managers.appUsersManager.getUserInput(storyPeerId.toUserId());
      rootScope.managers.appMessagesManager.sendOther(
        peerId,
        {
          _: 'inputMediaStory',
          id: currentStory().id,
          user_id: inputUser
        }
      );

      showMessageSentTooltip(
        i18n(peerId === rootScope.myId ? 'StorySharedToSavedMessages' : 'StorySharedTo', [await wrapPeerTitle({peerId})])
      );
    });

    popup.addEventListener('closeAfterTimeout', bindOnAnyPopupClose(wasPlaying));
  };

  const avatarInfo = AvatarNew({
    size: 162/* 54 */,
    peerId: props.state.peerId,
    isDialog: false,
    withStories: true,
    storyColors: {
      read: 'rgba(255, 255, 255, .3)'
    }
  });
  avatarInfo.node.classList.add(styles.ViewerStoryInfoAvatar);
  let peerTitleInfoElement: HTMLElement;
  if(isMe) {
    peerTitleInfoElement = i18n('MyStory');
  } else {
    const peerTitleInfo = new PeerTitle();
    peerTitleInfo.update({peerId: props.state.peerId, dialog: false, onlyFirstName: true});
    peerTitleInfoElement = peerTitleInfo.element;
  }
  peerTitleInfoElement.classList.add(styles.ViewerStoryInfoName);

  const [stories, actions] = useStories();
  const [content, setContent] = createSignal<JSX.Element>();
  const [videoDuration, setVideoDuration] = createSignal<number>();
  const [caption, setCaption] = createSignal<JSX.Element>();
  const [reaction, setReaction] = createSignal<JSX.Element>();
  const [captionOpacity, setCaptionOpacity] = createSignal(0);
  const [captionActive, setCaptionActive] = createSignal(false);
  const [date, setDate] = createSignal<{timestamp: number, edited?: boolean}>();
  const [loading, setLoading] = createSignal(false);
  const focusedSignal = createSignal(false);
  const sendingReactionSignal = createSignal<HTMLElement>();
  const inputEmptySignal = createSignal(true);
  const inputMenuOpenSignal = createSignal(false);
  const isPublicSignal = createSignal(false);
  const [focused, setFocused] = focusedSignal;
  const [sendingReaction, setSendingReaction] = sendingReactionSignal;
  const [inputEmpty] = inputEmptySignal;
  const [inputMenuOpen] = inputMenuOpenSignal;
  const [isPublic, setIsPublic] = isPublicSignal;
  const [noSound, setNoSound] = createSignal(false);
  const [sliding, setSliding] = createSignal(false);
  const [privacyType, setPrivacyType] = createSignal<StoryPrivacyType>();
  const [mediaAreas, setMediaAreas] = createSignal<JSX.Element>();
  const [stackedAvatars, setStackedAvatars] = createSignal<StackedAvatars>();
  const [tooltipCloseCallback, setTooltipCloseCallback] = createSignal<VoidFunction>();
  const [reactionsMenu, setReactionsMenu] = createSignal<ChatReactionsMenu>();
  const currentStory = createMemo(() => props.state.stories[props.state.index]);
  const isExpired = createMemo(() => {
    const story = currentStory();
    const expireDate = (story as StoryItem.storyItem).expire_date;
    if(!expireDate) return false;
    return expireDate <= tsNow(true);
  });
  const isActive = createMemo(() => stories.peer === props.state);

  const sendReaction = async(reaction: Reaction | Promise<Reaction>, target: HTMLElement) => {
    const peerId = props.state.peerId;
    const story = currentStory() as StoryItem.storyItem;
    const storyId = story.id;
    const sentReaction = story.sent_reaction;

    // * wait for picker
    if(reaction instanceof Promise) {
      reaction = await reaction;
      if(!reaction) {
        return;
      }
    }

    const isNewReaction = !reactionsEqual(sentReaction, reaction);
    if(!isNewReaction) {
      reaction = undefined;
    }

    setFocused(false);
    setSendingReaction(target);
    await rootScope.managers.acknowledged.appStoriesManager.sendReaction(peerId, storyId, reaction as Reaction);
    setSendingReaction();
  };

  const createReactionsMenu = () => {
    const [inited, setInited] = createSignal(false);
    const middleware = createMiddleware().get();
    const menu = new ChatReactionsMenu({
      managers: rootScope.managers,
      type: 'horizontal',
      middleware,
      onFinish: (reaction) => sendReaction(reaction, storyDiv),
      size: 36,
      openSide: 'top',
      getOpenPosition: () => undefined,
      noMoreButton: true
    });

    menu.widthContainer.classList.add(styles.ViewerStoryReactions);

    menu.init().finally(() => {
      setInited(true);
    });

    let timeout: number;
    createEffect(() => {
      if(!inited()) {
        return;
      }

      const isVisible = shouldMenuBeVisible();
      menu.widthContainer.classList.toggle('is-visible', isVisible);

      if(!isVisible) {
        timeout = window.setTimeout(() => {
          setReactionsMenu();
          menu.cleanup();
        }, liteMode.isAvailable('animations') ? 200 : 0);
      } else {
        clearTimeout(timeout);
      }
    });

    setReactionsMenu(menu);
  };

  const shouldMenuBeVisible = () => focused() && inputEmpty() && !inputMenuOpen();
  const haveToCreateMenu = createMemo(() => {
    return reactionsMenu() ? true : shouldMenuBeVisible();
  });

  createEffect(() => {
    if(haveToCreateMenu()) {
      createReactionsMenu();
    }
  });

  const setVideoListeners = (video: HTMLVideoElement) => {
    let cleaned = false;
    onCleanup(() => {
      cleaned = true;
      video.pause();
      // video.src = '';
      // video.load();
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('canplay', onCanPlay);
    });

    const onCanPlay = () => {
      setLoading(false);
      if(isActive()) {
        actions.setBuffering(false);
      }
    };

    const onWaiting = () => {
      const loading = video.networkState === video.NETWORK_LOADING;
      const isntEnoughData = video.readyState < video.HAVE_FUTURE_DATA;

      if(loading && isntEnoughData) {
        setLoading(true);
        if(isActive()) {
          actions.setBuffering(true);
        }
        video.addEventListener('canplay', onCanPlay, {once: true});
      }
    };

    video.addEventListener('waiting', onWaiting);

    onCleanup(() => {
      if(stories.buffering) {
        actions.setBuffering(false);
      }
    });

    // pause the video on viewer pause or story change
    createEffect(() => {
      if(stories.paused || !isActive()) {
        video.pause();
      } else {
        video.play();
      }
    });

    const reset = () => {
      setCurrentTime(video, 0);
    };

    // seek to start on story change
    createEffect(on(
      () => [/* props.state.index,  */isActive()],
      ([/* index,  */isActive]) => {
        if(isActive) {
          return;
        }

        reset();
      }
    ));

    const story = untrack(() => currentStory());
    createEffect(() => {
      if(isActive() && !stories.startTime && currentStory() === story) {
        reset();
      }
    });

    createEffect(() => {
      video.muted = stories.muted;
    });

    apiManagerProxy.getState().then((state) => {
      if(!cleaned && !state.seenTooltips.storySound) {
        runWithOwner(owner, () => {
          const playingMemo = createMemo((prev) => prev || (isActive() && stories.startTime));
          createEffect(() => {
            if(playingMemo()) {
              const {close} = showTooltip({
                ...muteTooltipOptions,
                textElement: i18n('Story.SoundTooltip')
              });
              setTooltipCloseCallback(() => close);
            }
          });
        });

        rootScope.managers.appStateManager.setByKey(joinDeepPath('seenTooltips', 'storySound'), true);
      }
    });

    const owner = getOwner();
  };

  const setStory = async(story: StoryItem) => {
    setLoading(true);
    if(story._ !== 'storyItem') {
      setContent();
      rootScope.managers.appStoriesManager.getStoryById(props.state.peerId, story.id);
      return;
    }

    const middleware = createMiddleware().get();
    const uStackedAvatars = isMe ? createUnifiedSignal<StackedAvatars>() : undefined;
    const uCaption = createUnifiedSignal<JSX.Element>();
    const uContent = createUnifiedSignal<JSX.Element>();
    const uReaction = createUnifiedSignal<JSX.Element>();
    const recentViewersMemo = isMe ? createMemo<UserId[]>((previousRecentViewers) => {
      const views = story.views;
      const recentViewers = views?.recent_viewers;
      if(previousRecentViewers?.join() === recentViewers?.join()) {
        return previousRecentViewers;
      }
      return recentViewers;
    }) : undefined;

    const setStoryMeta = () => {
      let privacyType = getStoryPrivacyType(story);
      if(/* !isMe &&  */privacyType === 'public') {
        privacyType = undefined;
      }

      const messageMedia = unwrap(story.media);
      const document = (messageMedia as MessageMedia.messageMediaDocument).document as Document.document;
      const videoAttribute = document && document.attributes.find((attribute) => attribute._ === 'documentAttributeVideo') as DocumentAttribute.documentAttributeVideo;
      const noSound = videoAttribute ? !!videoAttribute.pFlags.nosound : false;
      const videoDuration = videoAttribute?.duration;
      const date = story.date;
      const edited = story.pFlags.edited;
      const isPublic = !!story.pFlags.public;
      const mediaAreas = story.media_areas && (
        <For each={story.media_areas}>
          {(mediaArea) => {
            const {x, y, w, h, rotation} = mediaArea.coordinates;
            const geoPoint = (mediaArea as MediaArea.mediaAreaGeoPoint).geo as GeoPoint.geoPoint;
            const playingMemo = createMemo((prev) => prev || (isActive() && stories.startTime));
            let div: HTMLDivElement;
            return (
              <div
                ref={div}
                class={classNames(styles.ViewerStoryMediaArea, playingMemo() && 'shimmer', 'shimmer-bright', 'shimmer-once')}
                style={`left: ${x}%; top: ${y}%; width: ${w}%; height: ${h}%; --rotate: ${rotation}deg`}
                onClick={(e) => {
                  if(!isActive()) return;
                  cancelEvent(e);

                  const href = 'https://maps.google.com/maps?q=' + geoPoint.lat + ',' + geoPoint.long;

                  let a: HTMLAnchorElement, ignoreClickEvent = false, hasPopup: boolean;
                  const aa = (
                    <a
                      ref={a}
                      href={href}
                      onClick={async(e) => {
                        if(ignoreClickEvent) {
                          ignoreClickEvent = false;
                          return;
                        }

                        hasPopup = true;
                        cancelEvent(e);
                        try {
                          await confirmationPopup({
                            descriptionLangKey: 'Popup.OpenInGoogleMaps',
                            button: {
                              langKey: 'Open'
                            }
                          });
                        } catch(err) {
                          if(wasPlaying) {
                            actions.play();
                          }

                          return;
                        }

                        ignoreClickEvent = true;
                        a.click();
                      }}
                    >
                      {i18n('StoryViewLocation')}
                    </a>
                  );
                  setBlankToAnchor(a);
                  const wasPlaying = !stories.paused;
                  actions.pause();
                  const {close} = showTooltip({
                    element: div,
                    vertical: 'top',
                    textElement: a,
                    centerVertically: !!rotation,
                    onClose: () => {
                      if(hasPopup) {
                        hasPopup = false;
                        return;
                      }

                      if(wasPlaying) {
                        actions.play();
                      }
                    }
                  });
                  setTooltipCloseCallback(() => close);
                }}
              />
            );
          }}
        </For>
      );

      setMediaAreas(mediaAreas);
      setPrivacyType(privacyType);
      setDate({timestamp: date, edited});
      setNoSound(noSound);
      setVideoDuration(videoDuration && (videoDuration * 1000));
      setIsPublic(isPublic);
      // shareButton.classList.toggle('hide', !isPublic);
    };

    isMe && createEffect(async() => {
      let stackedAvatars: StackedAvatars;
      const recentViewers = recentViewersMemo();
      if(recentViewers?.length) {
        stackedAvatars = new StackedAvatars({
          avatarSize: 30,
          middleware
        });

        const peerIds = recentViewers.map((userId) => {
          return userId.toPeerId(false);
        });

        uStackedAvatars(null);
        await stackedAvatars.render(peerIds);
        if(!middleware()) {
          return;
        }
      }

      uStackedAvatars(stackedAvatars);
    });

    createEffect(async() => {
      let captionNode: JSX.Element;
      const {caption, entities} = story;
      if(caption?.trim()) {
        const loadPromises: Promise<any>[] = [];
        const {message, totalEntities} = wrapMessageEntities(caption, entities?.slice());
        const wrapped = wrapRichText(message, {
          entities: totalEntities,
          middleware,
          textColor: 'white',
          loadPromises
        });

        uCaption(null);
        await Promise.all(loadPromises);
        if(!middleware()) {
          return;
        }

        captionNode = documentFragmentToNodes(wrapped);
      }

      uCaption(captionNode);
    });

    createEffect(() => {
      const media = untrack(() => getMediaFromMessage(story));
      const mediaId = media.id;
      if(!mediaId) {
        uContent();
        return;
      }

      uContent(null);

      const wrapped = wrapStoryMedia({
        peerId: props.state.peerId,
        storyItem: unwrap(story),
        forViewer: true,
        childrenClassName: styles.ViewerStoryContentMedia,
        useBlur: 6
      });

      const onReady = () => {
        uContent(wrapped.container);
      };

      const onLoad = () => {
        if(!middleware()) {
          return;
        }

        setLoading(false);
        untrack(() => playOnOpen());
        // props.onReady?.();
      };

      const onMedia = () => {
        const media = wrapped.media();

        if(media instanceof HTMLVideoElement) {
          setVideoListeners(media);
          onMediaLoad(media).then(onLoad);
        } else {
          onLoad();
        }
      };

      createReaction(onReady)(() => wrapped.ready());
      createReaction(onMedia)(() => wrapped.media());
    });

    createEffect(async() => {
      let reactionNode: JSX.Element;
      const sentReaction = story.sent_reaction;
      const isDefault = isDefaultReaction(sentReaction);
      if(!sentReaction || isDefault) {
        reactionNode = Icon('reactions_filled', ...['btn-reaction-icon', isDefault && 'btn-reaction-default'].filter(Boolean));
      } else {
        let doc: Document.document;
        const isCustomEmoji = sentReaction._ === 'reactionCustomEmoji';
        const middleware = createMiddleware().get();
        uReaction(null);
        if(isCustomEmoji) {
          const result = await rootScope.managers.acknowledged.appEmojiManager.getCustomEmojiDocument(sentReaction.document_id);
          if(!middleware()) return;
          if(!result.cached) {
            uReaction();
          }

          doc = await result.result;
        } else {
          const result = apiManagerProxy.getAvailableReactions();
          if(result instanceof Promise) {
            uReaction();
          }
          const availableReactions = await result;
          if(!middleware()) return;
          const availableReaction = availableReactions.find((availableReaction) => reactionsEqual(sentReaction, availableReaction));
          doc = /* availableReaction.center_icon ??  */availableReaction.static_icon;
        }

        const div = document.createElement('div');
        div.classList.add('btn-reaction-sticker');
        const loadPromises: Promise<any>[] = [];
        await wrapSticker({
          div,
          doc,
          width: 26,
          height: 26,
          play: false,
          isCustomEmoji,
          textColor: 'white',
          middleware,
          loadPromises
        });

        await Promise.all(loadPromises);
        if(!middleware()) return;
        reactionNode = div;
      }

      uReaction(reactionNode);
    });

    createEffect(
      on(
        () => [uStackedAvatars?.(), uCaption(), uContent(), uReaction?.()] as const,
        ([stackedAvatars, caption, content, reaction]) => {
          if(stackedAvatars === null || caption === null || content === null || reaction === null) {
            return;
          }

          setStackedAvatars(stackedAvatars);
          setCaption(caption);
          setContent(content);
          setReaction(reaction);
          props.onReady?.();

          createEffect(() => {
            setStoryMeta();
          });
        },
        {defer: true}
      )
    );
  };

  createEffect(() => { // on story change
    const story = currentStory();
    setCaptionOpacity(0);
    setCaptionActive(false);

    createEffect(() => {
      setStory(story);
    });
    // createEffect(on( // on story update
    //   () => story._,
    //   () => {
    //     setStory(unwrap(story), hasViewer);
    //   }
    // ));
  });

  const pollViewedStories = () => {
    if(!pollViewedStoriesSet.size) {
      return;
    }

    const ids = Array.from(pollViewedStoriesSet);
    pollViewedStoriesSet.clear();
    rootScope.managers.appStoriesManager.getStoriesById(props.state.peerId, ids, true);
  };
  const pollViewedStoriesSet: Set<number> = new Set();
  let pollViewedStoriesInterval: number;
  createEffect(() => {
    if(isActive()) {
      pollViewedStoriesInterval = window.setInterval(pollViewedStories, 60e3);

      createEffect(() => {
        pollViewedStoriesSet.add(currentStory().id);
      });
    } else {
      clearInterval(pollViewedStoriesInterval);
    }
  });

  const readStories = (maxId: number) => {
    if(viewedStories.size) {
      rootScope.managers.appStoriesManager.incrementStoryViews(props.state.peerId, Array.from(viewedStories));
      viewedStories.clear();
    }

    rootScope.managers.appStoriesManager.readStories(props.state.peerId, maxId);
  };

  const viewedStories: Set<number> = new Set();
  const readDebounced = debounce(readStories, 5e3, true, true);
  createEffect(() => { // read stories
    if(!isActive()) {
      return;
    }

    let lastId: number;
    createEffect(() => {
      const story = currentStory();
      if(props.pinned && untrack(() => isExpired())) viewedStories.add(story.id);
      readDebounced(lastId = story.id);
    });

    onCleanup(() => {
      if(!readDebounced.isDebounced()) {
        return;
      }

      readDebounced.clearTimeout();
      readStories(lastId);
    });
  });

  const playOnOpen = () => {
    if(!stories.hasViewer || untrack(() => !isActive())) {
      return;
    }

    playOnReady();
  };

  createEffect(playOnOpen) // play on open

  const slides = <StorySlides {...mergeProps(props, {currentStory})} />;

  const calculateTranslateX = () => {
    const diff = props.index() - stories.index;
    const storyWidth = stories.width;
    const MARGIN = 40;
    const multiplier = diff > 0 ? 1 : -1;
    const smallStoryWidth = storyWidth * STORY_SCALE_SMALL;
    let offset = storyWidth * multiplier;
    const distance = (storyWidth - smallStoryWidth) / 2 - MARGIN;
    offset = (storyWidth - distance) * multiplier;
    if(Math.abs(diff) !== 1) {
      const d = diff - 1 * multiplier;
      offset += d * smallStoryWidth + MARGIN * d;
    }
    return offset + 'px';
  };

  const playOnReady = () => {
    if(untrack(() => loading())) {
      return;
    }

    const activeVideoDuration = untrack(() => videoDuration());
    // * add 0.001 just to differ video and photo stories
    const storyDuration = activeVideoDuration ? activeVideoDuration + 0.001 : STORY_DURATION;
    actions.play(storyDuration);
  };

  // let transitionPromise: CancellablePromise<void>;
  const onTransitionStart = (e?: TransitionEvent) => {
    if(e && e.target !== div) {
      return;
    }

    setSliding(true);
    // transitionPromise = deferredPromise();
  };

  const onTransitionEnd = (e?: TransitionEvent) => {
    if(e && e.target !== div) {
      return;
    }

    setSliding(false);
    // transitionPromise?.resolve();
    if(!isActive()) {
      return;
    }

    playOnReady();
  };

  const toggleMute = (e: MouseEvent) => {
    if(noSound()) {
      const {close} = showTooltip({
        ...muteTooltipOptions,
        textElement: i18n('Story.NoSound')
      });
      setTooltipCloseCallback(() => close);
      return;
    }

    actions.toggleMute();
  };

  let muteButtonButton: HTMLButtonElement;
  const muteButton = (
    <ButtonIconTsx
      ref={muteButtonButton}
      classList={{[styles.noSound]: noSound()}}
      icon={stories.muted || noSound() ? 'speakerofffilled' : 'speakerfilled'}
      onClick={toggleMute}
    />
  );

  const copyLink = () => {
    copyTextToClipboard(`https://t.me/${getPeerActiveUsernames(user)[0]}/s/${currentStory().id}`);
    toastNew({
      langPackKey: 'LinkCopied'
    });
  };

  const topMenuOptions: Partial<Parameters<typeof createContextMenu>[0]> = {
    onOpenBefore: async() => {
      user = await rootScope.managers.appUsersManager.getUser(props.state.peerId.toUserId());
    },
    onOpen: () => {
      wasPlaying = !stories.paused;
      actions.pause();
    },
    onCloseAfter: () => {
      if(wasPlaying && !ignoreOnClose) {
        actions.play();
      }

      ignoreOnClose = false;
    }
  };

  // * caption start

  const CAPTION_ACTIVE_THRESHOLD = 0.2;
  createEffect(() => {
    if(!isActive()) {
      return;
    }

    actions.setLoop(videoDuration() !== undefined && captionActive());
  });

  let wasPlayingBeforeCaption: boolean;
  const onCaptionScrollTop = (scrollTop: number) => {
    const progress = Math.min(1, scrollTop / 100);
    const active = progress >= CAPTION_ACTIVE_THRESHOLD;
    setCaptionOpacity(progress);
    setCaptionActive(active);
    // console.log('caption progress', progress);

    if(videoDuration() !== undefined) {
      return;
    }

    if(active) {
      if(wasPlayingBeforeCaption === undefined) {
        wasPlayingBeforeCaption = !stories.paused;
        actions.pause();
      }
    } else if(wasPlayingBeforeCaption) {
      wasPlayingBeforeCaption = undefined;
      actions.play();
    }
  };

  let captionScrollable: HTMLDivElement, captionText: HTMLDivElement, scrolling = false;
  const onCaptionScroll = () => {
    if(scrolling) {
      return;
    }

    const scrollTop = captionScrollable.scrollTop;
    onCaptionScrollTop(scrollTop);
  };

  const scrollPath = (path: number) => {
    const target = Math.max(0, path);
    const startTime = Date.now();
    scrolling = true;

    const story = currentStory();
    animateSingle(() => {
      if(currentStory() !== story) {
        return false;
      }

      const t = Math.min(1, (Date.now() - startTime) / 300);
      const value = easeOutCubicApply(t, 1);
      const currentPath = path * (1 - value);
      const scrollTop = Math.round(target - currentPath);
      captionScrollable.scrollTop = scrollTop;
      onCaptionScrollTop(scrollTop);

      return t < 1;
    }, captionScrollable).finally(() => {
      scrolling = false;
    });
  };

  const onCaptionClick = (e: MouseEvent) => {
    if((captionScrollable.scrollHeight <= captionScrollable.clientHeight) || captionScrollable.scrollTop) {
      return;
    }

    cancelEvent(e);
    const visibleTextHeight = captionScrollable.clientHeight - captionScrollable.clientWidth * 0.7 - 8;
    const path = Math.min(captionText.scrollHeight - visibleTextHeight, captionScrollable.clientHeight - 60);
    scrollPath(path);
  };

  const captionContainer = (
    <div
      ref={captionScrollable}
      class={classNames('scrollable', 'scrollable-y', 'no-scrollbar', styles.ViewerStoryCaption)}
      onScroll={onCaptionScroll}
    >
      <div
        ref={captionText}
        class={classNames('spoilers-container', styles.ViewerStoryCaptionText)}
        onClick={onCaptionClick}
      >
        <div class={styles.ViewerStoryCaptionTextCell}>
          {caption()}
        </div>
      </div>
    </div>
  );

  // * caption end

  const contentItem = (
    <div
      class={styles.ViewerStoryContentItem}
      style={captionOpacity() && {opacity: 1 - captionOpacity() * 0.5}}
    >
      {content()}
      {mediaAreas()}
    </div>
  );

  const getDateText = () => {
    const {timestamp, edited} = date() || {};
    if(!timestamp) {
      return;
    }

    const elapsedTime = tsNow(true) - timestamp;
    const formatted = formatDuration(elapsedTime);
    const map: {[type in DurationType]?: LangPackKey} = {
      [DurationType.Seconds]: 'StoryJustNow',
      [DurationType.Minutes]: 'MinutesShortAgo',
      [DurationType.Hours]: 'HoursShortAgo'
      // [DurationType.Days]: 'DaysShortAgo'
    };

    // if(formatted[0].type === DurationType.Seconds) {
    //   formatted[0] = {
    //     type: DurationType.Minutes,
    //     duration: 0
    //   };
    // }

    const first = formatted[0];
    const key = map[first.type];
    const elements: (Node | string | (Node | string)[])[] = [];
    if(!key) {
      // return formatFullSentTime(timestamp);
      // elements.push(getFullDate(new Date(timestamp * 1000), {shortYear: true}));
      elements.push(<span>{documentFragmentToNodes(formatFullSentTime(timestamp))}</span> as any);
    } else if(first.type === DurationType.Days && first.duration !== 1) {
      elements.push(formatDateAccordingToTodayNew(new Date(timestamp * 1000)));
    } else {
      elements.push(i18n(key, [first.duration]));
    }

    if(edited) {
      elements.push(i18n('EditedMessage'));
    }

    return joinElementsWith(elements, JOINER);
  };

  const showMessageSentTooltip = (textElement: HTMLElement, peerId?: PeerId) => {
    let a: HTMLAnchorElement;
    if(peerId) {
      a = document.createElement('a');
      a.href = '#';
      a.addEventListener('click', (e) => {
        cancelEvent(e);
        props.close(() => {
          appImManager.setInnerPeer({peerId});
        });
      }, {capture: true, passive: false});
      a.append(i18n('ViewInChat'));
    }

    setQuizHint({
      textElement,
      textRight: a,
      appendTo: storyDiv,
      from: 'bottom',
      duration: 3000,
      icon: 'checkround_filled'
    });
  };

  const storyInput = props.state.peerId !== CHANGELOG_PEER_ID &&
    props.state.peerId !== rootScope.myId &&
    <StoryInput
      {
        ...mergeProps(props, {
          currentStory,
          isActive,
          focusedSignal,
          sendingReaction,
          inputEmptySignal,
          inputMenuOpenSignal,
          sendReaction,
          isPublic,
          shareStory: onShareClick,
          reaction,
          copyStoryLink: copyLink,
          contextMenuOptions: topMenuOptions,
          onMessageSent: () => {
            showMessageSentTooltip(i18n('Story.Tooltip.MessageSent'), props.state.peerId);
          }
        })
      }
    />;

  // * top menu start

  const isPeerArchived = async(visible: boolean) => {
    const peerId = props.state.peerId;
    if(peerId === rootScope.myId || peerId === CHANGELOG_PEER_ID) {
      return false;
    }

    const userId = peerId.toUserId();
    const [user, isContact] = await Promise.all([
      rootScope.managers.appUsersManager.getUser(userId),
      rootScope.managers.appUsersManager.isContact(userId)
    ]);
    const isHidden = !!user.pFlags.stories_hidden;
    return (visible ? !isHidden : isHidden) && isContact;
  };

  const togglePeerHidden = async(hidden: boolean) => {
    const peerId = props.state.peerId;
    rootScope.managers.appStoriesManager.toggleStoriesHidden(peerId, hidden);
    toastNew({
      langPackKey: hidden ? 'StoriesMovedToContacts' : 'StoriesMovedToDialogs',
      langPackArguments: [await wrapPeerTitle({peerId})]
    });
  };

  let wasPlaying = false, user: User.user, ignoreOnClose = false;
  const btnMenu = ButtonMenuToggle({
    buttons: [{
      icon: 'plusround',
      text: 'Story.AddToProfile',
      onClick: () => {
        rootScope.managers.appStoriesManager.togglePinned(currentStory().id, true).then(() => {
          toastNew({langPackKey: 'StoryPinnedToProfile'});
        });
      },
      verify: () => {
        const story = currentStory() as StoryItem.storyItem;
        return props.state.peerId === rootScope.myId && !story.pFlags?.pinned;
      }
    }, {
      icon: 'crossround',
      text: 'Story.RemoveFromProfile',
      onClick: () => {
        rootScope.managers.appStoriesManager.togglePinned(currentStory().id, false).then(() => {
          toastNew({langPackKey: 'StoryArchivedFromProfile'});
        });
      },
      verify: () => {
        const story = currentStory() as StoryItem.storyItem;
        return props.state.peerId === rootScope.myId && !!story.pFlags?.pinned;
      }
    }, {
      icon: 'forward',
      text: 'ShareFile',
      onClick: () => {
        ignoreOnClose = true;
        onShareClick(wasPlaying);
      },
      verify: () => {
        const story = currentStory();
        return !!(story as StoryItem.storyItem)?.pFlags?.public && !(story as StoryItem.storyItem).pFlags.noforwards;
      }
    }, {
      icon: 'copy',
      text: 'CopyLink',
      onClick: copyLink,
      verify: () => {
        const story = currentStory();
        if(story._ !== 'storyItem') {
          return false;
        }

        // const appConfig = await rootScope.managers.apiManager.getAppConfig();
        return (story.pFlags.public/*  || appConfig.stories_export_nopublic_link */) && !!getPeerActiveUsernames(user)[0];
      }
    }, {
      icon: 'download',
      text: 'MediaViewer.Context.Download',
      onClick: () => {
        const story = currentStory();
        const media = getMediaFromMessage(story as StoryItem.storyItem, true);
        if(!media) {
          return;
        }
        appDownloadManager.downloadToDisc({media: unwrap(media)});
      },
      verify: () => {
        if(props.state.peerId === rootScope.myId) {
          return true;
        }

        const story = currentStory();
        return !!(story?._ === 'storyItem' && !story.pFlags.noforwards && rootScope.premium);
      }
    }, {
      icon: 'archive',
      text: 'ArchivePeerStories',
      onClick: () => togglePeerHidden(true),
      verify: () => isPeerArchived(true)
    }, {
      icon: 'unarchive',
      text: 'UnarchiveStories',
      onClick: () => togglePeerHidden(false),
      verify: () => isPeerArchived(false)
    }, {
      icon: 'delete danger' as Icon,
      text: 'Delete',
      onClick: async() => {
        const id = currentStory().id;
        ignoreOnClose = true;
        const onAnyPopupClose = bindOnAnyPopupClose(wasPlaying);
        try {
          await confirmationPopup({
            titleLangKey: 'DeleteStoryTitle',
            descriptionLangKey: 'DeleteStorySubtitle',
            button: {
              langKey: 'Delete',
              isDanger: true
            }
          });
        } catch(err) {
          onAnyPopupClose();
          return;
        }

        rootScope.managers.appStoriesManager.deleteStories([id]);
      },
      verify: () => props.state.peerId === rootScope.myId
    }, {
      icon: 'flag',
      className: 'danger',
      text: 'ReportChat',
      onClick: () => {
        ignoreOnClose = true;
        const onAnyPopupClose = bindOnAnyPopupClose(wasPlaying);
        PopupElement.createPopup(
          PopupReportMessages,
          props.state.peerId,
          [currentStory().id],
          onAnyPopupClose,
          true
        );
      },
      verify: () => props.state.peerId !== rootScope.myId && props.state.peerId !== CHANGELOG_PEER_ID
      // separator: true
    }],
    direction: 'bottom-left',
    ...topMenuOptions
  });
  btnMenu.classList.add('night');

  // * top menu end

  // * privacy icon start

  const privacyIconMap: {[key in StoryPrivacyType]: Icon} = {
    close: 'star_filled',
    contacts: 'newprivate_filled',
    public: 'newchannel_filled',
    selected: 'newgroup_filled'
  };

  const onPrivacyIconClick = async() => {
    const type = privacyType();
    const peerTitle = await wrapPeerTitle({peerId: props.state.peerId, onlyFirstName: true});
    const {close} = showTooltip({
      container: headerDiv,
      element: privacyIconElement,
      vertical: 'bottom',
      textElement: i18n(
        type === 'close' ? 'StoryCloseFriendsHint' : (type === 'selected' ? 'StorySelectedContactsHint' : 'StoryContactsHint'),
        [peerTitle]
      ),
      paddingX: 13
    });

    setTooltipCloseCallback(() => close);
  };

  createEffect(() => {
    const close = tooltipCloseCallback();
    if(!close) {
      return;
    }

    onCleanup(close);

    createEffect(
      on(
        () => [isActive(), currentStory()],
        () => {
          close();
          setTooltipCloseCallback();
        },
        {defer: true}
      )
    );
  });

  let privacyIconElement: HTMLDivElement;
  const privacyIcon = (
    <div
      ref={privacyIconElement}
      class={classNames(
        styles.ViewerStoryPrivacy,
        'privacy-bg',
        `privacy-bg-${privacyType()}`
      )}
      onClick={() => onPrivacyIconClick()}
    >
      {Icon(privacyIconMap[privacyType()])}
    </div>
  );

  // * privacy icon end

  // * my footer start

  const getViews = isMe && (() => {
    const story = currentStory();
    if(story._ !== 'storyItem') {
      return;
    }

    const viewsCount = story.views?.views_count ?? 0;
    if(!viewsCount) {
      const isExpired = story.expire_date <= tsNow(true);
      if(isExpired) {
        return i18n('NobodyViewsArchived');
      } else {
        return i18n('NobodyViews');
      }
    } else {
      return i18n('Views', [viewsCount]);
    }
  });

  const openViewsList = isMe && (() => {
    let nextOffset: string;
    const viewsMap: Map<PeerId, StoryView> = new Map();
    const popup: PopupPickUser = PopupElement.createPopup(
      PopupPickUser,
      {
        peerType: ['custom'],
        getMoreCustom: (q) => {
          const loadCount = 50;
          return rootScope.managers.appStoriesManager.getStoryViewsList(
            currentStory().id,
            loadCount,
            nextOffset,
            q
          ).then(({count, nextOffset: _nextOffset, views}) => {
            nextOffset = _nextOffset;
            return {
              result: views.map((storyView) => {
                const peerId = storyView.user_id.toPeerId(false);
                viewsMap.set(peerId, storyView);
                return peerId;
              }),
              isEnd: !nextOffset
            };
          });
        },
        processElementAfter: (peerId, dialogElement) => {
          const view = viewsMap.get(peerId);
          return processDialogElementForReaction({
            dialogElement,
            peerId,
            date: view.date,
            isMine: true,
            middleware: popup.selector.middlewareHelperLoader.get(),
            reaction: view.reaction
          });
        },
        onSelect: (peerId) => {
          props.close(() => {
            appImManager.setInnerPeer({peerId});
          });
        },
        placeholder: 'SearchPlaceholder',
        exceptSelf: true,
        meAsSaved: false
      }
    );
  });

  const onDeleteClick = isMe && (async() => {
    const storyId = currentStory().id;
    await confirmationPopup({
      titleLangKey: 'DeleteStoryTitle',
      descriptionLangKey: 'DeleteStorySubtitle',
      button: {
        isDanger: true,
        langKey: 'Delete'
      }
    });

    rootScope.managers.appStoriesManager.deleteStories([storyId]);
  });

  if(isMe) {
    const viewedStories: Set<number> = new Set();
    const getAround = 2;
    let promise: Promise<any>;
    const getStoriesViews = async() => {
      if(promise) {
        return;
      }

      const story = currentStory();
      const index = props.state.stories.indexOf(story);
      const slice = props.state.stories.slice(Math.max(0, index - getAround), index + getAround);
      slice.forEach((story) => {
        viewedStories.add(story.id);
      });

      const ids = Array.from(viewedStories);
      viewedStories.clear();
      promise = rootScope.managers.appStoriesManager.getStoriesViews(ids).then(() => {
        promise = undefined;
      });

      // let's clear after last execution, not before viewer is closed
      if(cleaned) {
        clearInterval(interval);
      }
    };
    const interval = setInterval(getStoriesViews, 10e3);

    createEffect(() => {
      const story = currentStory();
      viewedStories.add(story.id);
    });

    let cleaned = false;
    onCleanup(() => {
      cleaned = true;
    });

    onMount(() => {
      getStoriesViews();
    });
  }

  const footer = (isMe || CHANGELOG_PEER_ID === props.state.peerId) && (
    <div class={classNames(styles.ViewerStoryFooter, styles.hideOnSmall, !isMe && styles.isChangelog)}>
      {isMe ? (
        <>
          <div class={styles.ViewerStoryFooterLeft} onClick={openViewsList}>
            {stackedAvatars() && stackedAvatars().container}
            {getViews()}
          </div>
          <div class={styles.ViewerStoryFooterRight}>
            <ButtonIconTsx icon="delete" onClick={onDeleteClick} />
          </div>
        </>
      ) : i18n('StoryCantReply')}
    </div>
  );

  // * my footer end

  createEffect(() => {
    if(stories.peer && !liteMode.isAvailable('animations')) {
      untrack(() => {
        onTransitionStart();
        onTransitionEnd();
      });
    }
  });

  let div: HTMLDivElement, storyDiv: HTMLDivElement, headerDiv: HTMLDivElement;
  const ret = (
    <div
      ref={div}
      class={styles.ViewerStoryContainer}
      classList={{
        [styles.small]: !isActive(),
        [styles.hold]: stories.hideInterface && isActive(),
        [styles.focused]: focused()
      }}
      style={{
        '--translateX': isActive() ? 0 : calculateTranslateX(),
        '--stories-width': stories.width + 'px'
      }}
      onClick={(e) => {
        if(!isActive()) {
          actions.set({peer: props.state, index: props.state.index});
        } else if(
          captionScrollable.scrollTop &&
          !findUpAsChild(e.target, captionText) &&
          !findUpClassName(e.target, styles.ViewerStoryHeader)
        ) {
          scrollPath(-captionScrollable.scrollTop);
        } else if(
          !stories.paused &&
          !stories.hideInterface &&
          !findUpClassName(e.target, styles.ViewerStoryHeader) &&
          !findUpClassName(e.target, 'stories-input') &&
          !findUpClassName(e.target, styles.ViewerStoryReactions) &&
          findUpClassName(e.target, styles.ViewerStory)
        ) {
          const rect = div.getBoundingClientRect();
          const next = e.clientX > (rect.left + rect.width / 3);
          actions.goToNearestStorySafe(next);
        }
      }}
      onTransitionStart={onTransitionStart}
      onTransitionEnd={onTransitionEnd}
    >
      <div ref={storyDiv} class={classNames(styles.ViewerStory, loading() && isActive() && 'shimmer')}>
        <div class={styles.ViewerStoryContent}>
          {contentItem}
        </div>
        <div class={styles.hideOnSmall}>
          <div class={classNames(styles.ViewerStoryShadow, caption() && styles.hasCaption)}></div>
          <div class={styles.ViewerStorySlides}>
            {slides}
          </div>
          <div ref={headerDiv} class={classNames(styles.ViewerStoryHeader, 'night')}>
            <div class={styles.ViewerStoryHeaderLeft}>
              {avatar.element}
              <div class={styles.ViewerStoryHeaderInfo}>
                <div class={styles.ViewerStoryHeaderRow}>
                  {peerTitleElement}
                  {props.splitByDays && (
                    <span class={styles.ViewerStoryHeaderSecondary}>
                      {`${JOINER}${props.state.index + 1}/${props.state.stories.length}`}
                    </span>
                  )}
                </div>
                <div
                  class={classNames(
                    // styles.ViewerStoryHeaderRow,
                    styles.ViewerStoryHeaderSecondary,
                    styles.ViewerStoryHeaderTime
                  )}
                >
                  {getDateText()}
                </div>
              </div>
            </div>
            <div class={styles.ViewerStoryHeaderRight}>
              {privacyType() && privacyIcon}
              <ButtonIconTsx
                icon={stories.paused && !stories.playAfterGesture ? 'play' : 'pause'}
                onClick={() => actions.toggle()}
              />
              {videoDuration() && muteButton}
              {/* <ButtonIconTsx icon={'more'} /> */}
              {btnMenu}
            </div>
          </div>
          {caption() && captionContainer}
          {reactionsMenu()?.widthContainer}
        </div>
        <div class={styles.ViewerStoryInfo}>
          {avatarInfo.node}
          {peerTitleInfoElement}
        </div>
      </div>
      {storyInput || footer}
      {/* <MessageInputField /> */}
    </div>
  );

  const w = createMemo((prev) => {
    return true;
    if(sliding()) return prev;
    const diff = Math.abs(stories.index - stories.peers.indexOf(props.state));
    const isOut = diff < 3;
    return isOut;
  });

  const muteTooltipOptions: Parameters<typeof showTooltip>[0] = {
    container: headerDiv,
    element: muteButtonButton,
    vertical: 'bottom',
    paddingX: 13
  };

  return (
    <Show when={w()}>
      {ret}
    </Show>
  );
}

export type PassthroughProps<E extends Element> = {element: E} & ParentProps & JSX.HTMLAttributes<E>;
export function Passthrough<E extends Element>(props: PassthroughProps<E>): E {
  const owner = getOwner();
  let content: JSX.Element;

  createEffect(() => {
    content ||= runWithOwner(owner, () => props.children);
    const [_, others] = splitProps(props, ['element']);
    const isSvg = props.element instanceof SVGElement;
    assign(props.element, others, isSvg);
  });

  return props.element;
}

export default function StoriesViewer(props: {
  onExit?: () => void,
  target?: Accessor<Element>,
  splitByDays?: boolean,
  pinned?: boolean
}) {
  const [stories, actions] = useStories();
  const [show, setShow] = createSignal(false);
  const wasShown = createMemo((shown) => shown || show());

  // * fix `ended` property
  actions.viewerReady(false);

  const CANCELABLE_KEYS: Set<string> = new Set([
    'ArrowRight',
    'ArrowLeft',
    'ArrowDown',
    'Space'
  ]);

  const onKeyDown = (e: KeyboardEvent) => {
    if(isTargetAnInput(document.activeElement as HTMLElement)) {
      throttledKeyDown.clear();
      return;
    }

    const activeStoryContainer = getActiveStoryContainer();
    if(animating || !!activeStoryContainer.querySelector('.is-recording')) {
      throttledKeyDown.clear();
      cancelEvent(e);
      return;
    }

    if(CANCELABLE_KEYS.has(e.key) || CANCELABLE_KEYS.has(e.code)) {
      cancelEvent(e);
    } else {
      const input = activeStoryContainer.querySelector<HTMLElement>('.input-message-input');
      if(
        input &&
        !IS_TOUCH_SUPPORTED &&
        input.isContentEditable &&
        overlayCounter.overlaysActive === overlaysActive
      ) {
        focusInput(input, e);
      }
    }

    if(e.key === 'ArrowDown') {
      throttledKeyDown.clear();
      close();
      return;
    }

    throttledKeyDown(e);
  };

  const throttledKeyDown = throttle((e: KeyboardEvent) => {
    if(e.key === 'ArrowRight') {
      actions.goToNearestStorySafe(true);
    } else if(e.key === 'ArrowLeft') {
      actions.goToNearestStorySafe(false);
    } else if(e.code === 'Space') {
      actions.toggle();
    }
  }, 200, true);

  emoticonsDropdown.getElement().classList.add('night');
  emoticonsDropdown.setTextColor('white');

  onCleanup(() => {
    document.body.removeEventListener('keydown', onKeyDown);
    toggleOverlay(false);
    swipeHandler.removeListeners();
    appNavigationController.removeItem(navigationItem);

    emoticonsDropdown.getElement().classList.remove('night');
    emoticonsDropdown.setTextColor();
    emoticonsDropdown.chatInput = undefined;
  });

  const close = (callback?: () => void) => {
    callback && runWithOwner(owner, () => {
      onCleanup(() => {
        callback();
      });
    });

    dispose();
    actions.pause();
    throttledKeyDown.clear();
    setShow(false);
    div.removeEventListener('click', onDivClick, {capture: true});
  };

  let div: HTMLDivElement, backgroundDiv: HTMLDivElement, closeButton: HTMLButtonElement;
  let dispose: () => void; // * dispose listeners on close to avoid effects during animation
  const ret = createRoot((_dispose) => {
    dispose = _dispose;

    createEffect(() => {
      if(stories.ended) {
        close();
      }
    });

    const storiesReadiness: Set<ReturnType<typeof Stories>> = new Set();
    const perf = performance.now();
    let wasReady = false;

    const createStories = (peer: StoriesContextPeerState, index: Accessor<number>) => {
      const onReady = () => {
        if(wasReady) {
          return;
        }

        storiesReadiness.add(ret);
        console.log('stories ready', peer.peerId, storiesReadiness.size, performance.now() - perf);

        if(storiesReadiness.size === stories.peers.length) {
          wasReady = true;
          console.log('ready', performance.now() - perf);
          runWithOwner(owner, () => {
            onMount(() => {
              open();
            });
          });
        }
      };

      const ret = (
        <Stories
          state={peer}
          index={index}
          splitByDays={props.splitByDays}
          pinned={props.pinned}
          onReady={onReady}
          close={close}
        />
      );

      return ret;
    };

    return (
      <div
        ref={div}
        class={classNames(styles.Viewer, !show() && styles.isInvisible)}
        onClick={(e) => {
          if(animating) {
            cancelEvent(e);
            return;
          }

          if(e.target === div) {
            close();
          }
        }}
      >
        <div ref={backgroundDiv} class={styles.ViewerBackground} />
        <ButtonIconTsx ref={closeButton} icon={'close'} class={styles.ViewerClose} onClick={() => close()} />
        <For each={stories.peers}>{createStories}</For>
      </div>
    );
  });

  let pauseTimeout: number;
  const swipeHandler = new SwipeHandler({
    element: div,
    onSwipe: () => {},
    verifyTouchTarget: (e) => {
      return !findUpClassName(e.target, 'btn-icon') &&
        !findUpClassName(e.target, 'btn-corner') &&
        !findUpClassName(e.target, styles.ViewerStoryMediaArea) &&
        !findUpClassName(e.target, styles.ViewerStoryPrivacy) &&
        !findUpClassName(e.target, styles.ViewerStoryCaptionText) &&
        !findUpClassName(e.target, styles.ViewerStoryReactions) &&
        !!findUpClassName(e.target, styles.ViewerStory) &&
        !findUpClassName(e.target, styles.small) &&
        !findUpClassName(e.target, styles.focused);
    },
    onStart: () => {
      // if(stories.paused && !stories.hideInterface) {
      //   return;
      // }

      pauseTimeout = window.setTimeout(() => {
        actions.pause(true);
      }, 200);
    },
    onReset: (e) => {
      window.clearTimeout(pauseTimeout);
      if(!e ||
        !stories.paused ||
        findUpClassName(e.target, 'btn-icon') ||
        findUpClassName(e.target, styles.ViewerStoryPrivacy) ||
        findUpClassName(e.target, 'btn-corner') ||
        findUpClassName(e.target, styles.ViewerStoryReactions)) {
        return;
      }

      const story = findUpClassName(e.target, styles.ViewerStory);
      const caption = story?.querySelector('.' + styles.ViewerStoryCaption);
      if(caption?.scrollTop) {
        return;
      }

      if(story && stories.hideInterface) {
        document.addEventListener('click', cancelEvent, {capture: true, once: true});
      }

      const playStories = stories.playAfterGesture || !stories.hideInterface;
      actions.toggleInterface(false);
      if(playStories) {
        actions.play();
      }
    }
  });

  let avatarFrom: ReturnType<typeof AvatarNew>;
  const open = () => {
    const target = props.target?.();
    if(!target || !target.classList.contains('avatar')) {
      setShow(true);
      return;
    }

    avatarFrom = AvatarNew({
      size: STORY_HEADER_AVATAR_SIZE,
      isDialog: false,
      useCache: false
    });

    createEffect(() => {
      if(avatarFrom.ready()) {
        setShow(true);
      }
    });

    // await avatarFrom.readyThumbPromise;

    createEffect(() => {
      const peerId = stories.peer?.peerId;
      if(peerId) {
        avatarFrom.render({peerId: stories.peer.peerId});
      }
    });
  };

  const onDivClick = (e: MouseEvent) => {
    if(animating) {
      cancelEvent(e);
    }

    const story = findUpClassName(e.target, styles.ViewerStory);
    const caption = story?.querySelector('.' + styles.ViewerStoryCaptionText) as HTMLElement;
    const callback = caption && onMediaCaptionClick(caption, e);
    if(!callback) {
      return;
    }

    close(callback);
    return false;
  };

  div.addEventListener('click', onDivClick, {capture: true});

  const owner = getOwner();

  const navigationItem: NavigationItem = {
    type: 'stories',
    onPop: () => {
      if(animating) {
        return false;
      }

      close();
    }
  };

  appNavigationController.pushItem(navigationItem);

  const getActiveStoryContainer = (el: Element = div) => {
    return el.querySelector(`.${styles.ViewerStoryContainer}:not(.${styles.small})`) as HTMLElement;
  };

  const animate = (el: Element, forwards: boolean, done: () => void) => {
    const container = getActiveStoryContainer(el);
    if(!liteMode.isAvailable('animations') || !container) {
      done();
      return;
    }

    const containers = Array.from(el.querySelectorAll(`.${styles.ViewerStoryContainer}`));
    let needAvatarOpacity: boolean;
    const target = untrack(() => {
      const target = props.target?.();
      if(!target) {
        return;
      }

      const overflowElement = findUpClassName(target, 'scrollable');
      if(!overflowElement) {
        return target;
      }

      const visibleRect = getVisibleRect(target as HTMLElement, overflowElement);
      if(!visibleRect) {
        if(avatarFrom) {
          avatarFrom.node.remove();
          avatarFrom = undefined;
        }

        return;
      }

      if(avatarFrom && (visibleRect.overflow.horizontal || visibleRect.overflow.vertical)) {
        needAvatarOpacity = true;
      }

      return target;
    });
    const rectFrom = target && (target.querySelector('.avatar') || target).getBoundingClientRect();
    const rectTo = container.getBoundingClientRect();
    const borderRadius = avatarFrom ? '50%' : window.getComputedStyle(container).borderRadius;

    const options: KeyframeAnimationOptions = {
      duration: 250,
      easing: 'cubic-bezier(0.4, 0.0, 0.6, 1)',
      direction: forwards ? 'normal' : 'reverse'
    };

    // * animate avatar movement
    let avatarAnimation: Animation, avatar: HTMLElement;
    if(avatarFrom) {
      avatar = container.querySelector<HTMLElement>(`.${styles.ViewerStoryHeaderAvatar}`);
      avatar.style.visibility = 'hidden';
      // const rectFrom = props.target.querySelector('.avatar').getBoundingClientRect();
      const rectTo = avatar.getBoundingClientRect();
      avatarFrom.node.style.cssText = `position: absolute; top: ${rectFrom.top}px; left: ${rectFrom.left}px; z-index: 1000; transform-origin: top left;`;
      const translateX = rectTo.left - rectFrom.left;
      const translateY = rectTo.top - rectFrom.top;
      document.body.append(avatarFrom.node);

      const keyframes: Keyframe[] = [{
        transform: `translate(0, 0) scale(${rectFrom.width / STORY_HEADER_AVATAR_SIZE})`
      }, {
        transform: `translate(${translateX}px, ${translateY}px) scale(1)`
      }];

      if(needAvatarOpacity) {
        keyframes[0].opacity = 0;
        keyframes[1].opacity = 1;
      }

      avatarAnimation = avatarFrom.node.animate(keyframes, options);
    }

    const setOverflow = (overflow: boolean) => {
      // container.style.overflow = overflow ? 'visible' : '';
    };

    if(!forwards) {
      setOverflow(false);
    }

    // * animate main container
    const translateX = rectFrom && rectFrom.left - (windowSize.width / 2) + rectFrom.width / 2;
    const translateY = rectFrom && rectFrom.top - (windowSize.height / 2) + rectFrom.height / 2;
    const containerAnimation = rectFrom && container.animate([{
      borderRadius,
      transform: `translate3d(${translateX}px, ${translateY}px, 0) scale3d(${rectFrom.width / rectTo.width}, ${rectFrom.height / rectTo.height}, 1)`,
      opacity: 0
    }, {
      opacity: 1,
      offset: 0.3
    }, {
      borderRadius: '0%',
      transform: `translate3d(0, 0, 0) scale3d(1, 1, 1)`
    }], options);

    // * animate simple opacity
    const opacityAnimations = (containerAnimation ? [backgroundDiv, closeButton] : [container, el]).map((element) => {
      return element.animate([{opacity: 0}, {opacity: 1}], options);
    });

    // * animate small containers
    const activeIndex = containers.indexOf(container);
    containers.splice(activeIndex, 1);
    const before = containers.slice(0, activeIndex);
    const after = containers.slice(activeIndex);
    const animateSmallContainers = (containers: Element[], next: boolean) => {
      if(!rectFrom) {
        return containers.map((container) => {
          return container.animate([{opacity: 0}, {opacity: 1}], options);
        });
      }

      return containers.map((container, idx, arr) => {
        const offsetX = (next ? idx + 1 : (arr.length - idx)) * 60 * (next ? -1 : 1);
        return container.animate([{
          transform: `translate3d(calc(var(--translateX) + ${offsetX}px), 0, 0) scale3d(${STORY_SCALE_SMALL / 2}, ${STORY_SCALE_SMALL / 2}, 1)`,
          opacity: 0.001 // fix lag with fractal opacity so element should be prepared for animation
        }, {
          opacity: 0.001,
          offset: 0.5
        }, {
          transform: `translate3d(var(--translateX), 0, 0) scale3d(${STORY_SCALE_SMALL}, ${STORY_SCALE_SMALL}, 1)`,
          opacity: 1
        }], options);
      })
    };

    const animations = [
      ...opacityAnimations,
      containerAnimation,
      avatarAnimation,
      ...animateSmallContainers(before, false),
      ...animateSmallContainers(after, true)
    ];

    const promises = animations.map((animation) => animation?.finished);
    return Promise.all(promises).then(() => {
      if(avatarFrom) {
        avatarFrom.node.remove();
        avatar.style.visibility = '';
      }

      if(forwards) {
        setOverflow(true);
      }

      done();
    });
  };

  let overlaysActive: number;
  const toggleOverlay = (active: boolean) => {
    actions.toggleSorting('viewer', active);
    overlayCounter.isDarkOverlayActive = active;
    animationIntersector.checkAnimations2(active);

    if(active) {
      overlaysActive = overlayCounter.overlaysActive;
    }
  };

  const listenerSetter = createListenerSetter();
  let wasPlayingBeforeIdle: boolean;
  listenerSetter.add(idleController)('change', (idle) => {
    if(idle) {
      wasPlayingBeforeIdle = !stories.paused;
      actions.pause();
      x.open();
      return;
    }

    const onMouseDown = () => {
      clearTimeout(timeout);
    };

    document.body.addEventListener('mousedown', onMouseDown, {once: true});
    const timeout = setTimeout(() => {
      document.body.removeEventListener('mousedown', onMouseDown);
      x.close();
    }, 100);

    if(wasPlayingBeforeIdle) {
      actions.play();
    }
  });

  let wasPlayingBeforeOverlay: boolean;
  listenerSetter.add(overlayCounter)('change', () => {
    const active = overlayCounter.overlaysActive;
    if(active > overlaysActive) {
      wasPlayingBeforeOverlay = !stories.paused;
      actions.pause();
    } else if(active === overlaysActive && wasPlayingBeforeOverlay) {
      actions.play();
    }
  });

  let animating = true;
  return (
    <Show when={wasShown()} fallback={ret}>
      <Transition
        onEnter={(el, done) => {
          document.body.addEventListener('keydown', onKeyDown);
          toggleOverlay(true);
          animate(el, true, done);
        }}
        onAfterEnter={() => {
          animating = false;
          actions.viewerReady(true);
          // play();
        }}
        onExit={(el, done) => {
          animating = true;
          animate(el, false, done);
          actions.viewerReady(false);
        }}
        onAfterExit={() => {
          animating = false;
          props.onExit?.();
          stop();
        }}
        appear
      >
        {show() && ret}
      </Transition>
    </Show>
  );
}

export const createStoriesViewer = (
  props: Parameters<typeof StoriesViewer>[0] & Parameters<typeof StoriesProvider>[0]
): JSX.Element => {
  if(props.peers && !props.onExit) {
    return createRoot((dispose) => {
      props.onExit = () => dispose();
      return (
        <StoriesProvider peers={props.peers} index={props.index}>
          {createStoriesViewer(props)}
        </StoriesProvider>
      );
    });
  }

  return (
    <Portal mount={document.getElementById('stories-viewer')}>
      <StoriesViewer {...props} />
    </Portal>
  );
};

export const createStoriesViewerWithStory = (
  props: Omit<Parameters<typeof createStoriesViewer>[0], 'peers' | 'index'> & {
    peerId: PeerId,
    storyItem: StoryItem
  }
) => {
  const [, rest] = splitProps(props, ['peerId', 'storyItem']);
  return createStoriesViewer({
    ...rest,
    peers: [{
      peerId: props.peerId,
      stories: [props.storyItem],
      index: 0
    }],
    index: 0
  });
};

export const createStoriesViewerWithPeer = async(
  props: Omit<Parameters<typeof createStoriesViewer>[0], 'peers' | 'index'> & {
    peerId: PeerId,
    id?: number
  }
): Promise<void> => {
  const [, rest] = splitProps(props, ['peerId', 'id']);
  const userStories = await rootScope.managers.appStoriesManager.getUserStories(props.peerId);
  const storyIndex = props.id ? userStories.stories.findIndex((story) => story.id === props.id) : undefined;
  if(props.id && storyIndex === -1) {
    const storyItem = await rootScope.managers.appStoriesManager.getStoryById(props.peerId, props.id);
    if(!storyItem) {
      toastNew({langPackKey: 'Story.ExpiredToast'});
      return;
    }
    // if(storyItem) { // own story can be missed in UserStories
    //   return createStoriesViewerWithPeer(props);
    // }

    createStoriesViewerWithStory({
      ...rest,
      peerId: props.peerId,
      storyItem
    });
    return;
  }

  createStoriesViewer({
    ...rest,
    peers: [{
      peerId: props.peerId,
      stories: userStories.stories,
      maxReadId: userStories.max_read_id,
      index: storyIndex
    }],
    index: 0
  });
};

// export const openStories = (target?: Parameters<typeof StoriesViewer>[0]['target'], onExit?: () => void) => {
//   const dispose = render(
//     () => (
//       <StoriesProvider stories={[]}>
//         <StoriesViewer onExit={() => {dispose(); onExit?.();}} target={target} />
//       </StoriesProvider>
//     ),
//     document.getElementById('stories-viewer')
//   );
// };
