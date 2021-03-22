import { MOUNT_CLASS_TO } from "../config/debug";
import { safeAssign } from "../helpers/object";
import type lang from "../lang";
import { LangPackDifference, LangPackString } from "../layer";
import apiManager from "./mtproto/mtprotoworker";
import sessionStorage from "./sessionStorage";

export const langPack: {[actionType: string]: string} = {
  "messageActionChatCreate": "created the group",
	"messageActionChatEditTitle": "changed group name",
	"messageActionChatEditPhoto": "changed group photo",
	"messageActionChatDeletePhoto": "removed group photo",
	"messageActionChatReturn": "returned to group",
	"messageActionChatJoined": "joined the group",
  "messageActionChatAddUser": "invited {}",
  "messageActionChatAddUsers": "invited {} users",
	"messageActionChatLeave": "left the group",
	"messageActionChatDeleteUser": "removed user {}",
	"messageActionChatJoinedByLink": "joined the group via invite link",
  "messageActionPinMessage": "pinned message",
  "messageActionContactSignUp": "joined Telegram",
	"messageActionChannelCreate": "Channel created",
	"messageActionChannelEditTitle": "Channel renamed",
	"messageActionChannelEditPhoto": "Channel photo updated",
  "messageActionChannelDeletePhoto": "Channel photo removed",
  "messageActionHistoryClear": "History was cleared",

  "messageActionChannelMigrateFrom": "",

  "messageActionPhoneCall.in_ok": "Incoming Call",
	"messageActionPhoneCall.out_ok": "Outgoing Call",
	"messageActionPhoneCall.in_missed": "Missed Call",
	"messageActionPhoneCall.out_missed": "Cancelled Call",

	"messageActionBotAllowed": "You allowed this bot to message you when logged in {}"
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
			if(!langPack || true) {
				return getLangPack('en');
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

			return sessionStorage.set({langPack}).then(() => {
				applyLangPack(langPack);
				return langPack;
			});
		});
	}

	export const polyfillPromise = (function checkIfPolyfillNeeded() {
		if(typeof(Intl) !== 'undefined' && typeof(Intl.PluralRules) !== 'undefined' && false) {
			return Promise.resolve();
		} else {
			return import('./pluralPolyfill').then(_Intl => {
				(window as any).Intl = _Intl.default;
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
	
	export function getString(key: LangPackKey, args?: any[]) {
		const str = strings.get(key);
		let out = '';

		if(str) {
			if(str._ === 'langPackStringPluralized' && args?.length) {
				const v = args[0] as number;
				const s = pluralRules.select(v);
				// @ts-ignore
				out = str[s + '_value'] || str['other_value'];
			} else if(str._ === 'langPackString') {
				out = str.value;
			} else {
				out = '[' + key + ']';
				//out = key;
			}
		} else {
			out = '[' + key + ']';
			//out = key;
		}

		out = out
		.replace(/\n/g, '<br>')
		.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

		if(args?.length) {
			out = out.replace(/%\d\$.|%./g, (match, offset, string) => {
				return '' + args.shift();
			});
		}

		return out;
	}

	const weakMap: WeakMap<HTMLElement, IntlElement> = new WeakMap();

	export type IntlElementOptions = {
		element?: HTMLElement,
		property?: /* 'innerText' |  */'innerHTML' | 'placeholder'
		key: LangPackKey,
		args?: any[]
	};
	export class IntlElement {
		public element: IntlElementOptions['element'];
		public key: IntlElementOptions['key'];
		public args: IntlElementOptions['args'];
		public property: IntlElementOptions['property'] = 'innerHTML';
	
		constructor(options: IntlElementOptions) {
			this.element = options.element || document.createElement('span');
			this.element.classList.add('i18n');
			
			this.update(options);
			weakMap.set(this.element, this);
		}
	
		public update(options?: IntlElementOptions) {
			safeAssign(this, options);
	
			const str = getString(this.key, this.args);
			(this.element as any)[this.property] = str;
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

MOUNT_CLASS_TO && (MOUNT_CLASS_TO.I18n = I18n);
