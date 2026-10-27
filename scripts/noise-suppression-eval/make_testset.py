"""Builds the noise-suppression test set (48 kHz mono float32 WAV).

Subsets (testset/<subset>/{noisy,clean}/<id>.wav + testset/manifest.json):
  vb     VoiceBank+DEMAND test set as published (824 pairs, real fullband
         DEMAND noise at 2.5-17.5 dB SNR) - comparable with published numbers.
  mix    VCTK speech from the same test set mixed with MS-SNSD noises in three
         groups (stationary, transient, babble) at 0/5/10/20 dB SNR. MS-SNSD is
         16 kHz, so this noise has nothing above 8 kHz.
  clean  clean speech only: what a suppressor does to speech without noise.

usage: make_testset.py <data dir> <out dir>
"""
import json
import os
import random
import sys

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

RATE = 48000
SPEECH_LEVEL_DB = -26.0
LEAD_S, TAIL_S = 0.5, 0.3
SNRS = [0, 5, 10, 20]
PER_CELL = 20
CLEAN_COUNT = 40

GROUPS = {
    'stationary': ['AirConditioner', 'VacuumCleaner', 'CopyMachine', 'WasherDryer', 'Car', 'Bus', 'Metro', 'Station', 'Hallway', 'Field'],
    'transient': ['Typing', 'ShuttingDoor', 'SqueakyChair', 'Munching', 'Kitchen', 'Washing', 'Traffic'],
    'babble': ['Babble', 'NeighborSpeaking', 'Neighbor', 'AirportAnnouncements', 'AirportAnnouncement', 'Cafe', 'CafeTeria', 'Restaurant', 'Office']
}

data_dir, out_dir = sys.argv[1], sys.argv[2]
rng = random.Random(20261009)


def active_level_db(x):
    frame = RATE // 100
    n = len(x) // frame
    energy = (x[:n * frame].reshape(n, frame) ** 2).mean(axis=1)
    active = energy[energy > energy.max() * 1e-4]
    return 10 * np.log10(active.mean() + 1e-20)


def write(subset, kind, clip_id, x):
    path = os.path.join(out_dir, subset, kind)
    os.makedirs(path, exist_ok=True)
    sf.write(os.path.join(path, clip_id + '.wav'), x.astype(np.float32), RATE, subtype='FLOAT')


def load_noises():
    noises = {group: [] for group in GROUPS}
    for folder in ['noise_test', 'noise_train']:
        root = os.path.join(data_dir, 'ms-snsd', folder)
        for name in sorted(os.listdir(root)):
            if not name.endswith('.wav'):
                continue
            category = name.rsplit('_', 1)[0]
            group = next((g for g, cats in GROUPS.items() if category in cats), None)
            if group is None:
                continue
            x, rate = sf.read(os.path.join(root, name), dtype='float64')
            if x.ndim > 1:
                x = x[:, 0]
            x = resample_poly(x, RATE, rate)
            noises[group].append((name, x))
    return noises


manifest = {'vb': [], 'mix': [], 'clean': []}
speech_dir = os.path.join(data_dir, 'valentini', 'clean_testset_wav')
noisy_dir = os.path.join(data_dir, 'valentini', 'noisy_testset_wav')
names = sorted(n for n in os.listdir(speech_dir) if n.endswith('.wav'))

for name in names:
    clip_id = name[:-4]
    clean, rate = sf.read(os.path.join(speech_dir, name), dtype='float64')
    noisy, _ = sf.read(os.path.join(noisy_dir, name), dtype='float64')
    assert rate == RATE
    write('vb', 'clean', clip_id, clean)
    write('vb', 'noisy', clip_id, noisy)
    manifest['vb'].append({'id': clip_id})

noises = load_noises()
speech_pool = names[:]
rng.shuffle(speech_pool)
speech_iter = iter(speech_pool * 4)
for group, items in noises.items():
    for snr in SNRS:
        for k in range(PER_CELL):
            speech_name = next(speech_iter)
            speech, _ = sf.read(os.path.join(speech_dir, speech_name), dtype='float64')
            speech *= 10 ** ((SPEECH_LEVEL_DB - active_level_db(speech)) / 20)
            lead, tail = int(LEAD_S * RATE), int(TAIL_S * RATE)
            clean = np.concatenate([np.zeros(lead), speech, np.zeros(tail)])
            noise_name, noise = items[rng.randrange(len(items))]
            while len(noise) < len(clean):
                noise = np.concatenate([noise, noise])
            start = rng.randrange(len(noise) - len(clean) + 1)
            noise = noise[start:start + len(clean)].copy()
            noise_db = 10 * np.log10((noise ** 2).mean() + 1e-20)
            noise *= 10 ** ((SPEECH_LEVEL_DB - snr - noise_db) / 20)
            noisy = clean + noise
            peak = np.abs(noisy).max()
            if peak > 0.98:
                clean *= 0.98 / peak
                noisy *= 0.98 / peak
            clip_id = f'{group}_{snr:02d}db_{k:02d}'
            write('mix', 'clean', clip_id, clean)
            write('mix', 'noisy', clip_id, noisy)
            manifest['mix'].append({'id': clip_id, 'group': group, 'snr': snr, 'speech': speech_name, 'noise': noise_name})

for k, speech_name in enumerate(speech_pool[:CLEAN_COUNT]):
    speech, _ = sf.read(os.path.join(speech_dir, speech_name), dtype='float64')
    speech *= 10 ** ((SPEECH_LEVEL_DB - active_level_db(speech)) / 20)
    lead, tail = int(LEAD_S * RATE), int(TAIL_S * RATE)
    clean = np.concatenate([np.zeros(lead), speech, np.zeros(tail)])
    # A microphone is never digitally silent: a -80 dBFS floor.
    clean += np.random.default_rng(k).normal(0, 10 ** (-80 / 20), len(clean))
    clip_id = f'clean_{k:02d}'
    write('clean', 'clean', clip_id, clean)
    write('clean', 'noisy', clip_id, clean)
    manifest['clean'].append({'id': clip_id, 'speech': speech_name})

with open(os.path.join(out_dir, 'manifest.json'), 'w') as f:
    json.dump(manifest, f, indent=1)
print({k: len(v) for k, v in manifest.items()}, {g: len(v) for g, v in noises.items()})
