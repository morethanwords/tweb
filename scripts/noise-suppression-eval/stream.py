"""Continuous-stream evaluation: clips played back to back, the way a
microphone delivers them, for systems that must run in real time (Chrome's
WebRTC noise suppression behind a fake capture device) and for the systems
compared with them on exactly the same input.

  build <subset> <parts>       stream/<subset>.<k>.wav (+ .json): every clip
                               preceded by 0.5 s of its own noise (mirrored,
                               so it joins without a click) and 0.2 s apart
  cut <system> <subset> <k> <processed.wav> [--refine]
                               finds the processed stream's offset, cuts it
                               back into out/<system>/<subset>/<id>.wav;
                               --refine re-aligns each clip within +-20 ms
                               (a real-time capture may slip)

usage: stream.py <work dir> build|cut ...
"""
import json
import os
import sys

import numpy as np
import soundfile as sf
from scipy.signal import fftconvolve

RATE = 48000
PREROLL = RATE // 2
GAP = RATE // 5
LEAD = int(1.5 * RATE)
SLIP = RATE // 5

E = sys.argv[1]
TESTSET = os.path.join(E, 'testset')
STREAM = os.path.join(E, 'stream')


def subset_ids(subset):
    with open(os.path.join(TESTSET, 'manifest.json')) as f:
        items = json.load(f)[subset]
    if subset == 'vb':
        items = items[::int(os.environ.get('VB_EVERY', '3'))]
    return [item['id'] for item in items]


def build(subset, parts):
    ids = subset_ids(subset)
    os.makedirs(STREAM, exist_ok=True)
    for k in range(parts):
        chunk = ids[k::parts]
        pieces = [np.zeros(LEAD)]
        position = LEAD
        index = []
        for clip_id in chunk:
            noisy, _ = sf.read(os.path.join(TESTSET, subset, 'noisy', clip_id + '.wav'), dtype='float64')
            clean, _ = sf.read(os.path.join(TESTSET, subset, 'clean', clip_id + '.wav'), dtype='float64')
            noise = noisy - clean
            pre = noise[:PREROLL]
            while len(pre) < PREROLL:
                pre = np.concatenate([pre, pre])
            pre = pre[:PREROLL][::-1].copy()
            pre[:480] *= np.linspace(0, 1, 480)
            pieces += [pre, noisy, np.zeros(GAP)]
            index.append({'id': clip_id, 'start': position + PREROLL, 'length': len(noisy)})
            position += PREROLL + len(noisy) + GAP
        stream = np.concatenate(pieces + [np.zeros(RATE)])
        name = os.path.join(STREAM, f'{subset}.{k}')
        sf.write(name + '.wav', np.clip(stream, -1, 1), RATE, subtype='PCM_16')
        with open(name + '.json', 'w') as f:
            json.dump(index, f)
        print(name, len(chunk), 'clips', round(len(stream) / RATE, 1), 's')


def xcorr_lag(reference, signal, max_lag):
    corr = fftconvolve(signal, reference[::-1], mode='full')
    zero = len(reference) - 1
    lo = max(0, zero - max_lag)
    return lo + int(np.argmax(corr[lo:zero + max_lag + 1])) - zero


def cut(system, subset, k, processed_path, refine):
    name = os.path.join(STREAM, f'{subset}.{k}')
    source, _ = sf.read(name + '.wav', dtype='float64')
    with open(name + '.json') as f:
        index = json.load(f)
    processed, rate = sf.read(processed_path, dtype='float64')
    if processed.ndim > 1:
        processed = processed[:, 0]
    assert rate == RATE, rate
    window = slice(0, min(len(source), 20 * RATE))
    offset = xcorr_lag(source[window], processed[:min(len(processed), 25 * RATE)], 3 * RATE)
    out_dir = os.path.join(E, 'out', system, subset)
    os.makedirs(out_dir, exist_ok=True)
    slips = []
    glitched = []
    for clip in index:
        start = clip['start'] + offset
        if refine:
            # A capture that drops audio slips by whole buffers: find where
            # each half of the clip landed; halves that disagree mean audio
            # went missing inside the clip, which no alignment repairs.
            half = clip['length'] // 2
            lags = []
            for begin, length in ((0, half), (half, clip['length'] - half)):
                reference = source[clip['start'] + begin:clip['start'] + begin + length]
                lo = max(0, start + begin - SLIP)
                segment = processed[lo:start + begin + length + SLIP]
                lags.append(xcorr_lag(reference, segment, SLIP) - (start + begin - lo))
            if abs(lags[0] - lags[1]) > 120:
                glitched.append(clip['id'])
            start += lags[0]
            slips.append(lags[0])
        piece = processed[max(0, start):start + clip['length']]
        piece = np.concatenate([piece, np.zeros(clip['length'] - len(piece))])
        sf.write(os.path.join(out_dir, clip['id'] + '.wav'), piece.astype(np.float32), RATE, subtype='FLOAT')
    glitch_file = os.path.join(out_dir, '_glitched.json')
    previous = json.load(open(glitch_file)) if os.path.exists(glitch_file) else []
    ids = {clip['id'] for clip in index}
    with open(glitch_file, 'w') as f:
        json.dump(sorted({g for g in previous if g not in ids} | set(glitched)), f)
    print(system, subset, k, 'offset', offset, 'slips', (min(slips), max(slips)) if slips else '-', 'glitched', len(glitched), 'of', len(index))


if __name__ == '__main__':
    command = sys.argv[2]
    if command == 'build':
        build(sys.argv[3], int(sys.argv[4]))
    else:
        cut(sys.argv[3], sys.argv[4], int(sys.argv[5]), sys.argv[6], '--refine' in sys.argv)
