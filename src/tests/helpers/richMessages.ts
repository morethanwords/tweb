import type {Message, PageBlock, PageCaption, RichMessage} from '@layer';

// * messages of the shared media, rich and not: a rich message (page blocks, no media of its own) holds `photo` and
// * `video`, and stands for the first video in it, else the first photo

export const photo = {_: 'photo', id: 1, sizes: []} as any;
export const video = {_: 'document', id: 2, type: 'video', thumbs: []} as any;
const caption: PageCaption = {_: 'pageCaption', text: {_: 'textEmpty'}, credit: {_: 'textEmpty'}};

let nextId = 0;
function message(fields: Partial<Message.message>): Message.message {
  return {_: 'message', pFlags: {}, id: ++nextId, mid: nextId, date: 0, message: '', peer_id: {_: 'peerUser', user_id: 1}, ...fields} as Message.message;
}

function rich(blocks: PageBlock[]): Message.message {
  const richMessage: RichMessage = {_: 'richMessage', pFlags: {}, blocks, photos: [photo], documents: [video]};
  return message({rich_message: richMessage});
}

/** a rich photo, a rich video after a photo, a rich text and a plain photo, each made anew */
export function makeSharedMediaMessages() {
  return {
    richPhoto: rich([{_: 'pageBlockPhoto', pFlags: {}, photo_id: 1, caption}]),
    richVideoAfterPhoto: rich([
      {_: 'pageBlockPhoto', pFlags: {}, photo_id: 1, caption},
      {_: 'pageBlockVideo', pFlags: {}, video_id: 2, caption}
    ]),
    richText: rich([{_: 'pageBlockParagraph', text: {_: 'textPlain', text: 'a'}}]),
    plainPhoto: message({media: {_: 'messageMediaPhoto', pFlags: {}, photo}})
  };
}
