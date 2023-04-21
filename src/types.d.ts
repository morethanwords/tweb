import {AuthSentCode} from './layer';
import type {ApiError} from './lib/mtproto/apiManager';

export type DcId = number;
export type TrueDcId = 1 | 2 | 3 | 4 | 5;
export type DcAuthKey = `dc${TrueDcId}_auth_key`;
export type DcServerSalt = `dc${TrueDcId}_server_salt`;

export type InvokeApiOptions = Partial<{
  dcId: DcId,
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
  secondary_bg_color: string,
  text_color: string,
  hint_color: string,
  link_color: string,
  button_color: string,
  button_text_color: string
};

/**
 * @link https://core.telegram.org/api/web-events#postmessage-api
 */
export type TelegramWebViewEventMap = {
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
    color_key: 'bg_color' | 'secondary_bg_color'
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
  web_app_setup_back_button: {
    is_visible: boolean
  },
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
  }
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
