import type {LiteModeKey} from '@helpers/liteMode';
import type {AppMediaPlaybackController} from '@components/appMediaPlaybackController';
import type {TopPeerType, MyTopPeer} from '@appManagers/appUsersManager';
import type {AccountContentSettings, AccountThemes, AutoDownloadSettings, BaseTheme, NotifyPeer, PeerNotifySettings, Theme, ThemeSettings, WallPaper} from '@layer';
import type DialogsStorage from '@lib/storages/dialogs';
import type FiltersStorage from '@lib/storages/filters';
import type {AuthState, Modify} from '@types';
import type {ShortcutKey as PasscodeLockShortcutKey} from '@components/sidebarLeft/tabs/passcodeLock/shortcutBuilder';
import {IS_MOBILE} from '@environment/userAgent';
import getTimeFormat from '@helpers/getTimeFormat';
import App from '@config/app';
import {getAccentPresetsForBase} from '@config/themePresets';
import {ColoredBrushType} from '@components/mediaEditor/context';
import {FontKey} from '@components/mediaEditor/types';

// Factory tinted ("Dark") collapses onto the first base-color preset (blue) so the accent picker
// can omit a separate "default" swatch — resetting to factory now reaches the same state the user
// gets by tapping the blue circle.
const TINTED_DEFAULT_PRESET = getAccentPresetsForBase('baseThemeTinted')[0];

const STATE_VERSION = App.version;
const BUILD = App.build;

// ! DEPRECATED
export type Background = {
  type?: 'color' | 'image' | 'default', // ! DEPRECATED
  blur: boolean,
  highlightingColor?: string,
  color?: string,
  slug?: string,        // image slug
  intensity?: number,   // pattern intensity
  id: string | number,  // wallpaper id
};

export type AppThemeSettings = Modify<ThemeSettings, {
  highlightingColor: string
}>;

export type AppTheme = Modify<Theme, {
  name: 'day' | 'night' | 'light' | 'tinted' | 'system',
  settings?: Array<AppThemeSettings>
}>;

export type AutoDownloadPeerTypeSettings = {
  contacts: boolean,
  private: boolean,
  groups: boolean,
  channels: boolean
};

export type StateSettings = {
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
  // Last explicitly-picked theme variant on each side. The burger-menu Dark-Mode toggle uses
  // these so toggling away and back returns to the same variant (e.g. tinted ↔ classic ↔ tinted)
  // instead of always flipping to the legacy night/classic pair. Updated in themeController on
  // settings.theme changes; radios/UI / `switchTheme(name)` direct calls feed it.
  lastThemeNames: {
    dark: Extract<AppTheme['name'], 'night' | 'tinted'>,
    light: Extract<AppTheme['name'], 'day' | 'light'>
  },
  notifications: {
    sound: boolean,
    push: boolean,
    desktop: boolean,
    sentMessageSound: boolean,
    suggested: boolean,
    volume: number, // [0..1]
    novibrate?: boolean,
    nopreview?: boolean
  },
  nightTheme?: boolean, // ! DEPRECATED
  timeFormat: 'h12' | 'h23',
  liteMode: {[key in LiteModeKey]: boolean},
  savedAsForum: boolean,
  notifyAllAccounts: boolean,
  tabsInSidebar: boolean,
  seenTooltips: {
    storySound: boolean,
    noForwards: boolean,
    sidebarResize: boolean
  },
  playbackParams: ReturnType<AppMediaPlaybackController['getPlaybackParams']>,
  translations: {
    peers: {[peerId: PeerId]: string},
    enabledPeers: {[peerId: PeerId]: boolean},
    enabled: boolean,
    showInMenu: boolean,
    doNotTranslate: TranslatableLanguageISO[]
  },
  chatContextMenuHintWasShown: boolean,
  passcode: {
    enabled: boolean,
    autoLockTimeoutMins: number, // number | null is not working, gets reset after reloading the page
    lockShortcutEnabled: boolean,
    lockShortcut: PasscodeLockShortcutKey[],
    canAttemptAgainOn: number | null
  },
  logsDiffView?: boolean,
  instantView: {
    scale: number
  },
  cacheTTL: number,
  cacheSize: number,
  showArchiveInChatList: boolean,
  mediaEditor: {
    colorByBrush?: Partial<Record<ColoredBrushType, SavedBrushColor>>;
    brushSize?: number;
    brushType?: string;
    textColor?: SavedBrushColor;
    textSize?: number;
    textAlignment?: string;
    textStyle?: string;
    textFont?: FontKey;
  },
  // Persisted device choices for the audio/video stack used by the
  // SettingsCallsPanel ("Speakers and Camera" tab) and the per-call settings
  // popup. Empty string = follow the OS default (no setSinkId / no deviceId
  // constraint). `micVolume` is a 0..2 multiplier applied to the captured
  // input via a GainNode in StreamManager; 1 = unity.
  callDevices: {
    speakerId: string,
    microphoneId: string,
    cameraId: string,
    micVolume: number,
    // Whether to apply the browser's `noiseSuppression` constraint when
    // requesting a microphone stream. Skipped if the browser doesn't
    // advertise support (`IS_NOISE_SUPPRESSION_SUPPORTED`). Default true
    // matches tdesktop / the legacy behavior before this flag existed.
    noiseSuppression: boolean
  },
  // What the composer's recording button captures when the input is empty.
  // 'voice' shows a microphone icon and records OGG/Opus; 'video' shows a
  // videocamera icon and records a round 360x360 video note. Toggled by
  // clicking the button itself (when input is empty), matches the per-client
  // toggle in tdesktop / iOS / Android.
  recordingMediaType: 'voice' | 'video',
  // My QR-code popup: remembers the user's last picked chat-theme + brightness
  // so reopens land back where they left off. `nightMode` falls back to the
  // global theme's brightness when unset; `selectedThemeId` empty = the
  // DEFAULT_THEME sentinel (i.e. "use the current chat theme").
  qrCode: {
    nightMode?: boolean,
    selectedThemeId: string
  },
};

// (1 - use swatch, 2 - use picker color), (color from swatch), (color from picker)
export type SavedBrushColor = [1 | 2, string, string];

type CacheSomething<T> = {
  value: T,
  timestamp: number
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
  hideChatJoinRequests: {[peerId: PeerId]: number},
  // stateId?: number, // ! DEPRECATED
  notifySettings: {[k in Exclude<NotifyPeer['_'], 'notifyPeer'>]?: PeerNotifySettings.peerNotifySettings},
  confirmedWebViews: BotId[],
  hiddenSimilarChannels: number[],
  appConfig: MTAppConfig,
  accountThemes: AccountThemes.accountThemes,
  shownUploadSpeedTimestamp?: number,
  dontShowPaidMessageWarningFor: PeerId[],
  ageVerification?: {
    date: string,
    layer: number,
    clientVersion: string,
  },
  accountContentSettings: CacheSomething<AccountContentSettings>,


  // playbackParams?: StateSettings['playbackParams'], // ! MIGRATED TO SETTINGS
  // chatContextMenuHintWasShown?: StateSettings['chatContextMenuHintWasShown'], // ! MIGRATED TO SETTINGS
  // seenTooltips?: StateSettings['seenTooltips'], // ! MIGRATED TO SETTINGS
  // translations?: StateSettings['translations'], // ! MIGRATED TO SETTINGS
  settings?: StateSettings // ! DEPRECATED, BUT DON'T REMOVE BEFORE FULL MIGRATION
};

export type CommonState = {
  settings: StateSettings
};

// const BACKGROUND_DAY_MOBILE: Background = {
//   blur: false,
//   slug: '',
//   color: '#dbddbb,#6ba587,#d5d88d,#88b884',
//   highlightingColor: 'hsla(86.4, 43.846153%, 45.117647%, .4)',
//   intensity: 0,
//   id: '1'
// };

// const BACKGROUND_NIGHT_MOBILE: Background = {
//   blur: false,
//   slug: '',
//   color: '#0f0f0f',
//   highlightingColor: 'hsla(0, 0%, 3.82353%, 0.4)',
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
    message_colors: [0x5CA853],
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
  }, {
    _: 'themeSettings',
    pFlags: {},
    base_theme: {_: 'baseThemeTinted'},
    // accent + wallpaper aligned with iOS Dark Blue ("nightAccent"). See submodules/Telegram-iOS/
    // submodules/TelegramPresentationData/Sources/DefaultDarkTintedPresentationTheme.swift —
    // the home wallpaper is the `.blue` baseColor variant from `colorWallpaper` (line 13-14):
    //   case .blue: return (.variant7, 40, [0x1e3557, 0x182036, 0x1c4352, 0x16263a])
    // accent + bubble gradient come from the blue base-color preset so factory state matches what
    // the accent picker offers as its first swatch (the "default" swatch is hidden on tinted).
    accent_color: TINTED_DEFAULT_PRESET.accent_color,
    message_colors: TINTED_DEFAULT_PRESET.message_colors,
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
        // iOS stores intensity 40 (positive) for these dark wallpapers. tweb's pattern renderer
        // expects the dark-pattern sign convention: dark wallpapers carry negative intensity, abs
        // value used as the pattern overlay opacity. So we flip iOS' 40 to -40.
        intensity: -40,
        background_color: 0x1e3557,
        second_background_color: 0x182036,
        third_background_color: 0x1c4352,
        fourth_background_color: 0x16263a
      }
    }
  }, {
    _: 'themeSettings',
    pFlags: {},
    base_theme: {_: 'baseThemeDay'},
    accent_color: 0x2D7ED5,
    message_colors: [0x2D7ED5],
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
        background_color: 0xb1e0fa,
        second_background_color: 0x82b0d8,
        third_background_color: 0xa0d8e8,
        fourth_background_color: 0xe5f0f8
      }
    }
  }],
  slug: '',
  title: '',
  emoticon: '🏠',
  pFlags: {default: true}
};

// Per-base highlighting colors used when nothing has been computed from a wallpaper yet.
// Stored on every settings entry so that switching the active base theme keeps highlights coherent
// (mirrors how iOS persists a per-base TelegramThemeSettings array).
const DEFAULT_HIGHLIGHTING_COLORS: {[base in BaseTheme['_']]?: string} = {
  baseThemeClassic: 'hsla(86.4, 43.846153%, 45.117647%, .4)',
  baseThemeNight: 'hsla(299.142857, 44.166666%, 37.470588%, .4)',
  baseThemeTinted: 'hsla(258.461538, 50%, 65.490196%, .4)',
  baseThemeDay: 'hsla(210, 67.741935%, 50.588235%, .4)'
};

const makeDefaultAppTheme = (name: AppTheme['name']): AppTheme => {
  return {
    ...DEFAULT_THEME,
    name,
    settings: DEFAULT_THEME.settings.map((s) => ({
      ...s,
      highlightingColor: DEFAULT_HIGHLIGHTING_COLORS[s.base_theme._] ?? ''
    }))
  };
};

export const SETTINGS_INIT: StateSettings = {
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
    video_upload_maxbitrate: 100,
    small_queue_active_operations_max: 0,
    large_queue_active_operations_max: 0
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
    makeDefaultAppTheme('day'),
    makeDefaultAppTheme('night'),
    makeDefaultAppTheme('tinted'),
    makeDefaultAppTheme('light')
  ],
  theme: 'system',
  lastThemeNames: {
    dark: 'night',
    light: 'day'
  },
  notifications: {
    sound: false,
    push: true,
    desktop: true,
    sentMessageSound: true,
    suggested: false,
    volume: 0.5
  },
  timeFormat: getTimeFormat(),
  liteMode: {
    all: false,
    animations: false,
    blur: false,
    chat: false,
    chat_background: false,
    chat_spoilers: false,
    effects: false,
    effects_premiumstickers: false,
    effects_reactions: false,
    effects_emoji: false,
    emoji: false,
    emoji_appear: false,
    emoji_messages: false,
    emoji_panel: false,
    gif: false,
    stickers: false,
    stickers_chat: false,
    stickers_panel: false,
    video: false
  },
  savedAsForum: false,
  notifyAllAccounts: true,
  tabsInSidebar: false,
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
  chatContextMenuHintWasShown: false,
  seenTooltips: {
    storySound: false,
    noForwards: false,
    sidebarResize: false
  },
  translations: {
    peers: {},
    enabledPeers: {},
    enabled: true,
    showInMenu: true,
    doNotTranslate: []
  },
  passcode: {
    enabled: false,
    autoLockTimeoutMins: 0,
    lockShortcutEnabled: false,
    lockShortcut: ['Alt'],
    canAttemptAgainOn: null
  },
  instantView: {
    scale: 1
  },
  cacheTTL: 86400 * 7, // 1 week
  cacheSize: 0, // Auto
  showArchiveInChatList: true,
  mediaEditor: {
    colorByBrush: {}
  },
  callDevices: {
    speakerId: '',
    microphoneId: '',
    cameraId: '',
    micVolume: 1,
    noiseSuppression: true
  },
  recordingMediaType: 'voice',
  qrCode: {
    selectedThemeId: ''
  }
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
  hideChatJoinRequests: {},
  // stateId: nextRandomUint(32),
  notifySettings: {},
  confirmedWebViews: [],
  hiddenSimilarChannels: [],
  appConfig: {} as any,
  accountThemes: {} as any,
  dontShowPaidMessageWarningFor: [],
  accountContentSettings: {} as any
};

export const COMMON_STATE_INIT: CommonState = {
  settings: SETTINGS_INIT
};
