/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import DEBUG, { MOUNT_CLASS_TO } from "../config/debug";
import { safeAssign } from "../helpers/object";
import { capitalizeFirstLetter } from "../helpers/string";
import type lang from "../lang";
import type langSign from "../langSign";
import { HelpCountriesList, HelpCountry, LangPackDifference, LangPackString } from "../layer";
import apiManager from "./mtproto/mtprotoworker";
import stateStorage from "./stateStorage";
import App from "../config/app";
import rootScope from "./rootScope";
import RichTextProcessor from "./richtextprocessor";

export const langPack: {[actionType: string]: LangPackKey} = {
  "messageActionChatCreate": "ActionCreateGroup",
  "messageActionChatCreateYou": "ActionYouCreateGroup",
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
	"messageActionChatLeaveYou": "YouLeft",
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
	"messageActionDiscussionStarted": "DiscussionStarted",

  "messageActionChannelMigrateFrom": "ActionMigrateFromGroup",

  "messageActionPhoneCall.in_ok": "ChatList.Service.Call.incoming",
	"messageActionPhoneCall.out_ok": "ChatList.Service.Call.outgoing",
	"messageActionPhoneCall.in_missed": "ChatList.Service.Call.Missed",
	"messageActionPhoneCall.out_missed": "ChatList.Service.Call.Cancelled",

	"messageActionGroupCall.started": "ActionGroupCallJustStarted",
	"messageActionGroupCall.started_by": "ActionGroupCallStarted",
	"messageActionGroupCall.started_byYou": "ActionGroupCallStartedByYou",
	"messageActionGroupCall.ended": "ActionGroupCallEnded",
	"messageActionGroupCall.ended_by": "Chat.Service.VoiceChatFinished",
	"messageActionGroupCall.ended_byYou": "Chat.Service.VoiceChatFinishedYou",

	"messageActionBotAllowed": "Chat.Service.BotPermissionAllowed"
};

export type LangPackKey = /* string |  */keyof typeof lang | keyof typeof langSign;

export type FormatterArgument = string | Node;
export type FormatterArguments = FormatterArgument[];

namespace I18n {
	export const strings: Map<LangPackKey, LangPackString> = new Map();
	export const countriesList: HelpCountry[] = [];
	let pluralRules: Intl.PluralRules;

	let cacheLangPackPromise: Promise<LangPackDifference>;
	export let lastRequestedLangCode: string;
	export let lastAppliedLangCode: string;
	export let requestedServerLanguage = false;
	export function getCacheLangPack(): Promise<LangPackDifference> {
		if(cacheLangPackPromise) return cacheLangPackPromise;
		return cacheLangPackPromise = Promise.all([
			stateStorage.get('langPack') as Promise<LangPackDifference>,
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
				lastRequestedLangCode = langPack.lang_code;
			}
			
			applyLangPack(langPack);
			return langPack;
		}).finally(() => {
			cacheLangPackPromise = undefined;
		});
	}

	export function loadLocalLangPack() {
		const defaultCode = App.langPackCode;
		lastRequestedLangCode = defaultCode;
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

	export function loadLangPack(langCode: string) {
		requestedServerLanguage = true;
		return Promise.all([
			apiManager.invokeApiCacheable('langpack.getLangPack', {
				lang_code: langCode,
				lang_pack: App.langPack
			}),
			apiManager.invokeApiCacheable('langpack.getLangPack', {
				lang_code: langCode,
				lang_pack: 'android'
			}),
			import('../lang'),
			import('../langSign'),
			apiManager.invokeApiCacheable('help.getCountriesList', {
				lang_code: langCode,
				hash: 0
			}) as Promise<HelpCountriesList.helpCountriesList>,
			polyfillPromise,
		]);
	}

	export function getStrings(langCode: string, strings: string[]) {
		return apiManager.invokeApi('langpack.getStrings', {
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

	export function getLangPack(langCode: string) {
		lastRequestedLangCode = langCode;
		return loadLangPack(langCode).then(([langPack1, langPack2, localLangPack1, localLangPack2, countries, _]) => {
			let strings: LangPackString[] = [];

			[localLangPack1, localLangPack2].forEach(l => {
				formatLocalStrings(l.default as any, strings);
			});

			strings = strings.concat(langPack1.strings);

			for(const string of langPack2.strings) {
				strings.push(string);
			}

			langPack1.strings = strings;
			langPack1.countries = countries;
			return saveLangPack(langPack1);
		});
	}

	export function saveLangPack(langPack: LangPackDifference) {
		langPack.appVersion = App.langPackVersion;

		return stateStorage.set({langPack}).then(() => {
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
		if(langPack.lang_code !== lastRequestedLangCode) {
			return;
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

			langPack.countries.countries.forEach(country => {
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

		if(lastAppliedLangCode !== langPack.lang_code) {
			rootScope.dispatchEvent('language_change', langPack.lang_code);
			lastAppliedLangCode = langPack.lang_code;
		}

		const elements = Array.from(document.querySelectorAll(`.i18n`)) as HTMLElement[];
		elements.forEach(element => {
			const instance = weakMap.get(element);

			if(instance) {
				instance.update();
			}
		});
	}

	export function superFormatter(input: string, args?: FormatterArguments, indexHolder = {i: 0}) {
		let out: FormatterArguments = [];
		const regExp = /(\*\*)(.+?)\1|(\n)|(\[.+?\]\(.*?\))|un\d|%\d\$.|%./g;

		let lastIndex = 0;
		input.replace(regExp, (match, p1: any, p2: any, p3: any, p4: string, offset: number, string: string) => {
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
			} else if(p4) {
				const a = document.createElement('a');

				const idx = p4.lastIndexOf(']');
				const text = p4.slice(1, idx);
				a.append(...superFormatter(text, args, indexHolder));

				const url = p4.slice(idx + 2, p4.length - 1);
				if(url) {
					const wrappedUrl = RichTextProcessor.wrapUrl(url);
					a.href = wrappedUrl.url;
					if(wrappedUrl.onclick) a.setAttribute('onclick', wrappedUrl.onclick);
					a.target = '_blank';
				}

				out.push(a);
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
	export function format(key: LangPackKey, plain?: false, args?: any[]): FormatterArguments;
	export function format(key: LangPackKey, plain = false, args?: any[]): FormatterArguments | string {
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
		args?: FormatterArguments
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
			
			// * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Locale/hourCycle#adding_an_hour_cycle_via_the_locale_string
			const dateTimeFormat = new Intl.DateTimeFormat(lastRequestedLangCode + '-u-hc-h23', this.options);
			
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

export function join(elements: (Node | string)[], useLast = true) {
	const arr = elements.slice(0, 1);
  for(let i = 1; i < elements.length; ++i) {
    const isLast = (elements.length - 1) === i;
    const delimiterKey: LangPackKey = isLast && useLast ? 'WordDelimiterLast' : 'WordDelimiter';
    arr.push(i18n(delimiterKey));
    arr.push(elements[i]);
  }

	return arr;
}

MOUNT_CLASS_TO.I18n = I18n;
