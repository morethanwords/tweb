import DEBUG, { MOUNT_CLASS_TO } from "../config/debug";
import { safeAssign } from "../helpers/object";
import { capitalizeFirstLetter } from "../helpers/string";
import type lang from "../lang";
import { LangPackDifference, LangPackString } from "../layer";
import apiManager from "./mtproto/mtprotoworker";
import sessionStorage from "./sessionStorage";
import App from "../config/app";

export const langPack: {[actionType: string]: LangPackKey} = {
  "messageActionChatCreate": "ActionCreateGroup",
	"messageActionChatEditTitle": "ActionChangedTitle",
	"messageActionChatEditPhoto": "ActionChangedPhoto",
	"messageActionChatEditVideo": "ActionChangedVideo",
	"messageActionChatDeletePhoto": "ActionRemovedPhoto",
	"messageActionChatReturn": "ActionAddUserSelf",
	"messageActionChatReturnYou": "ActionAddUserSelfYou",
	"messageActionChatJoined": "ActionAddUserSelfMega",
	"messageActionChatJoinedYou": "ChannelMegaJoined",
  "messageActionChatAddUser": "ActionAddUser",
  "messageActionChatAddUsers": "ActionAddUser",
	"messageActionChatLeave": "ActionLeftUser",
	"messageActionChatDeleteUser": "ActionKickUser",
	"messageActionChatJoinedByLink": "ActionInviteUser",
  "messageActionPinMessage": "ActionPinnedNoText",
  "messageActionContactSignUp": "Chat.Service.PeerJoinedTelegram",
	"messageActionChannelCreate": "ActionCreateChannel",
	"messageActionChannelEditTitle": "Chat.Service.Channel.UpdatedTitle",
	"messageActionChannelEditPhoto": "Chat.Service.Channel.UpdatedPhoto",
	"messageActionChannelEditVideo": "Chat.Service.Channel.UpdatedVideo",
  "messageActionChannelDeletePhoto": "Chat.Service.Channel.RemovedPhoto",
  "messageActionHistoryClear": "HistoryCleared",

  "messageActionChannelMigrateFrom": "ActionMigrateFromGroup",

  "messageActionPhoneCall.in_ok": "ChatList.Service.Call.incoming",
	"messageActionPhoneCall.out_ok": "ChatList.Service.Call.outgoing",
	"messageActionPhoneCall.in_missed": "ChatList.Service.Call.Missed",
	"messageActionPhoneCall.out_missed": "ChatList.Service.Call.Cancelled",

	"messageActionBotAllowed": "Chat.Service.BotPermissionAllowed"
};

export type LangPackKey = string | keyof typeof lang;

namespace I18n {
	export const strings: Map<LangPackKey, LangPackString> = new Map();
	let pluralRules: Intl.PluralRules;

	let lastRequestedLangCode: string;
	export function getCacheLangPack(): Promise<LangPackDifference> {
		return Promise.all([
			sessionStorage.get('langPack'),
			polyfillPromise
		]).then(([langPack]) => {
			if(!langPack/*  || true */) {
				return getLangPack('en');
			} else if(DEBUG) {
				return getLangPack(langPack.lang_code);
			} else if(langPack.appVersion !== App.langPackVersion) {
				return getLangPack(langPack.lang_code);
			}
			
			if(!lastRequestedLangCode) {
				lastRequestedLangCode = langPack.lang_code;
			}
			
			applyLangPack(langPack);
			return langPack;
		});
	}

	export function getLangPack(langCode: string) {
		lastRequestedLangCode = langCode;
		return Promise.all([
			apiManager.invokeApi('langpack.getLangPack', {
				lang_code: langCode,
				lang_pack: 'macos'
			}),
			apiManager.invokeApi('langpack.getLangPack', {
				lang_code: langCode,
				lang_pack: 'android'
			}),
			import('../lang'),
			polyfillPromise
		]).then(([langPack, _langPack, __langPack, _]) => {
			let strings: LangPackString[] = [];
			for(const i in __langPack.default) {
				// @ts-ignore
				const v = __langPack.default[i];
				if(typeof(v) === 'string') {
					strings.push({
						_: 'langPackString',
						key: i,
						value: v
					});
				} else {
					strings.push({
						_: 'langPackStringPluralized',
						key: i,
						...v
					});
				}
			}

			strings = strings.concat(langPack.strings);

			for(const string of _langPack.strings) {
				strings.push(string);
			}

			langPack.strings = strings;
			// @ts-ignore
			langPack.appVersion = App.langPackVersion;

			return sessionStorage.set({langPack}).then(() => {
				applyLangPack(langPack);
				return langPack;
			});
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
		if(langPack.lang_code !== lastRequestedLangCode) {
			return;
		}

		pluralRules = new Intl.PluralRules(langPack.lang_code);

		strings.clear();

		for(const string of langPack.strings) {
			strings.set(string.key as LangPackKey, string);
		}

		const elements = Array.from(document.querySelectorAll(`.i18n`)) as HTMLElement[];
		elements.forEach(element => {
			const instance = weakMap.get(element);

			if(instance) {
				instance.update();
			}
		});
	}

	export function superFormatter(input: string, args?: any[], indexHolder = {i: 0}) {
		let out: (string | HTMLElement)[] = [];
		const regExp = /(\*\*)(.+?)\1|(\n)|un\d|%\d\$.|%./g;

		let lastIndex = 0;
		input.replace(regExp, (match, p1: any, p2: any, p3: any, offset: number, string: string) => {
			//console.table({match, p1, p2, offset, string});

			out.push(string.slice(lastIndex, offset));

			if(p1) {
				//offset += p1.length;
				switch(p1) {
					case '**': {
						const b = document.createElement('b');
						b.append(...superFormatter(p2, args, indexHolder));
						out.push(b);
						break;
					}
				}
			} else if(p3) {
				out.push(document.createElement('br'));
			} else if(args) {
				out.push(args[indexHolder.i++]);
			}

			lastIndex = offset + match.length;
			return '';
		});
	
		if(lastIndex !== input.length) {
			out.push(input.slice(lastIndex));
		}

		return out;
	}
	
	export function format(key: LangPackKey, plain: true, args?: any[]): string;
	export function format(key: LangPackKey, plain?: false, args?: any[]): (string | HTMLElement)[];
	export function format(key: LangPackKey, plain = false, args?: any[]): (string | HTMLElement)[] | string {
		const str = strings.get(key);
		let input: string;
		if(str) {
			if(str._ === 'langPackStringPluralized' && args?.length) {
				const v = args[0] as number;
				const s = pluralRules.select(v);
				// @ts-ignore
				input = str[s + '_value'] || str['other_value'];
			} else if(str._ === 'langPackString') {
				input = str.value;
			} else {
				//input = '[' + key + ']';
				input = key;
			}
		} else {
			//input = '[' + key + ']';
			input = key;
		}
		
		if(plain) {
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
		}
	}

	export const weakMap: WeakMap<HTMLElement, IntlElementBase<IntlElementBaseOptions>> = new WeakMap();

	export type IntlElementBaseOptions = {
		element?: HTMLElement,
		property?: /* 'innerText' |  */'innerHTML' | 'placeholder',
	};

	abstract class IntlElementBase<Options extends IntlElementBaseOptions> {
		public element: IntlElementBaseOptions['element'];
		public property: IntlElementBaseOptions['property'] = 'innerHTML';
	
		constructor(options: Options) {
			this.element = options.element || document.createElement('span');
			this.element.classList.add('i18n');
			
			this.update(options);
			weakMap.set(this.element, this);
		}

		abstract update(options?: Options): void;
	}

	export type IntlElementOptions = IntlElementBaseOptions & {
		key: LangPackKey,
		args?: any[]
	};
	export class IntlElement extends IntlElementBase<IntlElementOptions> {
		public key: IntlElementOptions['key'];
		public args: IntlElementOptions['args'];

		public update(options?: IntlElementOptions) {
			safeAssign(this, options);
	
			if(this.property === 'innerHTML') {
				this.element.textContent = '';
				this.element.append(...format(this.key, false, this.args));
			} else {
				// @ts-ignore
				const v = this.element[this.property];
				const formatted = format(this.key, true, this.args);

				// * hasOwnProperty won't work here
				if(v === undefined) this.element.dataset[this.property] = formatted;
				else (this.element as HTMLInputElement)[this.property] = formatted;
			}
		}
	}

	export type IntlDateElementOptions = IntlElementBaseOptions & {
		date: Date,
		options: Intl.DateTimeFormatOptions
	};
	export class IntlDateElement extends IntlElementBase<IntlDateElementOptions> {
		public date: IntlDateElementOptions['date'];
		public options: IntlDateElementOptions['options'];

		public update(options?: IntlDateElementOptions) {
			safeAssign(this, options);
	
			//var options = { month: 'long', day: 'numeric' };
			const dateTimeFormat = new Intl.DateTimeFormat(lastRequestedLangCode, this.options);
			
			(this.element as any)[this.property] = capitalizeFirstLetter(dateTimeFormat.format(this.date));
		}
	}

	export function i18n(key: LangPackKey, args?: any[]) {
		return new IntlElement({key, args}).element;
	}
	
	export function i18n_(options: IntlElementOptions) {
		return new IntlElement(options).element;
	}

	export function _i18n(element: HTMLElement, key: LangPackKey, args?: any[], property?: IntlElementOptions['property']) {
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

export function join(elements: HTMLElement[], useLast = true) {
	const arr: HTMLElement[] = elements.slice(0, 1);
  for(let i = 1; i < elements.length; ++i) {
    const isLast = (elements.length - 1) === i;
    const delimiterKey: LangPackKey = isLast && useLast ? 'WordDelimiterLast' : 'WordDelimiter';
    arr.push(i18n(delimiterKey));
    arr.push(elements[i]);
  }

	return arr;
}

MOUNT_CLASS_TO && (MOUNT_CLASS_TO.I18n = I18n);
