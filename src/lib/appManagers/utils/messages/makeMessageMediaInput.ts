import {InputMedia, Message, MessageMedia} from '../../../../layer';
import getDocumentInput from '../docs/getDocumentInput';
import getPhotoInput from '../photos/getPhotoInput';

export function makeMessageMediaInput(media: MessageMedia): InputMedia | undefined {
  if(!media) return;

  if(media._ === 'messageMediaPhoto' && media.photo?._ === 'photo') {
    return {
      _: 'inputMediaPhoto',
      id: getPhotoInput(media.photo),
      pFlags: {
        spoiler: media.pFlags.spoiler
      },
      ttl_seconds: media.ttl_seconds
    }
  }

  if(media._ === 'messageMediaDocument' && media.document?._ === 'document') {
    return {
      _: 'inputMediaDocument',
      id: getDocumentInput(media.document),
      pFlags: {
        spoiler: media.pFlags.spoiler
      },
      video_cover: media.video_cover?._ === 'photo' ? getPhotoInput(media.video_cover) : undefined,
      ttl_seconds: media.ttl_seconds
    }
  }

  if(media._ === 'messageMediaContact') {
    return {
      _: 'inputMediaContact',
      user_id: media.user_id,
      phone_number: media.phone_number,
      first_name: media.first_name,
      last_name: media.last_name,
      vcard: media.vcard
    }
  }

  // Other types to be added...
}

export function makeMessageMediaInputForSuggestedPost(media: MessageMedia) {
  if(media && (
    media._ === 'messageMediaPhoto' && media.photo?._ === 'photo' ||
    media._ === 'messageMediaDocument' && media.document?._ === 'document'
    // media._ === 'messageMediaContact
  )) {
    return makeMessageMediaInput(media);
  }
}
