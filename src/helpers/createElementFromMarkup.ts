import {MOUNT_CLASS_TO} from '../config/debug';

export default function createElementFromMarkup<T = Element>(markup: string) {
  const div = document.createElement('div');
  div.innerHTML = markup.trim();
  return div.firstElementChild as T;
}
MOUNT_CLASS_TO.createElementFromMarkup = createElementFromMarkup;
