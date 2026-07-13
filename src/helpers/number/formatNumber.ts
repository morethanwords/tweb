export default function formatNumber(bytes: number, decimals = 2): string {
  if(bytes === 0) return '0';
  if(bytes < 0) return '-' + formatNumber(-bytes, decimals);

  const k = 1000;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['', 'K', 'M', 'B', 'T'];

  // * `i` is log-derived and otherwise unbounded at the top, so clamp it to the last
  // * available unit: an out-of-range magnitude would index past `sizes`, making
  // * `value + undefined` === NaN and breaking the declared `: string` return.
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + sizes[i];
}
