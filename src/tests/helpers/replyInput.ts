import '@helpers/peerIdPolyfill';
import {AppMessagesManager} from '@appManagers/appMessagesManager';
import type {InputPeer} from '@layer';

// An AppMessagesManager that only builds what a reply asks the server for (getInputReplyTo), in channel 777: no message
// is known to it, none is ephemeral, and it manages no monoforum.
export const replyInputPeer: InputPeer.inputPeerChannel = {_: 'inputPeerChannel', channel_id: 777, access_hash: '1'};

export function makeReplyInputManager() {
  const manager = new AppMessagesManager();
  Object.assign(manager as any, {
    appPeersManager: {
      canManageDirectMessages: () => false,
      getInputPeerById: () => replyInputPeer
    },
    getMessageByPeer: (): undefined => undefined,
    isEphemeralMessage: () => false,
    isEphemeralMessageId: () => false
  });
  return manager;
}
