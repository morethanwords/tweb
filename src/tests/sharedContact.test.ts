import parseVcard, {sortVcardItems} from '@helpers/parseVcard';
import {getFakeUserIdForJustName} from '@appManagers/utils/peers/getPeerColorById';
import {makeContactPhoneFormatter} from '@components/wrappers/formatUserPhone';
import I18n from '@lib/langPack';
import {HelpCountry} from '@layer';

describe('parseVcard', () => {
  test('keeps every field in the card\'s order, and sorts them by kind as tdesktop lists them', () => {
    const vcard = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'N:Doe;John;;;',
      'FN:John Doe',
      'ORG:Example Inc.;',
      'TEL;TYPE=CELL:+1 555 0100',
      'TEL;TYPE=WORK:+1 555 0101',
      'TEL;TYPE=WORK:+1 555 0102',
      'EMAIL;TYPE=INTERNET:john@example.com',
      'BDAY:1990-01-15',
      'END:VCARD'
    ].join('\r\n');

    const items = parseVcard(vcard);
    // * a second phone of a kind is kept: iOS and Android show it, tdesktop loses it
    expect(items).toEqual([
      {type: 'name', value: 'Doe John'},
      {type: 'organization', value: 'Example Inc.'},
      {type: 'phoneMobile', value: '+1 555 0100'},
      {type: 'phoneWork', value: '+1 555 0101'},
      {type: 'phoneWork', value: '+1 555 0102'},
      {type: 'email', value: 'john@example.com'},
      {type: 'birthday', value: '1990-01-15'}
    ]);
    expect(sortVcardItems(items).map((item) => item.type)).toEqual([
      'phoneMobile', 'phoneWork', 'phoneWork', 'email', 'birthday', 'organization', 'name'
    ]);
    expect(parseVcard('TEL:+1 555 0100\nTEL:+1 555 0100')).toEqual([{type: 'phone', value: '+1 555 0100'}]);

    // * the phones keep the card's order whatever they are marked, as the bubble lists them
    expect(sortVcardItems(parseVcard('EMAIL:a@b.c\nTEL;TYPE=WORK:+1 555 0101\nTEL;TYPE=CELL;TYPE=pref:+1 555 0100')).map((item) => item.value)).toEqual([
      '+1 555 0101', '+1 555 0100', 'a@b.c'
    ]);
  });

  test('keeps a value with a colon in it, which tdesktop drops', () => {
    expect(parseVcard('URL:https://example.com\nNOTE:call at 10:30')).toEqual([
      {type: 'url', value: 'https://example.com'},
      {type: 'note', value: 'call at 10:30'}
    ]);
  });

  test('takes Apple\'s grouped, lower-case properties and the main phone', () => {
    expect(parseVcard('item1.TEL;type=CELL;type=VOICE;type=pref:+7 900 000-00-00\nitem2.EMAIL;type=INTERNET:a@b.c')).toEqual([
      {type: 'phoneMain', value: '+7 900 000-00-00'},
      {type: 'email', value: 'a@b.c'}
    ]);
  });

  test('leaves out the link iOS keeps to the Telegram account, and keeps a real URL', () => {
    const vcard = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'TEL;type=CELL;type=VOICE;type=pref:+7 900 000-00-00',
      'item1.URL;type=pref:https://example.com',
      'item1.X-ABLabel:_$!<HomePage>!$_',
      'item2.URL:https://t.me/@id1404966982',
      'item2.X-ABLabel:Telegram',
      'END:VCARD'
    ].join('\r\n');

    expect(parseVcard(vcard)).toEqual([
      {type: 'phoneMain', value: '+7 900 000-00-00'},
      {type: 'url', value: 'https://example.com'}
    ]);
    expect(parseVcard('TEL:+1 555 0100\nURL:https://t.me/@id1404966982')).toEqual([
      {type: 'phone', value: '+1 555 0100'}
    ]);
  });

  test('does not read a nickname as the name', () => {
    expect(parseVcard('NICKNAME:Johnny')).toEqual([]);
  });

  test('decodes quoted-printable UTF-8 and unfolds folded lines', () => {
    expect(parseVcard('N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=D0=98=D0=B2=D0=B0=D0=BD;;;;')).toEqual([
      {type: 'name', value: 'Иван'}
    ]);
    // * vCard 2.1's soft line break: a quoted-printable value ending with '=' goes on below
    expect(parseVcard('ADR;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:;;=D1=83=D0=BB=D0=B8=D1=86=D0=B0 =D0=9B=D0=B5=D0=BD=D0=B8=\r\n=D0=BD=D0=B0 1;=D0=9C=D0=BE=D1=81=D0=BA=D0=B2=D0=B0;;;\r\nTEL:+7 900 000-00-00')).toEqual([
      {type: 'address', value: 'улица Ленина 1, Москва'},
      {type: 'phone', value: '+7 900 000-00-00'}
    ]);
    expect(parseVcard('NOTE:first\r\n  second')).toEqual([
      {type: 'note', value: 'first second'}
    ]);
  });

  test('joins an address without its empty components and unescapes the text', () => {
    expect(parseVcard('ADR;TYPE=HOME:;;1 Main St\\, Apt 2;Springfield;;12345;USA')).toEqual([
      {type: 'address', value: '1 Main St, Apt 2, Springfield, 12345, USA'}
    ]);
  });

  test('an empty or missing vCard has no fields', () => {
    expect(parseVcard('')).toEqual([]);
    expect(parseVcard(undefined)).toEqual([]);
  });
});

describe('getFakeUserIdForJustName', () => {
  // * the values tdesktop's Data::FakePeerIdForJustName gives: crc32 of the UTF-16 name over 0xFE << 32
  test('matches tdesktop', () => {
    expect(getFakeUserIdForJustName('John Doe')).toBe(1091378823410);
    expect(getFakeUserIdForJustName('Иван Петров')).toBe(1092162380746);
    expect(getFakeUserIdForJustName('')).toBe(1090921693961);
  });
});

describe('makeContactPhoneFormatter', () => {
  // * formatPhoneNumber builds its prefix map once, from I18n.countriesList
  beforeAll(() => {
    const country = (iso2: string, country_code: string, patterns: string[]): HelpCountry => ({
      _: 'help.country',
      pFlags: {},
      iso2,
      default_name: iso2,
      country_codes: [{_: 'help.countryCode', country_code, patterns}]
    });

    I18n.countriesList.length = 0;
    I18n.countriesList.push(country('AE', '971', ['XX XXX XXXX']), country('TH', '66', ['X XXXX XXXX']));
  });

  test('the number an account was found by is international, whatever the viewer\'s country', () => {
    const format = makeContactPhoneFormatter([undefined, '971585165713'], '66');
    expect(format('971585165713')).toBe('+971 58 516 5713');
    expect(format('+971 58 516 5713')).toBe('+971 58 516 5713');
  });

  test('any other number without a "+" reads as one of the viewer\'s country (#30681)', () => {
    const format = makeContactPhoneFormatter([], '66');
    expect(format('971585165713')).not.toMatch(/^\+/);
    expect(format('+971585165713')).toBe('+971 58 516 5713');
  });

  test('a number with a trunk 0 stays national even when it is the account\'s', () => {
    const format = makeContactPhoneFormatter(['0585165713'], '66');
    expect(format('0585165713')).not.toMatch(/^\+/);
  });
});
