import createMp4VideoEncoder from '@components/mediaEditor/finalRender/createMp4VideoEncoder';

let supported: boolean;

export function canConvertGifToVideoSync() {
  return !!supported;
}

export async function canConvertGifToVideo(): Promise<boolean> {
  if(supported !== undefined) {
    return supported;
  }

  if(typeof(ImageDecoder) === 'undefined' || typeof(VideoEncoder) === 'undefined') {
    return supported = false;
  }

  const {supportsVideoEncoding} = await import('@components/mediaEditor/support');
  return supported = await supportsVideoEncoding();
}

export default async function gifToVideo(blob: Blob, onProgress?: (progress: number) => void): Promise<{
  blob: Blob,
  width: number,
  height: number,
  duration: number
}> {
  const decoder = new ImageDecoder({data: await blob.arrayBuffer(), type: 'image/gif', preferAnimation: true});
  await decoder.tracks.ready;
  const frameCount = decoder.tracks.selectedTrack.frameCount;

  const {image: firstFrame} = await decoder.decode({frameIndex: 0});
  // * H.264 requires even dimensions
  const width = firstFrame.displayWidth & ~1;
  const height = firstFrame.displayHeight & ~1;
  firstFrame.close();

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const {encoder, finalize} = await createMp4VideoEncoder({width, height});

  let duration = 0;
  try {
    for(let i = 0; i < frameCount; ++i) {
      const {image} = await decoder.decode({frameIndex: i});
      const frameDuration = image.duration || 1e5; // gifs with no delay play at ~10fps
      ctx.drawImage(image, 0, 0, width, height);
      image.close();

      const videoFrame = new VideoFrame(canvas, {
        timestamp: duration,
        duration: frameDuration
      });
      encoder.encode(videoFrame, {keyFrame: i % 30 === 0});
      videoFrame.close();

      duration += frameDuration;
      onProgress?.((i + 1) / frameCount);
    }

    await encoder.flush();
  } finally {
    encoder.close();
    decoder.close();
  }

  return {
    blob: finalize(),
    width,
    height,
    duration: duration / 1e6
  };
}
