"""Prints the score tables: per subset, and the mix subset per noise group and SNR.
usage: summary.py <work dir> [system ...] [--paired]   (--paired: only clips every listed system has, minus captures' glitched clips)"""
import json, os, sys
import numpy as np

E = sys.argv[1]
args = [a for a in sys.argv[2:] if not a.startswith('--')]
paired = '--paired' in sys.argv
SCORES = os.path.join(E, 'out', 'scores')
systems = args or sorted({f.split('.')[0] for f in os.listdir(SCORES)})
METRICS = ['pesq', 'stoi', 'si_sdr', 'sig', 'bak', 'ovrl', 'p808', 'speech_gain_db']


def load(system, subset):
    path = os.path.join(SCORES, f'{system}.{subset}.json')
    if not os.path.exists(path):
        return None
    clips = {c['id']: c for c in json.load(open(path))['clips']}
    glitches = os.path.join(E, 'out', system, subset, '_glitched.json')
    if os.path.exists(glitches):
        for clip_id in json.load(open(glitches)):
            clips.pop(clip_id, None)
    return clips


def mean(clips, key):
    values = [c[key] for c in clips if c.get(key) is not None]
    return np.mean(values) if values else float('nan')


for subset in ['vb', 'mix', 'clean']:
    data = {s: load(s, subset) for s in systems}
    data = {s: d for s, d in data.items() if d}
    common = set.intersection(*(set(d) for d in data.values())) if paired and data else None
    print(f'\n## {subset}' + (f' ({len(common)} common clips)' if common is not None else ''))
    print('| system | n | ' + ' | '.join(METRICS) + ' |')
    print('|---' * (len(METRICS) + 2) + '|')
    for s, d in data.items():
        clips = [c for k, c in d.items() if common is None or k in common]
        print(f'| {s} | {len(clips)} | ' + ' | '.join(f'{mean(clips, m):.3f}' for m in METRICS) + ' |')
    if subset == 'mix':
        for key, values in (('group', ['stationary', 'transient', 'babble']), ('snr', [0, 5, 10, 20])):
            print(f'\n### mix by {key}: PESQ / DNSMOS OVRL / BAK / SIG')
            print('| system | ' + ' | '.join(str(v) for v in values) + ' |')
            print('|---' * (len(values) + 1) + '|')
            for s, d in data.items():
                cells = []
                for v in values:
                    clips = [c for k, c in d.items() if c.get(key) == v and (common is None or k in common)]
                    cells.append(f"{mean(clips, 'pesq'):.2f} / {mean(clips, 'ovrl'):.2f} / {mean(clips, 'bak'):.2f} / {mean(clips, 'sig'):.2f}")
                print(f'| {s} | ' + ' | '.join(cells) + ' |')
