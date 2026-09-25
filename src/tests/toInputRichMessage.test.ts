import toInputRichMessage from '@appManagers/utils/richMessage/toInputRichMessage';
import {validateRichMessage} from '@appManagers/utils/richMessage/validateRichMessage';
import type {PageBlock, RichMessage, RichText} from '@layer';

const auto: RichText = {_: 'textBold', text: {_: 'textAutoUrl', text: {_: 'textPlain', text: 'https://example.com'}}};
const plain: RichText = {_: 'textPlain', text: 'Body'};
const credit: RichText = {_: 'textConcat', texts: [{_: 'textPlain', text: 'A'}, {_: 'textPlain', text: 'B'}]};
const caption = {_: 'pageCaption' as const, text: auto, credit};
const map: PageBlock = {_: 'pageBlockMap', geo: {_: 'geoPoint', access_hash: '1', lat: 20, long: 1}, w: 400, h: 200, zoom: 4, caption};
const list: PageBlock = {_: 'pageBlockOrderedList', pFlags: {reversed: true}, start: 7, type: 'I', items: [{
  _: 'pageListOrderedItemBlocks', pFlags: {checkbox: true, checked: true}, value: 7, type: 'I', num: 'VII', blocks: [map]
}]};
const containers: PageBlock[] = [
  list,
  {_: 'pageBlockList', items: [{_: 'pageListItemBlocks', pFlags: {}, blocks: [list]}]},
  {_: 'pageBlockBlockquoteBlocks', caption: auto, blocks: [list]},
  {_: 'pageBlockDetails', pFlags: {open: true}, title: plain, blocks: [list]},
  {_: 'pageBlockTable', pFlags: {striped: true}, title: auto, rows: [{_: 'pageTableRow', cells: [{_: 'pageTableCell', pFlags: {}, text: auto}]}]},
  {_: 'pageBlockPhoto', pFlags: {spoiler: true}, photo_id: '1', caption},
  {_: 'pageBlockBlockquote', pFlags: {}, text: auto, caption: credit},
  {_: 'pageBlockPullquote', text: auto, caption: credit}
];

test.each(containers)('normalizes nested server-only fields without changing $_', block => {
  const message: RichMessage.richMessage = {_: 'richMessage', pFlags: {rtl: true}, blocks: [block], photos: [], documents: []};
  const before = JSON.stringify(message);
  const input = toInputRichMessage(message);
  expect(validateRichMessage(input)).toMatchObject({valid: true});
  expect(input.pFlags.rtl).toBe(true);
  expect(input.pFlags.noautolink).toBeUndefined();
  expect(JSON.stringify(input)).not.toMatch(/textAutoUrl|"_":"pageBlockMap"|"num"/);
  expect(toInputRichMessage(message)).toEqual(input);
  expect(JSON.stringify(message)).toBe(before);
});

test('preserves ordered list direction, style and item overrides', () => {
  const message: RichMessage.richMessage = {_: 'richMessage', pFlags: {}, blocks: [list], photos: [], documents: []};
  expect(toInputRichMessage(message).blocks[0]).toMatchObject({
    pFlags: {reversed: true}, start: 7, type: 'I',
    items: [{pFlags: {checkbox: true, checked: true}, value: 7, type: 'I', blocks: [{_: 'inputPageBlockMap'}]}]
  });
});
