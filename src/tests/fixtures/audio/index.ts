/*
 * A tagged track in every container the client sends as music. The tags were written byte by byte to each format's
 * own specification — not by the library the client reads them with — over real streams: the LAME frames of
 * `ephemeralBot/media/audio.mp3`, the Opus voice note beside it, AAC from a browser's encoder, and silence in FLAC and
 * PCM. Only `tagged.m4a` (iTunes-style `ilst` with `covr`) was tagged by mediabunny itself.
 *
 * Every one is titled "Песня" by "Artist ö" with a 16×16 PNG front cover, but where the format cannot say so: ID3v1
 * and RIFF INFO hold ISO-8859-1 only ("Chanson"), and neither has a picture.
 */
export const TAGGED_AUDIO_PERFORMER = 'Artist ö';

export const TAGGED_AUDIO = [
  {file: 'id3v24.mp3', type: 'audio/mpeg', title: 'Песня', cover: true},
  {file: 'id3v1.mp3', type: 'audio/mpeg', title: 'Chanson', cover: false},
  // * ID3 frames as the standard allows them and mediabunny did not read them (`patches/mediabunny.patch`):
  // * "unsynchronised" (a zero after every 0xFF that could pass for an MPEG sync), as older taggers wrote a tag holding
  // * a JPEG — over the whole tag in ID3v2.3, frame by frame in ID3v2.4; ID3v2.4 frames led by a data length
  // * indicator, alone or unsynchronised too; and a cover described in UTF-16, its MIME type ISO-8859-1 all the same
  {file: 'unsync-v23.mp3', type: 'audio/mpeg', title: 'Песня', cover: true},
  {file: 'unsync-v24.mp3', type: 'audio/mpeg', title: 'Песня', cover: true},
  {file: 'dli-v24.mp3', type: 'audio/mpeg', title: 'Песня', cover: true},
  {file: 'unsync-dli-v24.mp3', type: 'audio/mpeg', title: 'Песня', cover: true},
  {file: 'apic-utf16-v23.mp3', type: 'audio/mpeg', title: 'Песня', cover: true},
  {file: 'apic-utf16be-v24.mp3', type: 'audio/mpeg', title: 'Песня', cover: true},
  {file: 'id3v24.aac', type: 'audio/aac', title: 'Песня', cover: true},
  {file: 'tagged.m4a', type: 'audio/mp4', title: 'Песня', cover: true},
  {file: 'tagged.flac', type: 'audio/flac', title: 'Песня', cover: true},
  {file: 'tagged.ogg', type: 'audio/ogg', title: 'Песня', cover: true},
  {file: 'info.wav', type: 'audio/wav', title: 'Chanson', cover: false},
  {file: 'id3chunk.wav', type: 'audio/wav', title: 'Песня', cover: true}
] as const;
