import cardFormattingPatterns from '../helpers/cards/cardFormattingPatterns';
import formatValueByPattern from '../helpers/cards/formatValueByPattern';
import {validateCardExpiry, validateCardNumber} from '../helpers/cards/validateCard';

describe('Card number', () => {
  test('Format', () => {
    const data = [
      ['4242424242424242', '4242 4242 4242 4242'],
      ['371758885524003', '3717 588855 24003']
    ];

    data.forEach(([plain, formatted]) => {
      const result = formatValueByPattern(cardFormattingPatterns.cardNumber, plain);
      expect(result.value).toEqual(formatted);
    });
  });

  test('Validate', () => {
    const data = [
      ['4242424242424242', null],
      ['4242424242424241', 'invalid'],
      ['424242424242424', 'incomplete']
    ];

    data.forEach(([cardNumber, code]) => {
      const result = validateCardNumber(cardNumber);
      if(code) {
        expect(result.code).toEqual(code);
      } else {
        expect(result).toEqual(null);
      }
    });
  });
});

describe('Expiry date', () => {
  const joiner = '/';
  const getExpiryDate = (date: Date) => `${date.getMonth()}${joiner}${date.getFullYear() % 100}`;

  test('Format', () => {
    const month = 10;
    const year = 20;

    const {value} = formatValueByPattern(cardFormattingPatterns.cardExpiry, `${month}${year}`);
    expect(value).toEqual(`${month}${joiner}${year}`);
  });

  test('Expired', () => {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    expect(validateCardExpiry(getExpiryDate(date))).toBeTruthy();
  });

  test('Nonexpired', () => {
    const date = new Date();
    date.setFullYear(date.getFullYear() + 1);
    expect(validateCardExpiry(getExpiryDate(date))).toEqual(null);
  });
});
