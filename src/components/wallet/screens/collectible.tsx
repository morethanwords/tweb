/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupElement from '@components/popups/indexTsx';
import Section from '@components/section';
import {createSignal, Show} from 'solid-js';
import type {WalletNftItem} from '@layer';
import type {MyStarGift} from '@appManagers/appGiftsManager';
import Row from '@components/rowTsx';
import Table, {TableRow} from '@components/table';
import {AvatarNewTsx} from '@components/avatarNew';
import {GiftAttributeValue} from '@components/stargifts/giftAttributeValue';
import {ButtonMenuToggleTsx} from '@components/buttonMenuToggleTsx';
import {i18n, LangPackKey} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import {
  classifyWalletNft,
  getWalletNftFragmentUrl,
  getWalletNftTrait,
  isWalletNftGift,
  WalletNftClass
} from '@lib/wallet/nftKind';
import safeWindowOpen from '@helpers/dom/safeWindowOpen';
import {formatPhoneNumber} from '@helpers/formatPhoneNumber';
import noop from '@helpers/noop';
import {useWallet} from '@components/wallet/context';
import {copyWalletAddress, WalletHeader} from '@components/wallet/parts';
import WalletCollectibleHeader from '@components/wallet/collectibleHeader';
import {groupAddress, walletNftName} from '@components/wallet/format';
import styles from '@components/wallet/wallet.module.scss';
import detailsStyles from '@components/wallet/screens/details.module.scss';
import collectibleStyles from '@components/wallet/screens/collectible.module.scss';

/**
 * What the collectible is, under its header: a username or a number in Fragment's words (tdesktop's
 * `CollectibleAboutText`), anything else in its own, as iOS shows it. A gift says it with its table instead.
 */
function walletNftAbout(item: WalletNftItem, {kind, key}: WalletNftClass) {
  if(key && kind === 'username') return i18n('Wallet.Collectible.UsernameAbout', ['@' + key]);
  if(key && kind === 'number') return i18n('Wallet.Collectible.NumberAbout', ['+' + formatPhoneNumber(key).formatted]);
  if(kind === 'gift') return;
  return item.description?.trim() || i18n('Wallet.Collectible.NftAbout');
}

type GiftTrait = 'model' | 'symbol' | 'backdrop';

/** The gift's attributes and what each is called in its table, in iOS's order */
const GIFT_TRAITS: [LangPackKey, GiftTrait][] = [
  ['StarGiftModel', 'model'],
  ['StarGiftPattern', 'symbol'],
  ['StarGiftBackdrop', 'backdrop']
];

/**
 * A gift's table (iOS): its owner, then its model, symbol and backdrop with how rare each is. The rarity comes
 * with the gift itself once the server confirmed it is this item; until then, or without that, the item's own
 * traits stand alone.
 */
function giftTable(item: WalletNftItem, gift: () => MyStarGift): TableRow[] {
  const attribute = (trait: GiftTrait) => {
    const attributes = gift()?.collectibleAttributes;
    return trait === 'model' ? attributes?.model : trait === 'backdrop' ? attributes?.backdrop : attributes?.pattern;
  };

  return [
    ['StarGiftOwner', (
      <div class={collectibleStyles.owner}>
        <AvatarNewTsx peerId={rootScope.myId} size={24} />
        {i18n('FromYou')}
      </div>
    )],
    ...GIFT_TRAITS.map(([langKey, trait]): TableRow => [langKey, (
      <GiftAttributeValue
        name={attribute(trait)?.name || getWalletNftTrait(item, trait) || '—'}
        rarity={attribute(trait)?.rarity}
      />
    )])
  ];
}

/** Any other collectible's traits, as its metadata names them */
function traitsTable(item: WalletNftItem): TableRow[] {
  return (item.attributes || [])
  .filter((attribute) => attribute.trait_type && attribute.value)
  .map((attribute): TableRow => [<span dir="auto">{attribute.trait_type}</span>, <span dir="auto">{attribute.value}</span>]);
}

/**
 * One collectible: its picture (or animation), name and collection, what it is, its traits, and where it lives
 * on the chain. Send hands it on: the recipient screen picks the new owner, the collectible's confirmation sends
 * it. A Telegram username, number or gift is sold on Fragment: Sell opens its page there.
 */
export default function WalletCollectibleScreen(props: {params: {item: WalletNftItem}}) {
  const wallet = useWallet();
  const item = props.params.item;
  const explorerUrl = () => `${wallet.store.config().explorerUrl.replace(/\/$/, '')}/${item.address}`;
  const nftClass = classifyWalletNft(item);
  const fragmentUrl = getWalletNftFragmentUrl(nftClass);
  // * a gift URL only nominates the gift: when the gift turns out to live at another address, this item is not
  // * it and has nothing to sell there (tdesktop drops Sell on GIFT_ADDRESS_MISMATCH, keeps it when the lookup fails)
  const [foreignGift, setForeignGift] = createSignal(false);
  // * the gift itself, once it turned out to be this item: its table shows how rare its attributes are
  const [gift, setGift] = createSignal<MyStarGift>();
  if(fragmentUrl && nftClass.kind === 'gift') {
    rootScope.managers.appGiftsManager.getGiftBySlug(nftClass.key).then((gift) => {
      if(isWalletNftGift(gift?.raw, item.address)) setGift(gift);
      else setForeignGift(true);
    }, noop);
  }

  const about = walletNftAbout(item, nftClass);
  const table = nftClass.kind === 'gift' ? giftTable(item, gift) : traitsTable(item);
  const sellUrl = () => foreignGift() ? undefined : fragmentUrl;
  const canSend = () => wallet.store.status().presence === 'ready';

  return (
    <>
      <WalletHeader title="Wallet.Collectible.Title" back>
        <ButtonMenuToggleTsx
          buttonOptions={{ariaLabel: 'MultiAccount.More'}}
          direction="bottom-left"
          buttons={[{
            icon: 'link',
            text: 'Wallet.Menu.Explorer',
            onClick: () => safeWindowOpen(explorerUrl())
          }]}
        />
      </WalletHeader>
      <div class={styles.body}>
        {/* * a username or a number is its own collection: iOS leaves that line out */}
        <WalletCollectibleHeader item={item} collection={nftClass.kind === 'gift' || nftClass.kind === 'generic'}>
          <Show when={about}>
            <div class={collectibleStyles.description} dir="auto">{about}</div>
          </Show>
        </WalletCollectibleHeader>

        <Show when={table.length}>
          <Table
            class={collectibleStyles.table}
            cellClass={collectibleStyles.tableCell}
            keyCellClass={collectibleStyles.tableKey}
            content={table}
          />
        </Show>

        <Section>
          <Show when={item.collection_address}>
            <Row clickable={() => copyWalletAddress(item.collection_address)}>
              <Row.Title><span class={detailsStyles.address} dir="ltr">{groupAddress(item.collection_address, 6).join('\n')}</span></Row.Title>
              <Row.Subtitle>{i18n('Wallet.Collectible.Collection')}</Row.Subtitle>
            </Row>
          </Show>
          <Row clickable={() => copyWalletAddress(item.address)}>
            <Row.Title><span class={detailsStyles.address} dir="ltr">{groupAddress(item.address, 6).join('\n')}</span></Row.Title>
            <Row.Subtitle>{i18n('Wallet.Collectible.Address')}</Row.Subtitle>
          </Row>
        </Section>
      </div>
      <Show when={canSend() || sellUrl()}>
        {/* * Send alone names what it sends; with Sell under it, it is just Send */}
        <PopupElement.Footer>
          <Show when={canSend()}>
            <PopupElement.FooterButton
              langKey={sellUrl() ? 'Wallet.Send' : 'Wallet.Collectible.Send'}
              langArgs={sellUrl() ? undefined : [walletNftName(item)]}
              callback={() => {
                wallet.router.push('recipient', {nft: item});
                return false;
              }}
            />
          </Show>
          <Show when={sellUrl()}>
            <PopupElement.FooterButton
              langKey="Wallet.Collectible.Sell"
              callback={() => {
                safeWindowOpen(sellUrl());
                return false;
              }}
            />
          </Show>
        </PopupElement.Footer>
      </Show>
    </>
  );
}
