const _logTimer = Date.now();
export default function dT() {
  return '[' + ((Date.now() - _logTimer) / 1000).toFixed(3) + ']';
}
