/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type lang from '../lang';
import type langSign from '../langSign';
import type {State} from '../config/state';
import DEBUG, {MOUNT_CLASS_TO} from '../config/debug';
import {HelpCountriesList, HelpCountry, LangPackDifference, LangPackString} from '../layer';
import App from '../config/app';
import rootScope from './rootScope';
import {IS_MOBILE} from '../environment/userAgent';
import deepEqual from '../helpers/object/deepEqual';
import safeAssign from '../helpers/object/safeAssign';
import capitalizeFirstLetter from '../helpers/string/capitalizeFirstLetter';
import matchUrlProtocol from './richTextProcessor/matchUrlProtocol';
import wrapUrl from './richTextProcessor/wrapUrl';
import {setDirection} from '../helpers/dom/setInnerHTML';
import setBlankToAnchor from './richTextProcessor/setBlankToAnchor';
import {createSignal} from 'solid-js';
import commonStateStorage from './commonStateStorage';

export const langPack: {[actionType: string]: LangPackKey} = {
  'messageActionChatCreate': 'ActionCreateGroup',
  'messageActionChatCreateYou': 'ActionYouCreateGroup',
  'messageActionChatEditTitle': 'ActionChangedTitle',
  'messageActionChatEditPhoto': 'ActionChangedPhoto',
  'messageActionChatEditVideo': 'ActionChangedVideo',
  'messageActionChatDeletePhoto': 'ActionRemovedPhoto',
  'messageActionChatReturn': 'ActionAddUserSelf',
  'messageActionChatReturnYou': 'ActionAddUserSelfYou',
  'messageActionChatJoined': 'ActionAddUserSelfMega',
  'messageActionChatJoinedYou': 'ChannelMegaJoined',
  'messageActionChatAddUser': 'ActionAddUser',
  'messageActionChatAddUsers': 'ActionAddUser',
  'messageActionChatLeave': 'ActionLeftUser',
  'messageActionChatLeaveYou': 'YouLeft',
  'messageActionChatDeleteUser': 'ActionKickUser',
  'messageActionChatJoinedByLink': 'ActionInviteUser',
  'messageActionPinMessage': 'Chat.Service.Group.UpdatedPinnedMessage',
  'messageActionContactSignUp': 'Chat.Service.PeerJoinedTelegram',
  'messageActionChannelCreate': 'ActionCreateChannel',
  'messageActionChannelEditTitle': 'Chat.Service.Channel.UpdatedTitle',
  'messageActionChannelEditPhoto': 'Chat.Service.Channel.UpdatedPhoto',
  'messageActionChannelEditVideo': 'Chat.Service.Channel.UpdatedVideo',
  'messageActionChannelDeletePhoto': 'Chat.Service.Channel.RemovedPhoto',
  'messageActionHistoryClear': 'HistoryCleared',
  'messageActionDiscussionStarted': 'DiscussionStarted',
  'messageActionChannelJoined': 'ChannelJoined',

  'messageActionChannelMigrateFrom': 'ActionMigrateFromGroup',

  'messageActionPhoneCall.video_in_ok': 'ChatList.Service.VideoCall.incoming',
  'messageActionPhoneCall.video_out_ok': 'ChatList.Service.VideoCall.outgoing',
  'messageActionPhoneCall.video_missed': 'ChatList.Service.VideoCall.Missed',
  'messageActionPhoneCall.video_cancelled': 'ChatList.Service.VideoCall.Cancelled',
  'messageActionPhoneCall.in_ok': 'ChatList.Service.Call.incoming',
  'messageActionPhoneCall.out_ok': 'ChatList.Service.Call.outgoing',
  'messageActionPhoneCall.missed': 'ChatList.Service.Call.Missed',
  'messageActionPhoneCall.cancelled': 'ChatList.Service.Call.Cancelled',

  'messageActionGroupCall.started': 'Chat.Service.VoiceChatStarted.Channel',
  'messageActionGroupCall.started_by': 'Chat.Service.VoiceChatStarted',
  'messageActionGroupCall.started_byYou': 'Chat.Service.VoiceChatStartedYou',
  'messageActionGroupCall.ended': 'Chat.Service.VoiceChatFinished.Channel',
  'messageActionGroupCall.ended_by': 'Chat.Service.VoiceChatFinished',
  'messageActionGroupCall.ended_byYou': 'Chat.Service.VoiceChatFinishedYou',

  'messageActionBotAllowed': 'Chat.Service.BotPermissionAllowed'
};

export type LangPackKey = /* string |  */keyof typeof lang | keyof typeof langSign;

export type FormatterArgument = string | number | Node | FormatterArgument[];
export type FormatterArguments = FormatterArgument[];

export const UNSUPPORTED_LANG_PACK_KEY: LangPackKey = IS_MOBILE ? 'Message.Unsupported.Mobile' : 'Message.Unsupported.Desktop';

namespace I18n {
  export const strings: Map<LangPackKey, LangPackString> = new Map();
  export const countriesList: HelpCountry[] = [];
  let pluralRules: Intl.PluralRules;

  let cacheLangPackPromise: Promise<LangPackDifference>;
  export let lastRequestedLangCode: string;
  export let lastRequestedNormalizedLangCode: string;
  export let lastAppliedLangCode: string;
  export let requestedServerLanguage = false;
  export let timeFormat: State['settings']['timeFormat'];
  export let isRTL = false;

  export const [langCodeNormalized, setLangCodeNormalized] = createSignal<TranslatableLanguageISO>();

  export function setRTL(rtl: boolean) {
    isRTL = rtl;
  }

  function setLangCode(langCode: string) {
    lastRequestedLangCode = langCode;
    lastRequestedNormalizedLangCode = langCode.split('-')[0];
    setLangCodeNormalized(lastRequestedNormalizedLangCode.split('-')[0] as any);
  }

  export function getCacheLangPack(): Promise<LangPackDifference> {
    if(cacheLangPackPromise) return cacheLangPackPromise;
    return cacheLangPackPromise = Promise.all([
      commonStateStorage.get('langPack') as Promise<LangPackDifference>,
      polyfillPromise
    ]).then(([langPack]) => {
      if(!langPack/*  || true */) {
        return loadLocalLangPack();
      } else if(DEBUG && false) {
        return getLangPack(langPack.lang_code);
      }/*  else if(langPack.appVersion !== App.langPackVersion) {
        return getLangPack(langPack.lang_code);
      } */

      if(!lastRequestedLangCode) {
        setLangCode(langPack.lang_code);
      }

      applyLangPack(langPack);
      return langPack;
    }).finally(() => {
      cacheLangPackPromise = undefined;
    });
  }

  function updateAmPm() {
    if(timeFormat === 'h12') {
      try {
        const dateTimeFormat = getDateTimeFormat({hour: 'numeric', minute: 'numeric', hour12: true});
        const date = new Date();
        date.setHours(0);
        const amText = dateTimeFormat.format(date);
        amPmCache.am = amText.split(/\s/)[1];
        date.setHours(12);
        const pmText = dateTimeFormat.format(date);
        amPmCache.pm = pmText.split(/\s/)[1];
      } catch(err) {
        console.error('cannot get am/pm', err);
        amPmCache = {am: 'AM', pm: 'PM'};
      }
    }
  }

  export function setTimeFormat(
    format: State['settings']['timeFormat'],
    haveToUpdate = !!timeFormat && timeFormat !== format
  ) {
    timeFormat = format;

    updateAmPm();

    if(haveToUpdate) {
      cachedDateTimeFormats.clear();
      const elements = Array.from(document.querySelectorAll(`.i18n`)) as HTMLElement[];
      elements.forEach((element) => {
        const instance = weakMap.get(element);

        if(instance instanceof IntlDateElement) {
          instance.update();
        }
      });
    }
  }

  export function loadLocalLangPack() {
    const defaultCode = App.langPackCode;
    setLangCode(defaultCode);
    return Promise.all([
      import('../lang'),
      import('../langSign'),
      import('../countries')
    ]).then(([lang, langSign, countries]) => {
      const strings: LangPackString[] = [];
      formatLocalStrings(lang.default, strings);
      formatLocalStrings(langSign.default, strings);

      const langPack: LangPackDifference = {
        _: 'langPackDifference',
        from_version: 0,
        lang_code: defaultCode,
        strings,
        version: 0,
        local: true,
        countries: countries.default
      };
      return saveLangPack(langPack);
    });
  }

  export function loadLangPack(langCode: string, web?: boolean) {
    web = true;
    requestedServerLanguage = true;
    const managers = rootScope.managers;
    return Promise.all([
      managers.apiManager.invokeApiCacheable('langpack.getLangPack', {
        lang_code: langCode,
        lang_pack: web ? 'web' : App.langPack
      }),
      !web && managers.apiManager.invokeApiCacheable('langpack.getLangPack', {
        lang_code: langCode,
        lang_pack: 'android'
      }),
      import('../lang'),
      import('../langSign'),
      managers.apiManager.invokeApiCacheable('help.getCountriesList', {
        lang_code: langCode,
        hash: 0
      }) as Promise<HelpCountriesList.helpCountriesList>,
      polyfillPromise
    ]);
  }

  export function getStrings(langCode: string, strings: string[]) {
    return rootScope.managers.apiManager.invokeApi('langpack.getStrings', {
      lang_pack: App.langPack,
      lang_code: langCode,
      keys: strings
    });
  }

  export function formatLocalStrings(strings: any, pushTo: LangPackString[] = []) {
    for(const i in strings) {
      // @ts-ignore
      const v = strings[i];
      if(typeof(v) === 'string') {
        pushTo.push({
          _: 'langPackString',
          key: i,
          value: v
        });
      } else {
        pushTo.push({
          _: 'langPackStringPluralized',
          key: i,
          ...v
        });
      }
    }

    return pushTo;
  }

  export function getLangPack(langCode: string, web?: boolean) {
    setLangCode(langCode);
    return loadLangPack(langCode, web).then(([langPack1, langPack2, localLangPack1, localLangPack2, countries, _]) => {
      let strings: LangPackString[] = [];

      [localLangPack1, localLangPack2].forEach((l) => {
        formatLocalStrings(l.default as any, strings);
      });

      strings = strings.concat(...[langPack1.strings, langPack2.strings].filter(Boolean));

      langPack1.strings = strings;
      langPack1.countries = countries;
      return saveLangPack(langPack1);
    });
  }

  export function saveLangPack(langPack: LangPackDifference) {
    langPack.appVersion = App.langPackVersion;

    return commonStateStorage.set({langPack}).then(() => {
      applyLangPack(langPack);
      return langPack;
    });
  }

  export const polyfillPromise = (function checkIfPolyfillNeeded() {
    if(typeof(Intl) !== 'undefined' && typeof(Intl.PluralRules) !== 'undefined'/*  && false */) {
      return Promise.resolve();
    } else {
      return import('./pluralPolyfill').then((_Intl) => {
        (window as any).Intl = Object.assign(typeof(Intl) !== 'undefined' ? Intl : {}, _Intl.default);
      });
    }
  })();

  export function applyLangPack(langPack: LangPackDifference) {
    const currentLangCode = lastRequestedLangCode;
    if(langPack.lang_code !== currentLangCode) {
      return;
    }

    try {
      pluralRules = new Intl.PluralRules(lastRequestedNormalizedLangCode);
    } catch(err) {
      console.error('pluralRules error', err);
      pluralRules = new Intl.PluralRules(lastRequestedNormalizedLangCode.split('-', 1)[0]);
    }

    try {
      pluralRules = new Intl.PluralRules(langPack.lang_code);
    } catch(err) {
      console.error('pluralRules error', err);
      pluralRules = new Intl.PluralRules(langPack.lang_code.split('-', 1)[0]);
    }

    strings.clear();

    for(const string of langPack.strings) {
      strings.set(string.key as LangPackKey, string);
    }

    if(langPack.countries) {
      countriesList.length = 0;
      countriesList.push(...langPack.countries.countries);

      langPack.countries.countries.forEach((country) => {
        if(country.name) {
          const langPackKey: any = country.default_name;
          strings.set(langPackKey, {
            _: 'langPackString',
            key: langPackKey,
            value: country.name
          });
        }
      });
    }

    if(lastAppliedLangCode !== currentLangCode) {
      if(lastAppliedLangCode && rootScope.myId) {
        rootScope.managers.appReactionsManager.resetAvailableReactions();
        rootScope.managers.appUsersManager.indexMyself();
        rootScope.managers.dialogsStorage.indexMyDialog();
      }

      lastAppliedLangCode = currentLangCode;
      cachedDateTimeFormats.clear();
      updateAmPm();
      rootScope.dispatchEvent('language_change', currentLangCode);
    }

    const elements = Array.from(document.querySelectorAll(`.i18n`)) as HTMLElement[];
    elements.forEach((element) => {
      const instance = weakMap.get(element);

      if(instance) {
        instance.update();
      }
    });
  }

  function pushNextArgument(out: ReturnType<typeof superFormatter>, args: FormatterArguments, indexHolder: {i: number}, i?: number) {
    const arg = args[i === undefined ? indexHolder.i++ : i];
    if(Array.isArray(arg)) {
      out.push(...arg as any);
    } else {
      out.push(arg);
    }
  }

  export function superFormatter(input: string, args?: FormatterArguments, indexHolder?: {i: number}): Exclude<FormatterArgument, FormatterArgument[]>[] {
    if(!indexHolder) { // set starting index for arguments without order
      indexHolder = {i: 0};
      const indexes = input.match(/(%|un)\d+/g);
      if(indexes?.length) {
        indexHolder.i = Math.max(...indexes.map((str) => +str.replace(/\D/g, '')));
      }
    }

    const out: ReturnType<typeof superFormatter> = [];
    const regExp = /(\*\*|__)(.+?)\1|(\n)|(\[.+?\]\(.*?\))|un\d|%\d\$.|%\S/g;

    let lastIndex = 0;
    input.replace(regExp, (match, p1: any, p2: any, p3: any, p4: string, offset: number, string: string) => {
      // console.table({match, p1, p2, offset, string});

      if(offset > lastIndex) {
        out.push(string.slice(lastIndex, offset));
      }

      if(p1) {
        // offset += p1.length;
        let element: HTMLElement;
        switch(p1) {
          case '**': {
            element = document.createElement('b');
            break;
          }

          case '__': {
            element = document.createElement('i');
            break;
          }
        }

        element.append(...superFormatter(p2, args, indexHolder) as any);
        out.push(element);
      } else if(p3) {
        out.push(document.createElement('br'));
      } else if(p4) {
        const idx = p4.lastIndexOf(']');
        const text = p4.slice(1, idx);

        const url = p4.slice(idx + 2, p4.length - 1);
        let a: HTMLAnchorElement;
        if(url && matchUrlProtocol(url)) {
          a = document.createElement('a');
          const wrappedUrl = wrapUrl(url);
          a.href = wrappedUrl.url;
          if(wrappedUrl.onclick) a.setAttribute('onclick', wrappedUrl.onclick + '(this)');
          setBlankToAnchor(a);
        } else {
          a = args[indexHolder.i++] as HTMLAnchorElement;

          if(a instanceof DocumentFragment) { // right after wrapRichText
            a = a.firstChild as any;
          }

          if(typeof(a) !== 'string') {
            a.textContent = ''; // reset content
          }
        }

        const formatted = superFormatter(text, args, indexHolder) as any;
        if(typeof(a) === 'string') {
          out.push(...formatted);
        } else {
          a.append(...formatted);
          out.push(a);
        }
      } else if(args) {
        const index = match.replace(/\D/g, '');
        pushNextArgument(
          out,
          args,
          indexHolder,
          !index || Number.isNaN(+index) ? undefined : Math.min(args.length - 1, +index - 1)
        );
      }

      lastIndex = offset + match.length;
      return '';
    });

    if(lastIndex !== input.length) {
      out.push(input.slice(lastIndex));
    }

    return out;
  }

  export function format(key: LangPackKey, plain: true, args?: FormatterArguments): string;
  export function format(key: LangPackKey, plain?: false, args?: FormatterArguments): ReturnType<typeof superFormatter>;
  export function format(key: LangPackKey, plain = false, args?: FormatterArguments): ReturnType<typeof superFormatter> | string {
    const str = strings.get(key);
    let input: string;
    if(str) {
      if(str._ === 'langPackStringPluralized' && args?.length) {
        let v = args[0] as number | string;
        if(typeof(v) === 'string') v = +v.replace(/\D/g, '');
        const s = pluralRules.select(v);
        // @ts-ignore
        input = str[s + '_value'] || str['other_value'];
      } else if(str._ === 'langPackString') {
        input = str.value;
      } else {
        // input = '[' + key + ']';
        input = key;
      }
    } else {
      // input = '[' + key + ']';
      input = key;
    }

    const result = superFormatter(input, args);
    if(plain) { // * let's try a hack now... (don't want to replace []() entity)
      return result.map((item) => item instanceof Node ? item.textContent : item).join('');
    } else {
      return result;
    }

    /* if(plain) {
      if(args?.length) {
        const regExp = /un\d|%\d\$.|%./g;
        let i = 0;
        input = input.replace(regExp, (match, offset, string) => {
          return '' + args[i++];
        });
      }

      return input;
    } else {
      return superFormatter(input, args);
    } */
  }

  export const weakMap: WeakMap<HTMLElement, IntlElementBase<IntlElementBaseOptions>> = new WeakMap();

  export type IntlElementBaseOptions = {
    element?: HTMLElement,
    property?: 'innerText' | 'innerHTML' | 'placeholder' | 'textContent',
  };

  abstract class IntlElementBase<Options extends IntlElementBaseOptions> {
    public element: IntlElementBaseOptions['element'];
    public property: IntlElementBaseOptions['property'];

    constructor(options?: Options) {
      this.element = options?.element || document.createElement('span');
      this.element.classList.add('i18n');

      this.property = options?.property;

      weakMap.set(this.element, this);
    }

    abstract update(options?: Options): void;
  }

  export type IntlElementOptions = IntlElementBaseOptions & {
    key?: LangPackKey,
    args?: FormatterArguments
  };
  export class IntlElement extends IntlElementBase<IntlElementOptions> {
    public key: IntlElementOptions['key'];
    public args: IntlElementOptions['args'];

    constructor(options: IntlElementOptions = {}) {
      super({...options, property: options.property ?? 'innerHTML'});

      if(options?.key) {
        this.update(options);
      }
    }

    public update(options?: IntlElementOptions) {
      safeAssign(this, options);

      if(!this.key) {
        this.element.replaceChildren();
        return;
      }

      if(this.property === 'innerHTML') {
        this.element.replaceChildren(...format(this.key, false, this.args) as any);
        if(this.args?.length) {
          this.element.normalize();
        }
      } else {
        // @ts-ignore
        const v = this.element[this.property];
        const formatted = format(this.key, true, this.args);

        // * hasOwnProperty won't work here
        if(v === undefined) this.element.dataset[this.property] = formatted;
        else (this.element as HTMLInputElement)[this.property] = formatted;
      }
    }

    public compareAndUpdateBool(options?: IntlElementOptions): boolean {
      if(this.key === options.key && deepEqual(this.args, options.args)) {
        return false;
      }

      this.update(options);
      return true;
    }

    public compareAndUpdate(options?: IntlElementOptions) {
      if(this.key === options.key && deepEqual(this.args, options.args)) {
        return;
      }

      return this.update(options);
    }
  }

  const cachedDateTimeFormats: Map<string, Intl.DateTimeFormat> = new Map();
  export function getDateTimeFormat(options: Intl.DateTimeFormatOptions = {}) {
    const json = JSON.stringify(options);
    let dateTimeFormat = cachedDateTimeFormats.get(json);
    if(!dateTimeFormat) {
      dateTimeFormat = new Intl.DateTimeFormat(lastRequestedNormalizedLangCode + '-u-hc-' + timeFormat, options);
      cachedDateTimeFormats.set(json, dateTimeFormat);
    }

    return dateTimeFormat;
  }

  export let amPmCache = {am: 'AM', pm: 'PM'};
  export type IntlDateElementOptions = IntlElementBaseOptions & {
    date?: Date,
    options: Intl.DateTimeFormatOptions
  };
  export class IntlDateElement extends IntlElementBase<IntlDateElementOptions> {
    public date: IntlDateElementOptions['date'];
    public options: IntlDateElementOptions['options'];

    constructor(options: IntlDateElementOptions) {
      super({...options, property: options.property ?? 'textContent'});
      setDirection(this.element);

      if(options?.date) {
        this.update(options);
      }
    }

    public update(options?: IntlDateElementOptions) {
      safeAssign(this, options);

      let text: string;
      if(this.options.hour && this.options.minute && Object.keys(this.options).length === 2/*  && false */) {
        const hours = this.date.getHours();
        text = ('0' + (timeFormat === 'h12' ? (hours % 12) || 12 : hours)).slice(-2) + ':' + ('0' + this.date.getMinutes()).slice(-2);
        // if(this.options.second) {
        //   text += ':' + ('0' + this.date.getSeconds()).slice(-2);
        // }

        if(timeFormat === 'h12') {
          text += ' ' + (hours < 12 ? amPmCache.am : amPmCache.pm);
        }
      } else {
        // * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Locale/hourCycle#adding_an_hour_cycle_via_the_locale_string
        const dateTimeFormat = getDateTimeFormat(this.options);
        text = capitalizeFirstLetter(dateTimeFormat.format(this.date));
      }

      (this.element as any)[this.property] = text;
    }
  }

  export function i18n(key: LangPackKey, args?: FormatterArguments) {
    return new IntlElement({key, args}).element;
  }

  export function i18n_(options: IntlElementOptions) {
    return new IntlElement(options).element;
  }

  export function _i18n(element: HTMLElement, key: LangPackKey, args?: FormatterArguments, property?: IntlElementOptions['property']) {
    return new IntlElement({element, key, args, property}).element;
  }
}

export {I18n};
export default I18n;

const i18n = I18n.i18n;
export {i18n};

const i18n_ = I18n.i18n_;
export {i18n_};

const _i18n = I18n._i18n;
export {_i18n};

export function joinElementsWith<T extends Node | string | Array<Node | string>>(
  elements: T[],
  joiner: T | string | ((isLast: boolean) => T)
): T[] {
  const arr = elements.slice(0, 1) as T[];
  for(let i = 1; i < elements.length; ++i) {
    const isLast = (elements.length - 1) === i;
    arr.push(typeof(joiner) === 'function' ? (joiner as any)(isLast) : joiner);
    arr.push(elements[i]);
  }

  return arr;
}


export function join(elements: (Node | string)[], useLast: boolean, plain: true): string;
export function join(elements: (Node | string)[], useLast?: boolean, plain?: false): (string | Node)[];
export function join(elements: (Node | string)[], useLast: boolean, plain: boolean): string | (string | Node)[];
export function join(elements: (Node | string)[], useLast = true, plain?: boolean): string | (string | Node)[] {
  const joined = joinElementsWith(elements, (isLast) => {
    const langPackKey: LangPackKey = isLast && useLast ? 'AutoDownloadSettings.LastDelimeter' : 'AutoDownloadSettings.Delimeter';
    return plain ? I18n.format(langPackKey, true) : i18n(langPackKey);
  });

  return plain ? joined.join('') : joined;
}

MOUNT_CLASS_TO && (MOUNT_CLASS_TO.I18n = I18n);
