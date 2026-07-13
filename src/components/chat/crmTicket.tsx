import {Accessor, createSignal, Show} from 'solid-js';
import type {MyMessage} from '@appManagers/appMessagesManager';
import getServerMessageId from '@appManagers/utils/messageId/getServerMessageId';
import {AppManagers} from '@lib/managers';
import debounce from '@helpers/schedulers/debounce';
import {i18n} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import Chat from '@components/chat/chat';
import type ChatTopbar from '@components/chat/topbar';
import TopbarPlate, {createTopbarPlate, TopbarPlateController} from '@components/chat/topbarPlate';
import {CrmTicketEvent, CrmTicketRef} from '@lib/crm/types';
import crmRealtime from '@lib/crm/crmRealtime';
import {showCrmLoginIfNeeded} from '@components/popups/crmLogin';
import {toastNew} from '@components/toast';

const className = 'crm-ticket';

export type ChatCrmTicketPlate = TopbarPlateController & {
  setPeerId: (peerId: PeerId) => void,
  hide: () => void,
  /** The currently loaded ticket for this peer (cached signal), or undefined. */
  getTicket: () => CrmTicketRef | undefined,
  /** Close the current open ticket. No-op unless there is an open ticket. */
  close: () => Promise<void>
};

function CrmTicketPlateBody(props: {
  ticket: Accessor<CrmTicketRef | undefined>,
  busy: Accessor<boolean>,
  reconnectNeeded: Accessor<boolean>,
  onClose: () => void,
  onReconnect: () => void
}) {
  return (
    <Show
      when={!props.reconnectNeeded()}
      fallback={
        <div class={'pinned-' + className + '-content'}>
          <div class={'pinned-' + className + '-info'}>
            <div class={'pinned-' + className + '-title'}>
              {i18n('Crm.SessionExpired')}
            </div>
          </div>
          <TopbarPlate.PrimaryButton onClick={props.onReconnect}>
            {i18n('Crm.Login')}
          </TopbarPlate.PrimaryButton>
        </div>
      }
    >
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
  const [reconnectNeeded, setReconnectNeeded] = createSignal(false);

  // Token to discard responses for a peer the user already navigated away from.
  let currentPeerId: PeerId;

  const openCrmLogin = () => showCrmLoginIfNeeded();

  const plate = createTopbarPlate({
    modifier: className,
    height: 52,
    onVisibilityChange: () => topbar.setFloating(),
    render: () => (
      <CrmTicketPlateBody
        ticket={ticket}
        busy={busy}
        reconnectNeeded={reconnectNeeded}
        onClose={() => closeTicket()}
        onReconnect={openCrmLogin}
      />
    )
  });

  const hide = () => {
    plate.setHidden(true);
    setTicket(undefined);
    setReconnectNeeded(false);
  };

  // Reflect a ticket: the bar shows ONLY for an open ticket (a closed ticket is
  // terminal in this CRM — the next message opens a NEW ticket). Always emit the
  // event so the timeline dividers stay in sync, even when the bar is hidden.
  // Never override plate visibility when the reconnect bar is showing.
  const apply = (peerId: PeerId, found?: CrmTicketRef) => {
    if(peerId !== currentPeerId) return;
    setTicket(found);
    if(!reconnectNeeded()) plate.setHidden(!found || found.status !== 'open');
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

  // Per-message author map for the chat: every agent session labels outbound
  // bubbles with who replied, even though all agents share one Telegram account.
  // Fire-and-forget like the ticket load — NEVER awaited on the chat-open path.
  // bubbles.ts consumes the event and tags the bubbles. (Phase A: REST backfill +
  // debounced refetch for liveness; phase B layers a Reverb push on top.)
  const loadAttributions = (peerId: PeerId) => {
    if(!peerId?.isUser()) {
      crmRealtime.leave();
      rootScope.dispatchEvent('crm_attributions_update', {peerId, attributions: {}});
      return;
    }

    // Check connection first. If the token is absent or expired the manager methods
    // return empty results silently — we need to surface the reconnect bar instead.
    managers.appCrmManager.isConnected().then((connected) => {
      if(peerId !== currentPeerId) return;
      if(!connected) {
        setReconnectNeeded(true);
        plate.setHidden(false);
        return;
      }
      // Realtime push for live messages (near-instant labels); REST backfill for
      // history. Both feed bubbles.ts. Subscribe is idempotent across peer changes.
      crmRealtime.subscribePeer(peerId, '' + peerId.toUserId());
      managers.appCrmManager.getAttributionsByTelegram('' + peerId.toUserId()).then((attributions) => {
        if(peerId !== currentPeerId) return;
        rootScope.dispatchEvent('crm_attributions_update', {peerId, attributions});
      });
    });
  };

  // The open ticket we've already claimed for this agent, so a burst of replies
  // doesn't hammer the claim endpoint. Reset on peer change.
  let claimedTicketId: number;

  const setPeerId = (peerId: PeerId) => {
    currentPeerId = peerId;
    claimedTicketId = undefined;
    hide();
    load(peerId);
    loadAttributions(peerId);
  };

  // The agent replied. Claim the customer's open ticket so it's bound to THIS
  // agent in the CRM. Agents share one department Telegram account, so the userbot
  // can't tell them apart — but the claim call is authenticated with the agent's
  // own CRM token, which is what outbound attribution + per-agent reports key off.
  // Claim by chat id (not the locally-known ticket id): the CRM resolves the latest
  // OPEN ticket server-side, which also covers the case where the customer's last
  // message opened a fresh ticket the bar hasn't picked up yet. Fire-and-forget.
  const maybeClaim = (peerId: PeerId) => {
    if(!peerId?.isUser()) return;
    const current = ticket();
    if(current && current.status === 'open' && current.id === claimedTicketId) return;
    if(current?.id) claimedTicketId = current.id;
    managers.appCrmManager.claimTicketByTelegram('' + peerId.toUserId());
  };

  // Per-message attribution: stamp the exact Telegram message id with this agent so
  // the CRM credits the right human for every reply (claim only gives per-ticket
  // ownership; this gives per-message precision across handoffs). The mid is already
  // remapped to the real server id by the time 'message_sent' fires.
  const attributeOutbound = (message: MyMessage) => {
    const peerId = message.peerId;
    if(!peerId?.isUser()) return;
    const messageId = getServerMessageId(message.mid);
    if(!messageId) return;
    managers.appCrmManager.attributeOutboundMessage('' + peerId.toUserId(), messageId);
  };

  // A new message may have opened a fresh ticket on the CRM side (a customer
  // message after close creates a NEW ticket) — re-fetch so the bar auto-updates
  // without a peer switch. Debounced + delayed so the CRM userbot ingest lands first.
  const refresh = debounce(() => {
    load(currentPeerId);
    loadAttributions(currentPeerId);
  }, 800, false, true);
  const onChatMessage = (payload: MyMessage | {message: MyMessage}) => {
    const message = (payload as {message: MyMessage})?.message ?? (payload as MyMessage);
    if(message?.peerId && message.peerId === currentPeerId) refresh();
  };

  // ONLY this client's own sends — never history_multiappend, which also carries
  // replies typed by other agents on the shared account (crediting them to this
  // session would be wrong). claim + attribute are this-session-only signals.
  const onMessageSent = ({message}: {message: MyMessage}) => {
    if(message?._ !== 'message' || !message.pFlags?.out || message.peerId !== currentPeerId) return;
    maybeClaim(message.peerId);
    attributeOutbound(message);
  };
  // When a CRM request returns 401 mid-session (token expired), surface the
  // reconnect bar immediately without waiting for the next peer switch.
  const onAuthRequired = () => {
    if(!currentPeerId?.isUser()) return;
    setReconnectNeeded(true);
    plate.setHidden(false);
  };

  // When the agent logs in (or out) in the CRM settings, re-evaluate the current
  // peer so attributions and the ticket load (or the reconnect bar appears again).
  const onConfigUpdate = () => {
    if(!currentPeerId?.isUser()) return;
    setReconnectNeeded(false);
    hide();
    load(currentPeerId);
    loadAttributions(currentPeerId);
  };

  rootScope.addEventListener('history_multiappend', onChatMessage);
  rootScope.addEventListener('message_sent', onChatMessage);
  rootScope.addEventListener('message_sent', onMessageSent);
  rootScope.addEventListener('crm_auth_required', onAuthRequired);
  rootScope.addEventListener('crm_config_update', onConfigUpdate);

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
    } catch(err) {
      // Surface the failure: previously it was swallowed and the agent had no way
      // to tell the ticket was still open. 403 gets its own message so a missing
      // department/permission isn't mistaken for a transient network error.
      const status = (err as Error & {status?: number})?.status;
      toastNew({langPackKey: status === 403 ? 'Crm.Ticket.CloseForbidden' : 'Crm.Ticket.CloseFailed'});
      // Re-fetch so the bar reflects the server's actual state (e.g. a stale
      // ticket id after a newer ticket was opened for this chat).
      if(peerId === currentPeerId) load(peerId);
    } finally {
      setBusy(false);
    }
  };

  return {
    ...plate,
    setPeerId,
    hide,
    getTicket: () => ticket(),
    close: () => closeTicket(),
    destroy: () => {
      rootScope.removeEventListener('history_multiappend', onChatMessage);
      rootScope.removeEventListener('message_sent', onChatMessage);
      rootScope.removeEventListener('message_sent', onMessageSent);
      rootScope.removeEventListener('crm_auth_required', onAuthRequired);
      rootScope.removeEventListener('crm_config_update', onConfigUpdate);
      crmRealtime.leave();
      plate.destroy();
    }
  };
}
