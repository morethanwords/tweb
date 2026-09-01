import {GroupCall, InputGroupCall, Update, Updates} from '@layer';
import sameInputGroupCall from '@lib/calls/helpers/sameInputGroupCall';

type ActiveGroupCallUpdate = Update.updateGroupCall & {call: GroupCall.groupCall};

export function getUpdatesList(updates: Updates): Update[] {
  switch(updates._) {
    case 'updates':
    case 'updatesCombined':
      return updates.updates;
    case 'updateShort':
      return [updates.update];
    default:
      return [];
  }
}

export function groupCallToInput(call: GroupCall.groupCall): InputGroupCall.inputGroupCall {
  return {_: 'inputGroupCall', id: call.id, access_hash: call.access_hash};
}

export function findGroupCallChainUpdate(
  updates: Updates,
  subChainId: number,
  requestedCall: InputGroupCall,
  expectedCanonicalInput?: InputGroupCall.inputGroupCall
): Update.updateGroupCallChainBlocks | undefined {
  const expectedCall = requestedCall._ === 'inputGroupCall' ? requestedCall : expectedCanonicalInput;
  if(!expectedCall) return;

  return getUpdatesList(updates).find((update): update is Update.updateGroupCallChainBlocks => {
    return update._ === 'updateGroupCallChainBlocks' &&
      update.sub_chain_id === subChainId &&
      sameInputGroupCall(update.call, expectedCall);
  });
}

function getActiveGroupCallUpdates(updates: Updates): ActiveGroupCallUpdate[] {
  return getUpdatesList(updates).filter(
    (update): update is ActiveGroupCallUpdate => update._ === 'updateGroupCall' && update.call._ === 'groupCall'
  );
}

/** Return the only active call identity carried by an Updates container. */
export function getInputGroupCallFromUpdates(updates: Updates): InputGroupCall.inputGroupCall | undefined {
  const calls = getActiveGroupCallUpdates(updates);
  if(!calls.length) return;

  const uniqueIds = new Set(calls.map(({call}) => String(call.id)));
  if(uniqueIds.size !== 1) return;
  return groupCallToInput(calls[calls.length - 1].call);
}

/**
 * Resolve a non-canonical call reference only when the same container links an
 * active updateGroupCall to a chain update naming that canonical call. A lone
 * updateGroupCall is not proof that it belongs to a requested slug/message.
 */
export function findResolvedGroupCallUpdate(
  updates: Updates,
  requestedCall: InputGroupCall,
  expectedCall?: InputGroupCall.inputGroupCall
): ActiveGroupCallUpdate | undefined {
  const calls = getActiveGroupCallUpdates(updates);
  const expected = requestedCall._ === 'inputGroupCall' ? requestedCall : expectedCall;

  // Slug/message references carry authorization but no canonical identity.
  // Their preview resolution must provide the expected id+access_hash; without
  // it a mixed Updates container can contain one internally-consistent but
  // unrelated updateGroupCall + chain pair and trick us into promoting the
  // wrong conference.
  if(!expected) return;
  for(let index = calls.length - 1; index >= 0; --index) {
    if(sameInputGroupCall(groupCallToInput(calls[index].call), expected)) {
      return calls[index];
    }
  }
}
