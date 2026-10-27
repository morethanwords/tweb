import type {Chat} from '@layer';
import getPeerId from '@appManagers/utils/peers/getPeerId';

/** the channel a basic group has been upgraded to, once the group itself is deactivated */
export default function getChatMigratedTo(chat: Chat) {
  const migratedTo = (chat as Chat.chat)?.migrated_to;
  if(migratedTo && (chat as Chat.chat).pFlags.deactivated) {
    return getPeerId(migratedTo);
  }
}
