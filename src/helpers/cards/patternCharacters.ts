import {fixBuggedNumbers} from '../string/buggedNumbers';
import replaceNonNumber from '../string/replaceNonNumber';

export type PatternCharacter = {
  type: 'optional',
  result: string,
  consumed: number
} | {
  type: 'required',
  result: string,
  consumed: number,
  partial?: boolean
} | {
  type: 'formatting',
  result: string,
  consumed: number
};

export type PatternFunction = (str: string) => ((str: string) => PatternCharacter)[];

function makeOptionalCharacter(result: string, consumed: number): PatternCharacter {
  return {type: 'optional', result, consumed};
}

function makeRequiredCharacter(result: string, consumed: number, partial?: boolean): PatternCharacter {
  return {type: 'required', result, consumed, partial};
}

function makeFormattingCharacter(result: string, consumed: number): PatternCharacter {
  return {type: 'formatting', result, consumed};
}

function wrapCharacterRegExpFactory(regExp: RegExp, optional?: boolean) {
  return (str: string) => {
    const _regExp = new RegExp('^'.concat(regExp.source.replace(/^\^/, '')));
    const match = str.match(_regExp);
    const makeCharacter = optional ? makeOptionalCharacter : makeRequiredCharacter;
    if(match) {
      const result = match[0];
      return makeCharacter(result, match.index + result.length);
    }

    return makeCharacter('', str.length);
  };
}

function makeCapitalPatternCharacter(str: string) {
  const char = wrapCharacterRegExpFactory(/\w/)(str);
  return char.result ? makeRequiredCharacter(char.result.toUpperCase(), char.consumed) : char;
}

const makeMonthDigitPatternCharacter = wrapCharacterRegExpFactory(/1[0-2]|0?[1-9]|0/);

function digit(str: string) {
  return wrapCharacterRegExpFactory(/[0-9]/)(fixBuggedNumbers(str));
}

const patternCharacters = {
  digit,
  capitalCharacter: makeCapitalPatternCharacter,
  month: (str: string) => {
    const char = makeMonthDigitPatternCharacter(fixBuggedNumbers(str));
    const cleanedResult = replaceNonNumber(char.result);
    const isPartial = ['0', '1'].includes(char.result) && str.length === 1;
    if(isPartial || (char.result === '0' && str.length >= 2)) {
      return makeRequiredCharacter(char.result, str.length, true);
    }

    return makeRequiredCharacter(cleanedResult.length === 1 ? '0' + cleanedResult : cleanedResult, char.consumed);
  },
  formattingCharacter: (str: string) => {
    return (str1: string) => {
      const consumed = str === str1[0] ? 1 : 0;
      return makeFormattingCharacter(str, consumed);
    }
  },
  optionalPattern: (regExp: RegExp) => {
    return (str: string) => {
      const char = wrapCharacterRegExpFactory(regExp, true)(str);
      return char.result ? char : makeOptionalCharacter('', 0);
    };
  }
};

export default patternCharacters;
