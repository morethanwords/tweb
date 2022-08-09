import bigInt from 'big-integer';

export const safeBigInt = bigInt(Number.MAX_SAFE_INTEGER);
export const ulongBigInt = bigInt(bigInt[2]).pow(64);
export const longBigInt = ulongBigInt.divide(bigInt[2]);
