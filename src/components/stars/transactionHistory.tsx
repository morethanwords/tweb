import {Show} from 'solid-js';
import Row from '@components/rowTsx';
import Section from '@components/section';
import {i18n} from '@lib/langPack';

export async function showPeerTransactionHistory(peerId: PeerId, ton = false) {
  const [{default: PopupElement}, {default: PopupStars}] = await Promise.all([
    import('@components/popups'),
    import('@components/popups/stars')
  ]);
  return PopupElement.createPopup(PopupStars, {historyPeerId: peerId, ton});
}

export default function TransactionHistorySection(props: {
  peerId: PeerId,
  stars?: boolean,
  ton?: boolean
}) {
  return (
    <Show when={props.stars || props.ton}>
      <Section name="StarsTransactionsAll">
        <Show when={props.stars}>
          <Row clickable={() => showPeerTransactionHistory(props.peerId)}>
            <Row.Icon icon="star_circle_filled" />
            <Row.Title>{i18n('TelegramStars')}</Row.Title>
          </Row>
        </Show>
        <Show when={props.ton}>
          <Row clickable={() => showPeerTransactionHistory(props.peerId, true)}>
            <Row.Icon icon="gram_filled" />
            <Row.Title>{i18n('GramBalance')}</Row.Title>
          </Row>
        </Show>
      </Section>
    </Show>
  );
}
