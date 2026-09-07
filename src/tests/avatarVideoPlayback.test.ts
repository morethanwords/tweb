import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const state = vi.hoisted(() => ({
  observe: undefined as (entries: any[]) => void,
  idle: false,
  videoAvailable: true,
  unpin: vi.fn()
}));

vi.mock('@config/debug', () => ({MOUNT_CLASS_TO: undefined, DEBUG: false}));
vi.mock('@stores/appSettings', () => ({useAppSettings: () => [{stickers: {loop: true}}]}));
vi.mock('@helpers/liteMode', () => ({default: {isAvailable: () => state.videoAvailable}}));
vi.mock('@helpers/objectUrl', () => ({pinObjectURL: () => state.unpin}));
vi.mock('@helpers/idleController', () => ({default: {
  get isIdle() { return state.idle; },
  addEventListener: vi.fn()
}}));
vi.mock('@helpers/appWindow', () => ({
  onAppWindowChange: vi.fn(),
  getAppWindow: () => ({IntersectionObserver: class {
    constructor(callback: typeof state.observe) { state.observe = callback; }
    observe() {}
    unobserve() {}
    disconnect() {}
  }})
}));

import animationIntersector from '@components/animationIntersector';
import createAvatarVideo from '@components/createAvatarVideo';
import {getMiddleware} from '@helpers/middleware';

describe('avatar video playback', () => {
  let lifecycle: ReturnType<typeof getMiddleware>;
  let video: HTMLVideoElement;
  let paused: boolean;
  let readyState: number;
  let play: ReturnType<typeof vi.spyOn>;

  const intersect = (visible: boolean) => state.observe([{target: video, isIntersecting: visible}]);
  const ready = () => {
    readyState = HTMLMediaElement.HAVE_CURRENT_DATA;
    video.dispatchEvent(new Event('loadedmetadata'));
    video.dispatchEvent(new Event('loadeddata'));
    video.dispatchEvent(new Event('canplay'));
  };
  const endLoop = () => {
    paused = true;
    video.currentTime = 5;
    video.dispatchEvent(new Event('ended'));
  };

  beforeEach(() => {
    state.idle = false;
    state.videoAvailable = true;
    state.unpin.mockClear();
    paused = true;
    readyState = 0;
    play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => {
      paused = false;
      return Promise.resolve();
    });
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => { paused = true; });
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    lifecycle = getMiddleware();
    video = createAvatarVideo('blob:avatar', 2, lifecycle.get(), 3);
    Object.defineProperties(video, {
      paused: {get: () => paused},
      readyState: {get: () => readyState}
    });
    document.body.append(video);
  });

  afterEach(() => {
    lifecycle.destroy();
    vi.restoreAllMocks();
  });

  it('waits for visibility and the cover seek before playing', () => {
    intersect(true);
    expect(play).not.toHaveBeenCalled();
    ready();
    expect(video.currentTime).toBe(2);
    expect(video.autoplay).toBe(false);
    expect(paused).toBe(false);
  });

  it('does not restart from load events after scrolling off-screen', () => {
    intersect(true);
    intersect(false);
    ready();
    expect(play).not.toHaveBeenCalled();
    intersect(true);
    expect(paused).toBe(false);
    intersect(false);
    video.dispatchEvent(new Event('canplay'));
    expect(paused).toBe(true);
  });

  it('keeps a late-loading video paused while idle or locked', () => {
    intersect(true);
    state.idle = true;
    ready();
    expect(paused).toBe(true);
    state.idle = false;
    animationIntersector.toggleVideosUnder(document.body, true);
    video.dispatchEvent(new Event('canplay'));
    expect(paused).toBe(true);
    animationIntersector.toggleVideosUnder(document.body, false);
    expect(paused).toBe(false);
  });

  it('pauses on removal and resumes when the same list row is reinserted', () => {
    ready();
    intersect(true);
    video.remove();
    intersect(false);
    expect(paused).toBe(true);
    expect(animationIntersector.getAnimations(video)).toHaveLength(1);
    document.body.append(video);
    intersect(true);
    expect(paused).toBe(false);
  });

  it('releases playback and its object URL on cleanup', () => {
    intersect(true);
    lifecycle.clean();
    ready();
    expect(play).not.toHaveBeenCalled();
    expect(video.isConnected).toBe(false);
    expect(animationIntersector.getAnimations(video)).toHaveLength(0);
    expect(state.unpin).toHaveBeenCalledOnce();
  });

  it('does not start if video animations were disabled while loading', () => {
    intersect(true);
    state.videoAvailable = false;
    ready();
    expect(paused).toBe(true);
  });

  it('cleans up a locked profile avatar through its parent middleware', () => {
    const profile = lifecycle.get().create();
    const profileVideo = createAvatarVideo('blob:profile-avatar', 0, profile.get());
    document.body.append(profileVideo);
    animationIntersector.toggleVideosUnder(document.body, true);

    lifecycle.clean();
    expect(animationIntersector.getAnimations(profileVideo)).toHaveLength(0);
    expect(profileVideo.hasAttribute('src')).toBe(false);
    expect(profileVideo.isConnected).toBe(false);
    expect(state.unpin).toHaveBeenCalledTimes(2);
  });

  it('stops after three repeats and cannot restart on readiness or focus changes', () => {
    ready();
    intersect(true);
    expect(video.loop).toBe(false);
    endLoop();
    expect(paused).toBe(false);
    endLoop();
    expect(paused).toBe(false);
    endLoop();
    expect(paused).toBe(true);
    expect(video.currentTime).toBe(5);
    expect(play).toHaveBeenCalledTimes(3);

    video.dispatchEvent(new Event('canplay'));
    animationIntersector.checkAnimations2(true);
    animationIntersector.checkAnimations2(false);
    expect(paused).toBe(true);
    expect(play).toHaveBeenCalledTimes(3);
  });

  it('resets the repeat budget when a list row is detached and reinserted', () => {
    ready();
    intersect(true);
    endLoop();
    endLoop();
    endLoop();
    expect(paused).toBe(true);

    video.remove();
    intersect(false);
    document.body.append(video);
    intersect(true);
    expect(paused).toBe(false);
    endLoop();
    endLoop();
    endLoop();
    expect(paused).toBe(true);
    expect(play).toHaveBeenCalledTimes(6);
  });

  it('does not reset the repeat budget when pausing and resuming', () => {
    ready();
    intersect(true);
    endLoop();
    animationIntersector.toggleVideosUnder(document.body, true);
    animationIntersector.toggleVideosUnder(document.body, false);
    endLoop();
    endLoop();
    expect(paused).toBe(true);
  });

  it('retains native looping for full profile avatars', () => {
    const profileVideo = createAvatarVideo('blob:profile-avatar', 0, lifecycle.get());
    expect(profileVideo.loop).toBe(true);
  });
});
