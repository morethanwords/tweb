export default function htmlToSpan(html: string | DocumentFragment) {
  const span = document.createElement('span');
  if(typeof(html) === 'string') span.innerHTML = html;
  else span.append(html);
  return span;
}
