/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {InputSavedStarGift, Message, MessageAction, PaymentsStarGifts, SavedStarGift, StarGift, StarGiftAttribute} from '../../layer';
import {MyDocument} from './appDocsManager';
import {AppManager} from './manager';

export interface MyStarGift {
  raw: StarGift,
  sticker: MyDocument,
  isIncoming?: boolean,
  isConverted?: boolean,
  collectibleAttributes?: {
    model: StarGiftAttribute.starGiftAttributeModel,
    backdrop: StarGiftAttribute.starGiftAttributeBackdrop,
    pattern: StarGiftAttribute.starGiftAttributePattern,
    original?: StarGiftAttribute.starGiftAttributeOriginalDetails
  },
  input?: InputSavedStarGift,
  saved?: SavedStarGift
}

export default class AppGiftsManager extends AppManager {
  protected after() {

  }

  private wrapGift(gift: StarGift): MyStarGift {
    if(gift._ === 'starGift') {
      return {
        raw: gift,
        sticker: this.appDocsManager.saveDoc(gift.sticker)
      }
    } else {
      let attrModel: StarGiftAttribute.starGiftAttributeModel
      let attrBackdrop: StarGiftAttribute.starGiftAttributeBackdrop
      let attrPatern: StarGiftAttribute.starGiftAttributePattern
      let attrOrig: StarGiftAttribute.starGiftAttributeOriginalDetails

      for(const attr of gift.attributes) {
        switch(attr._) {
          case 'starGiftAttributeModel':
            attrModel = attr
            break
          case 'starGiftAttributeBackdrop':
            attrBackdrop = attr
            break
          case 'starGiftAttributePattern':
            attrPatern = attr
            break
          case 'starGiftAttributeOriginalDetails':
            attrOrig = attr
            break
        }
      }

      return {
        raw: gift,
        sticker: this.appDocsManager.saveDoc(attrModel.document),
        collectibleAttributes: {
          model: attrModel,
          backdrop: attrBackdrop,
          pattern: attrPatern,
          original: attrOrig
        }
      }
    }
  }

  async wrapGiftFromMessage(message: Message.messageService): Promise<MyStarGift> {
    const action = message.action as MessageAction.messageActionStarGift;
    const sticker = this.appDocsManager.saveDoc((action.gift as StarGift.starGift).sticker);
    const saved: SavedStarGift.savedStarGift = {
      _: 'savedStarGift',
      pFlags: {
        unsaved: action.pFlags.saved ? undefined : true,
        can_upgrade: action.pFlags.can_upgrade,
        refunded: action.pFlags.refunded
      },
      from_id: message.pFlags.out ? {_: 'peerUser', user_id: this.rootScope.myId} : message.peer_id,
      date: message.date,
      gift: action.gift,
      message: action.message,
      msg_id: message.id,
      convert_stars: action.convert_stars,
      upgrade_stars: action.upgrade_stars,
      saved_id: action.saved_id
    };

    return {
      isIncoming: !message.pFlags.out,
      isConverted: Boolean(action.pFlags.converted),
      raw: action.gift,
      saved,
      input: {
        _: 'inputSavedStarGiftUser',
        msg_id: message.id
      },
      sticker
    }
  }

  async getProfileGifts(params: { peerId: PeerId, offset?: string, limit?: number }) {
    const isUser = params.peerId.isUser();
    const inputPeer = isUser ?
      this.appUsersManager.getUserInputPeer(params.peerId) :
      this.appChatsManager.getChatInputPeer(params.peerId);
    const res = await this.apiManager.invokeApiSingleProcess({
      method: 'payments.getSavedStarGifts',
      params: {
        peer: this.appUsersManager.getUserInputPeer(params.peerId),
        offset: params.offset ?? '',
        limit: params.limit ?? 50
      }
    })

    this.appUsersManager.saveApiUsers(res.users);
    this.appChatsManager.saveApiChats(res.chats);

    const wrapped: MyStarGift[] = [];
    for(const it of res.gifts) {
      wrapped.push({
        ...this.wrapGift(it.gift),
        input: isUser ? {
          _: 'inputSavedStarGiftUser',
          msg_id: it.msg_id
        } : {
          _: 'inputSavedStarGiftChat',
          peer: inputPeer,
          saved_id: it.saved_id
        },
        isIncoming: params.peerId.isUser() && this.rootScope.myId === params.peerId,
        saved: it
      });
    }

    return {
      next: res.next_offset,
      gifts: wrapped,
      count: res.count
    }
  }

  private cachedStarGiftOptions?: MyStarGift[]
  private cachedStarGiftOptionsHash = 0
  async getStarGiftOptions(): Promise<MyStarGift[]> {
    const res = await this.apiManager.invokeApiSingleProcess({
      method: 'payments.getStarGifts',
      params: {hash: this.cachedStarGiftOptionsHash}
    });

    if(res._ === 'payments.starGiftsNotModified') {
      return this.cachedStarGiftOptions
    }

    return this.cachedStarGiftOptions = res.gifts.map(it => this.wrapGift(it))
  }

  async toggleGiftHidden(gift: InputSavedStarGift, hidden: boolean) {
    this.rootScope.dispatchEvent('star_gift_update', {input: gift, unsaved: hidden});
    await this.apiManager.invokeApiSingle('payments.saveStarGift', {
      stargift: gift,
      unsave: hidden
    });
  }

  async convertGift(gift: InputSavedStarGift) {
    this.rootScope.dispatchEvent('star_gift_update', {input: gift, converted: true});
    await this.apiManager.invokeApiSingle('payments.convertStarGift', {
      stargift: gift
    });
  }
}
