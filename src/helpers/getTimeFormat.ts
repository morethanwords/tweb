// https://stackoverflow.com/a/61676104
export default function getTimeFormat(): 'h12' | 'h23' {
  const t = document.createElement('input');
  t.type = 'time';
  t.value = '15:00';
  t.style.visibility = 'hidden';
  document.body.append(t);
  const offsetWidth = t.offsetWidth;
  t.remove();
  const timeFormat = offsetWidth > 110 ? 'h12' : 'h23';
  // console.log('timeFormat', timeFormat, offsetWidth);
  return timeFormat;
}
