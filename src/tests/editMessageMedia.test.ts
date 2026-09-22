import {canEditMessageMediaWithEditor} from '@components/chat/editMessageMedia';
import {MAX_EDITABLE_VIDEO_SIZE} from '@components/mediaEditor/support';
import {Document, Message, Photo} from '@layer';
import {describe, expect, it} from 'vitest';


function photoMessage(sizes: Photo.photo['sizes'] = [{_: 'photoSize', type: 'y', w: 1280, h: 720, size: 100}]) {
  return {
    _: 'message',
    media: {
      _: 'messageMediaPhoto',
      photo: {_: 'photo', sizes} as Photo.photo
    }
  } as Message.message;
}

function documentMessage(document: Partial<Document.document>) {
  return {
    _: 'message',
    media: {
      _: 'messageMediaDocument',
      document: {_: 'document', size: 1024, ...document} as Document.document
    }
  } as Message.message;
}

describe('canEditMessageMediaWithEditor', () => {
  it('accepts photos and playable videos', () => {
    expect(canEditMessageMediaWithEditor(photoMessage())).toBe(true);
    expect(canEditMessageMediaWithEditor(documentMessage({type: 'video'}))).toBe(true);
    expect(canEditMessageMediaWithEditor(documentMessage({type: 'gif'}))).toBe(true);
  });

  it('rejects media the editor cannot open', () => {
    expect(canEditMessageMediaWithEditor(undefined)).toBe(false);
    expect(canEditMessageMediaWithEditor({_: 'message'} as Message.message)).toBe(false);
    expect(canEditMessageMediaWithEditor(documentMessage({type: 'round'}))).toBe(false);
    expect(canEditMessageMediaWithEditor(documentMessage({type: 'voice'}))).toBe(false);
    expect(canEditMessageMediaWithEditor(documentMessage({type: 'sticker'}))).toBe(false);
    // a plain file may be REPLACED from the attach menu, but there is nothing to draw on
    expect(canEditMessageMediaWithEditor(documentMessage({type: 'pdf'}))).toBe(false);
  });

  it('rejects a photo without a usable size and an oversized video', () => {
    expect(canEditMessageMediaWithEditor(photoMessage([{_: 'photoSizeEmpty', type: 'y'}]))).toBe(false);
    expect(canEditMessageMediaWithEditor(documentMessage({
      type: 'video',
      size: MAX_EDITABLE_VIDEO_SIZE + 1
    }))).toBe(false);
  });
});
