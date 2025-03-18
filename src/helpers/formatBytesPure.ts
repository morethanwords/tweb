export default function formatBytesPure(bytes: number, decimals: number | 'auto' = 'auto') {
  if(bytes === 0) return `0 B`;

  const strictDecimals = decimals === 'auto';

  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const _decimals = decimals === 'auto' ? Math.max(0, i - 1) : decimals;

  const dm = Math.max(0, _decimals);
  const sizes = ['B', 'KB', 'MB', 'GB'];

  const fixed = (bytes / Math.pow(k, i)).toFixed(dm);
  return [sizes[i], strictDecimals ? fixed : parseFloat(fixed)].reverse().join(' ');
}
