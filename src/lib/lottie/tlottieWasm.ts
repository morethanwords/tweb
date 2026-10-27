import {createPeakRecorder, MemoryEvent} from '@lib/debug/memoryStats';

export type TLottieHandle = number;
export type TLottieFitzModifier = 0 | 1 | 2 | 3 | 4 | 5;

type TLottieExports = WebAssembly.Exports & {
  memory: WebAssembly.Memory,
  tlottie_alloc: (length: number) => number,
  tlottie_free: (pointer: number, length: number) => void,
  tlottie_new_with_options: (
    pointer: number,
    length: number,
    fitzModifier: TLottieFitzModifier,
    replacementsPointer: number,
    replacementsLength: number
  ) => TLottieHandle,
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
      return await WebAssembly.instantiateStreaming(response.clone(), {});
    } catch(err) {
      if(err instanceof WebAssembly.CompileError) {
        throw err;
      }

      // Some servers do not send application/wasm. The ArrayBuffer fallback
      // compiles the same response and preserves compatibility with them.
    }
  }

  return WebAssembly.instantiate(await response.arrayBuffer(), {});
};

// * Memory. tlottie keeps the model plus about three frame-sized buffers for every animation it holds,
// * and a WebAssembly heap only ever grows - while the lottie pool is SharedWorkers that outlive every
// * tab. Holding every animation that exists (a sticker bubble scrolled away keeps its player) is how a
// * tab reached 2.8 GB, 1.45 GB of it four lottie heaps. So an animation here is only a source plus,
// * while it is in use, an instance in the heap:
// * - one not rendered for a while can sleep: its instance is dropped, and its next render creates it
// *   again from the same source - an immutable Blob (or the JSON), nothing is fetched. The canvas keeps
// *   its last frame meanwhile;
// * - what is awake is kept under a budget - past it, the animations that have been idle longest sleep
// *   first. One that is playing never does, so nothing can be re-created over and over;
// * - once the heap is far bigger than what is awake, and what is awake is cheap to re-create, the
// *   whole instance is replaced by a fresh one - the only way to give the memory back. Everything
// *   sleeps in it and wakes on its next render.
// * Re-creating costs a parse of the JSON: ~2 ms for a typical sticker, ~13 ms for the largest bundled
// * animation.

// * of the estimate below, not of the heap - which runs about 2.5 times higher: free space, fragments
const AWAKE_BUDGET = 24 * 1024 * 1024;
// * rendered this recently = playing: never put to sleep for the budget
const PLAYING_WINDOW = 2000;
// * whatever has not been rendered for this long sleeps, budget or not
const IDLE_SLEEP = 2 * 60 * 1000;
// * how often the idle ones are looked for while anything is awake
const SWEEP_INTERVAL = 15 * 1000;
// * a scroll creates in bursts - let the budget catch up shortly after, not on every render
const BUDGET_DELAY = 1000;
// * a panel closing drops in bursts - let it settle before deciding on a fresh instance
const RECYCLE_DELAY = 5000;
// * a fresh instance is only worth it from this size, and when the heap is this many times the estimate
const RECYCLE_MIN_HEAP = 32 * 1024 * 1024;
// * ...but with nothing awake it costs nothing at all - nothing to re-create - so a smaller heap goes too
const RECYCLE_MIN_HEAP_ASLEEP = 8 * 1024 * 1024;
const RECYCLE_RATIO = 4;
// * ...and only while what is awake re-parses in a few milliseconds
const RECYCLE_MAX_AWAKE_SOURCE = 256 * 1024;
// * the estimate is an estimate: should it ever undershoot an animation badly enough to keep the
// * heap looking oversized, this caps the churn at one cheap re-parse a minute
const RECYCLE_MIN_INTERVAL = 60 * 1000;

type TLottieLiveAnimation = {
  pointer: number, // 0 while asleep
  source: Blob | string,
  fitzModifier: TLottieFitzModifier,
  sourceBytes: number,
  renderBytes: number, // of the last frame rendered
  renderedAt: number
};

// * what an awake animation holds in the heap, measured against the bundled animations: a model of
// * about four times its JSON, and about three buffers of its frame size
const estimateBytes = (animation: TLottieLiveAnimation) => {
  return animation.pointer ? 4 * animation.sourceBytes + 3 * animation.renderBytes : 0;
};

const newAnimationPointer = (
  exports: TLottieExports,
  bytes: Uint8Array,
  fitzModifier: TLottieFitzModifier
) => {
  const pointer = exports.tlottie_alloc(bytes.length);
  if(!pointer) {
    throw new Error('tlottie input allocation failed');
  }

  try {
    new Uint8Array(exports.memory.buffer, pointer, bytes.length).set(bytes);
    return exports.tlottie_new_with_options(pointer, bytes.length, fitzModifier, 0, 0);
  } finally {
    exports.tlottie_free(pointer, bytes.length);
  }
};

export class TLottieWasm {
  private exports: TLottieExports;
  private encoder = new TextEncoder();
  private staticAnimations = new Set<TLottieHandle>();
  // * handles given out are stable ids: an animation's pointer changes every time it wakes
  private animations = new Map<TLottieHandle, TLottieLiveAnimation>();
  private lastHandle = 0;
  private awake = 0;
  private awakeBytes = 0;
  private maintenanceTimeout: ReturnType<typeof setTimeout>;
  private maintenanceAt = Infinity;
  private recycledAt = -Infinity;
  // * the moments the heap set a record, with what was awake then - a sample minutes later cannot say
  public peaks = createPeakRecorder('wasmHeap', {min: 16 * 1024 * 1024});
  public wakes = 0;
  public recycles = 0;

  private constructor(exports: TLottieExports, private module: WebAssembly.Module) {
    this.exports = exports;
  }

  // * The heap of the current instance - the high-water mark of everything awake at once since the
  // * last fresh instance (see memoryStats).
  public get heapBytes() {
    return this.exports.memory.buffer.byteLength;
  }

  public get stats() {
    return {
      heapBytes: this.heapBytes,
      animations: this.animations.size,
      awake: this.awake,
      wakes: this.wakes,
      recycles: this.recycles
    };
  }

  public static async create(wasmUrl: string) {
    const {instance, module} = await instantiate(wasmUrl);
    return new TLottieWasm(instance.exports as TLottieExports, module);
  }

  // * `source` is what the animation is re-created from after it sleeps. A Blob costs this thread
  // * nothing to keep - its bytes live with the browser - but only a worker can read one back
  // * synchronously; without that the JSON itself is kept.
  public createAnimation(json: string, fitzModifier: TLottieFitzModifier = 0, source?: Blob): TLottieAnimation {
    if(!Number.isInteger(fitzModifier) || fitzModifier < 0 || fitzModifier > 5) {
      throw new RangeError(`Invalid tlottie Fitz modifier: ${fitzModifier}`);
    }

    const pointer = this.newPointer(json, fitzModifier);
    const handle = ++this.lastHandle;
    const keptSource = source && typeof(FileReaderSync) !== 'undefined' ? source : json;
    const animation: TLottieLiveAnimation = {
      pointer,
      source: keptSource,
      fitzModifier,
      sourceBytes: typeof(keptSource) === 'string' ? keptSource.length : keptSource.size,
      renderBytes: 0,
      renderedAt: performance.now()
    };
    this.animations.set(handle, animation);
    this.onWoken(animation);

    const rendererFrameCount = this.exports.tlottie_frame_count(pointer);
    const frameCount = getAuthoredFrameCount(json, rendererFrameCount);
    if(rendererFrameCount === 1 && frameCount > 1) {
      this.staticAnimations.add(handle);
    }

    return {
      handle,
      width: this.exports.tlottie_width(pointer),
      height: this.exports.tlottie_height(pointer),
      frameRate: this.exports.tlottie_frame_rate(pointer),
      // Upstream collapses proven-static compositions to one render frame.
      // Keep their authored duration for the player's loop/onComplete timing.
      frameCount
    };
  }

  public destroyAnimation(handle: TLottieHandle) {
    const animation = this.animations.get(handle);
    if(!animation) {
      return;
    }

    this.sleep(animation);
    this.animations.delete(handle);
    this.staticAnimations.delete(handle);
    this.requestMaintenance(RECYCLE_DELAY);
  }

  public render(handle: TLottieHandle, frame: number, width: number, height: number) {
    const animation = this.animations.get(handle);
    if(!animation) {
      throw new Error('tlottie animation is destroyed');
    }

    if(!animation.pointer) {
      const {source} = animation;
      const json = typeof(source) === 'string' ? source : new FileReaderSync().readAsText(source);
      animation.pointer = this.newPointer(json, animation.fitzModifier);
      ++this.wakes;
      this.onWoken(animation);
    }

    animation.renderedAt = performance.now();
    const renderBytes = width * height * 4;
    if(animation.renderBytes !== renderBytes) {
      this.awakeBytes -= estimateBytes(animation);
      animation.renderBytes = renderBytes;
      this.awakeBytes += estimateBytes(animation);
      this.checkBudget();
    }

    const rendererFrame = this.staticAnimations.has(handle) ? 0 : frame;
    const pointer = this.exports.tlottie_render(animation.pointer, rendererFrame, width, height, 1);
    if(!pointer) {
      throw new Error('tlottie frame render failed');
    }

    this.noteHeap(animation);

    // tlottie_render can grow memory, and a fresh instance replaces it. Always derive the view after
    // the call and do not retain it beyond the immediate copy into ImageData/output buffers.
    return new Uint8Array(this.exports.memory.buffer, pointer, width * height * 4);
  }

  // * Puts everything to sleep in a fresh instance and drops the old one with its heap; each animation
  // * wakes on its next render. Exposed for tests - maintenance decides when it pays.
  public recycle() {
    let exports: TLottieExports;
    try {
      exports = new WebAssembly.Instance(this.module, {}).exports as TLottieExports;
    } catch(err) {
      console.error('tlottie: no fresh instance, keeping the current heap:', err);
      return false;
    }

    // * nothing is dropped one by one: the old instance goes as a whole
    this.exports = exports;
    for(const animation of this.animations.values()) {
      animation.pointer = 0;
    }

    this.awake = this.awakeBytes = 0;
    this.recycledAt = performance.now();
    this.peaks.reset();
    ++this.recycles;
    return true;
  }

  private newPointer(json: string, fitzModifier: TLottieFitzModifier) {
    const pointer = newAnimationPointer(this.exports, this.encoder.encode(json), fitzModifier);
    if(!pointer) {
      throw new Error('tlottie rejected the animation');
    }

    return pointer;
  }

  private onWoken(animation: TLottieLiveAnimation) {
    ++this.awake;
    this.awakeBytes += estimateBytes(animation);
    this.noteHeap(animation);
    this.checkBudget();
    this.requestMaintenance(SWEEP_INTERVAL);
  }

  private noteHeap(animation: TLottieLiveAnimation) {
    this.peaks.observe(this.heapBytes, () => ({
      animations: this.animations.size,
      awake: this.awake,
      awakeEstimateBytes: this.awakeBytes,
      frameBytes: animation.renderBytes,
      sourceBytes: animation.sourceBytes
    }));
  }

  private sleep(animation: TLottieLiveAnimation) {
    if(!animation.pointer) {
      return;
    }

    this.awakeBytes -= estimateBytes(animation);
    --this.awake;
    this.exports.tlottie_drop(animation.pointer);
    animation.pointer = 0;
  }

  private checkBudget() {
    if(this.awakeBytes > AWAKE_BUDGET) {
      this.requestMaintenance(BUDGET_DELAY);
    }
  }

  // * One timer for all of it, due at the earliest moment anything asked for
  private requestMaintenance(delay: number) {
    const at = performance.now() + delay;
    if(at >= this.maintenanceAt) {
      return;
    }

    clearTimeout(this.maintenanceTimeout);
    this.maintenanceAt = at;
    this.maintenanceTimeout = setTimeout(this.maintain, delay);
  }

  private maintain = () => {
    this.maintenanceAt = Infinity;
    this.maintenanceTimeout = undefined;

    const now = performance.now();
    const idle: TLottieLiveAnimation[] = [];
    for(const animation of this.animations.values()) {
      if(!animation.pointer) {
        continue;
      }

      const idleFor = now - animation.renderedAt;
      if(idleFor >= IDLE_SLEEP) {
        this.sleep(animation);
      } else if(idleFor >= PLAYING_WINDOW) {
        idle.push(animation);
      }
    }

    if(this.awakeBytes > AWAKE_BUDGET) {
      idle.sort((a, b) => a.renderedAt - b.renderedAt);
      for(const animation of idle) {
        if(this.awakeBytes <= AWAKE_BUDGET) {
          break;
        }

        this.sleep(animation);
      }
    }

    if(this.isRecycleWorthIt()) {
      // * too soon after the last one: come back when it is allowed - nothing else may, if nothing is awake
      const wait = this.recycledAt + RECYCLE_MIN_INTERVAL - now;
      if(wait > 0) {
        this.requestMaintenance(wait);
      } else {
        this.recycle();
      }
    }

    if(this.awakeBytes > AWAKE_BUDGET) {
      // * still over: what played a moment ago goes idle soon - look again then, not a sweep later
      this.requestMaintenance(PLAYING_WINDOW);
    } else if(this.awake) {
      this.requestMaintenance(SWEEP_INTERVAL);
    }
  };

  private isRecycleWorthIt() {
    const heapBytes = this.heapBytes;
    const minHeap = this.awake ? RECYCLE_MIN_HEAP : RECYCLE_MIN_HEAP_ASLEEP;
    if(heapBytes < minHeap || heapBytes < RECYCLE_RATIO * this.awakeBytes) {
      return false;
    }

    let awakeSourceBytes = 0;
    for(const animation of this.animations.values()) {
      if(animation.pointer) {
        awakeSourceBytes += animation.sourceBytes;
      }
    }

    return awakeSourceBytes <= RECYCLE_MAX_AWAKE_SOURCE;
  }
}

const tlottiePromises = new Map<string, Promise<TLottieWasm>>();
const loadedWasms = new Set<TLottieWasm>();

// * Sums the wasm heaps this thread has instantiated; a lottie worker's real cost is mostly here,
// * not in its JS heap, and it is invisible to performance.memory.
export function getTLottieMemoryStats() {
  const total = {heapBytes: 0, animations: 0, awake: 0, wakes: 0, recycles: 0};
  const events: MemoryEvent[] = [];
  for(const wasm of loadedWasms) {
    const stats = wasm.stats;
    for(const key in total) {
      total[key as keyof typeof total] += stats[key as keyof typeof total];
    }

    events.push(...wasm.peaks.events);
  }

  return {...total, events};
}

export default function loadTLottieWasm(wasmUrl: string) {
  let promise = tlottiePromises.get(wasmUrl);
  if(!promise) {
    promise = TLottieWasm.create(wasmUrl);
    tlottiePromises.set(wasmUrl, promise);
    promise.then((wasm) => loadedWasms.add(wasm), () => {});
    promise.catch(() => {
      if(tlottiePromises.get(wasmUrl) === promise) {
        tlottiePromises.delete(wasmUrl);
      }
    });
  }

  return promise;
}
