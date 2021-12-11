export default function tsNow(seconds?: true) {
  const t = Date.now();
  return seconds ? t / 1000 | 0 : t;
}
