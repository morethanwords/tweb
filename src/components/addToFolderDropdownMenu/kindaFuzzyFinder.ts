export default function kindaFuzzyFinder(str: string, toFind: string) {
  return kindaFuzzyFinderImpl(str.toLowerCase(), toFind.toLowerCase(), toFind.length);
}

function kindaFuzzyFinderImpl(str: string, toFind: string, fm: number) {
  let bestIndicies: number[] = [], bestScore = 0;

  const n = str.length;
  const m = toFind.length;

  for(let j = 0; j < m; j++) {
    for(let i = 0; i < n; i++) {
      if(str[i] !== toFind[j]) continue;

      const {found} = kindaFuzzyFinderImpl(str.slice(i + 1), toFind.slice(j + 1), fm);
      const newIndicies = [i, ...found.map(fi => fi + i + 1)];

      const s = score(str, toFind, newIndicies, fm, true) - punishments.missing(fm) * j;
      if(s > bestScore) {
        bestScore = s;
        bestIndicies = newIndicies;
      }
    }
  }

  return {found: bestIndicies, score: score(str, toFind, bestIndicies, fm, true)};
}

const punishments = {
  missing: (length: number) => 1 / length,
  gap: (length: number, gap: number) => 0.25 / length * gap
};

function score(str: string, toFind: string, indicies: number[], fm: number, punishLastMissing: boolean) {
  const n = str.length, m = toFind.length, k = indicies.length;
  if(!k) return 0;

  let result = 1;

  let fi = 0, prevsi = -1;
  for(let i = 0; i < k && fi < m; i++) {
    const si = indicies[i];
    if(!(si < n)) break;

    while(str[si] !== toFind[fi] && fi < m) {
      fi++;
      result -= punishments.missing(fm);
    }
    fi++;

    if(prevsi != -1 && si - prevsi > 1) {
      result -= punishments.gap(m, si - prevsi - 1);
    }

    prevsi = si;
  }

  if(punishLastMissing) result -= (fm - fi) * punishments.missing(fm);

  return result;
}

if(false) {
  const testCases = [
    ['hello world', ['hlo', 'hew', 'wld', 'world', 'xyz']],
    ['fuzzy finder', ['fzy', 'fin', 'fndr', 'zzi', 'der']],
    ['JavaScript', ['jvs', 'scr', 'java', 'script', 'pt']],
    ['keyboard', ['key', 'kbd', 'brd', 'board', 'z']],
    ['console.log', ['cl', 'csl', 'log', 'con', 'x']],
    ['performance', ['perf', 'mance', 'form', 'xyz', 'per']],
    ['stack overflow', ['stov', 'sov', 'flow', 'ovr', 'ack']],
    ['regex match', ['rx', 'mat', 'rmt', 'match', 'gg']],
    ['autocomplete', ['auto', 'cmp', 'complete', 'lete', 'ct']],
    ['developer tools', ['dev', 'tools', 'dvlp', 'dt', 'tl']],
    ['machine learning', ['ml', 'mach', 'learn', 'mle', 'xyz']],
    ['artificial intelligence', ['ai', 'art', 'intel', 'bficial', 'ce']],
    ['data structures', ['ds', 'str', 'data', 'stru', 'zzz']],
    ['frontend backend', ['fb', 'fe', 'be', 'front', 'back']],
    ['react components', ['rc', 'cmp', 'comp', 'reac', 'ents']],
    ['node.js server', ['nd', 'srv', 'node', 'js', 'ser']],
    ['web development', ['web', 'dev', 'wdev', 'lop', 'zzz']],
    ['browser history', ['bh', 'hist', 'browse', 'his', 'story']],
    ['terminal command', ['term', 'cmd', 'com', 'tc', 'mand']]
  ] as const;

  for(const [source, terms] of testCases) {
    console.log(`\nSource: "${source}"`);
    for(const term of terms) {
      const {found, score} = kindaFuzzyFinder(source, term);
      const arr = new Array(source.length).fill('^').map((_, i) => found.includes(i) ? source[i] : _);
      console.log(`  Search: "${term}" -> (${score.toFixed(2)}) ${arr.join('')}`);
    }
  }
}
