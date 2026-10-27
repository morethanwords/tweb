import type {MessageEntity} from '@layer';
import {SERVICE_PEER_ID, VERIFICATION_CODES_BOT_ID} from '@appManagers/constants';

/**
 * A login code in a text from the service notifications or the verification codes bot,
 * as the spoiler that hides it wherever the message is previewed
 */
export default function getLoginCodeEntity(
  peerId: PeerId,
  text: string
): MessageEntity.messageEntitySpoiler {
  const codeRegex = peerId === SERVICE_PEER_ID ?
    /[\d\-]{5,7}/ :
    peerId === VERIFICATION_CODES_BOT_ID ?
      /[\d\-]{3,8}/ :
      undefined;
  const match = codeRegex && text.match(codeRegex);
  if(!match) {
    return;
  }

  return {
    _: 'messageEntitySpoiler',
    offset: match.index,
    length: match[0].length
  };
}
