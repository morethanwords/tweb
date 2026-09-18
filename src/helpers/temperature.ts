import clamp from '@helpers/number/clamp';

export type TemperatureUnit = 'celsius' | 'fahrenheit';

/**
 * The countries that read temperature in Fahrenheit — tdesktop's list
 * (`ResolveWeatherInCelsius`), which is what decides the unit when nothing was picked by hand.
 */
const FAHRENHEIT_REGIONS = new Set(['US', 'BS', 'KY', 'LR', 'BZ']);

/**
 * Android goes by the timezone rather than the country. Kept as the fallback for a browser that
 * reports a language with no region at all (`en` instead of `en-US`).
 */
const FAHRENHEIT_TIME_ZONES = new Set(['America/Nassau', 'America/Belize', 'America/Cayman', 'Pacific/Palau']);

function getRegion() {
  const locales = navigator.languages?.length ? navigator.languages : [navigator.language];
  for(const locale of locales) {
    try {
      const {region} = new Intl.Locale(locale);
      if(region) {
        return region;
      }
    } catch(err) {}
  }
}

function isFahrenheitHere() {
  const region = getRegion();
  if(region) {
    return FAHRENHEIT_REGIONS.has(region);
  }

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  return timeZone.startsWith('US/') || FAHRENHEIT_TIME_ZONES.has(timeZone);
}

let defaultUnit: TemperatureUnit;
export function getDefaultTemperatureUnit(): TemperatureUnit {
  return defaultUnit ??= isFahrenheitHere() ? 'fahrenheit' : 'celsius';
}

/**
 * `24°C` / `72°F`, rounded to whole degrees like every other client. The value comes off the wire,
 * so it is clamped to something a thermometer could say before it is rendered (tdesktop's range).
 */
export default function formatTemperature(celsius: number, unit: TemperatureUnit) {
  const value = clamp(celsius || 0, -274, 1e6);
  return unit === 'fahrenheit' ?
    Math.round(value * 9 / 5 + 32) + '°F' :
    Math.round(value) + '°C';
}
