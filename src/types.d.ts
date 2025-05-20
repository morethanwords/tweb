import {AuthSentCode} from './layer';
import type {ApiError} from './lib/mtproto/apiManager';
import {ActiveAccountNumber} from './lib/sessionStorage';

export type DcId = number;
export type TrueDcId = 1 | 2 | 3 | 4 | 5;
export type DcAuthKey = `dc${TrueDcId}_auth_key`;
export type DcServerSalt = `dc${TrueDcId}_server_salt`;

export type InvokeApiOptions = Partial<{
  dcId: DcId,
  accountNumber: ActiveAccountNumber,
  floodMaxTimeout: number,
  noErrorBox: true,
  fileUpload: true,
  ignoreErrors: true,
  fileDownload: true,
  createNetworker: true,
  singleInRequest: true,
  startMaxLength: number,

  prepareTempMessageId: string,
  afterMessageId: string,
  resultType: string,

  timeout: number,
  waitTime: number,
  stopTime: number,
  rawError: any
}>;

export type WorkerTaskTemplate = {
  type: string,
  id: number,
  payload?: any,
  error?: ApiError
};

export type WorkerTaskVoidTemplate = Omit<WorkerTaskTemplate, 'id'>;

export type Modify<T, R> = Omit<T, keyof R> & R;

// export type Parameters<T> = T extends (... args: infer T) => any ? T : never;

export type ArgumentTypes<F extends Function> = F extends (...args: infer A) => any ? A : never;
export type SuperReturnType<F extends Function> = F extends (...args: any) => any ? ReturnType<F> : never;
export declare function assumeType<T>(x: unknown): asserts x is T;

export type AnyLiteral = Record<string, any>;
export type AnyClass = new (...args: any[]) => any;
export type AnyFunction = (...args: any) => any;
export type AnyToVoidFunction = (...args: any) => void;
export type NoneToVoidFunction = () => void;

export type Awaited<T> = T extends PromiseLike<infer U> ? Awaited<U> : T;

// https://stackoverflow.com/a/60762482/6758968
type Shift<A extends Array<any>> = ((...args: A) => void) extends ((...args: [A[0], ...infer R]) => void) ? R : never;

type GrowExpRev<A extends Array<any>, N extends number, P extends Array<Array<any>>> = A['length'] extends N ? A : {
  0: GrowExpRev<[...A, ...P[0]], N, P>,
  1: GrowExpRev<A, N, Shift<P>>
}[[...A, ...P[0]][N] extends undefined ? 0 : 1];

type GrowExp<A extends Array<any>, N extends number, P extends Array<Array<any>>> = A['length'] extends N ? A : {
  0: GrowExp<[...A, ...A], N, [A, ...P]>,
  1: GrowExpRev<A, N, P>
}[[...A, ...A][N] extends undefined ? 0 : 1];

export type FixedSizeArray<T, N extends number> = N extends 0 ? [] : N extends 1 ? [T] : GrowExp<[T, T], N, [[T]]>;

// taken somewhere from stackoverflow
// First, define a type that, when passed a union of keys, creates an object which
// cannot have those properties. I couldn't find a way to use this type directly,
// but it can be used with the below type.
type Impossible<K extends keyof any> = {
  [P in K]: never;
};

// The secret sauce! Provide it the type that contains only the properties you want,
// and then a type that extends that type, based on what the caller provided
// using generics.
type NoExtraProperties<T, U extends T = T> = U & Impossible<Exclude<keyof U, keyof T>>;

type ModifyFunctionsToAsync<T> = {
  [key in keyof T]: T[key] extends (...args: infer A) => infer R ? (R extends PromiseLike<infer O> ? T[key] : (...args: A) => Promise<Awaited<R>>) : T[key]
};

export type Mutable<T> = {
  -readonly [K in keyof T]: T[K];
};

export type MaybePromise<T> = T | Promise<T>;

export type PickByType<T, Value> = {
  [P in keyof T as T[P] extends Value | undefined ? P : never]: T[P]
};

export type InstanceOf<T> = T extends new (...args: any[]) => infer R ? R : never;

export type StringKey<T extends keyof any> = T extends string ? T : never;

export type AuthState = AuthState.signIn | AuthState.signQr | AuthState.authCode | AuthState.password | AuthState.signUp | AuthState.signedIn | AuthState.signImport;
export namespace AuthState {
  export type signIn = {
    _: 'authStateSignIn'
  };

  export type signQr = {
    _: 'authStateSignQr'
  };

  export type authCode = {
    _: 'authStateAuthCode',
    sentCode: AuthSentCode.authSentCode
  };

  export type password = {
    _: 'authStatePassword'
  };

  export type signUp = {
    _: 'authStateSignUp',
    authCode: {
      phone_number: string,
      phone_code_hash: string
    }
  };

  export type signedIn = {
    _: 'authStateSignedIn'
  };

  export type signImport = {
    _: 'authStateSignImport',
    data: {
      token: string,
      userId: UserId,
      dcId: DcId,
      isTest: boolean,
      tgAddr: string
    }
  };
}

export type SendMessageEmojiInteractionData = {
  a: {t: number, i: 1}[],
  v: 1
};

export type TelegramWebViewTheme = {
  bg_color: string,
  secondary_bg_color: string,         // 143
  text_color: string,
  hint_color: string,
  link_color: string,
  button_color: string,
  button_text_color: string,          // 166
  header_bg_color: string,            // 166
  accent_text_color: string,          // 166
  section_bg_color: string            // 166
  section_header_text_color: string,  // 166
  subtitle_text_color: string,        // 166
  destructive_text_color: string      // 166
};

/**
 * @link https://core.telegram.org/api/web-events#postmessage-api
 */
export type TelegramWebViewEventMap = {
  iframe_ready: {
    reload_supported?: boolean
  },
  iframe_will_reload: void,
  payment_form_submit: {
    credentials: any,
    title: string
  },
  web_app_open_tg_link: {
    path_full: string // '/username'
  },
  web_app_close: void,
  web_app_open_popup: {
    title?: string,
    message: string,
    buttons: {
      type: 'ok' | 'close' | 'cancel' | 'default' | 'destructive',
      text: string,
      id: string
    }[]
  },
  web_app_setup_closing_behavior: {
    need_confirmation: boolean
  },
  web_app_open_scan_qr_popup: {
    text?: string
  },
  web_app_set_background_color: {
    color: string
  },
  web_app_read_text_from_clipboard: {
    req_id: string
  },
  web_app_set_header_color: {
    color_key?: 'bg_color' | 'secondary_bg_color',
    color?: string // 163, #RRGGBB
  },
  web_app_data_send: {
    data: string
  },
  web_app_switch_inline_query: {
    chat_types?: TelegramChoosePeerType[],
    query: string
  },
  web_app_trigger_haptic_feedback: {
    type: 'impact',
    impact_style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'
  } | {
    type: 'notification',
    notification_type: 'error' | 'success' | 'warning'
  } | {
    type: 'selection_change'
  },
  web_app_open_link: {
    url: string
  },
  web_app_open_invoice: {
    slug: string
  },
  web_app_expand: void,
  web_app_request_viewport: void,
  web_app_request_theme: void,
  web_app_ready: void,
  web_app_setup_main_button: {
    is_visible: boolean,
    is_active: boolean,
    text: string,
    color: string,
    text_color: string,
    is_progress_visible: boolean
  },
  web_app_setup_secondary_button: {
    is_visible: boolean,
    is_active: boolean,
    text: string,
    color: string,
    text_color: string,
    is_progress_visible: boolean
    position: 'left' | 'right' | 'top' | 'bottom'
  },
  web_app_setup_back_button: {
    is_visible: boolean
  },
  web_app_setup_settings_button: {
    is_visible: boolean
  },  // 166
  web_app_request_write_access: void, // 162
  web_app_request_phone: void,        // 162
  web_app_invoke_custom_method: {     // 162
    req_id: string,
    method: string,
    params: any
  },
  web_app_biometry_get_info: void,
  web_app_set_bottom_bar_color: {
    color: string
  },
  web_app_start_accelerometer: {
    refresh_rate: number
  },
  web_app_stop_accelerometer: void,
  web_app_start_gyroscope: {
    refresh_rate: number
  },
  web_app_stop_gyroscope: void,
  web_app_start_device_orientation: {
    refresh_rate: number
    need_absolute?: boolean
  },
  web_app_stop_device_orientation: void,
  web_app_add_to_home_screen: void,
  web_app_check_home_screen: void,
  web_app_set_emoji_status: {
    custom_emoji_id: string,
    duration?: number
  }
  web_app_request_emoji_status_access: void
  web_app_check_location: void
  web_app_request_location: void
  web_app_open_location_settings: void
  web_app_request_file_download: {
    file_name: string,
    url: string
  }
  web_app_device_storage_save_key: {
    req_id: string,
    key: string,
    value: string | null
  }
  web_app_device_storage_get_key: {
    req_id: string,
    key: string,
  }
  web_app_device_storage_clear: {
    req_id: string,
  }
  web_app_secure_storage_save_key: {
    req_id: string,
    key: string,
    value: string | null
  }
  web_app_secure_storage_get_key: {
    req_id: string,
    key: string,
  }
  web_app_secure_storage_restore_key: {
    req_id: string,
    key: string,
  }
  web_app_secure_storage_clear: {
    req_id: string,
  }
  web_app_share_to_story: unknown,
  web_app_send_prepared_message: {id: string},
  web_app_request_fullscreen: void,
  web_app_exit_fullscreen: void,
  share_score: void,
  share_game: void,
  game_over: void,
  game_loaded: void,
  resize_frame: {
    height: number
  }
};

export type TelegramWebViewSerializedEvent<T extends keyof TelegramWebViewEventMap> = {
  eventType: T,
  eventData: TelegramWebViewEventMap[T]
};

export type TelegramWebViewSerializedEvents = {
  [type in keyof TelegramWebViewEventMap]: TelegramWebViewSerializedEvent<type>
};

export type TelegramWebViewEvent = TelegramWebViewSerializedEvents[keyof TelegramWebViewEventMap];
export type TelegramWebViewEventCallback = (event: TelegramWebViewEvent) => void;

export type TelegramWebViewSendEventMap = {
  // https://core.telegram.org/api/bots/webapps
  main_button_pressed: void,
  secondary_button_pressed: void,
  settings_button_pressed: void,
  back_button_pressed: void,
  invoice_closed: {
    slug: string,
    status: 'cancelled' | 'failed' | 'pending' | 'paid'
  },
  viewport_changed: {
    height: number,
    is_state_stable: boolean,
    is_expanded: boolean
  },
  theme_changed: {
    theme_params: TelegramWebViewTheme
  },
  popup_closed: {
    button_id?: string
  },
  scan_qr_popup_closed: {
    data?: string
  },
  clipboard_text_received: {
    req_id: string,
    data?: string
  },
  write_access_requested: { // 162
    status: 'allowed' | 'cancelled'
  },
  phone_requested: {        // 162
    status: 'sent' | 'cancelled'
  },
  custom_method_invoked: {  // 162
    req_id: string,
    result: any,
    error?: string
  },
  reload_iframe: void,      // 166
  biometry_info_received: {
    available: boolean
    type?: 'finger' | 'face' | 'unknown'
    access_requested: boolean
    access_granted: boolean
    token_saved: boolean
    device_id: string
  },
  accelerometer_failed: { error: string },
  accelerometer_started: void,
  accelerometer_stopped: void,
  accelerometer_changed: { x: number, y: number, z: number },
  gyroscope_failed: { error: string },
  gyroscope_started: void,
  gyroscope_stopped: void,
  gyroscope_changed: { x: number, y: number, z: number },
  device_orientation_failed: { error: string },
  device_orientation_started: void,
  device_orientation_stopped: void,
  device_orientation_changed: { absolute: boolean, alpha: number, beta: number, gamma: number },
  home_screen_failed: { error: string },
  home_screen_checked: {
    status: 'unsupported' | 'unknown' | 'added' | 'missed'
  }
  emoji_status_failed: { error: string },
  emoji_status_set: void,
  emoji_status_access_requested: {
    status: 'allowed' | 'cancelled'
  }
  location_checked: {
    available: boolean
    access_requested?: boolean
    access_granted?: boolean
  }
  location_requested: { available: false } | {
    available: true,
    latitude: number,
    longitude: number,
    altitude: number,
    course: number,
    speed: number,
    horizontal_accuracy: number,
    vertical_accuracy: number,
    course_accuracy: number,
    speed_accuracy: number
  }
  file_download_requested: {
    status: 'downloading' | 'cancelled'
  }
  device_storage_key_saved: {
    req_id: string,
  }
  device_storage_key_received: {
    req_id: string,
    value: string | null
  }
  device_storage_cleared: {
    req_id: string,
  }
  device_storage_failed: {
    req_id: string,
    error: 'KEY_INVALID' | 'VALUE_INVALID' | 'QUOTA_EXCEEDED' | 'UNKNOWN_ERROR'
  }
  secure_storage_failed: {
    req_id: string,
    error: 'UNSUPPORTED'
  }
  fullscreen_changed: { is_fullscreen: boolean }
  fullscreen_failed: { error: string }
  visibility_changed: { is_visible: boolean }
  content_safe_area_changed: {
    top: number,
    left: number,
    right: number,
    bottom: number,
  }
  prepared_message_failed: { error: string }
  gyroscope_failed: { error: string }
  device_orientation_failed: { error: string }
  accelerometer_failed: { error: string }
  prepared_message_sent: void
};

// export type TelegramWebViewSendSerializedEvent<T extends keyof TelegramWebViewSendEventMap> = {
//   eventType: T,
//   eventData: TelegramWebViewSendEventMap[T]
// };

// export type TelegramWebViewSendSerializedEvents = {
//   [type in keyof TelegramWebViewSendEventMap]: TelegramWebViewSendSerializedEvent<type>
// };

// export type TelegramWebViewSendEvent = TelegramWebViewSerializedEvents[keyof TelegramWebViewSendEventMap];
// export type TelegramWebViewSendEventCallback = (event: TelegramWebViewSendEvent) => void;
