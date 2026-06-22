import {Accessor, createSignal, Show} from 'solid-js';
import type {MyMessage} from '@appManagers/appMessagesManager';
import {AppManagers} from '@lib/managers';
import debounce from '@helpers/schedulers/debounce';
import {i18n} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import Chat from '@components/chat/chat';
import type ChatTopbar from '@components/chat/topbar';
import TopbarPlate, {createTopbarPlate, TopbarPlateController} from '@components/chat/topbarPlate';
import {CrmTicketEvent, CrmTicketRef} from '@lib/crm/types';

const className = 'crm-ticket';

export type ChatCrmTicketPlate = TopbarPlateController & {
  setPeerId: (peerId: PeerId) => void,
  hide: () => void
};

function CrmTicketPlateBody(props: {
  ticket: Accessor<CrmTicketRef | undefined>,
  busy: Accessor<boolean>,
  onClose: () => void
}) {
  return (
    <Show when={props.ticket()}>
      {(ticket) => (
        <div class={'pinned-' + className + '-content'}>
          <div class={'pinned-' + className + '-info'}>
            <div class={'pinned-' + className + '-title'}>
              {i18n('Crm.Ticket.Title', [ticket().id])}
            </div>
            <div class={'pinned-' + className + '-subtitle'}>
              {i18n('Crm.Ticket.StatusOpen')}
            </div>
          </div>
          <TopbarPlate.PrimaryButton onClick={() => !props.busy() && props.onClose()}>
            {i18n('Crm.Ticket.Close')}
          </TopbarPlate.PrimaryButton>
        </div>
      )}
    </Show>
  );
}

export default function createChatCrmTicketPlate(
  topbar: ChatTopbar,
  chat: Chat,
  managers: AppManagers
): ChatCrmTicketPlate {
  const [ticket, setTicket] = createSignal<CrmTicketRef | undefined>();
  const [busy, setBusy] = createSignal(false);

  // Token to discard responses for a peer the user already navigated away from.
  let currentPeerId: PeerId;

  const plate = createTopbarPlate({
    modifier: className,
    height: 52,
    onVisibilityChange: () => topbar.setFloating(),
    render: () => <CrmTicketPlateBody ticket={ticket} busy={busy} onClose={() => closeTicket()} />
  });

  const hide = () => {
    plate.setHidden(true);
    setTicket(undefined);
  };

  // Reflect a ticket: the bar shows ONLY for an open ticket (a closed ticket is
  // terminal in this CRM — the next message opens a NEW ticket). Always emit the
  // event so the timeline dividers stay in sync, even when the bar is hidden.
  const apply = (peerId: PeerId, found?: CrmTicketRef) => {
    if(peerId !== currentPeerId) return;
    setTicket(found);
    plate.setHidden(!found || found.status !== 'open');
    rootScope.dispatchEvent('crm_ticket_update', {peerId, ticket: found});
  };

  // Lazy, fire-and-forget: NEVER awaited on the chat-open path.
  const load = (peerId: PeerId) => {
    if(!peerId?.isUser()) {
      apply(peerId, undefined);
      return;
    }

    managers.appCrmManager.getTicketByTelegram('' + peerId.toUserId()).then((found) => apply(peerId, found));
  };

  const setPeerId = (peerId: PeerId) => {
    currentPeerId = peerId;
    hide();
    load(peerId);
  };

  // A new message may have opened a fresh ticket on the CRM side (a customer
  // message after close creates a NEW ticket) — re-fetch so the bar auto-updates
  // without a peer switch. Debounced + delayed so the CRM userbot ingest lands first.
  const refresh = debounce(() => load(currentPeerId), 800, false, true);
  const onChatMessage = (payload: MyMessage | {message: MyMessage}) => {
    const message = (payload as {message: MyMessage})?.message ?? (payload as MyMessage);
    if(message?.peerId && message.peerId === currentPeerId) refresh();
  };
  rootScope.addEventListener('history_multiappend', onChatMessage);
  rootScope.addEventListener('message_sent', onChatMessage);

  // The only lifecycle action from tweb is closing. Reopening is intentionally
  // not offered — a closed ticket stays closed; new messages create new tickets.
  const closeTicket = async() => {
    const current = ticket();
    if(!current || current.status !== 'open' || busy()) return;

    const peerId = currentPeerId;
    setBusy(true);
    try {
      await managers.appCrmManager.updateTicketStatus(current.id, 'closed');
      if(peerId !== currentPeerId) return;
      // Optimistically reflect close + append the lifecycle event so the timeline
      // gets a "closed" divider; the bar then hides (ticket no longer open).
      const event: CrmTicketEvent = {type: 'closed', at: new Date().toISOString()};
      apply(peerId, {...current, status: 'closed', events: [...(current.events || []), event]});
    } finally {
      setBusy(false);
    }
  };

  return {
    ...plate,
    setPeerId,
    hide,
    destroy: () => {
      rootScope.removeEventListener('history_multiappend', onChatMessage);
      rootScope.removeEventListener('message_sent', onChatMessage);
      plate.destroy();
    }
  };
}
