import type {AudioCodec, EncodedPacketSink, Input, InputTrack, InputVideoTrack, VideoCodec} from 'mediabunny';

export type VideoSourceAudioInfo = {
  status: 'unknown' | 'absent';
} | {
  status: 'present';
  codec?: AudioCodec;
  channels?: number;
  sampleRate?: number;
  bitrate?: number;
};

/** Raw demux signalling may include HDR names absent from TypeScript's
 * WebCodecs SDR-only unions. Never pass this record as a decoder config. */
export type VideoSourceColorSpace = {
  primaries?: string;
  transfer?: string;
  matrix?: string;
  fullRange?: boolean;
};

/** Source facts, not encoder defaults. Missing values remain unknown. */
export type VideoSourceInfo = {
  /** Unknown is NOT SDR. Values come from demux/codec colour signalling. */
  color?: {status: 'sdr' | 'hdr' | 'unknown'; space?: VideoSourceColorSpace};
  codedWidth?: number;
  codedHeight?: number;
  displayWidth?: number;
  displayHeight?: number;
  rotation?: 0 | 90 | 180 | 270;
  /** Seconds, from the primary video track's container metadata only. */
  duration?: number;
  codec?: VideoCodec;
  /** Bits/second from container metadata (average preferred, peak fallback). */
  videoBitrate?: number;
  videoBitrateProvenance?: 'container-average' | 'container-peak';
  /** The installed API has no metadata FPS getter. Probing is opt-in. */
  fps?: {
    value: number;
    provenance: 'packet-estimate';
    probedPacketCount: number;
  };
  audio: VideoSourceAudioInfo;
};

export type ReadVideoSourceInfoOptions = {
  /** Hard limit of 2..1024 TOTAL backing packet metadata retrievals (including
   * duration's hidden first-packet read and EOF). Repeated first reads share it;
   * omitted means no probe. No iterator prefetch beyond this budget.
   * Not a byte/I/O or wall-clock budget for parsing the container itself.
   */
  fpsProbePacketCount?: number;
  signal?: AbortSignal;
};

function positive(value: number) {
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function dimension(value: number) {
  return Number.isInteger(value) ? positive(value) : undefined;
}

/** Best effort per field: a broken optional tag must not erase other source facts.
 * Reuses the lazy Input/BlobSource demux path of movToVideo/readAudioTags.
 * No playback, decoding, full-file packet scan, blob-size bitrate guess or cache.
 * Cancellation rejects with AbortError and disposes the input, including while
 * reads are pending; ordinary unsupported/malformed inputs return unknowns.
 */
export default async function readVideoSourceInfo(blob: Blob, options: ReadVideoSourceInfoOptions = {}): Promise<VideoSourceInfo> {
  const {fpsProbePacketCount, signal} = options;
  if(fpsProbePacketCount !== undefined && (!Number.isInteger(fpsProbePacketCount) || fpsProbePacketCount < 2 || fpsProbePacketCount > 1024)) {
    throw new RangeError('fpsProbePacketCount must be an integer from 2 to 1024');
  }
  const throwIfAborted = () => {
    if(signal?.aborted) throw new DOMException('Video source read cancelled', 'AbortError');
  };
  throwIfAborted();

  let input: Input;
  let onAbort: () => void;
  const unknown = (): VideoSourceInfo => ({audio: {status: 'unknown'}});
  let packetReads = 0;
  // Pinned Mediabunny's MP4 duration getter fetches its first packet internally
  // (isobmff-demuxer.ts:3191-3202); colour config may also request a FULL packet.
  // Guard this owned Input's backing, not just the public sink. Share the first
  // metadata promise between duration and FPS, count every other backing fetch,
  // and refuse full-packet reads. This is intentionally version-coupled: an
  // unrecognized backing fails closed rather than claiming a fetch bound.
  type Options = NonNullable<Parameters<EncodedPacketSink['getFirstPacket']>[0]>;
  type Packet = Awaited<ReturnType<EncodedPacketSink['getFirstPacket']>>;
  type Backing = {
    getFirstPacket(options: Options): Promise<Packet>;
    getNextPacket(packet: NonNullable<Packet>, options: Options): Promise<Packet>;
    getPacket(timestamp: number, options: Options): Promise<Packet>;
    getKeyPacket(timestamp: number, options: Options): Promise<Packet>;
    getNextKeyPacket(packet: NonNullable<Packet>, options: Options): Promise<Packet>;
  };
  function hasBacking(track: InputTrack): track is InputTrack & {_backing: Backing} {
    const backing = '_backing' in track && track._backing;
    return !!backing && typeof backing === 'object' &&
      ['getFirstPacket', 'getNextPacket', 'getPacket', 'getKeyPacket', 'getNextKeyPacket'].every(key =>
        key in backing && typeof Reflect.get(backing, key) === 'function');
  }
  function boundPackets(track: InputTrack) {
    if(!hasBacking(track)) return false;
    const backing = track._backing;
    const first = backing.getFirstPacket.bind(backing);
    const next = backing.getNextPacket.bind(backing);
    const at = backing.getPacket.bind(backing);
    const key = backing.getKeyPacket.bind(backing);
    const nextKey = backing.getNextKeyPacket.bind(backing);
    let firstMetadata: Promise<Packet>;
    function reserve(options: Options) {
      throwIfAborted();
      if(!options?.metadataOnly || packetReads >= (fpsProbePacketCount ?? 0)) throw new Error('Video metadata packet budget');
      packetReads++;
    }
    backing.getFirstPacket = options => {
      throwIfAborted();
      if(options?.metadataOnly && firstMetadata) return firstMetadata;
      reserve(options);
      return firstMetadata = first(options);
    };
    backing.getNextPacket = (packet, options) => { reserve(options); return next(packet, options); };
    backing.getPacket = (timestamp, options) => { reserve(options); return at(timestamp, options); };
    backing.getKeyPacket = (timestamp, options) => { reserve(options); return key(timestamp, options); };
    backing.getNextKeyPacket = (packet, options) => { reserve(options); return nextKey(packet, options); };
    return true;
  }
  async function read<T>(get: () => Promise<T>): Promise<T | undefined> {
    throwIfAborted();
    try {
      return await get();
    } catch{
      throwIfAborted();
      return undefined;
    }
  }
  async function bitrate(track: InputTrack) {
    const average = positive(await read(() => track.getAverageBitrate()));
    if(average !== undefined) return {value: average, provenance: 'container-average' as const};
    const peak = positive(await read(() => track.getBitrate()));
    if(peak !== undefined) return {value: peak, provenance: 'container-peak' as const};
  }
  async function inspect(makeSink: (track: InputVideoTrack) => EncodedPacketSink): Promise<VideoSourceInfo> {
    const info = unknown();
    const [video, audio] = await Promise.all([
      read(() => input.getPrimaryVideoTrack()),
      read(() => input.getPrimaryAudioTrack())
    ]);
    if(audio === null) info.audio = {status: 'absent'};
    else if(audio && boundPackets(audio)) {
      const [codec, channels, sampleRate, audioBitrate] = await Promise.all([
        read(() => audio.getCodec()),
        read(() => audio.getNumberOfChannels()),
        read(() => audio.getSampleRate()),
        bitrate(audio)
      ]);
      info.audio = {
        status: 'present', codec: codec ?? undefined,
        channels: dimension(channels), sampleRate: positive(sampleRate), bitrate: audioBitrate?.value
      };
    }
    if(!video) return info;
    const bounded = boundPackets(video);
    if(!bounded) return info;
    const [codedWidth, codedHeight, displayWidth, displayHeight, rotation, duration, codec, videoBitrate] = await Promise.all([
      read(() => video.getCodedWidth()),
      read(() => video.getCodedHeight()),
      read(() => video.getDisplayWidth()),
      read(() => video.getDisplayHeight()),
      read(() => video.getRotation()),
      bounded ? read(() => video.getDurationFromMetadata()) : undefined,
      read(() => video.getCodec()),
      bitrate(video)
    ]);
    Object.assign(info, {
      codedWidth: dimension(codedWidth), codedHeight: dimension(codedHeight),
      displayWidth: positive(displayWidth), displayHeight: positive(displayHeight),
      rotation: [0, 90, 180, 270].includes(rotation) ? rotation : undefined,
      duration: positive(duration), codec: codec ?? undefined,
      videoBitrate: videoBitrate?.value, videoBitrateProvenance: videoBitrate?.provenance
    });
    const space: VideoSourceColorSpace = bounded ? await read(() => video.getColorSpace()) : undefined;
    const primaries = space?.primaries;
    const transfer = space?.transfer;
    const matrix = space?.matrix;
    const hdr = ['bt2020', 'smpte432'].includes(primaries) || ['pq', 'hlg', 'smpte2084', 'arib-std-b67'].includes(transfer) || matrix === 'bt2020-ncl';
    const sdr = ['bt709', 'bt470bg', 'smpte170m'].includes(primaries) &&
      ['bt709', 'smpte170m', 'iec61966-2-1'].includes(transfer) && ['bt709', 'bt470bg', 'smpte170m', 'rgb'].includes(matrix);
    info.color = {status: hdr ? 'hdr' : sdr ? 'sdr' : 'unknown', space};
    if(fpsProbePacketCount !== undefined && bounded) {
      // Metric targets may overrun for reordered frames; packets() also prefetches.
      // Explicit retrieval bounds FETCHES, not merely consumed metadata entries.
      info.fps = await read(async() => {
        let count = 0, start = Infinity, end = -Infinity;
        let valid = true;
        const sink = makeSink(video);
        let packet = await sink.getFirstPacket({metadataOnly: true});
        while(packet) {
          throwIfAborted();
          valid &&= Number.isFinite(packet.timestamp) && positive(packet.duration) !== undefined;
          start = Math.min(start, packet.timestamp);
          end = Math.max(end, packet.timestamp + packet.duration);
          if(++count >= fpsProbePacketCount) break;
          throwIfAborted();
          packet = await sink.getNextPacket(packet, {metadataOnly: true});
        }
        throwIfAborted();
        const value = positive(count / (end - start));
        if(valid && count >= 2 && value !== undefined) {
          return {value, provenance: 'packet-estimate' as const, probedPacketCount: count};
        }
      });
    }
    return info;
  }
  try {
    const {Input, BlobSource, EncodedPacketSink, MP4, QTFF, MATROSKA, WEBM} = await import('mediabunny');
    throwIfAborted();
    input = new Input({source: new BlobSource(blob), formats: [MP4, QTFF, MATROSKA, WEBM]});
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(new DOMException('Video source read cancelled', 'AbortError'));
      signal?.addEventListener('abort', onAbort, {once: true});
    });
    return await Promise.race([inspect(track => new EncodedPacketSink(track)), aborted]);
  } catch{
    throwIfAborted();
    return unknown();
  } finally {
    if(onAbort) signal?.removeEventListener('abort', onAbort);
    input?.dispose();
  }
}
