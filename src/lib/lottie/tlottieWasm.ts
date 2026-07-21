export type TLottieHandle = number;

type TLottieExports = WebAssembly.Exports & {
  memory: WebAssembly.Memory,
  tl_alloc: (length: number) => number,
  tl_free: (pointer: number, length: number) => void,
  tl_new: (pointer: number, length: number) => TLottieHandle,
  tl_drop: (handle: TLottieHandle) => void,
  tl_width: (handle: TLottieHandle) => number,
  tl_height: (handle: TLottieHandle) => number,
  tl_frame_rate: (handle: TLottieHandle) => number,
  tl_frame_count: (handle: TLottieHandle) => number,
  tl_render: (
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

  private constructor(exports: TLottieExports) {
    this.exports = exports;
  }

  public static async create(wasmUrl: string) {
    const instance = await instantiate(wasmUrl);
    return new TLottieWasm(instance.exports as TLottieExports);
  }

  public createAnimation(json: string): TLottieAnimation {
    const bytes = this.encoder.encode(json);
    const pointer = this.exports.tl_alloc(bytes.length);
    if(!pointer) {
      throw new Error('tlottie input allocation failed');
    }

    let handle: TLottieHandle;
    try {
      new Uint8Array(this.exports.memory.buffer, pointer, bytes.length).set(bytes);
      handle = this.exports.tl_new(pointer, bytes.length);
    } finally {
      this.exports.tl_free(pointer, bytes.length);
    }

    if(!handle) {
      throw new Error('tlottie rejected the animation');
    }

    return {
      handle,
      width: this.exports.tl_width(handle),
      height: this.exports.tl_height(handle),
      frameRate: this.exports.tl_frame_rate(handle),
      frameCount: this.exports.tl_frame_count(handle)
    };
  }

  public destroyAnimation(handle: TLottieHandle) {
    this.exports.tl_drop(handle);
  }

  public render(handle: TLottieHandle, frame: number, width: number, height: number) {
    const pointer = this.exports.tl_render(handle, frame, width, height, 1);
    if(!pointer) {
      throw new Error('tlottie frame render failed');
    }

    // tl_render can grow memory. Always derive the view after the call and do
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
