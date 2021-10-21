export default function compareVersion(v1: string, v2: string): number {
  v1 = v1.split(' ', 1)[0];
  v2 = v2.split(' ', 1)[0];
  const s1 = v1.split('.');
  const s2 = v2.split('.');

  for(let i = 0; i < s1.length; ++i) {
    const v1 = +s1[i];
    const v2 = +s2[i];
    if(v1 > v2) return 1;
    else if(v1 < v2) return -1;
  }

  return 0;
}
