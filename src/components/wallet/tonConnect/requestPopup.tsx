/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {createSignal, For, JSX, onCleanup, onMount, Show} from 'solid-js';
import type {SendPreview} from '@ton/wallet-engine';
import type {TonConnectManifestInfo} from '@lib/wallet/tonConnect';
import type {TonConnectAppRequest} from '@lib/wallet/tonConnectWire';
import type {WalletRates} from '@appManagers/appWalletManager';
import PopupElement, {createPopup} from '@components/popups/indexTsx';
import MediaHeader from '@components/mediaHeader';
import Section from '@components/section';
import Row from '@components/rowTsx';
import {IconTsx} from '@components/iconTsx';
import {PopupCloser, TonConnectAppIcon, TonConnectText} from '@components/wallet/tonConnect/parts';
import {readCurrency} from '@components/wallet/store';
import {formatFiat, formatGrams, formatGramsCut, shortAddress} from '@components/wallet/format';
import {sumTonConnectAmounts, toRawTonAddress} from '@lib/wallet/tonConnectWire';
import {toFriendlyTonAddress} from '@lib/wallet/tonAddress';
import I18n, {i18n, LangPackKey} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import classNames from '@helpers/string/classNames';
import Modes from '@config/modes';
import styles from '@components/wallet/tonConnect/tonConnect.module.scss';

type TransferRequest = Extract<TonConnectAppRequest, {kind: 'sendTransaction'}>;
type SignDataRequest = Extract<TonConnectAppRequest, {kind: 'signData'}>;

export type TonConnectRequestPopupOptions = {
  info?: TonConnectManifestInfo,
  request: TransferRequest | SignDataRequest,
  /** the wallet's own address: it tells what leaves it from what comes back */
  walletAddress: string,
  /** sendTransaction: the engine's emulation of exactly what would be signed */
  preview?: Promise<SendPreview>,
  /** unix ms: the request is gone then, and the sheet with it */
  closesAt?: number,
  /** settle once the answer went; a rejection keeps the sheet */
  onConfirm: () => Promise<void>,
  onDecline: () => Promise<void>,
  onExpired?: () => void,
  onClose?: () => void
};

export type TonConnectPreviewKind = 'transfer' | 'callContract' | 'deployContract' | 'excess' | 'unknown';

export type TonConnectPreviewItem = {
  kind: TonConnectPreviewKind,
  /** of the wallet: what leaves it, what comes back; nothing when it is neither */
  direction?: 'incoming' | 'outgoing',
  address?: string,
  /** nanograms */
  amount?: string,
  comment?: string,
  succeeded: boolean
};

const KIND_TITLES: {[kind in TonConnectPreviewKind]: LangPackKey} = {
  transfer: 'Wallet.Request.Transfer',
  callContract: 'Wallet.Request.CallContract',
  deployContract: 'Wallet.Request.DeployContract',
  excess: 'Wallet.Request.Excess',
  unknown: 'Wallet.Request.UnknownOperation'
};

/**
 * What the transfer would do, as iOS lists it (WalletTransferPresentation.previewItems): the emulated trace's
 * actions, each with its direction for this wallet — or, before the emulation answered, the messages themselves.
 */
export function getTonConnectPreviewItems(request: TransferRequest, walletAddress: string, preview?: SendPreview): TonConnectPreviewItem[] {
  const actions = preview?.emulation.actions;
  if(!actions?.length) {
    return request.messages.map((message) => ({
      kind: message.payload ? 'callContract' : 'transfer',
      direction: 'outgoing',
      address: message.address,
      amount: message.amount,
      succeeded: true
    }));
  }

  const own = toRawTonAddress(walletAddress);
  return actions.map((action): TonConnectPreviewItem => {
    let details: {[key: string]: any} = {};
    try {
      details = JSON.parse(action.detailsJson) || {};
    } catch(err) {}

    const kind: TonConnectPreviewKind = action.kind === 'ton_transfer' ? 'transfer' :
      action.kind === 'call_contract' ? 'callContract' :
      action.kind === 'contract_deploy' || action.kind === 'deploy_contract' ? 'deployContract' :
      action.kind === 'excess' ? 'excess' :
      'unknown';
    const source = typeof(details.source) === 'string' ? details.source : undefined;
    const destination = typeof(details.destination) === 'string' ? details.destination : undefined;
    const direction = own && source && toRawTonAddress(source) === own ? 'outgoing' :
      own && destination && toRawTonAddress(destination) === own ? 'incoming' :
      undefined;
    const value = kind === 'transfer' && /^\d+$/.test(String(details.value ?? '')) ? String(details.value) : undefined;
    return {
      kind,
      direction,
      address: (direction === 'incoming' ? source : destination) ?? action.accounts[0],
      amount: value,
      comment: typeof(details.comment) === 'string' ? details.comment : undefined,
      succeeded: action.succeeded
    };
  });
}

/** an address short, as the dApp wrote it; a raw one of the emulation in the form a contract is written (bounceable) */
function friendlyShort(address: string) {
  if(!address) return '';
  return shortAddress((address.includes(':') ? toFriendlyTonAddress(address, true) : undefined) || address);
}

/**
 * A connected app's request (iOS WalletTransferScreen): a transfer with what it sends, to whom, the emulated
 * preview and the fee — Confirm only once the emulation succeeded in full; or data to sign, text in full (Sign once it
 * was read to the end) or blind bytes with the warning. Closing leaves the request for another device.
 */
export default function showTonConnectRequestPopup(options: TonConnectRequestPopupOptions) {
  const [show, setShow] = createSignal(false);
  let close: () => void;
  createPopup(() => {
    const request = options.request;
    const name = options.info?.name;
    const [preview, setPreview] = createSignal<SendPreview>();
    const [previewFailed, setPreviewFailed] = createSignal(false);
    const [rates, setRates] = createSignal<WalletRates>();
    const [readToEnd, setReadToEnd] = createSignal(request.kind !== 'signData' || request.payload.type !== 'text');
    const currency = readCurrency();
    rootScope.managers.appWalletManager.getRates().then(setRates, () => {});
    options.preview?.then(setPreview, () => setPreviewFailed(true));
    const fiatPerGram = () => rates()?.rates[currency] || 0;

    // * one answer at a time, and one on its way is never taken from under the user: its outcome closes the sheet,
    // * or — when it did not go — the time that ran out meanwhile does
    const [answering, setAnswering] = createSignal(false);
    let expired = false;
    const expire = () => {
      options.onExpired?.();
      close?.();
    };

    const answer = (callback: () => Promise<void>) => {
      setAnswering(true);
      return callback().then(() => true, () => {
        setAnswering(false);
        if(expired) expire();
        return false;
      });
    };

    if(options.closesAt) {
      const timeout = window.setTimeout(() => {
        expired = true;
        if(!answering()) expire();
      }, Math.max(0, options.closesAt - Date.now()));
      onCleanup(() => clearTimeout(timeout));
    }

    const traceOk = () => !!preview() && preview().emulation.traceSucceeded && !preview().emulation.isIncomplete;
    const canConfirm = () => request.kind === 'signData' ? readToEnd() : traceOk();

    // * the app's name in a sentence reads in its own direction, apart from the words around it
    const nameText = () => <span dir="auto">{name}</span> as HTMLElement;
    const title = () => request.kind === 'signData' ?
      (name ? i18n('Wallet.Sign.Title', [nameText()]) : i18n('Wallet.Sign.SignData')) :
      (name ? i18n('Wallet.Request.Title', [nameText()]) : i18n('Wallet.Request.TitleUnknown'));

    return (
      <PopupElement
        class={styles.popup}
        show={show()}
        closable
        onClose={() => options.onClose?.()}
      >
        <PopupElement.Header>
          <PopupElement.CloseButton />
        </PopupElement.Header>
        <PopupElement.Scrollable>
          <PopupElement.Body class={styles.body}>
            <MediaHeader marginTop marginBottom>
              <MediaHeader.Sticker size={64} element={<TonConnectAppIcon icon={options.info?.icon} name={name} size={64} />} />
              <MediaHeader.Title tag="h2" size={20}>{title()}</MediaHeader.Title>
              <Show when={options.info?.domain}>
                <MediaHeader.Subtitle class={styles.domain}><span dir="ltr">{options.info.domain}</span></MediaHeader.Subtitle>
              </Show>
            </MediaHeader>
            <Show
              when={request.kind === 'sendTransaction'}
              fallback={<SignDataContent request={request as SignDataRequest} onReadToEnd={() => setReadToEnd(true)} />}
            >
              <TransferContent
                request={request as TransferRequest}
                walletAddress={options.walletAddress}
                preview={preview()}
                previewFailed={previewFailed()}
                fiatPerGram={fiatPerGram()}
                currency={currency}
              />
            </Show>
          </PopupElement.Body>
        </PopupElement.Scrollable>
        <PopupElement.Footer class={styles.footer}>
          <PopupElement.FooterButton
            color="secondary"
            langKey="Wallet.Request.Decline"
            disabled={answering()}
            callback={() => answer(options.onDecline)}
          />
          <PopupElement.FooterButton
            langKey={request.kind === 'signData' ? 'Wallet.Sign.Sign' : 'Wallet.Request.Confirm'}
            disabled={answering() || !canConfirm()}
            preloader
            callback={() => answer(options.onConfirm)}
          />
        </PopupElement.Footer>
        <PopupCloser register={(hide) => close = hide} />
      </PopupElement>
    );
  });

  setShow(true);
  return {close: () => close?.()};
}

function TransferContent(props: {
  request: TransferRequest,
  walletAddress: string,
  preview?: SendPreview,
  previewFailed: boolean,
  fiatPerGram: number,
  currency: string
}) {
  const total = sumTonConnectAmounts(props.request.messages);
  // * every digit of what goes: a request is confirmed as it is, never rounded
  const [whole, fraction] = formatGrams(total).split('.');
  // * its width in ems of the whole part, by the app's Roboto (a digit .57, a separator .25; the fraction is set at .75
  // * of the size, the gap and GRAM take 1.9): the stylesheet fits the amount to the sheet's width by it
  const ems = (text: string) => text.replace(/\d/g, '').length * .25 + text.replace(/\D/g, '').length * .57;
  const amountEms = ems(whole) + (fraction ? ems('.' + fraction) * .75 : 0) + 1.9;
  const recipients = [...new Set(props.request.messages.map((message) => toRawTonAddress(message.address)))];
  const first = friendlyShort(props.request.messages[0].address);
  // * an address in a sentence reads left to right
  const firstText = () => <span dir="ltr">{first}</span> as HTMLElement;
  const items = () => getTonConnectPreviewItems(props.request, props.walletAddress, props.preview);
  const fee = () => props.preview?.emulation.walletFeesNanograms;

  const feeText = (): JSX.Element => {
    if(props.previewFailed) return i18n('Wallet.Request.FeeFailed');
    const nanos = fee();
    if(nanos === undefined) return i18n('Wallet.Request.FeeLoading');
    const grams = formatGramsCut(nanos, 5) + ' GRAM';
    return props.fiatPerGram ?
      i18n('Wallet.Request.FeeWithFiat', [grams, formatFiat(nanos, props.fiatPerGram, props.currency, 4)]) :
      i18n('Wallet.Request.Fee', [grams]);
  };

  return (
    <>
      <MediaHeader class={styles.amountHeader}>
        <div class={styles.amount} style={{'--amount-ems': amountEms.toFixed(2)}} aria-label={formatGrams(total) + ' GRAM'}>
          <span>{whole}<Show when={fraction}><span class={styles.amountFraction}>.{fraction}</span></Show></span>
          <span class={styles.amountSuffix}>GRAM</span>
        </div>
        <Show when={props.fiatPerGram}>
          <MediaHeader.Subtitle color="secondary">{formatFiat(total, props.fiatPerGram, props.currency)}</MediaHeader.Subtitle>
        </Show>
        <div class={styles.recipient}>
          {recipients.length > 1 ?
            i18n('Wallet.Request.ToMultiple', [firstText(), recipients.length - 1]) :
            i18n('Wallet.Request.To', [firstText()])}
        </div>
      </MediaHeader>
      <Section name="Wallet.Request.Preview" class={styles.section}>
        <For each={items()}>
          {(item) => (
            <Row>
              <Row.Title>{i18n(KIND_TITLES[item.kind])}</Row.Title>
              <Row.Subtitle>
                <span dir="ltr">{friendlyShort(item.address)}</span>
                {item.comment && <>{' · '}<span dir="auto">{item.comment}</span></>}
                {!item.succeeded && <span class={styles.actionFailed}>{' · '}{i18n('Wallet.Request.Failed')}</span>}
              </Row.Subtitle>
              <Show when={item.amount}>
                <Row.RightContent>
                  <span class={classNames(styles.actionAmount, item.direction === 'incoming' && styles.actionIncoming)} dir="ltr">
                    {(item.direction === 'incoming' ? '+' : item.direction === 'outgoing' ? '–' : '') + formatGramsCut(item.amount, 3)}
                  </span>
                </Row.RightContent>
              </Show>
            </Row>
          )}
        </For>
      </Section>
      <div class={styles.fee}>
        {feeText()}
        <Show when={props.preview && !props.preview.emulation.traceSucceeded}>
          <div class={styles.warning} role="alert">{i18n('Wallet.Request.TraceFailed')}</div>
        </Show>
        <Show when={props.preview?.emulation.traceSucceeded && props.preview.emulation.isIncomplete}>
          <div class={styles.warning} role="alert">{i18n('Wallet.Request.TraceIncomplete')}</div>
        </Show>
      </div>
    </>
  );
}

function SignDataContent(props: {request: SignDataRequest, onReadToEnd: () => void}) {
  let data: HTMLDivElement;
  // * Sign once the whole text was on screen (iOS): a block that fits is read at once
  const checkEnd = () => {
    if(data.scrollTop + data.clientHeight >= data.scrollHeight - 2) {
      props.onReadToEnd();
    }
  };
  onMount(() => {
    if(props.request.payload.type === 'text') checkEnd();
  });

  return (
    <Show
      when={props.request.payload.type === 'text' && props.request.json.text !== undefined}
      fallback={
        <div class={styles.blind} role="alert">
          <div class={styles.blindTitle}><IconTsx icon="info" />{i18n('Wallet.Sign.BinaryContent')}</div>
          {i18n('Wallet.Sign.BinaryWarning')}
        </div>
      }
    >
      <div class={styles.dataTitle}>{i18n('Wallet.Sign.Data')}</div>
      <div
        ref={data}
        class={styles.data}
        role="region"
        aria-label={I18n.format('Wallet.Sign.Data', true)}
        tabindex={Modes.a11y ? 0 : undefined}
        onScroll={checkEnd}
        dir="auto"
      >{props.request.json.text}</div>
      <TonConnectText>{i18n('Wallet.Sign.TextExplanation')}</TonConnectText>
    </Show>
  );
}
