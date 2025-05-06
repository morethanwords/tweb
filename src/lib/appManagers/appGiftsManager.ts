/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import bigInt from 'big-integer';
import {InputSavedStarGift, Message, MessageAction, PremiumGiftCodeOption, SavedStarGift, StarGift, StarGiftAttribute, WebPageAttribute} from '../../layer';
import {STARS_CURRENCY} from '../mtproto/mtproto_config';
import {MyDocument} from './appDocsManager';
import {AppManager} from './manager';

export interface MyStarGift {
  type: 'stargift',
  raw: StarGift,
  sticker: MyDocument,
  isIncoming?: boolean,
  isConverted?: boolean,
  isUpgraded?: boolean,
  isUpgradedBySender?: boolean,
  collectibleAttributes?: {
    model: StarGiftAttribute.starGiftAttributeModel,
    backdrop: StarGiftAttribute.starGiftAttributeBackdrop,
    pattern: StarGiftAttribute.starGiftAttributePattern,
    original?: StarGiftAttribute.starGiftAttributeOriginalDetails
  },
  input?: InputSavedStarGift,
  saved?: SavedStarGift
}

export interface MyPremiumGiftOption {
  type: 'premium'
  months: 3 | 6 | 12
  discountPercent: number
  price: Long
  currency: string
  priceStars?: Long
  raw: PremiumGiftCodeOption
}

export interface StarGiftUpgradePreview {
  models: StarGiftAttribute.starGiftAttributeModel[],
  backdrops: StarGiftAttribute.starGiftAttributeBackdrop[],
  patterns: StarGiftAttribute.starGiftAttributePattern[]
}

function mapPremiumOptions(premiumOptions: PremiumGiftCodeOption.premiumGiftCodeOption[]) {
  const map: Map<MyPremiumGiftOption['months'], MyPremiumGiftOption> = new Map();
  for(const option of premiumOptions) {
    if(option.users !== 1) continue;
    if(option.months !== 3 && option.months !== 6 && option.months !== 12) continue;

    if(map.has(option.months)) {
      const oldOption = map.get(option.months);
      if(oldOption.currency === STARS_CURRENCY) {
        oldOption.priceStars = oldOption.price;
        oldOption.price = option.amount;
        oldOption.currency = option.currency;
        oldOption.raw = option;
      } else if(option.currency === STARS_CURRENCY) {
        oldOption.priceStars = option.amount;
      }
      continue;
    }

    map.set(option.months, {
      type: 'premium',
      months: option.months,
      price: option.amount,
      currency: option.currency,
      discountPercent: 0,
      raw: option
    });
  }

  const threePrice = bigInt(map.get(3).price as number);
  const calcDiscount = (option: MyPremiumGiftOption, mul: number) => {
    const optionPrice = option.price;
    const rawPrice = threePrice.multiply(mul);

    if(rawPrice.lt(optionPrice)) return;
    option.discountPercent = rawPrice.subtract(optionPrice).toJSNumber() / rawPrice.toJSNumber() * 100;
  }

  calcDiscount(map.get(6), 2);
  calcDiscount(map.get(12), 4);

  return [
    map.get(3),
    map.get(6),
    map.get(12)
  ];
}

export default class AppGiftsManager extends AppManager {
  private cachedStarGiftOptions?: MyStarGift[];
  private cachedStarGiftOptionsHash = 0;

  protected after() {

  }

  private wrapGift(gift: StarGift): MyStarGift {
    if(gift._ === 'starGift') {
      return {
        type: 'stargift',
        raw: gift,
        sticker: this.appDocsManager.saveDoc(gift.sticker)
      };
    } else {
      let attrModel: StarGiftAttribute.starGiftAttributeModel;
      let attrBackdrop: StarGiftAttribute.starGiftAttributeBackdrop;
      let attrPatern: StarGiftAttribute.starGiftAttributePattern;
      let attrOrig: StarGiftAttribute.starGiftAttributeOriginalDetails;

      for(const attr of gift.attributes) {
        switch(attr._) {
          case 'starGiftAttributeModel':
            attr.document = this.appDocsManager.saveDoc(attr.document);
            attrModel = attr;
            break;
          case 'starGiftAttributeBackdrop':
            attrBackdrop = attr;
            break;
          case 'starGiftAttributePattern':
            attr.document = this.appDocsManager.saveDoc(attr.document);
            attrPatern = attr;
            break;
          case 'starGiftAttributeOriginalDetails':
            attrOrig = attr;
            break;
        }
      }

      return {
        type: 'stargift',
        raw: gift,
        sticker: this.appDocsManager.saveDoc(attrModel.document),
        collectibleAttributes: {
          model: attrModel,
          backdrop: attrBackdrop,
          pattern: attrPatern,
          original: attrOrig
        }
      };
    }
  }

  public async wrapGiftFromMessage(message: Message.messageService): Promise<MyStarGift> {
    const action = message.action as MessageAction.messageActionStarGift | MessageAction.messageActionStarGiftUnique;
    const gift = action.gift;
    const baseWrap = this.wrapGift(action.gift);

    const isIncomingGift = action._ === 'messageActionStarGiftUnique' && action.pFlags.upgrade ? message.pFlags.out : !message.pFlags.out;

    const saved: SavedStarGift.savedStarGift = {
      _: 'savedStarGift',
      pFlags: {
        unsaved: action.pFlags.saved ? undefined : true,
        can_upgrade: action._ === 'messageActionStarGift' ? action.pFlags.can_upgrade : undefined,
        refunded: action.pFlags.refunded
      },
      from_id: isIncomingGift ? message.peer_id : {_: 'peerUser', user_id: this.rootScope.myId},
      date: message.date,
      gift,
      message: action._ === 'messageActionStarGift' ? action.message : baseWrap.collectibleAttributes.original?.message,
      msg_id: message.id,
      convert_stars: gift._ === 'starGift' ? gift.convert_stars : undefined,
      upgrade_stars: gift._ === 'starGift' ? gift.upgrade_stars : undefined,
      saved_id: action.saved_id
    };

    return {
      ...baseWrap,
      isIncoming: isIncomingGift,
      isConverted: action._ === 'messageActionStarGift' && Boolean(action.pFlags.converted),
      isUpgraded: action._ === 'messageActionStarGiftUnique' || Boolean(action.pFlags.upgraded),
      isUpgradedBySender: action._ === 'messageActionStarGift' && action.upgrade_stars !== undefined,
      saved,
      input: {
        _: 'inputSavedStarGiftUser',
        msg_id: message.id
      }
    };
  }

  public async wrapGiftFromWebPage(attr: WebPageAttribute.webPageAttributeUniqueStarGift) {
    return this.wrapGift(attr.gift);
  }

  public async getPinnedGifts(peerId: PeerId) {
    const res = await this.getProfileGifts({
      peerId,
      limit: (await this.apiManager.getAppConfig()).stargifts_pinned_to_top_limit
    });

    return res.gifts.filter((it) => it.saved.pFlags.pinned_to_top);
  }

  public async getProfileGifts(params: {peerId: PeerId, offset?: string, limit?: number}) {
    const isUser = params.peerId.isUser();
    const inputPeer = isUser ?
      this.appUsersManager.getUserInputPeer(params.peerId.toUserId()) :
      this.appChatsManager.getChannelInputPeer(params.peerId.toChatId());
    const res = await this.apiManager.invokeApiSingleProcess({
      method: 'payments.getSavedStarGifts',
      params: {
        peer: inputPeer,
        offset: params.offset ?? '',
        limit: params.limit ?? 50
      }
    });

    this.appPeersManager.saveApiPeers(res);

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
    };
  }

  public async getStarGiftOptions(): Promise<MyStarGift[]> {
    const res = await this.apiManager.invokeApiSingleProcess({
      method: 'payments.getStarGifts',
      params: {hash: this.cachedStarGiftOptionsHash}
    });

    if(res._ === 'payments.starGiftsNotModified') {
      return this.cachedStarGiftOptions;
    }

    return this.cachedStarGiftOptions = res.gifts.map((it) => this.wrapGift(it));
  }

  public async toggleGiftHidden(gift: InputSavedStarGift, hidden: boolean) {
    this.rootScope.dispatchEvent('star_gift_update', {input: gift, unsaved: hidden});
    await this.apiManager.invokeApiSingle('payments.saveStarGift', {
      stargift: gift,
      unsave: hidden
    });
  }

  public async convertGift(gift: InputSavedStarGift) {
    this.rootScope.dispatchEvent('star_gift_update', {input: gift, converted: true});
    await this.apiManager.invokeApiSingle('payments.convertStarGift', {
      stargift: gift
    });
  }

  public async getPremiumGiftOptions(): Promise<MyPremiumGiftOption[]> {
    const res = await this.apiManager.invokeApiCacheable('payments.getPremiumGiftCodeOptions');
    return mapPremiumOptions(res);
  }

  public async getUpgradePreview(giftId: Long): Promise<StarGiftUpgradePreview> {
    const res = await this.apiManager.invokeApiSingle('payments.getStarGiftUpgradePreview', {
      gift_id: giftId
    });

    const models: StarGiftAttribute.starGiftAttributeModel[] = [];
    const backdrops: StarGiftAttribute.starGiftAttributeBackdrop[] = [];
    const patterns: StarGiftAttribute.starGiftAttributePattern[] = [];

    for(const attribute of res.sample_attributes) {
      switch(attribute._) {
        case 'starGiftAttributeModel': {
          attribute.document = this.appDocsManager.saveDoc(attribute.document);
          models.push(attribute);
          break;
        }

        case 'starGiftAttributeBackdrop': {
          backdrops.push(attribute);
          break;
        }

        case 'starGiftAttributePattern': {
          attribute.document = this.appDocsManager.saveDoc(attribute.document);
          patterns.push(attribute);
          break;
        }
      }
    }

    return {
      models,
      backdrops,
      patterns
    };
  }

  public async getGiftBySlug(slug: string) {
    const result = await this.apiManager.invokeApiSingle('payments.getUniqueStarGift', {slug});

    this.appUsersManager.saveApiUsers(result.users);

    return this.wrapGift(result.gift);
  }

  public async togglePinnedGift(gift: InputSavedStarGift) {
    await this.apiManager.invokeApiSingle('payments.toggleStarGiftsPinnedToTop', {
      peer: {_:'inputPeerSelf'},
      stargift: [gift]
    });
    this.rootScope.dispatchEvent('star_gift_update', {input: gift, togglePinned: true});
  }

  public upgradeStarGift(input: InputSavedStarGift, keepDetails: boolean) {
    return this.apiManager.invokeApiSingleProcess({
      method: 'payments.upgradeStarGift',
      params: {
        stargift: input,
        keep_original_details: keepDetails
      }
    }).then((updates) => {
      this.apiUpdatesManager.processUpdateMessage(updates);
    });
  }

  public transferStarGift(input: InputSavedStarGift, toId: PeerId) {
    return this.apiManager.invokeApiSingle('payments.transferStarGift', {
      stargift: input,
      to_id: this.appPeersManager.getInputPeerById(toId)
    }).then((updates) => {
      this.apiUpdatesManager.processUpdateMessage(updates);
    });
  }
}
