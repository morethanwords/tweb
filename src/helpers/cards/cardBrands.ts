import cacheCallback from '../cacheCallback';
import replaceNonNumber from '../string/replaceNonNumber';

const CARD_BRAND_REGEXP: {[brand: string]: RegExp} = {
  visa: /^4/,
  mastercard: /^(51|52|53|54|55|222|23|24|25|26|27)/,
  amex: /^(34|37)/,
  discover: /^(60|64|65)/,
  diners: /^(30|38|39)/,
  diners14: /^(36)/,
  jcb: /^(35)/,
  unionpay: /^(62[0-6,8-9]|627[0-6,8-9]|6277[0-7,9]|62778[1-9]|81)/,
  elo: /^(5067|509|636368|627780)/,
  // mir: /^(220[0-4])/
  mir: /^(2\d+)/
};

// * taken from Stripe
export const CARD_BRANDS: {[b: string]: {
  minLength: number,
  maxLength: number,
  cvcMaxLength: number,
  cvcMinLength: number | null
}} = {
  visa: {
    minLength: 16,
    maxLength: 16,
    cvcMaxLength: 3,
    cvcMinLength: null
  },
  mastercard: {
    minLength: 16,
    maxLength: 16,
    cvcMaxLength: 3,
    cvcMinLength: null
  },
  amex: {
    minLength: 15,
    maxLength: 15,
    cvcMaxLength: 4,
    cvcMinLength: 3
  },
  unionpay: {
    minLength: 13,
    maxLength: 19,
    cvcMaxLength: 3,
    cvcMinLength: null
  },
  diners: {
    minLength: 16,
    maxLength: 16,
    cvcMaxLength: 3,
    cvcMinLength: null
  },
  diners14: {
    minLength: 14,
    maxLength: 14,
    cvcMaxLength: 3,
    cvcMinLength: null
  },
  discover: {
    minLength: 16,
    maxLength: 16,
    cvcMaxLength: 3,
    cvcMinLength: null
  },
  jcb: {
    minLength: 16,
    maxLength: 16,
    cvcMaxLength: 3,
    cvcMinLength: null
  },
  elo: {
    minLength: 16,
    maxLength: 16,
    cvcMaxLength: 3,
    cvcMinLength: null
  },
  mir: {
    minLength: 16,
    maxLength: 16,
    cvcMaxLength: 3,
    cvcMinLength: null
  },
  unknown: {
    minLength: 16,
    maxLength: 16,
    cvcMaxLength: 4,
    cvcMinLength: 3
  }
};

export const detectCardBrand = cacheCallback((card: string = '') => {
  const keys = Object.keys(CARD_BRAND_REGEXP);
  const sanitizedCard = replaceNonNumber(card);
  let brand: string;
  let last = 0;
  keys.forEach((key) => {
    const regExp = CARD_BRAND_REGEXP[key];
    const match = sanitizedCard.match(regExp);
    if(match) {
      const result = match[0];
      if(result && result.length > last) {
        brand = key;
        last = result.length;
      }
    }
  });

  return brand || 'unknown';
});

export function cardBrandToUnifiedBrand(brand: string) {
  return brand === 'diners14' ? 'diners' : brand;
}

export function detectUnifiedCardBrand(card = '') {
  const brand = detectCardBrand(card);
  return cardBrandToUnifiedBrand(brand);
}
