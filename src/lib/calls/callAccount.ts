import {getAccountSwitchingTo, getCurrentAccount} from '@lib/accounts/getCurrentAccount';
import {ActiveAccountNumber} from '@lib/accounts/types';
import bindManagersToAccount from '@lib/accounts/bindManagersToAccount';
import type {AppManagers, ReadingManagers} from '@lib/managers';
import rootScope from '@lib/rootScope';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';

/**
 * A call belongs to the account it was placed or answered on. The tab can switch to another account while
 * it runs: the call keeps that account's managers and identity, and that account's call events still reach
 * the tab - the way Android binds its call screen to the call's AccountInstance.
 */
export type CallAccount = {
  accountNumber: ActiveAccountNumber,
  managers: AppManagers,
  myId: PeerId
};

/** The account the tab shows now, for a call started or answered from it; `managers` are the caller's. */
export function captureCallAccount(managers: ReadingManagers): CallAccount {
  const accountNumber = getCurrentAccount();
  return {
    accountNumber,
    managers: bindManagersToAccount(managers, accountNumber),
    myId: rootScope.myId
  };
}

/** The account of a call that is there already, for one that takes over from it (a rejoin, a migration). */
export function getCallAccountOf({accountNumber, managers, myId}: CallAccount): CallAccount {
  return {accountNumber, managers, myId};
}

// * `ended`: a call over in this tab, whose account still has a last word to say about it
type HeldCall = {accountNumber: ActiveAccountNumber, id?: string, ended?: boolean};
const heldCalls: Set<HeldCall> = new Set();

export type CallHold = ReturnType<typeof holdCall>;

/**
 * A call - or one ringing - that lives in this tab. What is said about it comes from its own account only,
 * whichever the tab shows: another account may follow the same call (a member of its chat) and sees it
 * otherwise - ourselves not as ourselves. The call names its id as it learns it, and lets go once over.
 */
export function holdCall(accountNumber: ActiveAccountNumber) {
  const held: HeldCall = {accountNumber};
  heldCalls.add(held);
  return {
    setId: (id: string | number) => {
      held.id = id === undefined ? undefined : '' + id;
    },
    release: () => {
      heldCalls.delete(held);
    }
  };
}

/**
 * A 1-on-1 call ended here: the server's own word on it (phoneCallDiscarded, which may ask for a rating) can
 * come after, and comes from the call's account still, whichever the tab shows by then. Nothing lives in
 * the tab any more: a reload would end nothing.
 */
export function holdEndedCall(accountNumber: ActiveAccountNumber, id: string | number) {
  const held: HeldCall = {accountNumber, id: '' + id, ended: true};
  heldCalls.add(held);
  return () => {
    heldCalls.delete(held);
  };
}

function getCallOwner(callId: string | number) {
  const id = '' + callId;
  for(const held of heldCalls) {
    if(held.id === id) {
      return held.accountNumber;
    }
  }
}

// * the call an event about calls is about: every one of them names it
function getCallEventCallId(name: string, args: any[]): string | number {
  const [payload] = args;
  switch(name) {
    case 'call_update':
    case 'group_call_update':
      return payload?.id;
    case 'call_signaling':
    case 'group_call_chain_blocks':
      return payload?.callId;
    case 'group_call_participant':
      return payload?.groupCallId;
  }
}

/**
 * Whether the tab takes an event that came from `accountNumber`, when it is about a call living here: only
 * from the call's own account. Nothing to say about any other event.
 */
export function takesCallEvent(name: string, args: any[], accountNumber: ActiveAccountNumber): boolean | undefined {
  const callId = getCallEventCallId(name, args);
  const owner = callId !== undefined ? getCallOwner(callId) : undefined;
  return owner ? owner === accountNumber : undefined;
}

/** A reload would end what lives here. */
export function hasCallInTab() {
  for(const held of heldCalls) {
    if(!held.ended) {
      return true;
    }
  }

  return false;
}

/**
 * What a call's screen opens of its account - a chat, a profile, a list of the account's chats to pick from -
 * opens on that account: the tab switches back to it first, as Android does from its call screen.
 */
export async function showCallAccount(accountNumber: ActiveAccountNumber) {
  // * a switch under way would close what opens now: it goes behind it
  if(accountNumber === getCurrentAccount() && !getAccountSwitchingTo()) {
    return;
  }

  await hotReloadGuard.switchAccount(accountNumber);
}
