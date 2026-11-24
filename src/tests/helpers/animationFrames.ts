/** Holds the frames the window is asked for instead of running them: a test runs them itself, `frames[i](time)` */
export function queueAnimationFrames() {
  const frames: FrameRequestCallback[] = [];
  const request = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  return {frames, request};
}
