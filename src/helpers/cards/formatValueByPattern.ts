import accumulate from '../array/accumulate';
import {PatternFunction} from './patternCharacters';

function accumulateLengths(strs: string[]) {
  return accumulate(strs.map((str) => str.length), 0);
}

function formatValueByPattern(
  getPattern: PatternFunction,
  value: string,
  options: Partial<{
    selectionStart: number,
    selectionEnd: number
  }> = {},
  pushRest?: boolean
) {
  const pattern = getPattern(value);

  if(!pattern) {
    return {
      value: value,
      selection: null as typeof options,
      autocorrectComplete: !!value
    };
  }

  const length = pattern.length;
  const c: string[] = [];
  const s: string[] = [];

  let l = 0;
  let i = 0;
  let f = options.selectionStart === 0 ? 0 : null;
  let d = options.selectionEnd === 0 ? 0 : null;
  const p = () => {
    if(f === null && (i + 1) >= options.selectionStart) f = accumulateLengths(c) + (pushRest ? s.length : 0);
    if(d === null && (i + 1) >= options.selectionEnd) d = accumulateLengths(c) + (pushRest ? s.length : 0);
  };
  const m = (e: number) => {
    if(e > 0) {
      p();
      i += e;
    }
  };

  for(; l < length;) {
    const getCharacter = pattern[l];
    const character = getCharacter(value.slice(i));
    const {type, result, consumed} = character;
    if(type === 'required') {
      if(result) {
        c.push(...s, result);
        s.length = 0;
        ++l;

        if(character.partial) {
          m(value.length - i);
          break;
        }

        m(consumed);
      } else {
        if(!consumed) {
          break;
        }

        m(1);
      }
    } else if(type === 'optional') {
      if(result) {
        c.push(...s, result);
        s.length = 0;
        m(consumed);
      }

      ++l;
    } else if(type === 'formatting') {
      if(!pushRest && i >= value.length) {
        break;
      }

      s.push(result);
      ++l;
      m(consumed);
    }
  }

  if(pushRest) {
    c.push(...s);
  }

  return {
    value: c.join(''),
    selection: {
      selectionStart: f === null || value.length && options.selectionStart === value.length ? accumulateLengths(c) : f,
      selectionEnd: d === null || value.length && options.selectionEnd === value.length ? accumulateLengths(c) : d
    },
    autocorrectComplete: l === length
  };
}

export default formatValueByPattern;
