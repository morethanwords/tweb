import type {Message} from '@layer';
import filterMessagesByInputFilter from '@appManagers/utils/messages/filterMessagesByInputFilter';
import {getMediaFromMessageOrRich} from '@appManagers/utils/messages/getMediaFromMessage';
import {getMessageWithRichMedia} from '@appManagers/utils/richMessage/getRichMessageMedia';
import {makeSharedMediaMessages, photo, video} from '@/tests/helpers/richMessages';

// * the server finds a rich message in the shared media by the media inside it; the shared media and
// * its viewer show it by the photo or video it stands for, as Android does (`MessageObject.getPhoto`,
// * `getDocument`): the first video, or the first photo when there is none

const {richPhoto, richVideoAfterPhoto, richText, plainPhoto} = makeSharedMediaMessages();

function filter(inputFilter: Parameters<typeof filterMessagesByInputFilter>[0]['inputFilter'], messages: Message.message[]) {
  return filterMessagesByInputFilter({inputFilter, messages, limit: messages.length});
}

describe('a rich message in the shared media', () => {
  it('is found among photos and videos by the media it stands for', () => {
    const messages = [richPhoto, richVideoAfterPhoto, richText, plainPhoto];
    expect(filter('inputMessagesFilterPhotoVideo', messages)).toEqual([richPhoto, richVideoAfterPhoto, plainPhoto]);
    expect(filter('inputMessagesFilterPhotos', messages)).toEqual([richPhoto, plainPhoto]);
    expect(filter('inputMessagesFilterVideo', messages)).toEqual([richVideoAfterPhoto]);
  });

  it('is not a file, a song or a GIF for its video', () => {
    for(const inputFilter of ['inputMessagesFilterDocument', 'inputMessagesFilterMusic', 'inputMessagesFilterGif'] as const) {
      expect(filter(inputFilter, [richPhoto, richVideoAfterPhoto])).toEqual([]);
    }
  });

  it('shows the first video before any photo, and nothing without media', () => {
    expect(getMediaFromMessageOrRich(richVideoAfterPhoto)).toBe(video);
    expect(getMediaFromMessageOrRich(richPhoto)).toBe(photo);
    expect(getMediaFromMessageOrRich(richText)).toBeUndefined();
    expect(getMediaFromMessageOrRich(plainPhoto)).toBe(photo);
  });

  it('is handed to what reads a message\'s own media as a message holding that photo or video', () => {
    expect((getMessageWithRichMedia(richVideoAfterPhoto).media as any).document).toBe(video);
    expect((getMessageWithRichMedia(richPhoto).media as any).photo).toBe(photo);
    expect(getMessageWithRichMedia(richPhoto).mid).toBe(richPhoto.mid);
    expect(richPhoto.media, 'the message itself is left as it is').toBeUndefined();
    expect(getMessageWithRichMedia(richText)).toBe(richText);
    expect(getMessageWithRichMedia(plainPhoto)).toBe(plainPhoto);
  });
});
