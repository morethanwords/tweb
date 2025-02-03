export default function createElementFromMarkup<T = Element>(markup: string) {
  const div = document.createElement('div');
  div.innerHTML = markup.trim();
  return div.firstElementChild as T;
}
