import '@helpers/peerIdPolyfill';
import {ApiUpdatesManager} from '@appManagers/apiUpdatesManager';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import {logger, LogTypes} from '@lib/logger';
import {Message, Update, Updates} from '@layer';

/**
 * An updates manager at pts, seq and date 1 that knows every peer an update names: `saved` keeps the updates it
 * applies, in order
 */
export default function createUpdatesManager() {
  const manager = new ApiUpdatesManager() as any;
  const saved: Update[] = [];
  Object.assign(manager, {
    log: logger('UPDATES', LogTypes.None),
    appUsersManager: {saveApiUsers: vi.fn(), hasUser: () => true},
    appChatsManager: {saveApiChats: vi.fn(), hasChat: () => true, getChat: (): undefined => undefined},
    appPeersManager: {getPeerId},
    saveUpdate: (update: Update) => saved.push(update)
  });
  Object.assign(manager.updatesState, {pts: 1, seq: 1, date: 1});

  return {manager, saved};
}

/** An update as the server would send it alone, applied to the manager */
export function push(manager: any, update: Update) {
  manager.processUpdateMessage({_: 'updateShort', date: 2, update} as Updates.updateShort);
}

/** A text message of a channel, as its `updateNewChannelMessage`; `extra` overrides the message's fields */
export function newChannelMessageUpdate(channelId: ChatId, id: number, pts: number, extra?: Partial<Message.message>): Update.updateNewChannelMessage {
  return {
    _: 'updateNewChannelMessage',
    message: {
      _: 'message',
      id,
      peer_id: {_: 'peerChannel', channel_id: channelId},
      from_id: {_: 'peerUser', user_id: 7},
      pFlags: {},
      date: 2,
      message: 'hi',
      ...extra
    },
    pts,
    pts_count: 1
  };
}
