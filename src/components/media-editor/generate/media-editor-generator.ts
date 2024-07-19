export const generateFakeGif = async(src: HTMLImageElement) => {
  // if firefox then only static

  const width = src.width;
  const height = src.height;
  const durationInMillisecond = 1000;
  const fps = 5; // 60;
  const frameTimeInMillisecond = 1000 / fps;
  const totalFrames = Math.floor(durationInMillisecond / frameTimeInMillisecond) ;
  let chunkCount = 0;
  let encoderClosed = false;
  let videoEncoder: any = null;

  // ------ Mp4box setup --------
  const oneSecondInMillisecond = 1000;
  const timescale = 1000;

  let trackOptions: Record<string, unknown> = {
    timescale: (oneSecondInMillisecond * timescale),
    width,
    height,
    nb_samples: totalFrames
  }

  const sampleOptions: Record<string, unknown> = {
    duration: (frameTimeInMillisecond * timescale)
  }

  let track: any = null;
  const file = (window as unknown as { MP4Box: any }).MP4Box.createFile();

  const onOutput = (encodedChunk: any, config: any) => {
    const ab = new ArrayBuffer(encodedChunk.byteLength);
    encodedChunk.copyTo(ab);
    if(track === null) {
      trackOptions = {
        ...trackOptions,
        avcDecoderConfigRecord: config.decoderConfig.description
      }
      track = file.addTrack(trackOptions);
    }
    sampleOptions.dts = encodedChunk.timestamp*1000;
    sampleOptions.cts = encodedChunk.timestamp*1000;
    sampleOptions.is_sync = (encodedChunk.type === 'key');
    console.log(encodedChunk.timestamp);
    file.addSample(track, ab, sampleOptions);

    chunkCount++;
    if(chunkCount >= 5) {
      videoEncoder.close();
      encoderClosed = true;
      file.save('test.mp4');
      console.log('completed !');
    }
  };

  videoEncoder = await createVideoEncoder(width, height, onOutput);

  const drawFrame = (id: number) => {
    if(encoderClosed) return;

    const elem = document.getElementById('frame' + id) as HTMLCanvasElement;
    console.info(elem);

    const temp = document.createElement('canvas');
    temp.width = width;
    temp.height = height;
    const ctx = temp.getContext('2d');
    ctx.drawImage(src, 0, 0);
    ctx.drawImage(elem, 0, 0);

    createImageBitmap(temp).then((bmp) => {
      const videoFrame = new ((window as unknown as { VideoFrame: any }).VideoFrame)(bmp, {timestamp: durationInMillisecond * id});
      videoEncoder.encode(videoFrame);
      videoFrame.close();
    });
  };

  drawFrame(0);
  drawFrame(1);
  drawFrame(2);
  drawFrame(3);
  drawFrame(4);
}

const createVideoEncoder = async(width: number, height: number, output: (encodedChunk: any, config: any) => void) => {
  return new Promise(async(resolve, reject) => {
    const videoEncoder = new ((window as unknown as { VideoEncoder: any }).VideoEncoder)({
      output,
      error: (error: unknown) => {
        reject(error);
        console.log('onCodecError', error);
      }
    });

    await videoEncoder.configure({
      codec : 'avc1.4d0034', // 'avc1.420034', // 'avc3.42001E', // 'avc1.42C01 //'avc1.640834'
      width,
      height,
      hardwareAcceleration: 'prefer-hardware',
      avc: {format:'avc'}
    });

    resolve(videoEncoder);
  });
}
