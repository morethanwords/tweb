import {KeyboardButtonRow} from '@layer';
import filterReplyMarkupRows from '@components/chat/bubbleParts/filterReplyMarkupRows';

describe('filterReplyMarkupRows', () => {
  it('keeps every rendered row and ignores empty rows', () => {
    const firstRow = {buttons: [{}]} as KeyboardButtonRow;
    const emptyRow = {buttons: []} as KeyboardButtonRow;
    const secondRow = {buttons: [{}, {}]} as KeyboardButtonRow;

    expect(filterReplyMarkupRows([firstRow, emptyRow, secondRow])).toEqual([firstRow, secondRow]);
  });
});
