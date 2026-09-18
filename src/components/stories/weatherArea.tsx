import {createMemo} from 'solid-js';
import {MediaArea} from '@layer';
import {appSettings, setAppSettings} from '@stores/appSettings';
import {computePerceivedBrightness} from '@helpers/color';
import createMiddleware from '@helpers/solid/createMiddleware';
import wrapStickerEmoji from '@components/wrappers/stickerEmoji';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import formatTemperature, {getDefaultTemperatureUnit} from '@helpers/temperature';
import styles from '@components/stories/weatherArea.module.scss';

export function getTemperatureUnit() {
  return appSettings.temperatureUnit ?? getDefaultTemperatureUnit();
}

/**
 * Clicking the widget flips °C ↔ °F and remembers it, like tdesktop — the story carries celsius
 * and nothing else says which one this reader wants.
 */
export function toggleTemperatureUnit() {
  setAppSettings('temperatureUnit', getTemperatureUnit() === 'celsius' ? 'fahrenheit' : 'celsius');
}

/**
 * `mediaAreaWeather` — an emoji and a temperature on a coloured pill.
 *
 * Every measurement is a fraction of the media area's HEIGHT, taken from iOS
 * (`StoryItemOverlaysView.WeatherView`): .203 of padding, a .71 emoji, .06 of a gap, the
 * temperature at .69, then .2 of padding. The area only fixes the pill's height and its centre —
 * the width follows the text, so the pill can stick out of the area on either side.
 */
export default function StoryWeatherArea(props: {
  mediaArea: MediaArea.mediaAreaWeather,
  /** The area's own height, as a percentage of the story — the pill's whole scale. */
  height: number,
  /** The area's width, as a percentage of the story — what the corner radius is relative to. */
  width: number,
  /** Story height in px, only to pick the resolution the emoji is rendered at. */
  storyHeight: number
}) {
  const middleware = createMiddleware().get();

  const {color, emoji, coordinates} = props.mediaArea;
  const rgb: [number, number, number] = [(color >> 16) & 0xFF, (color >> 8) & 0xFF, color & 0xFF];
  const alpha = ((color >> 24) & 0xFF) / 255;

  const emojiSize = Math.max(16, Math.round(props.storyHeight * props.height / 100 * 0.71));
  const emojiDiv = (<div class={styles.Emoji} />) as HTMLDivElement;
  wrapStickerEmoji({
    div: emojiDiv,
    emoji,
    width: emojiSize,
    height: emojiSize,
    middleware,
    loop: true
  }).catch(() => {
    // not every weather emoji has an animated sticker behind it — show the plain one rather than
    // a hole where the icon should be
    if(!middleware()) return;
    emojiDiv.classList.remove('media-sticker-wrapper');
    emojiDiv.append(wrapEmojiText(emoji));
  });

  const temperature = createMemo(() => formatTemperature(props.mediaArea.temperature_c, getTemperatureUnit()));

  // the radius arrives as a percentage of the area's WIDTH (iOS / Android); a pill can never be
  // rounder than half its height, and an area that omits it gets Android's .2 of the height
  const radius = coordinates.radius !== undefined ?
    `calc(var(--stories-width) * ${props.width / 100 * coordinates.radius / 100})` :
    'calc(var(--weather-size) * .2)';

  return (
    <div
      class={styles.Pill}
      style={{
        '--weather-size': `calc(var(--stories-height) * ${props.height / 100})`,
        '--weather-radius': `min(${radius}, calc(var(--weather-size) * .5))`,
        '--weather-color': `rgba(${rgb.join(', ')}, ${alpha})`,
        '--weather-text-color': computePerceivedBrightness(rgb) > 0.705 ? '#000' : '#fff'
      }}
    >
      {emojiDiv}
      {temperature()}
    </div>
  );
}
