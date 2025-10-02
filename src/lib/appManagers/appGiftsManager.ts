/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import bigInt from 'big-integer';
import {InputSavedStarGift, Message, MessageAction, PremiumGiftCodeOption, SavedStarGift, StarGift, StarGiftAttribute, StarGiftAttributeId, StarGiftCollection, StarsAmount, WebPageAttribute} from '../../layer';
import {STARS_CURRENCY} from '../mtproto/mtproto_config';
import {MyDocument} from './appDocsManager';
import {AppManager} from './manager';
import getPeerId from './utils/peers/getPeerId';
import {nanotonToJsNumber} from '../../helpers/paymentsWrapCurrencyAmount';
import {inputStarGiftEquals} from './utils/gifts/inputStarGiftEquals';

export interface MyStarGift {
  type: 'stargift',
  raw: StarGift,
  sticker: MyDocument,
  isIncoming?: boolean,
  isConverted?: boolean,
  isUpgraded?: boolean,
  isUpgradedBySender?: boolean,
  isResale?: boolean,
  isWearing?: boolean,
  resellPriceStars?: Long,
  resellPriceTon?: Long,
  resellOnlyTon?: boolean,
  collectibleAttributes?: {
    model: StarGiftAttribute.starGiftAttributeModel,
    backdrop: StarGiftAttribute.starGiftAttributeBackdrop,
    pattern: StarGiftAttribute.starGiftAttributePattern,
    original?: StarGiftAttribute.starGiftAttributeOriginalDetails
  },
  ownerId?: PeerId,
  input?: InputSavedStarGift,
  saved?: SavedStarGift,
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
  private wearingGiftSlug?: string | null;

  protected after() {
    this.apiUpdatesManager.addMultipleEventsListeners({
      updateNewMessage: ({message}) => {
        if(message._ !== 'messageService') return;
        const action = message.action;

        switch(action._) {
          case 'messageActionStarGift':
            this.rootScope.dispatchEvent('star_gift_list_update', {peerId: getPeerId(message.peer_id)});
            break;

          case 'messageActionStarGiftUnique': {
            const peerId = getPeerId(message.peer_id);
            this.rootScope.dispatchEvent('star_gift_list_update', {peerId});
            if(action.pFlags.transferred && message.pFlags.out || action.resale_amount) {
              this.rootScope.dispatchEvent('star_gift_list_update', {peerId: this.rootScope.myId});
            }
            break;
          }
        }
      },
      updateUserEmojiStatus: (upd) => {
        if(upd.user_id !== this.rootScope.myId) return;

        if(this.wearingGiftSlug) {
          this.rootScope.dispatchEvent('star_gift_update', {input: {_: 'inputSavedStarGiftSlug', slug: this.wearingGiftSlug}, wearing: false});
        }

        if(upd.emoji_status._ === 'emojiStatusCollectible') {
          this.wearingGiftSlug = upd.emoji_status.slug;
          this.rootScope.dispatchEvent('star_gift_update', {input: {_: 'inputSavedStarGiftSlug', slug: this.wearingGiftSlug}, wearing: true});
        } else {
          this.wearingGiftSlug = null;
        }
      }
    })
  }

  private async ensureHaveWearingGiftSlug() {
    if(this.wearingGiftSlug === undefined) {
      const self = this.appUsersManager.getSelf();
      if(!self) return
      this.wearingGiftSlug = self.emoji_status?._ === 'emojiStatusCollectible' ? self.emoji_status.slug : null;
    };
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

      let resellPriceStars: Long | undefined;
      let resellPriceTon: Long | undefined;

      if(gift.resell_amount) {
        for(const amount of gift.resell_amount) {
          if(amount._ === 'starsAmount') {
            resellPriceStars = amount.amount;
          } else if(amount._ === 'starsTonAmount') {
            resellPriceTon = amount.amount;
          }
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
        },
        resellPriceStars,
        resellPriceTon,
        resellOnlyTon: gift.pFlags.resale_ton_only,
        ownerId: getPeerId(gift.owner_id),
        input: {_:'inputSavedStarGiftSlug', slug: gift.slug},
        isWearing: gift.slug === this.wearingGiftSlug
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
      saved_id: action.saved_id,
      can_transfer_at: action._ === 'messageActionStarGiftUnique' ? action.can_transfer_at : undefined,
      can_resell_at: action._ === 'messageActionStarGiftUnique' ? action.can_resell_at : undefined
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

    return res.gifts;
  }

  private myPinnedGifts: InputSavedStarGift[] = [];
  public async getProfileGifts(params: {
    peerId: PeerId,
    offset?: string,
    limit?: number,
    sort?: 'date' | 'value',
    unlimited?: boolean,
    limited?: boolean,
    upgradable?: boolean,
    unique?: boolean,
    displayed?: boolean,
    hidden?: boolean,
    withCollections?: boolean
    collectionId?: number
  }) {
    if(params.peerId === this.rootScope.myId) {
      await this.ensureHaveWearingGiftSlug();
    }

    const isUser = params.peerId.isUser();
    const inputPeer = this.appPeersManager.getInputPeerById(params.peerId)
    const collectionsPromise = params.withCollections ?
      this.apiManager.invokeApiSingle('payments.getStarGiftCollections', {
        peer: inputPeer,
        hash: 0
      }) : null
    const res = await this.apiManager.invokeApiSingleProcess({
      method: 'payments.getSavedStarGifts',
      params: {
        peer: inputPeer,
        offset: params.offset ?? '',
        limit: params.limit ?? 50,
        sort_by_value: params.sort === 'value',
        exclude_unlimited: params.unlimited === false,
        exclude_unupgradable: params.limited === false,
        exclude_upgradable: params.upgradable === false,
        exclude_unique: params.unique === false,
        exclude_saved: params.displayed === false,
        exclude_unsaved: params.hidden === false,
        collection_id: params.collectionId
      }
    });

    this.appPeersManager.saveApiPeers(res);

    const wrapped: MyStarGift[] = [];
    for(const it of res.gifts) {
      wrapped.push({
        ...this.wrapGift(it.gift),
        ownerId: params.peerId,
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

    let collections: StarGiftCollection[] | undefined;
    if(collectionsPromise) {
      const res = await collectionsPromise;
      if(res._ === 'payments.starGiftCollections') {
        collections = res.collections;
        for(const it of collections) {
          if(it.icon) this.appDocsManager.saveDoc(it.icon);
        }
      }
    }

    if(params.peerId === this.rootScope.myId && !params.offset) {
      this.myPinnedGifts = wrapped.filter((it) => it.saved?.pFlags.pinned_to_top).map((it) => it.input);
    }

    return {
      next: res.next_offset,
      gifts: wrapped,
      count: res.count,
      collections
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

    this.cachedStarGiftOptionsHash = res.hash;

    const options: MyStarGift[] = [];
    for(const it of res.gifts) {
      const gift = this.wrapGift(it);
      const isResale = gift.raw._ === 'starGift' && !!gift.raw.availability_resale;
      if(isResale) {
        if(!!(gift.raw as StarGift.starGift).availability_remains) {
          options.push(gift);
          options.push({...gift, isResale})
        } else {
          gift.isResale = true;
          options.push(gift);
        }
      } else {
        options.push(gift);
      }
    }

    return this.cachedStarGiftOptions = options;
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

  private wrapAttributeList(attrs: StarGiftAttribute[]) {
    const models: StarGiftAttribute.starGiftAttributeModel[] = [];
    const backdrops: StarGiftAttribute.starGiftAttributeBackdrop[] = [];
    const patterns: StarGiftAttribute.starGiftAttributePattern[] = [];

    for(const attribute of attrs) {
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

  public async getUpgradePreview(giftId: Long): Promise<StarGiftUpgradePreview> {
    const res = await this.apiManager.invokeApiSingle('payments.getStarGiftUpgradePreview', {
      gift_id: giftId
    });

    return this.wrapAttributeList(res.sample_attributes);
  }

  public async getGiftBySlug(slug: string) {
    const [result, savedResult] = await Promise.all([
      this.apiManager.invokeApiSingle('payments.getUniqueStarGift', {slug}),
      this.apiManager.invokeApiSingle('payments.getSavedStarGift', {
        stargift: [{_: 'inputSavedStarGiftSlug', slug}]
      }).catch((): null => null)
    ]);

    this.appUsersManager.saveApiUsers(result.users);

    const ret = this.wrapGift(result.gift);
    if(savedResult) {
      this.appPeersManager.saveApiPeers(savedResult);
      ret.saved = savedResult.gifts[0];
    }

    return ret;
  }

  public async getSavedGiftBySlug(slug: string) {
    const res = await this.apiManager.invokeApiSingle('payments.getSavedStarGift', {
      stargift: [{_: 'inputSavedStarGiftSlug', slug}]
    }).catch((): null => null);
    return res?.gifts[0];
  }

  public async togglePinnedGift(gift: InputSavedStarGift) {
    const idx = this.myPinnedGifts.findIndex((it) => inputStarGiftEquals(it, gift));
    if(idx !== -1) {
      this.myPinnedGifts.splice(idx, 1);
    } else {
      this.myPinnedGifts.push(gift);
    }

    await this.apiManager.invokeApiSingle('payments.toggleStarGiftsPinnedToTop', {
      peer: {_:'inputPeerSelf'},
      stargift: this.myPinnedGifts
    });
    this.rootScope.dispatchEvent('my_pinned_stargifts', {gifts: this.myPinnedGifts});
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

  public async getResaleOptions(params: {
    giftId: Long,
    sort?: 'price' | 'date' | 'num',
    filters?: StarGiftAttributeId[]
    attributesHash: Long,
    offset?: string,
  }) {
    const res = await this.apiManager.invokeApi('payments.getResaleStarGifts', {
      gift_id: params.giftId,
      sort_by_num: params.sort === 'num',
      sort_by_price: params.sort === 'price',
      attributes: params.filters,
      attributes_hash: params.attributesHash,
      offset: params.offset,
      limit: 51 // divisible by 3 for even grid
    })

    this.appPeersManager.saveApiPeers(res);

    const wrappedGifts: MyStarGift[] = res.gifts.map((it) => this.wrapGift(it));
    const ownedGifts = wrappedGifts.filter((it) => getPeerId((it.raw as StarGift.starGiftUnique).owner_id) === this.rootScope.myId);
    if(ownedGifts.length > 0) {
      const savedGifts = await this.apiManager.invokeApiSingle('payments.getSavedStarGift', {
        stargift: ownedGifts.map((it) => it.input)
      }).catch((): null => null)
      if(savedGifts) {
        this.appPeersManager.saveApiPeers(savedGifts);
        for(const it of ownedGifts) {
          const savedGift = savedGifts.gifts.find((it) => (it.gift as StarGift.starGiftUnique).slug === (it.gift as StarGift.starGiftUnique).slug);
          if(savedGift) {
            it.saved = savedGift;
          }
        }
      }
    }

    return {
      items: wrappedGifts,
      next: res.next_offset,
      count: res.count,
      counters: res.counters,
      attributes: res.attributes ? this.wrapAttributeList(res.attributes) : undefined,
      attributesHash: res.attributes_hash
    }
  }

  public async updateResalePrice(gift: InputSavedStarGift, price: StarsAmount | null) {
    return this.apiManager.invokeApiSingleProcess({
      method: 'payments.updateStarGiftPrice',
      params: {
        stargift: gift,
        resell_amount: price ?? {
          _: 'starsAmount',
          amount: 0,
          nanos: 0
        }
      },
      processResult: async(updates) => {
        this.apiUpdatesManager.processUpdateMessage(updates);
        const prices = price ? [price] : [];

        if(price?._ === 'starsTonAmount') {
          // need price in stars. we cant refetch the gift directly so estimate it based on rates

          const appConfig = await this.apiManager.getAppConfig();
          const usd = nanotonToJsNumber(price.amount) * appConfig.ton_usd_rate;
          const stars = usd / (appConfig.stars_usd_sell_rate_x1000 / 100) * 1000;
          prices.push({
            _: 'starsAmount',
            amount: Math.round(stars),
            nanos: 0
          });
        }

        this.rootScope.dispatchEvent('star_gift_update', {input: gift, resalePrice: prices});
      }
    })
  }

  public async getGiftValue(slug: string) {
    const res = await this.apiManager.invokeApiSingle('payments.getUniqueStarGiftValueInfo', {
      slug
    });

    return res;
  }

  public async getFloorPrice(giftName: string) {
    return (this.cachedStarGiftOptions?.find(option => option.raw._ === 'starGift' && option.raw.title === giftName)?.raw as StarGift.starGift)?.resell_min_stars;
  }

  public async updateCollection(options: {
    peerId: PeerId,
    collectionId: number,
    add?: InputSavedStarGift[],
    delete?: InputSavedStarGift[],
    title?: string,
  }) {
    const res = await this.apiManager.invokeApiSingle('payments.updateStarGiftCollection', {
      peer: this.appPeersManager.getInputPeerById(options.peerId),
      collection_id: options.collectionId,
      add_stargift: options.add,
      delete_stargift: options.delete,
      title: options.title
    });

    if(res.icon) this.appDocsManager.saveDoc(res.icon);

    return res;
  }
}
