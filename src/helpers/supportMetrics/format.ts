export function formatSupportDurationMs(ms: number) {
  if(!ms) return '—';
  if(ms < 1000) return `${ms}ms`;
  const sec = Math.round(ms / 1000);
  if(sec < 60) return `${sec}s`;
  const min = Math.round(sec / 60);
  if(min < 60) return `${min}m`;
  const hours = (min / 60).toFixed(1);
  return `${hours}h`;
}

export function formatSupportDelta(value: number, invertGood = false) {
  if(!value) return undefined;
  const positive = invertGood ? value < 0 : value > 0;
  const sign = value > 0 ? '+' : '';
  return {
    text: `${sign}${value}`,
    className: positive ? 'green' : 'red'
  };
}

export function downloadSupportMetricsCsv(csv: string) {
  const blob = new Blob([csv], {type: 'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `telegram-support-metrics-${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
