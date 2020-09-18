import appUsersManager from "./appUsersManager";
import appChatsManager from "./appChatsManager";
import { isObject } from "../utils";
import { RichTextProcessor } from "../richtextprocessor";
import { InputPeer, InputDialogPeer, Peer } from "../../layer";

// https://github.com/eelcohn/Telegram-API/wiki/Calculating-color-for-a-Telegram-user-on-IRC
/*
  HTML-color  IRC-color  Description
  #c03d33     4          red
  #4fad2d     3          green
  #d09306     7          yellow
  #168acd     10         blue
  #8544d6     6          purple
  #cd4073     13         pink
  #2996ad     11         sea
  #ce671b     5          orange
  */
const DialogColorsFg = ['#c03d33', '#4fad2d', '#d09306', '#168acd', '#8544d6', '#cd4073', '#2996ad', '#ce671b'];
const DialogColors = ['#e17076', '#7bc862', '#e5ca77', '#65AADD', '#a695e7', '#ee7aae', '#6ec9cb', '#faa774'];
const DialogColorsMap = [0, 7, 4, 1, 6, 3, 5];

export class AppPeersManager {
  public getPeerPhoto(peerID: number) {
    return peerID > 0
      ? appUsersManager.getUserPhoto(peerID)
      : appChatsManager.getChatPhoto(-peerID);
  }

  public getPeerMigratedTo(peerID: number) {
    if(peerID >= 0) {
      return false;
    }

    let chat = appChatsManager.getChat(-peerID);
    if(chat && chat.migrated_to && chat.pFlags.deactivated) {
      return this.getPeerID(chat.migrated_to);
    }
    
    return false;
  }

  public getPeerTitle(peerID: number | any, plainText = false, onlyFirstName = false) {
    let peer: any = {}; 
    if(!isObject(peerID)) {
      peer = this.getPeer(peerID);
    } else peer = peerID;

    let title = '';
    if(peerID > 0) {
      if(peer.first_name) title += peer.first_name;
      if(peer.last_name) title += ' ' + peer.last_name;
  
      if(!title) title = peer.pFlags.deleted ? 'Deleted account' : peer.username;
      else title = title.trim();
    } else {
      title = peer.title;
    }

    if(onlyFirstName) {
      title = title.split(' ')[0];
    }
    
    return plainText ? title : RichTextProcessor.wrapEmojiText(title);
  }

  public getOutputPeer(peerID: number): Peer {
    if(peerID > 0) {
      return {_: 'peerUser', user_id: peerID};
    }

    let chatID = -peerID;
    if(appChatsManager.isChannel(chatID)) {
      return {_: 'peerChannel', channel_id: chatID};
    }

    return {_: 'peerChat', chat_id: chatID};
  }

  public getPeerString(peerID: number) {
    if(peerID > 0) {
      return appUsersManager.getUserString(peerID);
    }
    return appChatsManager.getChatString(-peerID);
  }

  public getPeerUsername(peerID: number): string {
    if(peerID > 0) {
      return appUsersManager.getUser(peerID).username || '';
    }
    return appChatsManager.getChat(-peerID).username || '';
  }

  public getPeer(peerID: number) {
    return peerID > 0
      ? appUsersManager.getUser(peerID)
      : appChatsManager.getChat(-peerID)
  }

  public getPeerID(peerString: any): number {
    if(typeof(peerString) === 'number') return peerString;
    else if(isObject(peerString)) {
      return peerString.user_id
        ? peerString.user_id
        : -(peerString.channel_id || peerString.chat_id);
    } else if(!peerString) return 0;
    const isUser = peerString.charAt(0) == 'u';
    const peerParams = peerString.substr(1).split('_');

    return isUser ? peerParams[0] : -peerParams[0] || 0;
  }

  public isChannel(peerID: number): boolean {
    return (peerID < 0) && appChatsManager.isChannel(-peerID);
  }

  public isMegagroup(peerID: number) {
    return (peerID < 0) && appChatsManager.isMegagroup(-peerID);
  }

  public isAnyGroup(peerID: number): boolean {
    return (peerID < 0) && !appChatsManager.isBroadcast(-peerID);
  }

  public isBroadcast(id: number): boolean {
    return this.isChannel(id) && !this.isMegagroup(id);
  }

  public isBot(peerID: number): boolean {
    return (peerID > 0) && appUsersManager.isBot(peerID);
  }

  public getInputPeer(peerString: string): InputPeer {
    var firstChar = peerString.charAt(0);
    var peerParams = peerString.substr(1).split('_');
    let id = +peerParams[0];

    if(firstChar == 'u') {
      appUsersManager.saveUserAccess(id, peerParams[1]);

      return {
        _: 'inputPeerUser',
        user_id: id,
        access_hash: peerParams[1]
      };
    } else if(firstChar == 'c' || firstChar == 's') {
      appChatsManager.saveChannelAccess(id, peerParams[1]);
      if(firstChar == 's') {
        appChatsManager.saveIsMegagroup(id);
      }

      return {
        _: 'inputPeerChannel',
        channel_id: id,
        access_hash: peerParams[1] || '0'
      };
    } else {
      return {
        _: 'inputPeerChat',
        chat_id: id
      };
    }
  }

  public getInputPeerByID(peerID: number): InputPeer {
    if(!peerID) {
      return {_: 'inputPeerEmpty'};
    }

    if(peerID < 0) {
      const chatID = -peerID;
      if(!appChatsManager.isChannel(chatID)) {
        return appChatsManager.getChatInputPeer(chatID);
      } else {
        return appChatsManager.getChannelInputPeer(chatID);
      }
    }

    return {
      _: 'inputPeerUser',
      user_id: peerID,
      access_hash: appUsersManager.getUser(peerID).access_hash
    };
  }

  public getInputDialogPeerByID(peerID: number): InputDialogPeer {
    return {
      _: 'inputDialogPeer',
      peer: this.getInputPeerByID(peerID)
    }
  }

  public getPeerColorByID(peerID: number, pic = true) {
    const idx = DialogColorsMap[(peerID < 0 ? -peerID : peerID) % 7];
    const color = (pic ? DialogColors : DialogColorsFg)[idx];
    return color;
  }

  public getPeerSearchText(peerID: number) {
    let text;
    if(peerID > 0) {
      text = '%pu ' + appUsersManager.getUserSearchText(peerID);
    } else if(peerID < 0) {
      const chat = appChatsManager.getChat(-peerID);
      text = '%pg ' + (chat.title || '');
    }
    return text;
  }
}

const appPeersManager = new AppPeersManager();
export default appPeersManager;
