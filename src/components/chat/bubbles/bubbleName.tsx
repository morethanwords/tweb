import {onMount, untrack} from 'solid-js';
import {useBubble} from '@components/chat/bubbles/context';
import {Message, User} from '@layer';
import {i18n, FormatterArguments, LangPackKey} from '@lib/langPack';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import setInnerHTML, {setDirection} from '@helpers/dom/setInnerHTML';
import rootScope from '@lib/rootScope';
import {avatarNew} from '@components/avatarNew';
import PeerTitle from '@components/peerTitle';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import {REPLIES_PEER_ID, NULL_PEER_ID} from '@appManagers/constants';
import apiManagerProxy from '@lib/apiManagerProxy';
import generateFakeIcon from '@components/generateFakeIcon';
import getFwdFromName from '@appManagers/utils/messages/getFwdFromName';
import isForwardOfForward from '@appManagers/utils/messages/isForwardOfForward';
import {isMessageForVerificationBot} from '@components/chat/utils';
import {ChatType} from '@components/chat/chatType';
import {usePeer} from '@stores/peers';
import getPeerActiveUsernames from '@lib/appManagers/utils/peers/getPeerActiveUsernames';

/**
 * Bubble.Name — full implementation matching legacy renderMessage name block.
 * Handles: regular name, forwarded name, via bot, hidden profile,
 * two-title saved messages, scam/fake badges, ranks, colored names.
 */
export default function Name() {
  const ctx = useBubble();
  const message = ctx.message();

  if(message._ !== 'message') {
    return ctx.register('name', undefined);
  }

  const isOut = ctx.isOut();
  const our = ctx.chat.isOurMessage(message);
  const fwdFrom = message.fwd_from;
  const fwdFromId = message.fwdFromId;
  const replyTo = message.reply_to;
  const viaBotId = message.viaBotId;
  const fromId = message.fromId;

  // detect storyFromPeerId from story media
  const storyMedia = message.media?._ === 'messageMediaStory' ? message.media : undefined;
  const storyFromPeerId = storyMedia && !storyMedia.pFlags?.via_mention ? getPeerId(storyMedia.peer) : undefined;

  const showNameForVerificationCodes = isMessageForVerificationBot(message) && !message.pFlags.local;
  const iPostedAsSomeoneElse = fromId !== rootScope.myId && !ctx.chat.isMonoforum;
  const needName = ((iPostedAsSomeoneElse || !isOut) && ctx.chat.isLikeGroup) ||
    !!viaBotId ||
    !!storyFromPeerId ||
    (showNameForVerificationCodes && !replyTo);

  // same gate as legacy
  if(!needName && !fwdFrom) {
    return ctx.register('name', undefined);
  }

  const _isForwardOfForward = ctx.bubbles.chat.isForwardOfForward(message);
  const hasPostAuthor = ctx.isMessage && message.post_author && !ctx.chat.isLikeGroup;
  const canHideNameIfMedia = !message.viaBotId &&
    (message.fromId === rootScope.myId || !message.pFlags.out) &&
    (!hasPostAuthor || !fwdFrom) &&
    !_isForwardOfForward/*  &&
    !fwdFromId */;
    // (!getFwdFromName(fwdFrom) || !fwdFromId);

  return ctx.register('name', (() => {
    let ref: HTMLDivElement;

    onMount(() => {
      const bubbles = ctx.bubbles;
      const middleware = ctx.middleware;
      const wrapOptions = ctx.wrapOptions;
      const peerIdForColor = fromId;
      const isStandaloneMedia = ctx.isStandaloneMedia();

      const isForwardFromChannel = message.from_id?._ === 'peerChannel' && fromId === fwdFromId;
      const fwdFromName = getFwdFromName(fwdFrom);
      const hasTwoTitles = _isForwardOfForward && !isOut && fwdFrom?.from_name && fwdFrom?.saved_from_name;
      const hasPostAuthor = !!message.post_author && !ctx.chat.isLikeGroup;

      let mustHaveName = !!(viaBotId/*  || topicNameButtonContainer */) || storyFromPeerId;
      const isHidden = !!(fwdFrom && (!fwdFrom.from_id || fwdFromName));

      let titleVia: HTMLElement;
      if(viaBotId) {
        titleVia = document.createElement('span');
        const peer = untrack(() => usePeer(viaBotId));
        titleVia.innerText = '@' + getPeerActiveUsernames(peer);
        titleVia.classList.add('peer-title');
      }

      let isForward = !!(storyFromPeerId || fwdFromId || fwdFrom) && !showNameForVerificationCodes;
      if(isForward && ctx.chat.type === ChatType.Saved && fwdFromId === rootScope.myId) {
        isForward = false;
      }

      // create title element
      let title: HTMLElement;
      const noColor = false;
      if(isHidden && !fwdFromId) {
        title = document.createElement('span');
        title.classList.add('peer-title');
        setInnerHTML(title, wrapEmojiText(fwdFrom.from_name || fwdFromName));
      } else {
        const titlePeerId = fwdFromId || fromId;
        title = createTitle(titlePeerId, wrapOptions, isForward);
      }

      if(isHidden && !fwdFromId) {
        ctx.setState({isHiddenProfile: true});
      }
      let nameDiv: HTMLElement;

      if(isForward) {
        const peerId = bubbles.peerId;
        const isRegularSaved = peerId === rootScope.myId && (!ctx.chat.threadId || !isForwardOfForward(message));
        if(!isRegularSaved && !isForwardFromChannel) {
          ctx.setState({isForwarded: true});
        }

        nameDiv = document.createElement('div');
        const titlePeerId = storyFromPeerId || fwdFromId;
        if(titlePeerId) title.dataset.peerId = '' + titlePeerId;
        if((message as Message.message).savedFrom) {
          title.dataset.savedFrom = (message as Message.message).savedFrom;
        }

        if(
          (isRegularSaved || peerId === REPLIES_PEER_ID || isForwardFromChannel) &&
          !isStandaloneMedia &&
          !hasTwoTitles &&
          !_isForwardOfForward &&
          !storyFromPeerId
        ) {
          nameDiv.classList.add('colored-name');
          nameDiv.append(title);
        } else {
          mustHaveName ||= true;
          ctx.setState({hideName: false});
          const firstArgs: FormatterArguments = [title];

          if(titlePeerId) {
            const avatar = avatarNew({
              middleware,
              size: 20,
              lazyLoadQueue: ctx.lazyLoadQueue,
              peerId: titlePeerId,
              isDialog: false
            });
            avatar.node.classList.add('bubble-name-forwarded-avatar');
            firstArgs.unshift(avatar.node);
          } else {
            title.classList.add('text-normal');
          }

          const br = document.createElement('br');
          br.classList.add('hide-ol');
          firstArgs.unshift(br);

          let nameKey: LangPackKey;
          const nameArgs: FormatterArguments = [firstArgs];
          if(fwdFrom?.post_author) {
            nameKey = storyFromPeerId ? 'ForwardedStoryFromAuthor1' : 'ForwardedFromAuthor';
            const s = document.createElement('span');
            s.append(wrapEmojiText(fwdFrom.post_author));
            nameArgs.push(s);
          } else {
            nameKey = storyFromPeerId ? 'ForwardedStoryFrom1' : 'ForwardedFrom';
          }

          const span = i18n(nameKey, nameArgs);
          span.classList.add('bubble-name-forwarded');
          nameDiv.append(span);

          if(hasTwoTitles) {
            let twoTitle: HTMLElement;
            if(fwdFromName) {
              twoTitle = document.createElement('span');
              twoTitle.classList.add('peer-title');
              twoTitle.style.color = 'var(--message-primary-color)';
              twoTitle.dataset.peerId = '' + NULL_PEER_ID;
              twoTitle.append(wrapEmojiText(fwdFromName));
            } else {
              const peerId = getPeerId(fwdFrom.saved_from_id);
              twoTitle = createTitle(peerId, wrapOptions, false);
            }

            const line = document.createElement('div');
            line.classList.add('name-first-line');
            line.append(twoTitle);
            nameDiv.prepend(line);
          }
        }
      } else if(!viaBotId) {
        if(!isStandaloneMedia && needName) {
          nameDiv = document.createElement('div');
          nameDiv.append(title);

          if(!noColor) {
            const peer = apiManagerProxy.getPeer(peerIdForColor);
            const pFlags = (peer as User.user)?.pFlags;
            if(pFlags && (pFlags.scam || pFlags.fake)) {
              nameDiv.append(generateFakeIcon(pFlags.scam));
            }

            if(!our) {
              nameDiv.classList.add('colored-name');
            }

            nameDiv.dataset.peerId = '' + peerIdForColor;
          }
        } else {
          ctx.setState({hideName: true});
        }
      }

      // via bot
      if(viaBotId) {
        if(!nameDiv) {
          nameDiv = document.createElement('div');
        } else {
          nameDiv.append(' ');
        }

        const span = document.createElement('span');
        span.append(i18n('ViaBot'), ' ', titleVia);
        span.classList.add('is-via');
        nameDiv.append(span);
      }

      // finalize
      if(nameDiv && (canHideNameIfMedia && ctx.state.mediaCanHideName ? ctx.state.hideName === false : !ctx.state.hideName)) {
        nameDiv.classList.add('name');
        setDirection(nameDiv);

        if(!isStandaloneMedia) {
          nameDiv.classList.add('floating-part');
        }

        ref.replaceWith(nameDiv);

        // next-is-message for spacing
        if(!isStandaloneMedia && nameDiv.nextElementSibling?.classList.contains('message')) {
          nameDiv.classList.add('next-is-message');
        }

        // ranks
        const firstElement = nameDiv.firstElementChild as HTMLElement || title;
        if(
          bubbles.canShowRanks &&
          title &&
          !isHidden &&
          !fwdFromId
        ) {
          const rank = bubbles.ranks?.get(fromId);
          const postAuthor = hasPostAuthor && message.post_author;
          if(postAuthor) {
            bubbles.wrapTitleAndRank(firstElement, message, postAuthor);
          } else if(rank || (message as Message.message).from_boosts_applied) {
            bubbles.wrapTitleAndRank(firstElement, message, rank);
          } else if(bubbles.processRanks) {
            const processRank = () => {
              const rank = bubbles.ranks?.get(fromId);
              if(!rank && !(message as Message.message).from_boosts_applied) return;
              bubbles.wrapTitleAndRank(firstElement, message, rank);
            };
            bubbles.processRanks.add(processRank);
            middleware.onDestroy(() => bubbles.processRanks.delete(processRank));
          }
        } else if(ctx.chat.isMegagroup && !fromId.isUser() && message.views) {
          bubbles.wrapTitleAndRank(firstElement, message, 0);
        }
      } else {
        ref.remove();
      }

      if(mustHaveName) {
        ctx.setState({mustHaveName: true});
      }
    });

    return (
      <div ref={ref!} class="name floating-part" dir="auto" />
    );
  })());
}

function createTitle(peerId: PeerId, wrapOptions: WrapSomethingOptions, isForward?: boolean): HTMLElement {
  return new PeerTitle({
    peerId,
    withPremiumIcon: !isForward,
    wrapOptions
  }).element;
}
