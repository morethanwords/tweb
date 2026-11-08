/*
 * An MP3 put together byte by byte: an ID3v2.3 tag of the frames given, then silent MPEG frames a
 * browser plays. What a tagged track is made of, for the tests and the sandbox's music story.
 */

const encodeAscii = (text: string) => [...text].map((char) => char.charCodeAt(0));

function id3Frame(id: string, body: number[]) {
  // * a v2.3 frame's size is a plain 32-bit number (v2.4's would be sync-safe)
  const size = body.length;
  return [
    ...encodeAscii(id),
    (size >>> 24) & 0xFF, (size >>> 16) & 0xFF, (size >>> 8) & 0xFF, size & 0xFF,
    0, 0,
    ...body
  ];
}

/** A text frame (`TIT2` the title, `TPE1` the artist, `TPE2` the album's artist) in ISO-8859-1 (0) or UTF-16 with a BOM (1) */
export function id3TextFrame(id: string, text: string, encoding: 0 | 1) {
  return id3Frame(id, [
    encoding,
    ...(encoding === 0 ?
      encodeAscii(text) :
      [0xFF, 0xFE, ...[...text].flatMap((char) => [char.charCodeAt(0) & 0xFF, char.charCodeAt(0) >> 8]), 0, 0])
  ]);
}

/** The front cover */
export function id3PictureFrame(mimeType: string, data: Uint8Array) {
  return id3Frame('APIC', [0, ...encodeAscii(mimeType), 0, 3, 0, ...data]);
}

/** The tag of `frames` (none: no tag at all) and silent MPEG-1 Layer III frames, 128 kbps at 44.1 kHz */
export function makeMp3(frames: number[][], seconds = 5) {
  const body = frames.flat();
  const size = body.length;
  const tag = frames.length ? [
    ...encodeAscii('ID3'), 3, 0, 0,
    // * the tag's size is sync-safe: seven bits a byte
    (size >> 21) & 0x7F, (size >> 14) & 0x7F, (size >> 7) & 0x7F, size & 0x7F,
    ...body
  ] : [];

  const FRAME_LENGTH = 417, FRAMES_PER_SECOND = 44100 / 1152;
  const count = Math.ceil(seconds * FRAMES_PER_SECOND);
  const bytes = new Uint8Array(tag.length + FRAME_LENGTH * count);
  bytes.set(tag);
  for(let i = 0; i < count; ++i) {
    bytes.set([0xFF, 0xFB, 0x90, 0x64], tag.length + i * FRAME_LENGTH);
  }

  return bytes;
}
