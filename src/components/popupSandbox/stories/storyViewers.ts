import {defineStories, PopupStory} from '@components/popupSandbox/registry';
import {seedMirror} from '@components/popupSandbox/bootstrapState';
import {
  CHANNEL_PEER_ID,
  CONTACT_PEER_ID,
  PREMIUM_PEER_ID,
  makeMessage,
  photo,
  stickerDocument,
  storyItem,
  videoChatUsers
} from '@components/popupSandbox/fixtures';
import type {StoryInteraction, StoryInteractionsList} from '@appManagers/appStoriesManager';
import type {Chat, Reaction, StoryItem, User} from '@layer';
import rootScope from '@lib/rootScope';
import apiManagerProxy from '@lib/apiManagerProxy';
import tsNow from '@helpers/tsNow';
import noop from '@helpers/noop';

// * one's own story, seen by more people than the fixtures hold: the rest are made here
const MORE_VIEWERS = [
  'Kate Kim', 'Liam Lee', 'Mia Moore', 'Noah Nash', 'Olga Orlova', 'Paul Price', 'Quinn Quade', 'Rosa Ruiz',
  'Sam Stone', 'Tina Turner', 'Uma Underwood', 'Victor Vale', 'Wendy Wu', 'Xavier Xu'
].map((name, index): User.user => {
  const [first_name, last_name] = name.split(' ');
  return {
    _: 'user',
    pFlags: {},
    id: 777101 + index,
    access_hash: '' + (101 + index),
    first_name,
    last_name,
    photo: {_: 'userProfilePhotoEmpty'}
  };
});

const HEART: Reaction = {_: 'reactionEmoji', emoticon: '❤'};
const LIKE: Reaction = {_: 'reactionEmoji', emoticon: '👍'};
const PAGE = 10;

const makeStory = (overrides: Partial<StoryItem.storyItem>): StoryItem.storyItem => ({
  ...storyItem,
  pFlags: {out: true, public: true},
  caption: '',
  albums: undefined,
  ...overrides
});

/** The views, reposts and forwards of one's own story; `seen` of them in all, the rest were not kept. */
function makeViews(story: StoryItem.storyItem, seen: number) {
  const viewers = [CONTACT_PEER_ID, PREMIUM_PEER_ID, ...[...videoChatUsers, ...MORE_VIEWERS].map((user) => user.id.toPeerId(false))];
  const now = tsNow(true);
  const views: StoryInteraction[] = viewers.slice(0, seen).map((peerId, index) => ({
    _: 'view',
    peerId,
    date: now - index * 600,
    reaction: index % 2 ? undefined : (index % 4 ? LIKE : HEART),
    blocked: index === 7,
    blockedMyStoriesFrom: index === 5
  }));

  const repost = makeStory({
    id: 7,
    pFlags: {},
    date: now - 1800,
    caption: 'Look at this one',
    media: {_: 'messageMediaPhoto', pFlags: {}, photo}
  });
  views.splice(1, 0, {_: 'repost', peerId: CHANNEL_PEER_ID, date: repost.date, story: repost});
  views.splice(4, 0, {
    _: 'forward',
    peerId: CHANNEL_PEER_ID,
    date: now - 3000,
    message: makeMessage({mid: 4294967296 + 77, peerId: CHANNEL_PEER_ID, message: '', date: now - 3000})
  });

  return views;
}

/** Pages of the list, ordered and filtered the way the server is asked to. */
function answerViewsList(all: StoryInteraction[], viewsCount: number) {
  return (_peerId: PeerId, _id: number, options: {offset?: string, q?: string, justContacts?: boolean, reactionsFirst?: boolean}): StoryInteractionsList => {
    let items = all.slice();
    if(options.q) {
      const q = options.q.toLowerCase();
      items = items.filter((item) => {
        const peer = apiManagerProxy.getPeer(item.peerId);
        const name = (peer?._ === 'user' ? [peer.first_name, peer.last_name] : [(peer as Chat.channel)?.title]).filter(Boolean).join(' ').toLowerCase();
        return name.includes(q);
      });
    }

    if(options.justContacts) {
      items = items.filter((item) => item._ === 'view' && [CONTACT_PEER_ID, PREMIUM_PEER_ID].includes(item.peerId));
    }

    if(options.reactionsFirst) {
      items.sort((a, b) => +!!(b._ === 'view' && b.reaction) - +!!(a._ === 'view' && a.reaction) || b.date - a.date);
    }

    const offset = +(options.offset || 0);
    const next = offset + PAGE;
    return {
      count: items.length,
      viewsCount,
      items: items.slice(offset, next),
      nextOffset: next < items.length ? '' + next : undefined
    };
  };
}

function storyViewersStory(options: {
  id: string,
  title: string,
  views: number,
  listed: number,
  reactions?: number,
  forwards?: number,
  expired?: boolean,
  premium?: boolean,
  isPublic?: boolean
}): Omit<PopupStory, 'group'> {
  return {
    id: options.id,
    title: options.title,
    fixtureOnly: true,
    managers: () => {
      const now = tsNow(true);
      const story = makeStory({
        expire_date: options.expired ? now - 3 * 86400 : now + 3600,
        date: options.expired ? now - 4 * 86400 : now - 82800,
        pFlags: {out: true, public: options.isPublic === false ? undefined : true},
        views: {
          _: 'storyViews',
          pFlags: {has_viewers: true},
          views_count: options.views,
          reactions_count: options.reactions ?? 0,
          forwards_count: options.forwards ?? 0
        }
      });
      const items = options.listed ? makeViews(story, options.listed) : [];
      return {
        appStoriesManager: {
          getStoryById: () => story,
          getStoryViewsList: answerViewsList(items, options.views)
        },
        appReactionsManager: {
          getReaction: () => ({_: 'availableReaction', static_icon: stickerDocument})
        },
        appUsersManager: {
          toggleBlock: noop,
          deleteContacts: noop
        }
      };
    },
    open: async(ctx) => {
      MORE_VIEWERS.forEach((user) => seedMirror('peers', '' + user.id.toPeerId(false), user));
      // * the stub an account without Premium meets, with the Premium the sandbox's own account has given back after
      const premium = rootScope.premium;
      if(options.premium === false) {
        rootScope.dispatchEvent('premium_toggle', false);
      }

      const {default: showStoryViewersPopup} = await import('@components/popups/storyViewers');
      await showStoryViewersPopup({
        peerId: ctx.peer('self'),
        storyId: storyItem.id,
        onOpenPeer: noop,
        onOpenStory: noop,
        onOpenMessage: noop,
        onClose: () => {
          if(options.premium === false) {
            rootScope.dispatchEvent('premium_toggle', premium);
          }
        }
      });
    }
  };
}

defineStories('Stories', [
  storyViewersStory({
    id: 'storyViewers',
    title: 'Story viewers — tabs, order, search, reposts and forwards',
    views: 26,
    listed: 24,
    reactions: 12,
    forwards: 2
  }),
  storyViewersStory({
    id: 'storyViewers/few',
    title: 'Story viewers — a few, one not recorded',
    views: 6,
    listed: 4,
    reactions: 2
  }),
  storyViewersStory({
    id: 'storyViewers/empty',
    title: 'Story viewers — nobody yet',
    views: 0,
    listed: 0
  }),
  storyViewersStory({
    id: 'storyViewers/notRecorded',
    title: 'Story viewers — views counted, none recorded',
    views: 3,
    listed: 0
  }),
  storyViewersStory({
    id: 'storyViewers/expired',
    title: 'Story viewers — expired, without Premium',
    views: 8,
    listed: 0,
    expired: true,
    premium: false
  }),
  storyViewersStory({
    id: 'storyViewers/expiredReactions',
    title: 'Story viewers — expired, the reactions alone without Premium',
    views: 8,
    listed: 3,
    reactions: 2,
    expired: true,
    premium: false
  }),
  {
    id: 'storyReactions/channel',
    title: 'Story reactions — a channel\'s story, to its admin',
    fixtureOnly: true,
    managers: () => {
      const now = tsNow(true);
      const story = makeStory({
        pFlags: {public: true},
        expire_date: now + 3600,
        views: {_: 'storyViews', pFlags: {}, views_count: 1234, reactions_count: 3, forwards_count: 2}
      });
      const items: StoryInteraction[] = [
        ...makeViews(story, 3).filter((item) => item._ !== 'view'),
        ...[CONTACT_PEER_ID, PREMIUM_PEER_ID, videoChatUsers[0].id.toPeerId(false)].map((peerId, index): StoryInteraction => ({
          _: 'view',
          peerId,
          date: now - index * 900,
          reaction: index ? LIKE : HEART
        }))
      ];
      return {
        appStoriesManager: {
          getStoryById: () => story,
          getStoryReactionsList: (): StoryInteractionsList => ({count: items.length, items})
        },
        appReactionsManager: {
          getReaction: () => ({_: 'availableReaction', static_icon: stickerDocument})
        }
      };
    },
    open: async(ctx) => {
      const {default: showStoryViewersPopup} = await import('@components/popups/storyViewers');
      await showStoryViewersPopup({
        peerId: ctx.peer('channel'),
        storyId: storyItem.id,
        onOpenPeer: noop,
        onOpenStory: noop,
        onOpenMessage: noop
      });
    }
  }
]);

// The sandbox reloads on an edit anyway (watchForEdits). Accepting here keeps an edit of a popup this story imports
// from climbing through the story to the app's root once the sandbox has been opened on the dev server.
if(import.meta.hot) import.meta.hot.accept();
