// TON amounts come in nanotons; these stay free of any UI so that worker code can use them
import bigInt, {BigInteger} from 'big-integer';

const NANOTON_DECIMALS = 9;
export const GRAM_CURRENCY_SYMBOL = 'GRAM';

export function formatNanoton(amount: number | string | BigInteger, maxDecimals: number = 2, withThousandsSep = true) {
  let amountStr = String(amount);
  let negative = false;
  if(amountStr.startsWith('-')) {
    negative = true;
    amountStr = amountStr.slice(1);
  }

  // pad if needed
  if(amountStr.length < NANOTON_DECIMALS) {
    amountStr = amountStr.padStart(NANOTON_DECIMALS, '0');
  }
  let intPart = amountStr.slice(0, amountStr.length - NANOTON_DECIMALS) || '0';
  const fracPart = amountStr.slice(-NANOTON_DECIMALS).padEnd(NANOTON_DECIMALS, '0');

  // take decimals of fraction, with rounding
  let frac2 = fracPart.slice(0, maxDecimals);
  const nextDigit = fracPart.length > maxDecimals ? parseInt(fracPart[maxDecimals], 10) : 0;

  if(nextDigit >= 5) {
    const asNum = Number(frac2) + 1;
    if(asNum >= 10 ** maxDecimals) {
      intPart = bigInt(intPart).plus(1).toString();
      frac2 = '0'.repeat(maxDecimals);
    } else {
      frac2 = asNum.toString().padStart(maxDecimals, '0');
    }
  }

  let res = ''
  if(negative && (intPart !== '0' || Number(frac2) !== 0)) res += '-';

  if(withThousandsSep) {
    res += intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  } else {
    res += intPart;
  }

  if(maxDecimals > 0) {
    frac2 = frac2.replace(/0+$/, '');
    if(frac2) {
      res += '.' + frac2;
    }
  }

  return res;
}

export function nanotonToJsNumber(nanoton: number | string) {
  return Number(formatNanoton(nanoton, NANOTON_DECIMALS, false));
}

export function parseNanotonFromDecimal(decimal: string) {
  const negative = decimal.startsWith('-');
  const [int, frac = '0'] = (negative ? decimal.slice(1) : decimal).split('.');
  const intPart = int + '0'.repeat(NANOTON_DECIMALS);
  const fracPart = frac.padEnd(NANOTON_DECIMALS, '0').slice(0, NANOTON_DECIMALS);
  const amount = bigInt(intPart).plus(bigInt(fracPart));
  return negative ? amount.negate() : amount;
}
