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

export namespace Internationalization {
	let strings: {[key: string]: LangPackString} = {};

	export function getLangPack(langCode: string) {
		return apiManager.invokeApi('langpack.getLangPack', {
			lang_code: langCode,
			lang_pack: 'macos'
		}).then(langPack => {
			strings = {};
			for(const string of langPack.strings) {
				strings[string.key] = string;
			}
		});
	}
	
	export function _(key: keyof typeof strings, ...args: any[]) {
		let str = strings[key];
	
		return str;
	}
}
