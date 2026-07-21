export type TLottieHandle = number;

type TLottieExports = WebAssembly.Exports & {
  memory: WebAssembly.Memory,
  tlottie_alloc: (length: number) => number,
  tlottie_free: (pointer: number, length: number) => void,
  tlottie_new: (pointer: number, length: number) => TLottieHandle,
  tlottie_drop: (handle: TLottieHandle) => void,
  tlottie_width: (handle: TLottieHandle) => number,
  tlottie_height: (handle: TLottieHandle) => number,
  tlottie_frame_rate: (handle: TLottieHandle) => number,
  tlottie_frame_count: (handle: TLottieHandle) => number,
  tlottie_render: (
    handle: TLottieHandle,
    frame: number,
    width: number,
    height: number,
    antialias: number
  ) => number
};

export type TLottieAnimation = {
  handle: TLottieHandle,
  width: number,
  height: number,
  frameRate: number,
  frameCount: number
};

const getAuthoredFrameCount = (json: string, frameCount: number) => {
  if(frameCount !== 1) {
    return frameCount;
  }

  try {
    const data = JSON.parse(json);
    if(typeof(data?.ip) !== 'number' || typeof(data?.op) !== 'number') {
      return frameCount;
    }

    const authoredFrameCount = Math.floor(Math.fround(data.op) - Math.fround(data.ip));
    if(Number.isNaN(authoredFrameCount)) {
      return frameCount;
    }

    return Math.min(0xffffffff, Math.max(1, authoredFrameCount));
  } catch{
    return frameCount;
  }
};

const instantiate = async(wasmUrl: string) => {
  const response = await fetch(wasmUrl);
  if(!response.ok) {
    throw new Error(`Failed to load tlottie WebAssembly: ${response.status}`);
  }

  if(typeof(WebAssembly.instantiateStreaming) === 'function') {
    try {
      return (await WebAssembly.instantiateStreaming(response.clone(), {})).instance;
    } catch(err) {
      if(err instanceof WebAssembly.CompileError) {
        throw err;
      }

      // Some servers do not send application/wasm. The ArrayBuffer fallback
      // compiles the same response and preserves compatibility with them.
    }
  }

  return (await WebAssembly.instantiate(await response.arrayBuffer(), {})).instance;
};

export class TLottieWasm {
  private exports: TLottieExports;
  private encoder = new TextEncoder();
  private staticAnimations = new Set<TLottieHandle>();

  private constructor(exports: TLottieExports) {
    this.exports = exports;
  }

  public static async create(wasmUrl: string) {
    const instance = await instantiate(wasmUrl);
    return new TLottieWasm(instance.exports as TLottieExports);
  }

  public createAnimation(json: string): TLottieAnimation {
    const bytes = this.encoder.encode(json);
    const pointer = this.exports.tlottie_alloc(bytes.length);
    if(!pointer) {
      throw new Error('tlottie input allocation failed');
    }

    let handle: TLottieHandle;
    try {
      new Uint8Array(this.exports.memory.buffer, pointer, bytes.length).set(bytes);
      handle = this.exports.tlottie_new(pointer, bytes.length);
    } finally {
      this.exports.tlottie_free(pointer, bytes.length);
    }

    if(!handle) {
      throw new Error('tlottie rejected the animation');
    }

    const rendererFrameCount = this.exports.tlottie_frame_count(handle);
    const frameCount = getAuthoredFrameCount(json, rendererFrameCount);
    if(rendererFrameCount === 1 && frameCount > 1) {
      this.staticAnimations.add(handle);
    }

    return {
      handle,
      width: this.exports.tlottie_width(handle),
      height: this.exports.tlottie_height(handle),
      frameRate: this.exports.tlottie_frame_rate(handle),
      // Upstream collapses proven-static compositions to one render frame.
      // Keep their authored duration for the player's loop/onComplete timing.
      frameCount
    };
  }

  public destroyAnimation(handle: TLottieHandle) {
    this.staticAnimations.delete(handle);
    this.exports.tlottie_drop(handle);
  }

  public render(handle: TLottieHandle, frame: number, width: number, height: number) {
    const rendererFrame = this.staticAnimations.has(handle) ? 0 : frame;
    const pointer = this.exports.tlottie_render(handle, rendererFrame, width, height, 1);
    if(!pointer) {
      throw new Error('tlottie frame render failed');
    }

    // tlottie_render can grow memory. Always derive the view after the call and do
    // not retain it beyond the immediate copy into ImageData/output buffers.
    return new Uint8Array(this.exports.memory.buffer, pointer, width * height * 4);
  }
}

const tlottiePromises = new Map<string, Promise<TLottieWasm>>();

export default function loadTLottieWasm(wasmUrl: string) {
  let promise = tlottiePromises.get(wasmUrl);
  if(!promise) {
    promise = TLottieWasm.create(wasmUrl);
    tlottiePromises.set(wasmUrl, promise);
    promise.catch(() => {
      if(tlottiePromises.get(wasmUrl) === promise) {
        tlottiePromises.delete(wasmUrl);
      }
    });
  }

  return promise;
}
