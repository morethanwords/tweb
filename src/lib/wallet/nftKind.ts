/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {StarGift, WalletNftItem, WebDocument} from '@layer';
import {canonicalTonAddress} from '@lib/wallet/transferMessages';

/**
 * Which Telegram collectible an NFT is, and its key on Fragment (tdesktop: gram/api/gram_api_nft.cpp,
 * `ClassifyNftKind`).
 *
 * Numbers and usernames each live in one Fragment collection, so the item's collection address is what makes
 * one: a Fragment-shaped URL under any other collection is forged metadata. Gifts mint a collection per model,
 * which no list can hold, so a gift URL only nominates a slug — whatever collection holds the item. The gift is
 * trusted once `payments.getUniqueStarGift` names this very item's address as the gift's: `isWalletNftGift`.
 */

export type WalletNftKind = 'generic' | 'gift' | 'number' | 'username';

export type WalletNftClass = {
  kind: WalletNftKind,
  /** the slug on Fragment — a gift's slug, a username without `@`, a number's digits — or '' */
  key: string
};

export type WalletNftClassifyInput = {
  /** the collection's address, in any form */
  collection?: string,
  /** the item's metadata URI (`content.uri` of the TON API); an item from the server carries none */
  contentUri?: string,
  name?: string,
  // * the media URLs, in the order a key is looked for in them
  image?: string,
  lottie?: string,
  imageSmall?: string,
  contentUrl?: string
};

const FRAGMENT_NFT_HOST = 'https://nft.fragment.com/';
const FRAGMENT_HOST = 'https://fragment.com/';

/** the one collection numbers and usernames are minted in, by canonical address */
const FRAGMENT_COLLECTIONS: Map<string, {segment: string, kind: WalletNftKind}> = new Map([
  ['0:0e41dc1dc3c9067ed24248580e12b3359818d83dee0304fabcf80845eafafdb2', {segment: 'number', kind: 'number'}],
  ['0:80d78a35f955a14b679faa887ff4cd5bfc0f43b4a4eea2a7e6927f3701b273c2', {segment: 'username', kind: 'username'}]
]);

// * ASCII only: the class the app's t.me/nft/<slug> handler accepts, without a dot that could step out of the path
const SLUG = /^[A-Za-z0-9_-]+$/;
const DOTTED_SLUG = /^[A-Za-z0-9_.-]+$/;
const USERNAME = /^[A-Za-z0-9_]+$/;
const NUMBER = /^\+[0-9 ]*$/;

/** `https://nft.fragment.com/<segment>/<slug>.json` */
function fragmentSlug(uri: string, segment: string) {
  const prefix = FRAGMENT_NFT_HOST + segment + '/';
  if(!uri?.startsWith(prefix)) {
    return '';
  }

  let slug = uri.slice(prefix.length);
  if(slug.endsWith('.json')) {
    slug = slug.slice(0, -'.json'.length);
  }

  return DOTTED_SLUG.test(slug) ? slug : '';
}

/** `https://nft.fragment.com/<segment>/<slug>.<anything>`: a picture, an animation or the metadata */
function fragmentMediaSlug(url: string, segment: string) {
  const prefix = FRAGMENT_NFT_HOST + segment + '/';
  if(!url?.startsWith(prefix)) {
    return '';
  }

  const slug = url.slice(prefix.length).split('.', 1)[0];
  return SLUG.test(slug) ? slug : '';
}

function mediaSlug(input: WalletNftClassifyInput, segment: string) {
  for(const url of [input.image, input.lottie, input.imageSmall, input.contentUrl]) {
    const slug = fragmentMediaSlug(url, segment);
    if(slug) {
      return slug;
    }
  }

  return '';
}

/** `@username` or `+888 0768 4929`, as Fragment names them */
function keyFromName(name: string, kind: WalletNftKind) {
  if(!name) {
    return '';
  }

  if(kind === 'username') {
    const key = name.startsWith('@') ? name.slice(1) : name;
    return USERNAME.test(key) ? key : '';
  }

  if(kind === 'number') {
    return NUMBER.test(name) ? name.slice(1).replace(/ /g, '') : '';
  }

  return '';
}

export function classifyNft(input: WalletNftClassifyInput): WalletNftClass {
  const entry = FRAGMENT_COLLECTIONS.get(canonicalTonAddress(input.collection));
  if(entry) {
    return {
      kind: entry.kind,
      key: fragmentSlug(input.contentUri, entry.segment) ||
        mediaSlug(input, entry.segment) ||
        keyFromName(input.name, entry.kind)
    };
  }

  const slug = fragmentSlug(input.contentUri, 'gift') || mediaSlug(input, 'gift');
  return slug ? {kind: 'gift', key: slug} : {kind: 'generic', key: ''};
}

/**
 * The server's item. A no-proxy document counts as none, as in tdesktop: the client never fetches one, the
 * browser would reveal the user's IP to its host.
 */
export function classifyWalletNft(item: WalletNftItem): WalletNftClass {
  const url = (document: WebDocument) => document?._ === 'webDocument' ? document.url : undefined;
  return classifyNft({
    collection: item.collection_address,
    name: item.name,
    image: url(item.image),
    lottie: url(item.lottie),
    imageSmall: url(item.image_small),
    contentUrl: url(item.content_url)
  });
}

/** Where the collectible is sold: its page on fragment.com, or nothing for one that is not Telegram's */
export function getWalletNftFragmentUrl({kind, key}: WalletNftClass) {
  if(!key || kind === 'generic') {
    return;
  }

  return FRAGMENT_HOST + kind + '/' + key;
}

/**
 * Whether the gift `payments.getUniqueStarGift` returned for an item's slug is that item: the gift's on-chain
 * address is the item's own. Any other answer means the item's metadata names a gift it is not.
 */
export function isWalletNftGift(gift: StarGift, address: string) {
  if(gift?._ !== 'starGiftUnique' || !gift.gift_address) {
    return false;
  }

  const canonical = canonicalTonAddress(address);
  return !!canonical && canonicalTonAddress(gift.gift_address) === canonical;
}

/** A trait its metadata lists, by its type in lower case (`model`, `symbol`, `backdrop`) */
export function getWalletNftTrait(item: Pick<WalletNftItem, 'attributes'>, type: string) {
  return item.attributes?.find((attribute) => attribute.trait_type?.trim().toLowerCase() === type)?.value?.trim() || undefined;
}

/** A gift's model and backdrop, from the traits its metadata lists */
export function getWalletNftGiftLook(item: Pick<WalletNftItem, 'attributes'>) {
  const model = getWalletNftTrait(item, 'model'), backdrop = getWalletNftTrait(item, 'backdrop');
  return model && backdrop ? {model, backdrop} : undefined;
}

/** A collectible's animation is shown only up to this size, packed or not (iOS `walletCollectibleLottieMaximumSize`) */
export const WALLET_NFT_LOTTIE_MAX_SIZE = 5 * 1024 * 1024;

/** The animation the server proxies, when it may be fetched and is not bigger than the client shows */
export function getWalletNftLottie(item: Pick<WalletNftItem, 'lottie'>) {
  const lottie = item.lottie;
  if(lottie?._ !== 'webDocument' || lottie.size > WALLET_NFT_LOTTIE_MAX_SIZE) {
    return;
  }

  return lottie;
}

/** `Plush Pepe #12` → `['Plush Pepe ', '#12']`: the number is drawn in the secondary colour (iOS) */
export function splitWalletNftNumber(name: string): [string, string] {
  const match = /#[0-9]+$/.exec(name);
  return match ? [name.slice(0, match.index), match[0]] : [name, ''];
}

/** The collection an NFT belongs to, as its metadata names it */
export type WalletNftCollection = {
  name?: string,
  /** its page on fragment.com: a link anywhere else is not offered */
  url?: string
};

type JsonObject = {[key: string]: unknown};

const isJsonObject = (value: unknown): value is JsonObject => !!value && typeof(value) === 'object' && !Array.isArray(value);

function nonEmpty(value: unknown) {
  return typeof(value) === 'string' && value.trim() ? value.trim() : undefined;
}

/** An https page on fragment.com itself, normalized, or nothing: the metadata is anybody's to write */
export function getFragmentPageUrl(value: unknown) {
  const string = nonEmpty(value);
  if(!string) {
    return;
  }

  let url: URL;
  try {
    url = new URL(string);
  } catch(err) {
    return;
  }

  if(url.protocol !== 'https:' || url.hostname !== 'fragment.com' || url.port || url.username || url.password) {
    return;
  }

  return url.href;
}

// * the metadata is read once per item: the grid asks for it on every tile
const extraCache: WeakMap<WalletNftItem, JsonObject> = new WeakMap();

/** The item's `extra`: the metadata the server passes on as JSON, or an empty object when it is none */
export function getWalletNftExtra(item: Pick<WalletNftItem, 'extra'>): JsonObject {
  let extra = extraCache.get(item as WalletNftItem);
  if(extra) {
    return extra;
  }

  try {
    const parsed: unknown = item.extra?.data ? JSON.parse(item.extra.data) : undefined;
    extra = isJsonObject(parsed) ? parsed : {};
  } catch(err) {
    extra = {};
  }

  extraCache.set(item as WalletNftItem, extra);
  return extra;
}

/**
 * The collection's name and Fragment page from the item's metadata (iOS `walletCollectible(from:)`): the flat
 * `collection_name` / `collection_url`, or the nested `collection` object of the TON API.
 */
export function getWalletNftCollection(item: Pick<WalletNftItem, 'extra'>): WalletNftCollection {
  const extra = getWalletNftExtra(item);
  const collection = isJsonObject(extra.collection) ? extra.collection : {};
  return {
    name: nonEmpty(extra.collection_name) ?? nonEmpty(collection.name),
    url: getFragmentPageUrl(extra.collection_url) ??
      getFragmentPageUrl(collection.external_link) ??
      getFragmentPageUrl(collection.url)
  };
}
