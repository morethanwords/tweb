#!/bin/sh
#
# Runs every system over the test set, scores them and writes summary.md
# (README.md next to this script). Steps whose output exists are skipped.
#
# usage: sh scripts/noise-suppression-eval/run.sh [work dir]
#   RNNOISE_WASM     the RNNoise build to evaluate (default: src/vendor/rnnoise/rnnoise.wasm)
#   RNNOISE_WEIGHTS  the model it runs (default: src/vendor/rnnoise/weights.bin)
#   CAPTURES      Chrome captures at a time (default 1: more than one drops audio)
#   PYTHON        the interpreter with requirements.txt installed
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
WORK=${1:-$ROOT/tmp/noise-suppression-eval}
WASM=${RNNOISE_WASM:-$ROOT/src/vendor/rnnoise/rnnoise.wasm}
WEIGHTS=${RNNOISE_WEIGHTS:-$ROOT/src/vendor/rnnoise/weights.bin}
CAPTURES=${CAPTURES:-1}
PYTHON=${PYTHON:-python3}
cd "$WORK"

rnnoise() {
  node --no-warnings "$HERE/run_rnnoise.mjs" "$WASM" "$WEIGHTS" "$1" "$2"
}

# Clip by clip, each from a fresh state: RNNoise, and DeepFilterNet3 as the
# reference for a stronger model.
for subset in clean mix vb; do
  [ -d "out/rnnoise/$subset" ] || rnnoise "testset/$subset/noisy" "out/rnnoise/$subset"
  if [ ! -d "out/dfn3/$subset" ]; then
    mkdir -p "out/dfn3/$subset"
    ls "testset/$subset/noisy/"*.wav | xargs -n 50 -P 8 data/deepfilternet/deep-filter -D -o "out/dfn3/$subset" > /dev/null 2>&1
  fi
done

# As a microphone delivers it, clips back to back: through Chromium's own
# noise suppression (a fake capture device, in real time), RNNoise alone, and
# RNNoise after Chromium's suppression.
for subset in clean mix vb; do
  [ -f "stream/$subset.0.wav" ] || "$PYTHON" -I "$HERE/stream.py" "$WORK" build "$subset" 6
done

mkdir -p capture/chrome-ns
capture() {
  name=$(basename "$1" .wav)
  [ -f "capture/chrome-ns/$name.wav" ] ||
    node "$HERE/run_chrome.mjs" "$WORK/$1" "$WORK/capture/chrome-ns/$name.wav" ns > /dev/null
}
running=0
for file in stream/*.wav; do
  capture "$file" &
  running=$((running + 1))
  if [ "$running" -ge "$CAPTURES" ]; then
    wait
    running=0
  fi
done
wait

[ -d capture/rnnoise-stream ] || rnnoise stream capture/rnnoise-stream
[ -d capture/chrome-ns+rnnoise ] || rnnoise capture/chrome-ns capture/chrome-ns+rnnoise
for file in stream/*.wav; do
  name=$(basename "$file" .wav)
  subset=${name%.*}
  part=${name##*.}
  "$PYTHON" -I "$HERE/stream.py" "$WORK" cut rnnoise-stream "$subset" "$part" "capture/rnnoise-stream/$name.wav"
  "$PYTHON" -I "$HERE/stream.py" "$WORK" cut chrome-ns "$subset" "$part" "capture/chrome-ns/$name.wav" --refine
  "$PYTHON" -I "$HERE/stream.py" "$WORK" cut chrome-ns+rnnoise "$subset" "$part" "capture/chrome-ns+rnnoise/$name.wav" --refine
done

OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 NUMBA_NUM_THREADS=1 \
  "$PYTHON" -I -u "$HERE/score.py" "$WORK"
"$PYTHON" -I "$HERE/summary.py" "$WORK" --paired > summary.md
echo "$WORK/summary.md"
