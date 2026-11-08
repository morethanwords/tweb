/**
 * A track sent from a file keeps the name and the artist its tags give it, and its album cover
 * as the document's thumbnail: the server takes all of that from the client, so a client that
 * does not read the tags sends every song as "Unknown Artist".
 */

import type {AppMessagesManager} from '@appManagers/appMessagesManager';
import readAudioTags from '@helpers/files/readAudioTags';
import {makeMediaSize} from '@helpers/mediaSize';
import type {DocumentAttribute, InputFile, InputMedia} from '@layer';
import {makeDocumentMakingManager} from '@/tests/helpers/messageSending';
import noop from '@helpers/noop';
import {readFileSync} from 'node:fs';
import {id3TextFrame as textFrame, makeMp3} from '@/tests/fixtures/taggedMp3';
import {TAGGED_AUDIO, TAGGED_AUDIO_PERFORMER} from '@/tests/fixtures/audio';
import '@helpers/peerIdPolyfill';

function mp3(frames: number[][]) {
  return new File([makeMp3(frames, .5)], 'track.mp3', {type: 'audio/mpeg'});
}

describe('readAudioTags', () => {
  test('reads the title and the artist, in either text encoding', async() => {
    await expect(readAudioTags(mp3([
      textFrame('TIT2', 'Песня', 1),
      textFrame('TPE1', 'Artist', 0)
    ]))).resolves.toEqual({title: 'Песня', performer: 'Artist', cover: undefined});
  });

  test('takes the album\'s artist when the track names none', async() => {
    await expect(readAudioTags(mp3([
      textFrame('TIT2', 'Song', 0),
      textFrame('TPE2', 'Album Artist', 0)
    ]))).resolves.toMatchObject({title: 'Song', performer: 'Album Artist'});
  });

  test('leaves out what is only blank', async() => {
    const tags = await readAudioTags(mp3([
      textFrame('TIT2', '  Song  ', 0),
      textFrame('TPE1', '   ', 0)
    ]));
    expect(tags.title).toBe('Song');
    expect(tags.performer).toBeUndefined();
  });

  test('has nothing to say about a file without tags, or one it cannot read', async() => {
    await expect(readAudioTags(mp3([]))).resolves.toMatchObject({title: undefined, performer: undefined});
    await expect(readAudioTags(new File([new Uint8Array(64)], 'noise.mp3', {type: 'audio/mpeg'}))).resolves.toEqual({});
  });

  // * the covers are decoded by the browser, so they are checked in one (`e2e/popupSandboxNewMediaMusic.spec.ts`)
  test.each(TAGGED_AUDIO)('reads $file', async({file, type, title}) => {
    vi.spyOn(console, 'warn').mockImplementation(noop);
    const bytes = readFileSync(`src/tests/fixtures/audio/${file}`);
    await expect(readAudioTags(new File([bytes], file, {type}))).resolves.toMatchObject({title, performer: TAGGED_AUDIO_PERFORMER});
  });

  // * the cover the shipped mediabunny takes out (patches/mediabunny.patch) is the picture whole: its type, and the
  // * bytes a JPEG or a PNG starts and ends with
  test.each(TAGGED_AUDIO.filter(({cover}) => cover))('takes the whole cover out of $file', async({file, type}) => {
    const {Input, BlobSource, ALL_FORMATS} = await import('mediabunny');
    const bytes = readFileSync(`src/tests/fixtures/audio/${file}`);
    const input = new Input({source: new BlobSource(new File([bytes], file, {type})), formats: ALL_FORMATS});
    const [image] = (await input.getMetadataTags()).images;
    input.dispose();
    const [start, end] = image.mimeType === 'image/png' ? [[0x89, 0x50], [0x60, 0x82]] : [[0xFF, 0xD8], [0xFF, 0xD9]];
    expect(image.mimeType).toMatch(/^image\/(jpeg|png)$/);
    expect([...image.data.subarray(0, 2), ...image.data.subarray(-2)]).toEqual([...start, ...end]);
  });
});

describe('a track from a file', () => {
  const cover = {blob: new Blob([new Uint8Array(8)], {type: 'image/jpeg'}), size: makeMediaSize(320, 320)};

  function makeManager() {
    const setCacheContextBlob = vi.fn();
    const manager = makeDocumentMakingManager({thumbsStorage: {setCacheContextBlob}});
    return {manager, setCacheContextBlob};
  }

  function makeDocument(manager: AppMessagesManager, isVoiceMessage?: boolean) {
    return manager.makeDocumentAndMetaForSendingFile({
      file: new File(['audio'], 'track.mp3', {type: 'audio/mpeg'}),
      isDocument: false,
      isMedia: true,
      mediaTempId: 1,
      entities: [],
      duration: 3,
      isVoiceMessage,
      audioTitle: 'Song',
      audioPerformer: 'Artist',
      thumb: cover
    });
  }

  test('names the track in its audio attribute and keeps the cover as its thumbnail', () => {
    const {manager, setCacheContextBlob} = makeManager();
    const {attributes, document} = makeDocument(manager);
    expect(attributes.find((attribute) => attribute._ === 'documentAttributeAudio')).toMatchObject({
      duration: 3,
      title: 'Song',
      performer: 'Artist'
    });
    expect(document.thumbs).toEqual([expect.objectContaining({type: 'local-thumb', w: 320, h: 320})]);
    expect(setCacheContextBlob).toHaveBeenCalledWith(document, 'local-thumb', cover.blob, cover.blob.size, undefined, true);
  });

  test('a voice message stays nameless', () => {
    const {manager} = makeManager();
    const attribute = makeDocument(manager, true).attributes.find((attribute) => attribute._ === 'documentAttributeAudio') as DocumentAttribute.documentAttributeAudio;
    expect(attribute.title).toBeUndefined();
    expect(attribute.performer).toBeUndefined();
  });

  test('uploads the cover as the document\'s thumbnail', async() => {
    const {manager} = makeManager();
    const inputFile = (name: string): InputFile => ({_: 'inputFile', id: name, parts: 1, name, md5_checksum: ''});
    const upload = vi.fn(({file}: {file: Blob}) => Promise.resolve(inputFile(file === cover.blob ? 'cover' : 'track')));
    Object.assign(manager as any, {
      apiFileManager: {upload},
      appPeersManager: {getInputPeerById: (): undefined => undefined}
    });
    const inputMedia = await manager.uploadMediaFile({
      peerId: (42 as UserId).toPeerId(false),
      file: new File(['audio'], 'track.mp3', {type: 'audio/mpeg'}),
      uploadingFileName: 'track',
      fileType: 'audio/mpeg',
      apiFileName: 'audio.mp3',
      attachType: 'audio',
      attributes: [],
      actionName: 'sendMessageUploadAudioAction',
      thumb: cover
    }) as InputMedia.inputMediaUploadedDocument;
    expect(upload).toHaveBeenCalledTimes(2);
    expect(inputMedia.thumb).toMatchObject({id: 'cover'});
    expect(inputMedia.video_cover).toBeUndefined();
  });
});
