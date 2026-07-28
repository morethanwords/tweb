import {VERIFICATION_CODES_BOT_ID} from '@appManagers/constants';
import {User} from '@layer';

export default function canReportBot(peerId: PeerId, user: User) {
  return user?._ === 'user' &&
    !!user.pFlags.bot &&
    !user.pFlags.support &&
    peerId !== VERIFICATION_CODES_BOT_ID;
}
