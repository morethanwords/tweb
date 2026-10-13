"""Scores noise-suppressor outputs against the clean references.

For every system in out/<system>/<subset>/<id>.wav (plus 'noisy', the
unprocessed input) and every subset of the test set:
  - the system's constant delay is measured once (median cross-correlation
    lag against the clean speech) and removed;
  - per clip: PESQ-WB, STOI, SI-SDR (all at 16 kHz), DNSMOS P.835 SIG/BAK/OVRL
    and P.808, and the change of the speech level in dB.

usage: score.py <work dir> [system ...]
Writes out/scores/<system>.<subset>.json and prints the mean PESQ of each;
a system already scored is skipped unless RESCORE=1. SCORE_WORKERS sets the
processes (default 8), VB_EVERY which VoiceBank clips count (default 3).
"""
import json
import os
import sys
from multiprocessing import Pool

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly, fftconvolve

E = sys.argv[1]
TESTSET = os.path.join(E, 'testset')
OUT = os.path.join(E, 'out')
SCORES = os.path.join(OUT, 'scores')
DNSMOS_DIR = os.path.join(E, 'data', 'dnsmos')
RATE = 48000
MAX_LAG = RATE // 10

_dnsmos = None


def dnsmos():
    global _dnsmos
    if _dnsmos is None:
        # onnxruntime starts its telemetry on import (and tries to send it);
        # disable_telemetry_events() alone comes too late.
        os.environ['ORT_DISABLE_TELEMETRY'] = '1'
        import onnxruntime as ort
        ort.disable_telemetry_events()
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 1
        opts.inter_op_num_threads = 1
        _dnsmos = (
            ort.InferenceSession(os.path.join(DNSMOS_DIR, 'sig_bak_ovr.onnx'), opts),
            ort.InferenceSession(os.path.join(DNSMOS_DIR, 'model_v8.onnx'), opts)
        )
    return _dnsmos


def dnsmos_scores(audio16):
    import librosa
    primary, p808 = dnsmos()
    length = int(9.01 * 16000)
    audio = audio16.astype(np.float32)
    while len(audio) < length:
        audio = np.concatenate([audio, audio])
    hops = int(np.floor(len(audio) / 16000) - 9.01) + 1
    sig, bak, ovr, mos = [], [], [], []
    for k in range(hops):
        seg = audio[k * 16000:k * 16000 + length]
        if len(seg) < length:
            continue
        mel = librosa.feature.melspectrogram(y=seg[:-160], sr=16000, n_fft=321, hop_length=160, n_mels=120)
        mel = ((librosa.power_to_db(mel, ref=np.max) + 40) / 40).T
        mos.append(p808.run(None, {'input_1': mel[np.newaxis].astype(np.float32)})[0][0][0])
        s, b, o = primary.run(None, {'input_1': seg[np.newaxis]})[0][0]
        sig.append(np.poly1d([-0.08397278, 1.22083953, 0.0052439])(s))
        bak.append(np.poly1d([-0.13166888, 1.60915514, -0.39604546])(b))
        ovr.append(np.poly1d([-0.06766283, 1.11546468, 0.04602535])(o))
    return float(np.mean(sig)), float(np.mean(bak)), float(np.mean(ovr)), float(np.mean(mos))


def si_sdr(ref, est):
    ref = ref - ref.mean()
    est = est - est.mean()
    target = (est @ ref) / (ref @ ref + 1e-20) * ref
    return float(10 * np.log10((target @ target) / ((est - target) @ (est - target) + 1e-20) + 1e-20))


def speech_frames(ref):
    frame = RATE // 100
    n = len(ref) // frame
    energy = (ref[:n * frame].reshape(n, frame) ** 2).mean(axis=1)
    return energy > energy.max() * 1e-3, frame, n


def read(path):
    x, rate = sf.read(path, dtype='float64')
    if x.ndim > 1:
        x = x.mean(axis=1)
    if rate != RATE:
        x = resample_poly(x, RATE, rate)
    return x


def lag_of(ref, est):
    corr = fftconvolve(est, ref[::-1], mode='full')
    zero = len(ref) - 1
    window = corr[zero - MAX_LAG:zero + MAX_LAG + 1]
    return int(np.argmax(window)) - MAX_LAG


def align(est, lag, length):
    if lag > 0:
        est = est[lag:]
    elif lag < 0:
        est = np.concatenate([np.zeros(-lag), est])
    if len(est) < length:
        est = np.concatenate([est, np.zeros(length - len(est))])
    return est[:length]


def system_path(system, subset, clip_id):
    if system == 'noisy':
        return os.path.join(TESTSET, subset, 'noisy', clip_id + '.wav')
    return os.path.join(OUT, system, subset, clip_id + '.wav')


def score_clip(args):
    system, subset, clip_id, lag = args
    from pesq import pesq
    from pystoi import stoi
    ref = read(os.path.join(TESTSET, subset, 'clean', clip_id + '.wav'))
    est = align(read(system_path(system, subset, clip_id)), lag, len(ref))
    ref16 = resample_poly(ref, 1, 3)
    est16 = resample_poly(est, 1, 3)
    result = {'id': clip_id}
    try:
        result['pesq'] = float(pesq(16000, ref16, est16, 'wb'))
    except Exception:
        result['pesq'] = None
    result['stoi'] = float(stoi(ref16, est16, 16000, extended=False))
    result['si_sdr'] = si_sdr(ref16, est16)
    result['sig'], result['bak'], result['ovrl'], result['p808'] = dnsmos_scores(est16)
    active, frame, n = speech_frames(ref)
    ref_energy = (ref[:n * frame].reshape(n, frame) ** 2).mean(axis=1)[active].sum()
    est_energy = (est[:n * frame].reshape(n, frame) ** 2).mean(axis=1)[active].sum()
    result['speech_gain_db'] = float(10 * np.log10((est_energy + 1e-20) / (ref_energy + 1e-20)))
    return result


def measure_lag(system, subset, ids):
    lags = []
    for clip_id in ids[:30]:
        ref = read(os.path.join(TESTSET, subset, 'clean', clip_id + '.wav'))
        est = read(system_path(system, subset, clip_id))
        lags.append(lag_of(ref, est))
    return int(np.median(lags)), int(np.min(lags)), int(np.max(lags))


def main():
    with open(os.path.join(TESTSET, 'manifest.json')) as f:
        manifest = json.load(f)
    # DNSMOS costs ~2 s a clip: every third VoiceBank+DEMAND clip (275 of 824).
    manifest['vb'] = manifest['vb'][::int(os.environ.get('VB_EVERY', '3'))]
    systems = sys.argv[2:] or ['noisy'] + sorted(d for d in os.listdir(OUT) if d not in ('scores',) and os.path.isdir(os.path.join(OUT, d)))
    os.makedirs(SCORES, exist_ok=True)
    with Pool(int(os.environ.get('SCORE_WORKERS', '8'))) as pool:
        for system in systems:
            for subset, items in manifest.items():
                if os.path.exists(os.path.join(SCORES, f'{system}.{subset}.json')) and not os.environ.get('RESCORE'):
                    continue
                ids = [item['id'] for item in items]
                if system != 'noisy' and not os.path.isdir(os.path.join(OUT, system, subset)):
                    continue
                lag, lag_min, lag_max = measure_lag(system, subset, ids)
                results = pool.map(score_clip, [(system, subset, clip_id, lag) for clip_id in ids], chunksize=4)
                meta = {item['id']: item for item in items}
                for r in results:
                    r.update({k: v for k, v in meta[r['id']].items() if k in ('group', 'snr')})
                with open(os.path.join(SCORES, f'{system}.{subset}.json'), 'w') as f:
                    json.dump({'system': system, 'subset': subset, 'lag': lag, 'lag_range': [lag_min, lag_max], 'clips': results}, f)
                print(system, subset, 'lag', lag, (lag_min, lag_max), 'pesq', round(np.nanmean([r['pesq'] or np.nan for r in results]), 3), flush=True)


if __name__ == '__main__':
    main()
