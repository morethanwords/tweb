import pause from '../helpers/schedulers/pause';
import splitStringByLength from '../helpers/string/splitStringByLength';
import {MessageEntity} from '../layer';

const text = 'abc def ghi jkl mno pqr stu vwx yz';
// const text = 'abcdefghijklmnopqrstuvwxyz';
const entities: MessageEntity[] = [];
const maxLength = 3;
const parts = ['abc def ghi', 'jkl mno pqr', 'stu vwx yz'];

async function split(str: string, maxLength: number, entities: MessageEntity[]) {
  if(str.length <= maxLength) return [str];

  const delimiter = ' ';
  const out: {part: string, entities: MessageEntity[]}[] = [];

  let offset = 0;
  while(str.length) {
    const isEnd = (offset + maxLength) >= str.length;
    const sliced = str.slice(offset, offset + maxLength);
    if(!sliced.length) {
      break;
    }

    const delimiterIndex = !isEnd ? sliced.lastIndexOf(delimiter) : -1;
    console.log(`sliced='${sliced}'`);
    let good: string;
    if(delimiterIndex !== -1) {
      offset += delimiter.length;
      good = sliced.slice(0, delimiterIndex);
    } else {
      good = sliced;
    }

    if(!good.length) {
      continue;
    }

    offset += good.length;
    out.push({part: good, entities: []});
    console.log(`'${good}'`);

    // await pause(1000);
  }

  return out;
}

describe('Split string', () => {
  const splitted = split(text, maxLength, []);

  // console.log(parts, splitted);

  test('parts', () => {
    expect(1).toEqual(1);
  });

  test('a', async() => {
    console.log(await splitted);
  });

  // test('')
});
