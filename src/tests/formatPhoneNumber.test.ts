import {formatPhoneNumber} from '@helpers/formatPhoneNumber';
import I18n from '@lib/langPack';
import {HelpCountry} from '@layer';

// The prefix map inside formatPhoneNumber is built lazily ONCE from
// I18n.countriesList, so we must populate it before the very first call.
function installCountries(countries: HelpCountry[]) {
  I18n.countriesList.length = 0;
  I18n.countriesList.push(...countries);
}

function country(iso2: string, country_code: string, patterns: string[]): HelpCountry {
  return {
    _: 'help.country',
    pFlags: {},
    iso2,
    default_name: iso2,
    country_codes: [{
      _: 'help.countryCode',
      country_code,
      patterns
    }]
  };
}

describe('formatPhoneNumber', () => {
  beforeAll(() => {
    installCountries([
      // Japan, country code 81
      country('JP', '81', ['XX XXXX XXXX']),
      // Indonesia, country code 62
      country('ID', '62', ['XXX XXXXXXXX'])
    ]);
  });

  test('a fully-qualified number (with country code) is still detected and grouped', () => {
    // +81 90 1234 5678 — a real Japanese number, carries its country code.
    // This is the user.phone case (registered users always carry the cc).
    const res = formatPhoneNumber('819012345678');
    expect(res.code.country_code).toBe('81');
    expect(res.country.iso2).toBe('JP');
  });

  test('an explicit "+" prefix still triggers country detection even with defaultCountryCode', () => {
    const res = formatPhoneNumber('+819012345678', {defaultCountryCode: '62'});
    expect(res.code.country_code).toBe('81');
  });

  // bugs.telegram.org #30681 — "Phone number in contact embed (in-chat) is not
  // displayed correctly if the country code is not explicitly contained in the
  // contact phone number ... shows the first city code digits as if they were
  // the country code (does not happen on Android)".
  test('national number without a country code is grouped under the viewer country, not misread as a foreign code (#30681)', () => {
    // An Indonesian contact whose number is stored without the +62 dialing prefix,
    // e.g. national mobile 0812-3456-789 stored as bare digits "8123456789". Those
    // leading "81" digits collide with Japan's country code (81). Without the bias
    // this returns {formatted: '81 23 4567 89', code: 81 (JP)} -> "+81 ..." (wrong).
    // The viewer is Indonesian (+62), so it must be grouped as an ID national number.
    const res = formatPhoneNumber('8123456789', {defaultCountryCode: '62'});

    expect(res.code).toBeUndefined(); // -> caller omits the '+' sign
    expect(res.country.iso2).toBe('ID'); // grouped under the viewer's country
    // grouped by ID's national pattern, never attributed to Japan
    expect(res.formatted).toBe('812 3456789');
  });

  test('a number that DOES start with the viewer country code keeps the "+" international grouping', () => {
    // Viewer is Indonesian (+62); a contact stored as "6281234567" already carries
    // the country code -> detect & group normally so the caller renders "+62 ...".
    const res = formatPhoneNumber('6281234567', {defaultCountryCode: '62'});
    expect(res.code.country_code).toBe('62');
    expect(res.country.iso2).toBe('ID');
  });

  test('a genuinely foreign number is grouped under the viewer country without a false "+CC"', () => {
    // Viewer is Japanese (+81) and the contact is an Indonesian number "6281234567"
    // stored without "+". We cannot know it is foreign, so it is grouped as a JP
    // national number — but crucially NO foreign "+62" is asserted (code undefined).
    const res = formatPhoneNumber('6281234567', {defaultCountryCode: '81'});
    expect(res.code).toBeUndefined();
    expect(res.country.iso2).toBe('JP');
  });

  test('backward compatible: without options, a "+"-less number is still parsed (unchanged behavior)', () => {
    // The registered-user / payment callers pass user.phone (no "+", but it always
    // carries the country code) and rely on detection — must not regress.
    const res = formatPhoneNumber('819012345678');
    expect(res.code.country_code).toBe('81');
  });
});
