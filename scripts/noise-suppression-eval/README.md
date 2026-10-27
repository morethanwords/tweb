# Noise-suppression bench

Scores what a noise suppressor does to speech and noise, so the one the calls
ship (`src/lib/calls/noiseSuppression`, RNNoise from `src/vendor/rnnoise`) can
be compared with the browser's own suppression, with other models, and with
other apps.

## Setup

Linux x86_64, Node with the repo's `node_modules` (Playwright's Chromium for
the captures), Python 3.12 with `requirements.txt`, for example:

```bash
uv venv --python 3.12 tmp/noise-suppression-eval/venv
uv pip install --python tmp/noise-suppression-eval/venv/bin/python -r scripts/noise-suppression-eval/requirements.txt
export PYTHON=$PWD/tmp/noise-suppression-eval/venv/bin/python
sh scripts/noise-suppression-eval/setup.sh   # ~1 GB of downloads, checked; ~3 GB on disk with the test set
sh scripts/noise-suppression-eval/run.sh     # ~1 h; writes tmp/noise-suppression-eval/summary.md
```

Everything lands in `tmp/noise-suppression-eval` (or the work dir passed to
both scripts); a step whose output exists is skipped, so deleting
`out/<system>` and `out/scores/<system>.*` re-runs just that system.

## Test set (`make_testset.py`)

48 kHz mono, three subsets:

- `vb` — the [VoiceBank+DEMAND](https://datashare.ed.ac.uk/handle/10283/2791) test set as published (CC BY 4.0): real fullband
  noise at 2.5–17.5 dB SNR, comparable with published numbers. Every third
  clip is scored (275 of 824), as DNSMOS costs about 2 s a clip. Its noise is
  DEMAND's, which RNNoise 0.2's README recommends training on, so it is not
  held out for 0.2: compare RNNoise models on `mix`.
- `mix` — the same speakers mixed with [MS-SNSD](https://github.com/microsoft/MS-SNSD) noises (MIT) in three groups —
  stationary (air conditioner, vacuum cleaner…), transient (typing, doors,
  chewing, dishes…) and babble (voices, cafés, announcements) — at 0, 5, 10
  and 20 dB, 20 clips each. MS-SNSD is 16 kHz, so this noise stops at 8 kHz.
- `clean` — speech with nothing but a −80 dBFS floor: what a suppressor does
  to a voice in a quiet room.

## Systems

- `noisy` — the input, unprocessed.
- `rnnoise`, `dfn3` — RNNoise (`RNNOISE_WASM` and `RNNOISE_WEIGHTS`, the
  vendored build and model by default, run through the same `RnnoiseDenoiser`
  the AudioWorklet uses) and
  [DeepFilterNet3](https://github.com/Rikorose/DeepFilterNet), clip by clip from a fresh state.
- `chrome-ns`, `rnnoise-stream`, `chrome-ns+rnnoise` — the clips played back to
  back the way a microphone delivers them (`stream.py build`: each preceded by
  half a second of its own noise): through Chromium's WebRTC noise suppression
  (`run_chrome.mjs` plays the stream into a fake capture device and records
  what `getUserMedia({noiseSuppression: true})` returns, in real time), through
  RNNoise alone, and through RNNoise after Chromium.

A real-time capture sometimes drops a buffer. `stream.py cut --refine` finds
each clip in the capture and lists those with audio missing inside in
`out/<system>/<subset>/_glitched.json`; `summary.py --paired` compares all
systems on the clips none of them lost.

## Metrics (`score.py`)

Each system's constant delay is found by cross-correlation and removed. Per
clip, at 16 kHz: PESQ-WB, STOI, SI-SDR, and DNSMOS P.835 (SIG — the speech,
BAK — the background, OVRL) and P.808, plus the change in speech level.
PESQ, STOI and SI-SDR need the clean reference; DNSMOS does not, which is
why it is the one to read for recordings made elsewhere.

## Other apps (Krisp in Discord, Meet)

Their models only run inside their apps, so they are measured the way
Chromium is: play `stream/<subset>.<k>.wav` into a call as the microphone (a
virtual audio device), record what the other side receives, then

```bash
python -I scripts/noise-suppression-eval/stream.py tmp/noise-suppression-eval cut krisp mix 0 recording.wav --refine
python -I scripts/noise-suppression-eval/score.py tmp/noise-suppression-eval krisp
```

That recording has also been through the app's codec and network, so compare
it with tweb measured the same way rather than with the offline numbers.
