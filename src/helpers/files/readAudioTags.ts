import type {AttachedImage} from 'mediabunny';
import {createPosterFromMedia} from '@helpers/createPoster';
import {renderImageFromUrlPromise} from '@helpers/dom/renderImageFromUrl';
import {ObjectURLScope} from '@helpers/objectUrlScope';

// * a document's thumbnail as the server takes it: a JPEG within 320×320 (tdesktop's kThumbnailSize)
const COVER_MAX_SIZE = 320;

export type AudioTags = {
  title?: string,
  performer?: string,
  cover?: Awaited<ReturnType<typeof createPosterFromMedia>>
};

function readTag(value: string) {
  return value?.trim() || undefined;
}

async function prepareCover({data, mimeType}: AttachedImage) {
  const objectURLs = new ObjectURLScope();
  try {
    const image = new Image();
    await renderImageFromUrlPromise(image, objectURLs.create(new Blob([data as Uint8Array<ArrayBuffer>], {type: mimeType})));
    const {naturalWidth: width, naturalHeight: height} = image;
    // * what tdesktop takes for a thumbnail: no empty or needle-thin picture
    if(!width || !height || width > height * 20 || height > width * 20) {
      return;
    }

    return await createPosterFromMedia(image, 'image/jpeg', COVER_MAX_SIZE);
  } finally {
    objectURLs.dispose();
  }
}

/**
 * The track's name, artist and cover from its own tags (ID3, MP4, Vorbis comments, RIFF INFO) —
 * the official clients send them in the audio attribute and as the document's thumbnail, and the
 * server takes them from the client only. Nothing when the file has none or cannot be read.
 */
export default async function readAudioTags(file: Blob): Promise<AudioTags> {
  try {
    const {Input, BlobSource, MP3, MP4, QTFF, OGG, FLAC, WAVE, ADTS} = await import('mediabunny');
    const input = new Input({
      source: new BlobSource(file),
      formats: [MP3, MP4, QTFF, OGG, FLAC, WAVE, ADTS]
    });

    try {
      const tags = await input.getMetadataTags();
      const images = tags.images || [];
      const image = images.find(({kind}) => kind === 'coverFront') || images[0];
      return {
        title: readTag(tags.title),
        // * the album's artist stands in for a track's own, as tdesktop's reading does
        performer: readTag(tags.artist) || readTag(tags.albumArtist),
        cover: image && await prepareCover(image).catch((err): undefined => {
          console.warn('audio cover error', err);
        })
      };
    } finally {
      input.dispose();
    }
  } catch(err) {
    console.warn('audio tags error', err);
    return {};
  }
}
