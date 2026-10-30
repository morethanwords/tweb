import type {StarGift, WalletNftItem, WebDocument} from '@layer';
import {
  classifyNft,
  classifyWalletNft,
  getFragmentPageUrl,
  getWalletNftCollection,
  getWalletNftFragmentUrl,
  getWalletNftGiftLook,
  getWalletNftLottie,
  getWalletNftTrait,
  isWalletNftGift,
  splitWalletNftNumber,
  WALLET_NFT_LOTTIE_MAX_SIZE,
  WalletNftClassifyInput
} from '@lib/wallet/nftKind';

// * the vectors of tdesktop's gram/tests/gram_nft_tests.cpp and its fixtures
const FOREIGN_RAW = '0:0c8f3fcc4abd589206a2cdf1469e37092c1adad272fbe7db97104569c16f0ff2';
const NUMBER_RAW = '0:0e41dc1dc3c9067ed24248580e12b3359818d83dee0304fabcf80845eafafdb2';
const USERNAME_RAW = '0:80d78a35f955a14b679faa887ff4cd5bfc0f43b4a4eea2a7e6927f3701b273c2';
const GIFT_COLLECTION_RAW = '0:4C71F300665314AF55B75FC91D130DDF24C5006961F8F9772613947945F14863';
// * the same collections the way the explorer writes them (the fixtures' address books)
const NUMBER_FRIENDLY = 'EQAOQdwdw8kGftJCSFgOErM1mBjYPe4DBPq8-AhF6vr9si5N';
const USERNAME_FRIENDLY = 'EQCA14o1-VWhS2efqoh_9M1b_A9DtKTuoqfmkn83AbJzwnPi';
const GIFT_ITEM_RAW = '0:CA0CFD519F763102B5BEC9D9E3AF43592EA362FB773FA319EA09C4F162C171E0';
const GIFT_ITEM_FRIENDLY = 'EQDKDP1Rn3YxArW-ydnjr0NZLqNi-3c_oxnqCcTxYsFx4IUQ';

const GIFT_URI = 'https://nft.fragment.com/gift/deskcalendar-45754.json';
const NUMBER_URI = 'https://nft.fragment.com/number/88807684929.json';

const expectClass = (input: WalletNftClassifyInput, kind: string, key = '') => {
  expect(classifyNft(input)).toEqual({kind, key});
};

describe('Telegram collectibles', () => {
  test('a gift URI nominates its slug whatever the collection', () => {
    expectClass({collection: FOREIGN_RAW, contentUri: GIFT_URI}, 'gift', 'deskcalendar-45754');
    expectClass({collection: GIFT_COLLECTION_RAW, contentUri: GIFT_URI}, 'gift', 'deskcalendar-45754');
  });

  test('numbers and usernames only in their own collection', () => {
    expectClass({collection: NUMBER_RAW, contentUri: NUMBER_URI}, 'number', '88807684929');
    expectClass({collection: NUMBER_RAW.toUpperCase(), contentUri: NUMBER_URI}, 'number', '88807684929');
    expectClass(
      {collection: USERNAME_RAW.toUpperCase(), contentUri: 'https://nft.fragment.com/username/katrinakaif.json'},
      'username',
      'katrinakaif'
    );
    // * a real-shaped URI under another collection is forged metadata
    expectClass({collection: FOREIGN_RAW, contentUri: NUMBER_URI}, 'generic');
  });

  test('a slug that leaves the allowed characters is none', () => {
    expectClass({collection: GIFT_COLLECTION_RAW, contentUri: 'https://nft.fragment.com/gift/sub/dir.json'}, 'generic');
  });

  test('the key from the media when the URI has none', () => {
    expectClass(
      {collection: FOREIGN_RAW, image: 'https://nft.fragment.com/gift/deskcalendar-45754.webp'},
      'gift',
      'deskcalendar-45754'
    );
    expectClass({
      collection: FOREIGN_RAW,
      imageSmall: 'https://imgproxy.toncenter.com/CLisjZYndcPa0HF7lUeL2LkBthE4L7OJ04Gp8GEDknE/pr:small/aHR0cHM6Ly9uZnQuZnJhZ21lbnQuY29tL2dpZnQvZGVza2NhbGVuZGFyLTQ1NzU0LndlYnA',
      lottie: 'https://nft.fragment.com/gift/deskcalendar-45754.lottie.json'
    }, 'gift', 'deskcalendar-45754');
    expectClass(
      {collection: NUMBER_RAW, name: '+888 0768 4929', image: 'https://nft.fragment.com/number/88807684929.webp'},
      'number',
      '88807684929'
    );
    expectClass(
      {collection: FOREIGN_RAW, name: '+888 0768 4929', image: 'https://nft.fragment.com/number/88807684929.webp'},
      'generic'
    );
  });

  test('the key from the name as the last resort', () => {
    expectClass({collection: NUMBER_RAW, name: '+888 0768 4929'}, 'number', '88807684929');
    expectClass({collection: USERNAME_RAW, name: '@tolya'}, 'username', 'tolya');
    expectClass({collection: USERNAME_RAW, name: 'tolya'}, 'username', 'tolya');
    // * the collection still makes the kind, without a key to sell it by
    expectClass({collection: USERNAME_RAW, name: '@to.lya'}, 'username');
    expectClass({collection: NUMBER_RAW, name: '888 0768 4929'}, 'number');
    expectClass({collection: NUMBER_RAW, name: '+888-0768'}, 'number');
  });

  test('nothing else makes a Telegram collectible', () => {
    expectClass({collection: FOREIGN_RAW, image: 'https://example.com/gift/x.webp'}, 'generic');
    expectClass({collection: FOREIGN_RAW, image: 'https://nft.fragment.com/gift/../x.webp'}, 'generic');
    expectClass({collection: FOREIGN_RAW, image: 'https://nft.fragment.com/gift/x%2Fy.webp'}, 'generic');
    expectClass({collection: FOREIGN_RAW, name: 'Some Item #1'}, 'generic');
    expectClass({collection: FOREIGN_RAW, contentUri: 'http://192.236.162.114/nft/1.json'}, 'generic');
    for(const contentUri of [
      'https://888ton2.pages.dev/nft/13.json',
      'https://hamstrcombat.github.io/hmstr/metadata.json?aUn8uheb7onG13AVFMiEl',
      'http://ntf.pages.dev/777.json?qZhoT8SDfV-DKUnT4XWAm',
      'ipfs://QmZUbAvRbmwbn26fq2312fp67c6iZD2vK1NmwmimWTnA38',
      'tonstorage://6BF34B39DC5FD6AC4FF845722E16EA8574A2504B7C6E1F0DF375805B69AAABE5/2006.json'
    ]) {
      expectClass({contentUri}, 'generic');
    }
  });
});

describe('the server\'s collectibles', () => {
  const document = (url: string, noProxy?: boolean): WebDocument => noProxy ?
    {_: 'webDocumentNoProxy', url, size: 0, attributes: []} :
    {_: 'webDocument', url, access_hash: '1', size: 0, attributes: []};

  const item = (fields: Partial<WalletNftItem>): WalletNftItem => ({
    _: 'wallet.nftItem',
    address: GIFT_ITEM_FRIENDLY,
    owner_address: 'UQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPuwA',
    index: '1',
    ...fields
  });

  test('a collection in any form, the key from the content URL', () => {
    expect(classifyWalletNft(item({
      collection_address: NUMBER_FRIENDLY,
      name: '+888 0768 4929',
      content_url: document(NUMBER_URI)
    }))).toEqual({kind: 'number', key: '88807684929'});
    expect(classifyWalletNft(item({
      collection_address: USERNAME_FRIENDLY,
      name: '@katrinakaif',
      image: document('https://nft.fragment.com/username/katrinakaif.webp')
    }))).toEqual({kind: 'username', key: 'katrinakaif'});
    expect(classifyWalletNft(item({
      collection_address: GIFT_COLLECTION_RAW,
      content_url: document(GIFT_URI)
    }))).toEqual({kind: 'gift', key: 'deskcalendar-45754'});
  });

  test('a document the client never fetches counts as none', () => {
    expect(classifyWalletNft(item({
      collection_address: GIFT_COLLECTION_RAW,
      content_url: document(GIFT_URI, true)
    }))).toEqual({kind: 'generic', key: ''});
    // * a number's name still names it
    expect(classifyWalletNft(item({
      collection_address: NUMBER_FRIENDLY,
      name: '+888 0768 4929',
      content_url: document(NUMBER_URI, true)
    }))).toEqual({kind: 'number', key: '88807684929'});
  });

  test('sold on fragment.com by kind and key', () => {
    expect(getWalletNftFragmentUrl({kind: 'gift', key: 'deskcalendar-45754'})).toBe('https://fragment.com/gift/deskcalendar-45754');
    expect(getWalletNftFragmentUrl({kind: 'username', key: 'katrinakaif'})).toBe('https://fragment.com/username/katrinakaif');
    expect(getWalletNftFragmentUrl({kind: 'number', key: '88807684929'})).toBe('https://fragment.com/number/88807684929');
    expect(getWalletNftFragmentUrl({kind: 'username', key: ''})).toBeUndefined();
    expect(getWalletNftFragmentUrl({kind: 'generic', key: ''})).toBeUndefined();
  });

  test('a gift is the item only at the item\'s own address', () => {
    const gift = (gift_address?: string) => ({_: 'starGiftUnique', gift_address} as StarGift.starGiftUnique);
    expect(isWalletNftGift(gift(GIFT_ITEM_RAW), GIFT_ITEM_FRIENDLY)).toBe(true);
    expect(isWalletNftGift(gift(GIFT_ITEM_FRIENDLY), GIFT_ITEM_RAW.toLowerCase())).toBe(true);
    expect(isWalletNftGift(gift(FOREIGN_RAW), GIFT_ITEM_FRIENDLY)).toBe(false);
    // * a gift that is not on the chain, or not unique, is no item's
    expect(isWalletNftGift(gift(), GIFT_ITEM_FRIENDLY)).toBe(false);
    expect(isWalletNftGift({_: 'starGift'} as StarGift, GIFT_ITEM_FRIENDLY)).toBe(false);
    expect(isWalletNftGift(gift('not an address'), 'not an address')).toBe(false);
    expect(isWalletNftGift(undefined, GIFT_ITEM_FRIENDLY)).toBe(false);
  });

  test('a gift\'s model and backdrop from its traits', () => {
    const trait = (trait_type: string, value: string) => ({_: 'wallet.nftAttribute' as const, trait_type, value});
    expect(getWalletNftGiftLook({attributes: [
      trait('Model', 'Red Pen'),
      trait('Backdrop', 'Azure Blue'),
      trait('Symbol', 'Flower Cross')
    ]})).toEqual({model: 'Red Pen', backdrop: 'Azure Blue'});
    expect(getWalletNftGiftLook({attributes: [trait('Model', 'Red Pen')]})).toBeUndefined();
    expect(getWalletNftGiftLook({})).toBeUndefined();
  });

  test('a trait by its type, whatever its case and spaces', () => {
    const trait = (trait_type: string, value: string) => ({_: 'wallet.nftAttribute' as const, trait_type, value});
    const item = {attributes: [trait(' Symbol ', ' Flower Cross '), trait('Model', '')]};
    expect(getWalletNftTrait(item, 'symbol')).toBe('Flower Cross');
    expect(getWalletNftTrait(item, 'model')).toBeUndefined();
    expect(getWalletNftTrait({}, 'model')).toBeUndefined();
  });

  test('the number after the name, split off', () => {
    expect(splitWalletNftNumber('Plush Pepe #12')).toEqual(['Plush Pepe ', '#12']);
    expect(splitWalletNftNumber('#7')).toEqual(['', '#7']);
    expect(splitWalletNftNumber('Item #12a')).toEqual(['Item #12a', '']);
    expect(splitWalletNftNumber('@username')).toEqual(['@username', '']);
  });

  test('a collection page only on fragment.com over https', () => {
    expect(getFragmentPageUrl('https://fragment.com/gifts/plushpepe')).toBe('https://fragment.com/gifts/plushpepe');
    expect(getFragmentPageUrl(' https://FRAGMENT.com/gifts ')).toBe('https://fragment.com/gifts');
    expect(getFragmentPageUrl('http://fragment.com/gifts')).toBeUndefined();
    expect(getFragmentPageUrl('https://nft.fragment.com/gift/a.json')).toBeUndefined();
    expect(getFragmentPageUrl('https://fragment.com.evil.example/gifts')).toBeUndefined();
    expect(getFragmentPageUrl('https://user@fragment.com/gifts')).toBeUndefined();
    expect(getFragmentPageUrl('https://fragment.com:8443/gifts')).toBeUndefined();
    expect(getFragmentPageUrl('javascript:alert(1)')).toBeUndefined();
    expect(getFragmentPageUrl(42)).toBeUndefined();
    expect(getFragmentPageUrl('not a url')).toBeUndefined();
  });

  test('the collection from the metadata, flat or nested', () => {
    const extra = (value: unknown) => ({extra: {_: 'dataJSON' as const, data: JSON.stringify(value)}});
    expect(getWalletNftCollection(extra({collection_name: ' Plush Pepes ', collection_url: 'https://fragment.com/gifts/plushpepe'})))
    .toEqual({name: 'Plush Pepes', url: 'https://fragment.com/gifts/plushpepe'});
    expect(getWalletNftCollection(extra({collection: {name: 'Punks', external_link: 'https://punks.example.com', url: 'https://fragment.com/punks'}})))
    .toEqual({name: 'Punks', url: 'https://fragment.com/punks'});
    // * the flat fields first
    expect(getWalletNftCollection(extra({collection_name: 'Flat', collection: {name: 'Nested'}})).name).toBe('Flat');
    expect(getWalletNftCollection(extra({collection_name: '', collection: 'Punks'}))).toEqual({name: undefined, url: undefined});
    expect(getWalletNftCollection(extra([1, 2]))).toEqual({name: undefined, url: undefined});
    expect(getWalletNftCollection({extra: {_: 'dataJSON', data: '{broken'}})).toEqual({name: undefined, url: undefined});
    expect(getWalletNftCollection({})).toEqual({name: undefined, url: undefined});
  });

  test('an animation only through the proxy and not too big', () => {
    const url = 'https://nft.fragment.com/gift/a.lottie.json';
    const proxied = (size: number): {lottie: WebDocument} => ({lottie: {_: 'webDocument', url, size, attributes: [], access_hash: 0}});
    expect(getWalletNftLottie(proxied(1000))).toBeTruthy();
    expect(getWalletNftLottie(proxied(0))).toBeTruthy();
    expect(getWalletNftLottie(proxied(WALLET_NFT_LOTTIE_MAX_SIZE + 1))).toBeUndefined();
    expect(getWalletNftLottie({lottie: {_: 'webDocumentNoProxy', url, size: 1000, attributes: []}})).toBeUndefined();
    expect(getWalletNftLottie({})).toBeUndefined();
  });
});
