/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {createEffect, createMemo, createSignal, getOwner, JSX, Match, on, onCleanup, runWithOwner, Show, Suspense, Switch} from 'solid-js';
import type {WalletNftItem} from '@layer';
import type AppSelectPeers from '@components/appSelectPeers';
import Row from '@components/rowTsx';
import Section from '@components/section';
import {AvatarNewTsx} from '@components/avatarNew';
import {PeerTitleTsx} from '@components/peerTitleTsx';
import {IconTsx} from '@components/iconTsx';
import emptyPlaceholder from '@components/emptyPlaceholder';
import {toastNew} from '@components/toast';
import {i18n} from '@lib/langPack';
import I18n from '@lib/langPack';
import liteMode from '@helpers/liteMode';
import classNames from '@helpers/string/classNames';
import {getMiddleware} from '@helpers/middleware';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import {walletError} from '@lib/wallet/walletSession';
import {useWallet} from '@components/wallet/context';
import {WalletHeader} from '@components/wallet/parts';
import WalletPicker, {setWalletPickerQuery} from '@components/wallet/picker';
import {
  classifyRecipientInput,
  getRecentRecipients,
  resolveRecipientInput,
  resolveUserRecipient,
  WalletRecipientInput,
  WalletTransferLink
} from '@components/wallet/recipient';
import {shortAddress, walletNftName} from '@components/wallet/format';
import {getWalletErrorLangKey, toastWalletError} from '@components/wallet/send';
import styles from '@components/wallet/screens/recipient.module.scss';

/** iOS resolves what is typed after this pause */
const RESOLVE_DEBOUNCE = 400;

type Resolution =
  | {state: 'resolving'}
  | {state: 'resolved', link: WalletTransferLink}
  | {state: 'failed', error: any};

/**
 * Who to send to — the app's people picker (tdesktop: WalletSendRecipientBox): recent recipients first, then
 * chats and contacts, users only. An address, a .ton or .t.me name or a ton:// link typed into its search is checked
 * as it is typed (iOS): the Telegram user its wallet belongs to, or the address itself, is offered above the list, an
 * address that is none says so. The pick goes on to the amount screen, or for a collectible to its confirmation.
 */
export default function WalletRecipientScreen(props: {params?: {nft?: WalletNftItem}}) {
  const wallet = useWallet();
  const store = wallet.store;
  const nft = props.params?.nft;
  // * a pick still resolving when the screen was left (back, the window closed) goes nowhere
  const isCurrent = wallet.router.watchCurrent();
  let selector: AppSelectPeers;

  let busy = false;
  /** `resolve` gives the recipient; a failure is said and the picker stays */
  const choose = async(resolve: () => Promise<WalletTransferLink>) => {
    // * one pick at a time: a second one while the first resolves is dropped
    if(busy) return;
    busy = true;
    try {
      const params = await resolve();
      if(!isCurrent()) return;
      if(!params) throw new Error('no recipient');
      if(!nft) {
        await wallet.router.push('amount', params);
        return;
      }

      // * a link's amount and comment are for Grams: only its address counts here
      const own = store.status().state?.address;
      if(own && await store.session.isSameAddress(own, params.recipient.address)) {
        throw walletError('WALLET_NFT_OWN_WALLET');
      }

      if(!isCurrent()) return;
      await wallet.router.push('collectibleSend', {recipient: params.recipient, nft});
    } catch(err) {
      if(isCurrent()) toastWalletError(err);
    } finally {
      busy = false;
    }
  };

  const [search, setSearch] = createSignal('');
  const input = createMemo(() => classifyRecipientInput(search()), undefined, {
    equals: (a, b) => a.kind === b.kind && a.value === b.value
  });

  // * what the typed address, name or link stands for, checked a moment after the typing stops
  const [resolution, setResolution] = createSignal<Resolution>();
  let resolveTimer: number, resolveRevision = 0;
  createEffect(on(input, (value) => {
    clearTimeout(resolveTimer);
    const revision = ++resolveRevision;
    if(value.kind === 'search') {
      setResolution(undefined);
      return;
    }

    setResolution({state: 'resolving'});
    resolveTimer = window.setTimeout(() => {
      resolveRecipientInput(store, value).then((link) => {
        if(revision === resolveRevision) setResolution({state: 'resolved', link});
      }, (error) => {
        if(revision === resolveRevision) setResolution({state: 'failed', error});
      });
    }, RESOLVE_DEBOUNCE);
  }));
  onCleanup(() => {
    clearTimeout(resolveTimer);
    ++resolveRevision;
  });

  const resolved = () => {
    const value = resolution();
    return value?.state === 'resolved' ? value.link : undefined;
  };

  const failure = () => {
    const value = resolution();
    return value?.state === 'failed' ? value.error : undefined;
  };

  // * the pasted text goes into the search as if typed; what is not an address, a name or a link is said (iOS)
  const canPaste = !!navigator.clipboard?.readText;
  const paste = async() => {
    let text: string;
    try {
      text = (await navigator.clipboard.readText()).trim();
    } catch(err) {
      return;
    }

    if(!selector || classifyRecipientInput(text).kind === 'search') {
      toastNew({langPackKey: 'Wallet.Recipient.InvalidAddress'});
      return;
    }

    setWalletPickerQuery(selector, text);
  };

  return (
    <>
      <WalletHeader
        titleElement={nft ? i18n('Wallet.Collectible.TransferTitle', [walletNftName(nft)]) : i18n('Wallet.SendTitle')}
        back
      >
        <Show when={canPaste && !search()}>
          <button
            type="button"
            class={classNames('btn-icon', styles.paste)}
            aria-label={I18n.format('Wallet.Recipient.Paste', true)}
            title={I18n.format('Wallet.Recipient.Paste', true)}
            onClick={paste}
          >
            <IconTsx icon="clipboard" />
          </button>
        </Show>
      </WalletHeader>
      <WalletPicker
        ref={(value) => selector = value}
        options={getRecentRecipients(store).catch((): PeerId[] => []).then((recent) => ({
          filterPeerTypeBy: ['isRegularUser'],
          exceptSelf: true,
          meAsSaved: false,
          prependPeerIds: recent,
          onSelect: (peerId) => {
            choose(async() => ({recipient: await resolveUserRecipient(store, (peerId as PeerId).toUserId())}));
            return false;
          }
        }))}
        onSearch={setSearch}
        // * an address is not searched for among people: what it resolves to is all there is (tdesktop)
        listHidden={() => input().kind !== 'search'}
        aboveList={
          <Show when={input().kind !== 'search'}>
            <Switch>
              <Match when={resolved()} keyed>
                {(link) => <RecipientResult link={link} onClick={() => choose(async() => link)} />}
              </Match>
              <Match when={failure()} keyed>
                {(error) => <RecipientFailure input={input()} error={error} />}
              </Match>
            </Switch>
          </Show>
        }
      />
    </>
  );
}

/** Comes in with a fade (iOS: 0.2 s), when fades play */
function fadeClass() {
  return liteMode.isAvailable('animations') ? styles.fadeIn : undefined;
}

/** The typed address: the Telegram user whose wallet it is, or the address (with the name it was found by) */
function RecipientResult(props: {link: WalletTransferLink, onClick: () => void}) {
  const recipient = props.link.recipient;
  const peerId = recipient.userId?.toPeerId(false);
  const subtitle = (): JSX.Element => recipient.domain ? <span dir="ltr">{recipient.domain}</span> : i18n('Wallet.Recipient.Address');
  return (
    <Section class={fadeClass()}>
      <Row clickable={props.onClick}>
        <Show
          when={peerId}
          fallback={<>
            <Row.Icon icon="gram_filled" />
            <Row.Title><span dir="ltr">{shortAddress(recipient.address, 6)}</span></Row.Title>
            <Row.Subtitle>{subtitle()}</Row.Subtitle>
          </>}
        >
          <Row.Media size="abitbigger"><AvatarNewTsx peerId={peerId} size={42} /></Row.Media>
          {/* * its own boundary: the name loading must not suspend the whole screen (it would be taken out and put back) */}
          <Row.Title><Suspense><PeerTitleTsx peerId={peerId} /></Suspense></Row.Title>
          <Row.Subtitle><span dir="ltr">{shortAddress(recipient.address, 6)}</span></Row.Subtitle>
        </Show>
      </Row>
    </Section>
  );
}

/** Nothing behind what was typed: the app's "No Results", with iOS's words for an address and for a name */
function RecipientFailure(props: {input: WalletRecipientInput, error: any}) {
  const middlewareHelper = getMiddleware();
  onCleanup(() => middlewareHelper.destroy());
  const description = (): JSX.Element => {
    const type: string = props.error?.type;
    if(type === 'WALLET_ADDRESS_INVALID') return i18n('Wallet.Recipient.InvalidAddressText');
    if(type === 'WALLET_NAME_NOT_FOUND') return i18n('Wallet.Recipient.NoResultsText', [wrapEmojiText(props.input.value)]);
    return i18n(getWalletErrorLangKey(props.error));
  };

  const [element, setElement] = createSignal<JSX.Element>();
  const owner = getOwner();
  emptyPlaceholder({
    middleware: middlewareHelper.get(),
    title: () => i18n('SearchEmptyViewTitle'),
    description,
    hide: () => false
  }).then((container) => runWithOwner(owner, () => setElement(container)));

  return <div class={classNames(styles.failure, fadeClass())} role="status">{element()}</div>;
}
