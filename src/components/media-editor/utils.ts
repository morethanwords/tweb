export function auto_adjust(context: CanvasRenderingContext2D, W: number, H: number) {
  // settings
  var white = 240;    // white color min
  var black = 30;     // black color max
  var target_white = 1;   // how much % white colors should take
  var target_black = 0.5; // how much % black colors should take
  var modify = 1.1;   // color modify strength

  var img = context.getImageData(0, 0, W, H);
  var imgData = img.data;
  var n = 0;  // pixels count without transparent

  // make sure we have white
  var n_valid = 0;
  for(var i = 0; i < imgData.length; i += 4) {
    if(imgData[i + 3] == 0) continue; // transparent
    if((imgData[i] + imgData[i + 1] + imgData[i + 2]) / 3 > white) n_valid++;
    n++;
  }
  let target = target_white;
  var n_fix_white = 0;
  var done = false;
  for(var j = 0; j < 30; j++) {
    if(n_valid * 100 / n >= target) done = true;
    if(done == true) break;
    n_fix_white++;

    // adjust
    for(var i = 0; i < imgData.length; i += 4) {
      if(imgData[i + 3] == 0) continue; // transparent
      for(var c = 0; c < 3; c++) {
        var x = i + c;
        if(imgData[x] < 10) continue;
        // increase white
        imgData[x] *= modify;
        imgData[x] = Math.round(imgData[x]);
        if(imgData[x] > 255) imgData[x] = 255;
      }
    }

    // recheck
    n_valid = 0;
    for(var i = 0; i < imgData.length; i += 4) {
      if(imgData[i + 3] == 0) continue; // transparent
      if((imgData[i] + imgData[i + 1] + imgData[i + 2]) / 3 > white) n_valid++;
    }
  }

  // make sure we have black
  n_valid = 0;
  for(var i = 0; i < imgData.length; i += 4) {
    if(imgData[i + 3] == 0) continue; // transparent
    if((imgData[i] + imgData[i + 1] + imgData[i + 2]) / 3 < black) n_valid++;
  }
  target = target_black;
  var n_fix_black = 0;
  var done = false;
  for(var j = 0; j < 30; j++) {
    if(n_valid * 100 / n >= target) done = true;
    if(done == true) break;
    n_fix_black++;

    // adjust
    for(var i = 0; i < imgData.length; i += 4) {
      if(imgData[i + 3] == 0) continue; // transparent
      for(var c = 0; c < 3; c++) {
        var x = i + c;
        if(imgData[x] > 240) continue;
        // increase black
        imgData[x] -= (255 - imgData[x]) * modify - (255 - imgData[x]);
        imgData[x] = Math.round(imgData[x]);
      }
    }

    // recheck
    n_valid = 0;
    for(var i = 0; i < imgData.length; i += 4) {
      if(imgData[i + 3] == 0) continue; // transparent
      if((imgData[i] + imgData[i + 1] + imgData[i + 2]) / 3 < black) n_valid++;
    }
  }

  //  save
  context.putImageData(img, 0, 0);
  //  log('Iterations: brighten='+n_fix_white+", darken="+n_fix_black);
}

export function adjustGamma(initial: any, ctx: CanvasRenderingContext2D, width: number, height: number, gamma: number) {
  const gammaCorrection = 1 / gamma;
  const copyData = ctx.createImageData(width, height);
  copyData.data.set(initial.data);
  const data = copyData.data;

  for(let i = 0; i < data.length; i += 4) {
    data[i] = 255 * Math.pow((data[i] / 255), gammaCorrection);
    data[i + 1] = 255 * Math.pow((data[i + 1] / 255), gammaCorrection);
    data[i + 2] = 255 * Math.pow((data[i + 2] / 255), gammaCorrection);
  }
  ctx.putImageData(copyData, 0, 0);
}

const PGPhotoEnhanceSegments = 8; // Example value, replace with actual value
const PGPhotoEnhanceHistogramBins = 256; // Example value, replace with actual value

export function rgbToHsv(r: number, g: number, b: number) {
  r /= 255, g /= 255, b /= 255;

  var max = Math.max(r, g, b), min = Math.min(r, g, b);
  var h, s, v = max;

  var d = max - min;
  s = max == 0 ? 0 : d / max;

  if(max == min) {
    h = 0; // achromatic
  } else {
    switch(max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }

    h /= 6;
  }

  return [h, s, v];
}

export function hsvToRgb(h: number, s: number, v: number) {
  let r, g, b;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch(i % 6) {
    case 0:
      r = v, g = t, b = p;
      break;
    case 1:
      r = q, g = v, b = p;
      break;
    case 2:
      r = p, g = v, b = t;
      break;
    case 3:
      r = p, g = q, b = v;
      break;
    case 4:
      r = t, g = p, b = v;
      break;
    case 5:
      r = v, g = p, b = q;
      break;
  }
  return [r * 255, g * 255, b * 255];
}

/*
float enhance(float value) {" +
                "const vec2 offset = vec2(0.001953125, 0.03125);" +
                "value = value + offset.x;" +
                "vec2 coord = (clamp(vTextureCoord, 0.125, 1.0 - 0.125001) - 0.125) * 4.0;" +
                "vec2 frac = fract(coord);" +
                "coord = floor(coord);" +
                "float p00 = float(coord.y * 4.0 + coord.x) * 0.0625 + offset.y;" +
                "float p01 = float(coord.y * 4.0 + coord.x + 1.0) * 0.0625 + offset.y;" +
                "float p10 = float((coord.y + 1.0) * 4.0 + coord.x) * 0.0625 + offset.y;" +
                "float p11 = float((coord.y + 1.0) * 4.0 + coord.x + 1.0) * 0.0625 + offset.y;" +
                "vec3 c00 = texture2D(inputImageTexture2, vec2(value, p00)).rgb;" +
                "vec3 c01 = texture2D(inputImageTexture2, vec2(value, p01)).rgb;" +
                "vec3 c10 = texture2D(inputImageTexture2, vec2(value, p10)).rgb;" +
                "vec3 c11 = texture2D(inputImageTexture2, vec2(value, p11)).rgb;" +
                "float c1 = ((c00.r - c00.g) / (c00.b - c00.g));" +
                "float c2 = ((c01.r - c01.g) / (c01.b - c01.g));" +
                "float c3 = ((c10.r - c10.g) / (c10.b - c10.g));" +
                "float c4 = ((c11.r - c11.g) / (c11.b - c11.g));" +
                "float c1_2 = mix(c1, c2, frac.x);" +
                "float c3_4 = mix(c3, c4, frac.x);" +
                "return mix(c1_2, c3_4, frac.y);" +
            "}
 */

/* export function enhance(initValue: number): number {
  const [offsetX, offsetY] = [0.001953125, 0.03125];
  const value = initValue + offsetX;
  const coord = (clamp(vTextureCoord, 0.125, 1.0 - 0.125001) - 0.125) * 4.0;
  // const frac = fract(coord);
} */

export function enhance2(value: number) {
  const offset = [0.001953125, 0.03125];
  value += offset[0];
  let coord = [value % 1, value % 1];
  const frac = [coord[0] % 1, coord[1] % 1];
  coord = [Math.floor(coord[0]), Math.floor(coord[1])];
  const p00 = coord[1] * 4 + coord[0] * 0.0625 + offset[1];
  const p01 = coord[1] * 4 + (coord[0] + 1) * 0.0625 + offset[1];
  const p10 = (coord[1] + 1) * 4 + coord[0] * 0.0625 + offset[1];
  const p11 = (coord[1] + 1) * 4 + (coord[0] + 1) * 0.0625 + offset[1];
  // For simplicity, assume a static c00, c01, c10, c11
  const c00 = [1, 1, 1];
  const c01 = [1, 1, 1];
  const c10 = [1, 1, 1];
  const c11 = [1, 1, 1];
  const c1 = ((c00[0] - c00[1]) / (c00[2] - c00[1]));
  const c2 = ((c01[0] - c01[1]) / (c01[2] - c01[1]));
  const c3 = ((c10[0] - c10[1]) / (c10[2] - c10[1]));
  const c4 = ((c11[0] - c11[1]) / (c11[2] - c11[1]));
  const c1_2 = (1 - frac[0]) * c1 + frac[0] * c2;
  const c3_4 = (1 - frac[0]) * c3 + frac[0] * c4;
  return (1 - frac[1]) * c1_2 + frac[1] * c3_4;
}

export function bufferToHSV(initial: any, ctx: CanvasRenderingContext2D, width: number, height: number, gamma: number) {
  const copyData = ctx.createImageData(width, height);
  copyData.data.set(initial.data);
  const data = copyData.data;

  for(let i = 0; i < data.length; i += 4) {
    const [h, s, v] = rgbToHsv(data[i], data[i + 1], data[i + 2]);
    const it = {
      i,
      r: data[i],
      g: data[i + 1],
      b: data[i + 2],
      h, s, v
    };
    setTimeout(() => {
      i % 5000 || console.info(i, `${it.r}|${it.g}|${it.b}`, `${h}|${s}|${v}`);
    });
    data[i] = h;
    data[i + 1] = s;
    data[i + 2] = v;
  }

  console.log(copyData.data);
  ctx.putImageData(copyData, 0, 0);
}

export function calcCDT(hsvBuffer: Uint8Array, width: number, height: number, buffer: Uint8Array, calcBuffer: Uint32Array) {
  const imageWidth = width;
  const imageHeight = height;
  const _clipLimit = 1.25;

  const totalSegments = PGPhotoEnhanceSegments * PGPhotoEnhanceSegments;
  const tileArea = Math.floor(imageWidth / PGPhotoEnhanceSegments) * Math.floor(imageHeight / PGPhotoEnhanceSegments);
  const clipLimit = Math.max(1, _clipLimit * tileArea / PGPhotoEnhanceHistogramBins);
  const scale = 255.0 / tileArea;

  const cdfsMin = new Uint32Array(calcBuffer.buffer, 0, totalSegments);
  const cdfsMax = new Uint32Array(calcBuffer.buffer, totalSegments * 4, totalSegments);
  const cdfs = new Uint32Array(calcBuffer.buffer, totalSegments * 8, totalSegments * PGPhotoEnhanceHistogramBins);
  const hist = new Uint32Array(calcBuffer.buffer, totalSegments * 8 + totalSegments * PGPhotoEnhanceHistogramBins * 4, totalSegments * PGPhotoEnhanceHistogramBins);

  hist.fill(0);

  const xMul = PGPhotoEnhanceSegments / imageWidth;
  const yMul = PGPhotoEnhanceSegments / imageHeight;

  for(let i = 0; i < imageHeight; i++) {
    const yOffset = i * width * 4;
    for(let j = 0; j < imageWidth; j++) {
      const index = j * 4 + yOffset;

      const tx = Math.floor(j * xMul);
      const ty = Math.floor(i * yMul);
      const t = ty * PGPhotoEnhanceSegments + tx;

      hist[t * PGPhotoEnhanceHistogramBins + hsvBuffer[index + 2]]++;
    }
  }

  for(let i = 0; i < totalSegments; i++) {
    if(clipLimit > 0) {
      let clipped = 0;
      for(let j = 0; j < PGPhotoEnhanceHistogramBins; j++) {
        if(hist[i * PGPhotoEnhanceHistogramBins + j] > clipLimit) {
          clipped += hist[i * PGPhotoEnhanceHistogramBins + j] - clipLimit;
          hist[i * PGPhotoEnhanceHistogramBins + j] = clipLimit;
        }
      }

      const redistBatch = Math.floor(clipped / PGPhotoEnhanceHistogramBins);
      const residual = clipped - redistBatch * PGPhotoEnhanceHistogramBins;

      for(let j = 0; j < PGPhotoEnhanceHistogramBins; j++) {
        hist[i * PGPhotoEnhanceHistogramBins + j] += redistBatch;
        if(j < residual) {
          hist[i * PGPhotoEnhanceHistogramBins + j]++;
        }
      }
    }

    cdfs.set(hist.slice(i * PGPhotoEnhanceHistogramBins, (i + 1) * PGPhotoEnhanceHistogramBins), i * PGPhotoEnhanceHistogramBins);

    let hMin = PGPhotoEnhanceHistogramBins - 1;
    for(let j = 0; j < hMin; ++j) {
      if(cdfs[i * PGPhotoEnhanceHistogramBins + j] != 0) {
        hMin = j;
      }
    }

    let cdf = 0;
    for(let j = hMin; j < PGPhotoEnhanceHistogramBins; j++) {
      cdf += cdfs[i * PGPhotoEnhanceHistogramBins + j];
      cdfs[i * PGPhotoEnhanceHistogramBins + j] = Math.min(255, cdf * scale);
    }

    cdfsMin[i] = cdfs[i * PGPhotoEnhanceHistogramBins + hMin];
    cdfsMax[i] = cdfs[i * PGPhotoEnhanceHistogramBins + PGPhotoEnhanceHistogramBins - 1];
  }

  for(let j = 0; j < totalSegments; j++) {
    const yOffset = j * PGPhotoEnhanceHistogramBins * 4;
    for(let i = 0; i < PGPhotoEnhanceHistogramBins; i++) {
      const index = i * 4 + yOffset;
      buffer[index] = cdfs[j * PGPhotoEnhanceHistogramBins + i];
      buffer[index + 1] = cdfsMin[j];
      buffer[index + 2] = cdfsMax[j];
      buffer[index + 3] = 255;
    }
  }
}


/*
const initialData = context.createImageData(canvas.width, canvas.height);
      initialData.data.set(context.getImageData(0.0, 0.0, canvas.width, canvas.height).data);

let i = 0.5;
      setInterval(() => {
        //  console.warn('updating this shit', i);
        // adjustGamma(initialData, context, canvas.width, canvas.height, i);
        i += 0.05;
      }, 500);


      console.info(initialData.data);

      setTimeout(() => {
        // bufferToHSV(initialData, context, initialData.width, initialData.height, i);
      }, 1000);

      /* const renderBufferWidth = canvas.width; // Example value, replace with actual value
      const renderBufferHeight = canvas.height; // Example value, replace with actual value
      const cdtBuffer = new Uint8Array(PGPhotoEnhanceSegments * PGPhotoEnhanceSegments * PGPhotoEnhanceHistogramBins * 4);
      const calcBuffer = new Uint32Array(PGPhotoEnhanceSegments * PGPhotoEnhanceSegments * 2 * 4 * (1 + PGPhotoEnhanceHistogramBins));
      const hsvBuffer = new Uint8Array(renderBufferWidth * renderBufferHeight * 4);

      calcCDT(hsvBuffer, renderBufferWidth, renderBufferHeight, cdtBuffer, calcBuffer);
      console.info('res', cdtBuffer); * /
 */
