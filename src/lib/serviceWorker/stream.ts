/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { deferredPromise } from "../../helpers/cancellablePromise";
import { notifySomeone } from "../../helpers/context";
import debounce from "../../helpers/schedulers/debounce";
import { isSafari } from "../../helpers/userAgent";
import { InputFileLocation, UploadFile } from "../../layer";
import { DownloadOptions } from "../mtproto/apiFileManager";
import { RequestFilePartTask, deferredPromises, incrementTaskId } from "./index.service";
import timeout from "./timeout";

type StreamRange = [number, number];
type StreamId = string;
const streams: Map<StreamId, Stream> = new Map();
class Stream {
  private destroyDebounced: () => void;
  private id: StreamId;
  private limitPart: number;

  constructor(private info: DownloadOptions) {
    this.id = Stream.getId(info);
    streams.set(this.id, this);

    // ! если грузить очень большое видео чанками по 512Кб в мобильном Safari, то стрим не запустится
    this.limitPart = info.size > (75 * 1024 * 1024) ? STREAM_CHUNK_UPPER_LIMIT : STREAM_CHUNK_MIDDLE_LIMIT;
    this.destroyDebounced = debounce(this.destroy, 15000, false, true);
  }

  private destroy = () => {
    streams.delete(this.id);
  };

  private requestFilePart(alignedOffset: number, limit: number) {
    const task: RequestFilePartTask = {
      type: 'requestFilePart',
      id: incrementTaskId(),
      payload: [this.info.dcId, this.info.location, alignedOffset, limit]
    };

    notifySomeone(task);
    
    const deferred = deferredPromises[task.id] = deferredPromise<UploadFile.uploadFile>();
    return deferred;
  }

  public requestRange(range: StreamRange) {
    this.destroyDebounced();

    const possibleResponse = responseForSafariFirstRange(range, this.info.mimeType, this.info.size);
    if(possibleResponse) {
      return possibleResponse;
    }

    const [offset, end] = range;

    /* if(info.size > limitPart && isSafari && offset === limitPart) {
      //end = info.size - 1;
      //offset = info.size - 1 - limitPart;
      offset = info.size - (info.size % limitPart);
    } */

    const limit = end && end < this.limitPart ? alignLimit(end - offset + 1) : this.limitPart;
    const alignedOffset = alignOffset(offset, limit);

    return this.requestFilePart(alignedOffset, limit).then(result => {
      let ab = result.bytes as Uint8Array;
        
      //log.debug('[stream] requestFilePart result:', result);

      const headers: Record<string, string> = {
        'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${alignedOffset}-${alignedOffset + ab.byteLength - 1}/${this.info.size || '*'}`,
        'Content-Length': `${ab.byteLength}`,
      };

      if(this.info.mimeType) headers['Content-Type'] = this.info.mimeType;

      if(isSafari) {
        ab = ab.slice(offset - alignedOffset, end - alignedOffset + 1);
        headers['Content-Range'] = `bytes ${offset}-${offset + ab.byteLength - 1}/${this.info.size || '*'}`;
        headers['Content-Length'] = `${ab.byteLength}`;
      }

      // simulate slow connection
      //setTimeout(() => {
        return new Response(ab, {
          status: 206,
          statusText: 'Partial Content',
          headers,
        });
      //}, 2.5e3);
    });
  }

  public static get(info: DownloadOptions) {
    return streams.get(this.getId(info)) ?? new Stream(info);
  }

  public static getId(info: DownloadOptions) {
    return (info.location as InputFileLocation.inputDocumentFileLocation).id;
  }
}

export default function onStreamFetch(event: FetchEvent, params: string) {
  const range = parseRange(event.request.headers.get('Range'));
  const info: DownloadOptions = JSON.parse(decodeURIComponent(params));
  const stream = Stream.get(info);

  //log.debug('[stream]', url, offset, end);

  event.respondWith(Promise.race([
    timeout(45 * 1000),
    stream.requestRange(range)
  ]));
}

function responseForSafariFirstRange(range: StreamRange, mimeType: string, size: number): Response {
  if(range[0] === 0 && range[1] === 1) {
    return new Response(new Uint8Array(2).buffer, {
      status: 206,
      statusText: 'Partial Content',
      headers: {
        'Accept-Ranges': 'bytes',
        'Content-Range': `bytes 0-1/${size || '*'}`,
        'Content-Length': '2',
        'Content-Type': mimeType || 'video/mp4',
      },
    });
  }

  return null;
}

/* const STREAM_CHUNK_UPPER_LIMIT = 256 * 1024;
const SMALLEST_CHUNK_LIMIT = 256 * 4; */
/* const STREAM_CHUNK_UPPER_LIMIT = 1024 * 1024;
const SMALLEST_CHUNK_LIMIT = 1024 * 4; */
const STREAM_CHUNK_MIDDLE_LIMIT = 512 * 1024;
const STREAM_CHUNK_UPPER_LIMIT = 1024 * 1024;
const SMALLEST_CHUNK_LIMIT = 512 * 4;

function parseRange(header: string): StreamRange {
  if(!header) return [0, 0];
  const [, chunks] = header.split('=');
  const ranges = chunks.split(', ');
  const [offset, end] = ranges[0].split('-');

  return [+offset, +end || 0];
}

function alignOffset(offset: number, base = SMALLEST_CHUNK_LIMIT) {
  return offset - (offset % base);
}

function alignLimit(limit: number) {
  return 2 ** Math.ceil(Math.log(limit) / Math.log(2));
}
