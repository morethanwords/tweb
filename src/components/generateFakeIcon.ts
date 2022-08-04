import {_i18n} from '../lib/langPack';

export default function generateFakeIcon(isScam?: boolean) {
  const span = document.createElement('span');
  span.classList.add('badge-fake');
  _i18n(span, isScam ? 'ScamMessage' : 'FakeMessage');
  return span;
}
