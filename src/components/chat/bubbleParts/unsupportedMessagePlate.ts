import {i18n} from '@lib/langPack';

const CLASS_NAME = 'bubble-unsupported';

const ICON_SVG = `<svg class="${CLASS_NAME}-icon" viewBox="0 0 144 144" aria-hidden="true">
  <path class="${CLASS_NAME}-icon-bubble" fill-rule="evenodd" d="M72.5,14C104.81,14 131,40.19 131,72.5C131,104.81 104.81,131 72.5,131C60.92,131 50.12,127.63 41.04,121.83L19.43,129.16C17.14,129.94 14.92,127.81 15.59,125.49L22.22,102.42C17,93.67 14,83.43 14,72.5C14,40.19 40.19,14 72.5,14Z"/>
  <path class="${CLASS_NAME}-icon-plane" fill-rule="evenodd" transform="translate(33 33) scale(1.0833)" d="M6.232,35.046C22.115,28.147 32.706,23.599 38.006,21.401C53.136,15.126 56.28,14.036 58.329,14C58.78,13.992 59.788,14.104 60.441,14.632C60.992,15.078 61.143,15.68 61.216,16.103C61.289,16.526 61.379,17.489 61.307,18.241C60.487,26.831 56.939,47.675 55.134,57.295C54.371,61.366 52.867,62.731 51.411,62.865C48.247,63.155 45.844,60.78 42.78,58.777C37.985,55.643 35.276,53.692 30.621,50.634C25.242,47.1 28.729,45.157 31.795,41.983C32.597,41.152 46.537,28.51 46.807,27.363C46.841,27.22 46.872,26.685 46.554,26.403C46.235,26.12 45.765,26.217 45.426,26.294C44.945,26.402 37.284,31.451 22.444,41.438C20.27,42.927 18.3,43.652 16.536,43.614C14.591,43.572 10.849,42.518 8.067,41.616C4.655,40.51 2.448,39.938 2.684,38.06C2.807,37.082 3.99,36.077 6.232,35.046Z"/>
</svg>`;

/** The plate a message this client cannot show is drawn as, the way Android draws it (`UnsupportedBlockDrawable`) */
export default function wrapUnsupportedMessagePlate() {
  const container = document.createElement('div');
  container.classList.add(CLASS_NAME);
  container.insertAdjacentHTML('beforeend', ICON_SVG);

  const text = document.createElement('div');
  text.classList.add(`${CLASS_NAME}-text`);

  const title = i18n('UnsupportedMessageTitle');
  title.classList.add(`${CLASS_NAME}-title`);

  const subtitle = i18n('UnsupportedMessageMessage');
  subtitle.classList.add(`${CLASS_NAME}-subtitle`);

  text.append(title, subtitle);

  container.append(text);
  return container;
}
