import { MOUNT_CLASS_TO } from "../config/debug";
import { LangPackString } from "../layer";
import apiManager from "./mtproto/mtprotoworker";

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

namespace Strings {
	export type Bio = 'Bio.Description';

	export type LoginRegister = 'Login.Register.FirstName.Placeholder' | 'Login.Register.LastName.Placeholder';

	export type EditAccount = 'EditAccount.Logout' | 'EditAccount.Title' | 'EditAccount.Title' | 'EditAccount.Username';

	export type AccountSettings = 'AccountSettings.Filters' | 'AccountSettings.Notifications' | 'AccountSettings.PrivacyAndSecurity' | 'AccountSettings.Language' | 'AccountSettings.Bio';

	export type Telegram = 'Telegram.GeneralSettingsViewController' | 'Telegram.NotificationSettingsViewController';

	export type ChatFilters = 'ChatList.Filter.Header' | 'ChatList.Filter.NewTitle' | 'ChatList.Filter.List.Header' | 'ChatList.Filter.Recommended.Header' | 'ChatList.Filter.Recommended.Add' | 'ChatList.Filter.List.Title';

	export type AutoDownloadSettings = 'AutoDownloadSettings.TypePrivateChats' | 'AutoDownloadSettings.TypeChannels';

	export type DataAndStorage = 'DataAndStorage.CategorySettings.GroupChats';

	export type Suggest = 'Suggest.Localization.Other';

	export type LangPackKey = string | AccountSettings | EditAccount | Telegram | ChatFilters | LoginRegister | Bio | AutoDownloadSettings | DataAndStorage | Suggest;
}

export type LangPackKey = Strings.LangPackKey;

namespace I18n {
	let strings: Partial<{[key in LangPackKey]: LangPackString}> = {};

	export function getLangPack(langCode: string) {
		return apiManager.invokeApi('langpack.getLangPack', {
			lang_code: langCode,
			lang_pack: 'macos'
		}).then(langPack => {
			strings = {};
			for(const string of langPack.strings) {
				strings[string.key as LangPackKey] = string;
			}

			const elements = Array.from(document.querySelectorAll(`.i18n`)) as HTMLElement[];
			elements.forEach(element => {
				const instance = weakMap.get(element);

				if(instance) {
					instance.update();
				}
			});
		});
	}
	
	export function getString(key: LangPackKey, args?: any[]) {
		const str = strings[key];
		let out = '';

		if(str) {
			if(str._ === 'langPackStringPluralized') {
				out = str.one_value;
			} else if(str._ === 'langPackString') {
				out = str.value;
			} else {
				out = '[' + key + ']';
			}
		} else {
			out = '[' + key + ']';
		}

		return out;
	}

	const weakMap: WeakMap<HTMLElement, IntlElement> = new WeakMap();

	export type IntlElementOptions = {
		element?: HTMLElement,
		property?: 'innerHTML' | 'placeholder'
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
			if(options) {
				Object.assign(this, options);
			}
	
			(this.element as any)[this.property] = getString(this.key, this.args);
		}
	}

	export function i18n(key: LangPackKey, args?: any[]) {
		return new IntlElement({key, args}).element;
	}
	
	export function i18n_(options: IntlElementOptions) {
		return new IntlElement(options).element;
	}
}

export {I18n};
export default I18n;

const i18n = I18n.i18n;
export {i18n};

const i18n_ = I18n.i18n_;
export {i18n_};

MOUNT_CLASS_TO && (MOUNT_CLASS_TO.I18n = I18n);
