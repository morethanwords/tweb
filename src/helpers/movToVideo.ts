import {MAX_EDITABLE_VIDEO_SIZE} from '@components/mediaEditor/support';
import apiManagerProxy from '@lib/apiManagerProxy';
import rootScope from '@lib/rootScope';

export type MovVideoInfo = {
  width: number,
  height: number,
  duration: number
};

// remuxing is I/O-bound, so even a huge H.264 file converts in moments — the
// cap is the user's upload limit (2GB, 4GB with premium), not the conversion.
// An actual transcode (non-H.264 source) runs at roughly realtime though, so
// there the media-editor cap stays and bigger files fall back to documents.
const MAX_TRANSCODABLE_SIZE = MAX_EDITABLE_VIDEO_SIZE;

const UPLOAD_PART_SIZE = 512 * 1024;
// upload_max_fileparts_default/premium, until the app config arrives
const FALLBACK_MAX_FILEPARTS = 4000;

function getMaxUploadSize() {
  const appConfig = apiManagerProxy.getAppConfig();
  const parts = appConfig instanceof Promise ?
    FALLBACK_MAX_FILEPARTS :
    (rootScope.premium ? appConfig.upload_max_fileparts_premium : appConfig.upload_max_fileparts_default) ?? FALLBACK_MAX_FILEPARTS;
  return parts * UPLOAD_PART_SIZE;
}

// 'in-memory' fastStart holds the media twice at finalization (the muxer's
// buffers + the target buffer); above this size the moov goes to the end of
// the file instead, halving the memory peak — players reach it via ranges
const IN_MEMORY_FASTSTART_MAX_SIZE = 512 * 1024 * 1024;

// * whether this .mov can be offered the mp4 conversion at all; whether the
// * conversion actually succeeds is only known per-file, when it runs
export function isConvertibleMov(file: File | Blob) {
  return file.type === 'video/quicktime' && file.size <= getMaxUploadSize();
}

// * Remuxes (or, when the codec demands it, transcodes) a QuickTime .mov file
// * into a streamable mp4. H.264+AAC sources — the typical macOS screen
// * recording or camera clip — are repackaged without re-encoding, so the
// * conversion is lossless and fast; an HEVC source is transcoded to H.264,
// * which requires WebCodecs support for both directions. When a track can't
// * be carried over losslessly the conversion throws instead of silently
// * dropping it, so the caller can fall back to sending the original file.
export default async function movToVideo(
  file: Blob,
  onProgress?: (progress: number) => void,
  onInfo?: (info: MovVideoInfo) => void,
  waitBeforeConvert?: Promise<void>
): Promise<MovVideoInfo & {blob: Blob}> {
  const {Input, Output, Conversion, Mp4OutputFormat, BufferTarget, BlobSource, QTFF, MP4} = await import('mediabunny');

  const input = new Input({
    source: new BlobSource(file),
    formats: [QTFF, MP4]
  });

  const videoTrack = await input.getPrimaryVideoTrack();
  if(!videoTrack) {
    throw new Error('mov has no video track');
  }

  const [width, height, duration, videoCodec] = await Promise.all([
    videoTrack.getDisplayWidth(),
    videoTrack.getDisplayHeight(),
    input.computeDuration(),
    videoTrack.getCodec()
  ]);

  if(videoCodec !== 'avc' && file.size > MAX_TRANSCODABLE_SIZE) {
    throw new Error('the video needs an actual transcode and is too big for one');
  }

  onInfo?.({width, height, duration});

  // the metadata read above is cheap; the conversion below isn't — the caller
  // can postpone it (e.g. until the popup open animation has finished)
  await waitBeforeConvert;

  const output = new Output({
    format: new Mp4OutputFormat({fastStart: file.size <= IN_MEMORY_FASTSTART_MAX_SIZE ? 'in-memory' : false}),
    target: new BufferTarget()
  });

  const conversion = await Conversion.init({
    input,
    output,
    // H.264 + AAC play in every Telegram client; matching sources are copied
    // as-is, only other codecs get transcoded (a PCM track would otherwise be
    // copied into the mp4 verbatim, which Telegram clients can't play)
    video: {codec: 'avc'},
    audio: {codec: 'aac'},
    showWarnings: false
  });

  if(!conversion.isValid || conversion.discardedTracks.length) {
    await conversion.cancel();
    const reasons = conversion.discardedTracks.map(({track, reason}) => `${track.type}: ${reason}`);
    throw new Error(`cannot convert mov [${reasons.join(', ')}]`);
  }

  conversion.onProgress = onProgress;
  await conversion.execute();

  return {
    blob: new Blob([output.target.buffer], {type: 'video/mp4'}),
    width,
    height,
    duration
  };
}
