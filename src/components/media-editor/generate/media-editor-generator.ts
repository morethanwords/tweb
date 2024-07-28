export const generateGif = async(width: number, height: number, frames: any[]) => {
  return new Promise(async(resolve) => {
    if(width % 2) {
      width += 1;
    }

    if(height % 2) {
      height += 1;
    }
    // if firefox then only static
    const durationInMillisecond = 1000;
    const fps = 60;
    const frameTimeInMillisecond = 1000 / fps;
    const totalFrames = frames.length; // Math.floor(durationInMillisecond / frameTimeInMillisecond) ;
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
      sampleOptions.dts = encodedChunk.timestamp * 1000;
      sampleOptions.cts = encodedChunk.timestamp * 1000;
      sampleOptions.is_sync = (encodedChunk.type === 'key');
      console.log(encodedChunk.timestamp);
      file.addSample(track, ab, sampleOptions);

      chunkCount++;

      console.info(chunkCount);
      if(chunkCount >= totalFrames) {
        videoEncoder.close();
        encoderClosed = true;

        console.info(file);
        file.save('test.mp4');
        console.log('completed !');

        const buffer = file.getBuffer();
        console.info('bff', buffer);

        const blob = new Blob([buffer], {type: 'video/mp4'});

        /* const video = document.createElement('video');
        video.autoplay = true;
        video.muted = true;
        video.controls = true;
        video.src = URL.createObjectURL(blob);
        document.body.appendChild(video); */

        resolve(blob);
      }
    };

    videoEncoder = await createVideoEncoder(width, height, onOutput);

    const drawFrame = (id: number) => {
      if(encoderClosed) return;

      const temp = document.createElement('canvas');
      temp.width = width;
      temp.height = height;
      const ctx = temp.getContext('2d');
      ctx.drawImage(frames[id], 0, 0);

      createImageBitmap(temp).then((bmp) => {
        const videoFrame = new ((window as unknown as {
          VideoFrame: any
        }).VideoFrame)(bmp, {timestamp: frameTimeInMillisecond * id});
        videoEncoder.encode(videoFrame);
        videoFrame.close();
      });
    };

    for(let i = 0; i < frames.length; i++) {
      drawFrame(i);
    }
  });
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

