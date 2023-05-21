/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {LiteModeKey} from '../helpers/liteMode';
import type {AppMediaPlaybackController} from '../components/appMediaPlaybackController';
import type {TopPeerType, MyTopPeer} from '../lib/appManagers/appUsersManager';
import type {AutoDownloadSettings, BaseTheme, NotifyPeer, PeerNotifySettings, Theme, ThemeSettings, WallPaper} from '../layer';
import type DialogsStorage from '../lib/storages/dialogs';
import type FiltersStorage from '../lib/storages/filters';
import type {AuthState, Modify} from '../types';
import {IS_MOBILE} from '../environment/userAgent';
import getTimeFormat from '../helpers/getTimeFormat';
import {nextRandomUint} from '../helpers/random';
import App from './app';

const STATE_VERSION = App.version;
const BUILD = App.build;

// ! DEPRECATED
export type Background = {
  type?: 'color' | 'image' | 'default', // ! DEPRECATED
  blur: boolean,
  highlightningColor?: string,
  color?: string,
  slug?: string,        // image slug
  intensity?: number,   // pattern intensity
  id: string | number,  // wallpaper id
};

export type AppTheme = Modify<Theme, {
  name: 'day' | 'night' | 'system',
  settings?: Modify<ThemeSettings, {
    highlightningColor: string
  }>
}>;

export type AutoDownloadPeerTypeSettings = {
  contacts: boolean,
  private: boolean,
  groups: boolean,
  channels: boolean
};

export type State = {
  allDialogsLoaded: DialogsStorage['allDialogsLoaded'],
  pinnedOrders: DialogsStorage['pinnedOrders'],
  // contactsList: UserId[],
  contactsListCachedTime: number,
  updates: Partial<{
    seq: number,
    pts: number,
    date: number
  }>,
  // filters?: FiltersStorage['filters'], // ! DEPRECATED
  filtersArr?: FiltersStorage['filtersArr'],
  maxSeenMsgId: number,
  stateCreatedTime: number,
  recentEmoji: string[],
  recentCustomEmoji: DocId[],
  topPeersCache: {
    [type in TopPeerType]?: {
      peers: MyTopPeer[],
      cachedTime: number
    }
  },
  recentSearch: PeerId[],
  version: typeof STATE_VERSION,
  build: typeof BUILD,
  authState: AuthState,
  hiddenPinnedMessages: {[peerId: PeerId]: number},
  settings: {
    messagesTextSize: number,
    distanceUnit: 'kilometers' | 'miles',
    sendShortcut: 'enter' | 'ctrlEnter',
    animationsEnabled?: boolean, // ! DEPRECATED
    autoDownload: {
      contacts?: boolean, // ! DEPRECATED
      private?: boolean, // ! DEPRECATED
      groups?: boolean, // ! DEPRECATED
      channels?: boolean, // ! DEPRECATED
      photo: AutoDownloadPeerTypeSettings,
      video: AutoDownloadPeerTypeSettings,
      file: AutoDownloadPeerTypeSettings
    },
    autoDownloadNew: AutoDownloadSettings,
    autoPlay?: { // ! DEPRECATED
      gifs: boolean,
      videos: boolean
    },
    stickers: {
      suggest: 'all' | 'installed' | 'none',
      dynamicPackOrder: boolean,
      loop: boolean
    },
    emoji: {
      suggest: boolean,
      big: boolean
    },
    background?: Background, // ! DEPRECATED
    themes: AppTheme[],
    theme: AppTheme['name'],
    notifications: {
      sound: boolean
    },
    nightTheme?: boolean, // ! DEPRECATED
    timeFormat: 'h12' | 'h23',
    liteMode: {[key in LiteModeKey]: boolean}
  },
  playbackParams: ReturnType<AppMediaPlaybackController['getPlaybackParams']>,
  keepSigned: boolean,
  chatContextMenuHintWasShown: boolean,
  hideChatJoinRequests: {[peerId: PeerId]: number},
  stateId: number,
  notifySettings: {[k in Exclude<NotifyPeer['_'], 'notifyPeer'>]?: PeerNotifySettings.peerNotifySettings},
  confirmedWebViews: BotId[]
};

// const BACKGROUND_DAY_MOBILE: Background = {
//   blur: false,
//   slug: '',
//   color: '#dbddbb,#6ba587,#d5d88d,#88b884',
//   highlightningColor: 'hsla(86.4, 43.846153%, 45.117647%, .4)',
//   intensity: 0,
//   id: '1'
// };

// const BACKGROUND_NIGHT_MOBILE: Background = {
//   blur: false,
//   slug: '',
//   color: '#0f0f0f',
//   highlightningColor: 'hsla(0, 0%, 3.82353%, 0.4)',
//   intensity: 0,
//   id: '-1'
// };

export const DEFAULT_THEME: Theme = {
  _: 'theme',
  access_hash: '',
  id: '',
  settings: [{
    _: 'themeSettings',
    pFlags: {},
    base_theme: {_: 'baseThemeClassic'},
    accent_color: 0x3390ec,
    message_colors: [0x4fae4e],
    wallpaper: {
      _: 'wallPaper',
      pFlags: {
        default: true,
        pattern: true
      },
      access_hash: '',
      document: undefined,
      id: '',
      slug: 'pattern',
      settings: {
        _: 'wallPaperSettings',
        pFlags: {},
        intensity: 50,
        background_color: 0xdbddbb,
        second_background_color: 0x6ba587,
        third_background_color: 0xd5d88d,
        fourth_background_color: 0x88b884
      }
    }
  }, {
    _: 'themeSettings',
    pFlags: {},
    base_theme: {_: 'baseThemeNight'},
    accent_color: 0x8774E1,
    message_colors: [0x8774E1],
    wallpaper: {
      _: 'wallPaper',
      pFlags: {
        default: true,
        pattern: true,
        dark: true
      },
      access_hash: '',
      document: undefined,
      id: '',
      slug: 'pattern',
      settings: {
        _: 'wallPaperSettings',
        pFlags: {},
        intensity: -50,
        background_color: 0xfec496,
        second_background_color: 0xdd6cb9,
        third_background_color: 0x962fbf,
        fourth_background_color: 0x4f5bd5
      }
    }
  }],
  slug: '',
  title: '',
  emoticon: '🏠',
  pFlags: {default: true}
};

const makeDefaultAppTheme = (
  name: AppTheme['name'],
  baseTheme: BaseTheme['_'],
  highlightningColor: string
): AppTheme => {
  return {
    ...DEFAULT_THEME,
    name,
    settings: {
      ...DEFAULT_THEME.settings.find((s) => s.base_theme._ === baseTheme),
      highlightningColor
    }
  };
};

export const STATE_INIT: State = {
  allDialogsLoaded: {},
  pinnedOrders: {},
  // contactsList: [],
  contactsListCachedTime: 0,
  updates: {},
  filtersArr: [],
  maxSeenMsgId: 0,
  stateCreatedTime: Date.now(),
  recentEmoji: [],
  recentCustomEmoji: [],
  topPeersCache: {},
  recentSearch: [],
  version: STATE_VERSION,
  build: BUILD,
  authState: {
    _: IS_MOBILE ? 'authStateSignIn' : 'authStateSignQr'
  },
  hiddenPinnedMessages: {},
  settings: {
    messagesTextSize: 16,
    distanceUnit: 'kilometers',
    sendShortcut: 'enter',
    autoDownload: {
      photo: {
        contacts: true,
        private: true,
        groups: true,
        channels: true
      },
      video: {
        contacts: true,
        private: true,
        groups: true,
        channels: true
      },
      file: {
        contacts: true,
        private: true,
        groups: true,
        channels: true
      }
    },
    autoDownloadNew: {
      _: 'autoDownloadSettings',
      file_size_max: 3145728,
      pFlags: {
        video_preload_large: true,
        audio_preload_next: true
      },
      photo_size_max: 1048576,
      video_size_max: 15728640,
      video_upload_maxbitrate: 100
    },
    stickers: {
      suggest: 'all',
      dynamicPackOrder: true,
      loop: true
    },
    emoji: {
      suggest: true,
      big: true
    },
    themes: [
      makeDefaultAppTheme('day', 'baseThemeClassic', 'hsla(86.4, 43.846153%, 45.117647%, .4)'),
      makeDefaultAppTheme('night', 'baseThemeNight', 'hsla(299.142857, 44.166666%, 37.470588%, .4)')
    ],
    theme: 'system',
    notifications: {
      sound: false
    },
    timeFormat: getTimeFormat(),
    liteMode: {
      all: false,
      animations: false,
      chat: false,
      chat_background: false,
      chat_spoilers: false,
      effects: false,
      effects_premiumstickers: false,
      effects_reactions: false,
      effects_emoji: false,
      emoji: false,
      emoji_messages: false,
      emoji_panel: false,
      gif: false,
      stickers: false,
      stickers_chat: false,
      stickers_panel: false,
      video: false
    }
  },
  playbackParams: {
    volume: 1,
    muted: false,
    playbackRate: 1,
    playbackRates: {
      voice: 1,
      video: 1,
      audio: 1
    },
    loop: false,
    round: false
  },
  keepSigned: true,
  chatContextMenuHintWasShown: false,
  hideChatJoinRequests: {},
  stateId: nextRandomUint(32),
  notifySettings: {},
  confirmedWebViews: []
};
