import {IS_ANDROID} from '../../environment/userAgent';
import createArray from '../array/createArray';
import cacheCallback from '../cacheCallback';
import replaceNonNumber from '../string/replaceNonNumber';
import {CARD_BRANDS, detectCardBrand} from './cardBrands';
import patternCharacters from './patternCharacters';

const digit = patternCharacters.digit;
const capitalCharacter = patternCharacters.capitalCharacter;
const spaceCharacter = patternCharacters.formattingCharacter(' ');
const yearOptionalPattern = patternCharacters.optionalPattern(/\d\d/);
const sixteenPattern = [digit, digit, digit, digit, spaceCharacter, digit, digit, digit, digit, digit, digit, spaceCharacter, digit, digit, digit, digit, digit];
const fifteenPattern = [digit, digit, digit, digit, spaceCharacter, digit, digit, digit, digit, digit, digit, spaceCharacter, digit, digit, digit, digit];

const requiredPostcodes = new Set(['DZ', 'AR', 'AM', 'AU', 'AT', 'AZ', 'PT', 'BD', 'BY', 'BE', 'BA', 'BR', 'BN', 'BG', 'CA', 'IC', 'CN', 'CO', 'HR', 'CY', 'CZ', 'DK', 'EC', 'GB', 'EE', 'FO', 'FI', 'FR', 'GE', 'DE', 'GR', 'GL', 'GU', 'GG', 'NL', 'HU', 'IN', 'ID', 'IL', 'IT', 'JP', 'JE', 'KZ', 'KR', 'FM', 'KG', 'LV', 'LI', 'LT', 'LU', 'MK', 'MG', 'PT', 'MY', 'MH', 'MQ', 'YT', 'MX', 'MN', 'ME', 'NL', 'NZ', 'GB', 'NO', 'PK', 'PH', 'PL', 'FM', 'PT', 'PR', 'RE', 'RU', 'SA', 'SF', 'RS', 'SG', 'SK', 'SI', 'ZA', 'ES', 'LK', 'SX', 'VI', 'VI', 'SE', 'CH', 'TW', 'TJ', 'TH', 'TU', 'TN', 'TR', 'TM', 'VI', 'UA', 'GB', 'US', 'UY', 'UZ', 'VA', 'VN', 'GB', 'FM']);

const generateFourPattern = cacheCallback((length: number) => {
  const out: Array<typeof digit | typeof spaceCharacter> = [];

  for(let i = 0, k = 0; i < length;) {
    if(k === 4) {
      out.push(spaceCharacter);
      k = 0;
    } else {
      out.push(digit);
      ++i;
      ++k;
    }
  }

  return out;
});

function generateCardNumberPattern(card: string) {
  const brand = detectCardBrand(card);
  if(brand === 'amex') return sixteenPattern;
  if(brand === 'diners14') return fifteenPattern;
  const {minLength, maxLength} = CARD_BRANDS[brand];
  const s = replaceNonNumber(card).length;
  const d = Math.min(Math.max(minLength, s), maxLength);
  return generateFourPattern(d);
}

const cardFormattingPatterns = {
  cardNumber: generateCardNumberPattern,
  cardExpiry: () => [patternCharacters.month, patternCharacters.formattingCharacter('/'), digit, digit, yearOptionalPattern],
  cardCvc: (card?: string) => cardFormattingPatterns.cardCvcFromBrand(detectCardBrand(card)),
  cardCvcFromBrand: cacheCallback((brand: string) => {
    const info = CARD_BRANDS[brand];
    const {cvcMinLength, cvcMaxLength} = info;
    const pattern = createArray(cvcMinLength || cvcMaxLength, digit);
    if(cvcMinLength && cvcMinLength < cvcMaxLength) {
      const i = cvcMaxLength - cvcMinLength;
      const h = patternCharacters.optionalPattern(/\d/);
      if(i) {
        pattern.push(...createArray(i, h));
      }
    }

    return pattern;
  }),
  postalCodeFromCountry: cacheCallback((iso2: string) => {
    switch(iso2) {
      case 'US':
        return createArray(5, digit);
      case 'CA':
        return IS_ANDROID ? null : [capitalCharacter, capitalCharacter, capitalCharacter, spaceCharacter, capitalCharacter, capitalCharacter, capitalCharacter];
      default:
        const optionalDigits = createArray(10, patternCharacters.optionalPattern(/\d/));
        if(requiredPostcodes.has(iso2)) {
          optionalDigits[0] = digit;
        }
        return optionalDigits;
    }
  })
};

export default cardFormattingPatterns;
