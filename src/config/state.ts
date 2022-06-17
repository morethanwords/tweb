/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { AppMediaPlaybackController } from "../components/appMediaPlaybackController";
import { IS_MOBILE } from "../environment/userAgent";
import getTimeFormat from "../helpers/getTimeFormat";
import { nextRandomUint } from "../helpers/random";
import { AutoDownloadSettings, NotifyPeer, PeerNotifySettings } from "../layer";
import { TopPeerType, MyTopPeer } from "../lib/appManagers/appUsersManager";
import DialogsStorage from "../lib/storages/dialogs";
import FiltersStorage from "../lib/storages/filters";
import { AuthState } from "../types";
import App from "./app";

const STATE_VERSION = App.version;
const BUILD = App.build;

export type Background = {
  type?: 'color' | 'image' | 'default', // ! DEPRECATED
  blur: boolean,
  highlightningColor?: string,
  color?: string,     
  slug?: string,        // image slug
  intensity?: number,   // pattern intensity
  id: string | number,  // wallpaper id
};

export type Theme = {
  name: 'day' | 'night' | 'system',
  background: Background
};

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
  filters: FiltersStorage['filters'],
  maxSeenMsgId: number,
  stateCreatedTime: number,
  recentEmoji: string[],
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
    animationsEnabled: boolean,
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
    autoPlay: {
      gifs: boolean,
      videos: boolean
    },
    stickers: {
      suggest: boolean,
      loop: boolean
    },
    emoji: {
      suggest: boolean,
      big: boolean
    },
    background?: Background, // ! DEPRECATED
    themes: Theme[],
    theme: Theme['name'],
    notifications: {
      sound: boolean
    },
    nightTheme?: boolean, // ! DEPRECATED
    timeFormat: 'h12' | 'h23'
  },
  playbackParams: ReturnType<AppMediaPlaybackController['getPlaybackParams']>,
  keepSigned: boolean,
  chatContextMenuHintWasShown: boolean,
  stateId: number,
  notifySettings: {[k in Exclude<NotifyPeer['_'], 'notifyPeer'>]?: PeerNotifySettings.peerNotifySettings}
};

const BACKGROUND_DAY_DESKTOP: Background = {
  blur: false,
  slug: 'pattern',
  color: '#dbddbb,#6ba587,#d5d88d,#88b884',
  highlightningColor: 'hsla(86.4, 43.846153%, 45.117647%, .4)',
  intensity: 50,
  id: '1'
};

const BACKGROUND_DAY_MOBILE: Background = {
  blur: false,
  slug: '',
  color: '#dbddbb,#6ba587,#d5d88d,#88b884',
  highlightningColor: 'hsla(86.4, 43.846153%, 45.117647%, .4)',
  intensity: 0,
  id: '1'
};

const BACKGROUND_NIGHT_DESKTOP: Background = {
  blur: false,
  slug: 'pattern',
  // color: '#dbddbb,#6ba587,#d5d88d,#88b884',
  color: '#fec496,#dd6cb9,#962fbf,#4f5bd5',
  highlightningColor: 'hsla(299.142857, 44.166666%, 37.470588%, .4)',
  intensity: -50,
  id: '-1'
};

const BACKGROUND_NIGHT_MOBILE: Background = {
  blur: false,
  slug: '',
  color: '#0f0f0f',
  highlightningColor: 'hsla(0, 0%, 3.82353%, 0.4)',
  intensity: 0,
  id: '-1'
};

export const STATE_INIT: State = {
  allDialogsLoaded: {},
  pinnedOrders: {},
  // contactsList: [],
  contactsListCachedTime: 0,
  updates: {},
  filters: {},
  maxSeenMsgId: 0,
  stateCreatedTime: Date.now(),
  recentEmoji: [],
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
    animationsEnabled: true,
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
    autoPlay: {
      gifs: true,
      videos: true
    },
    stickers: {
      suggest: true,
      loop: true
    },
    emoji: {
      suggest: true,
      big: true
    },
    themes: [{
      name: 'day',
      background: IS_MOBILE ? BACKGROUND_DAY_MOBILE : BACKGROUND_DAY_DESKTOP
    }, {
      name: 'night',
      background: IS_MOBILE ? BACKGROUND_NIGHT_MOBILE : BACKGROUND_NIGHT_DESKTOP
    }],
    theme: 'system',
    notifications: {
      sound: false
    },
    timeFormat: getTimeFormat()
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
  stateId: nextRandomUint(32),
  notifySettings: {}
};
