/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

// Standalone, dependency-free feature detection for the WebCodecs-based voice
// recorder. Lives in its own file so that callers (e.g. bootstrapIm) can
// branch on native support WITHOUT pulling the recorder implementation,
// the OGG muxer, or the AudioWorklet source into their bundle.

export default function isNativeVoiceRecorderSupported(): boolean {
  return typeof AudioEncoder !== 'undefined' &&
    typeof AudioData !== 'undefined' &&
    typeof AudioWorkletNode !== 'undefined' &&
    typeof AudioContext !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia;
}
