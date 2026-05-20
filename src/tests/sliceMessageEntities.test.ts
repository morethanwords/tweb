import sliceMessageEntities from '@helpers/sliceMessageEntities';
import {MessageEntity} from '@layer';

describe('sliceMessageEntities', () => {
  test('messageEntityPre split at boundary — first part gets truncated entity', () => {
    const entities: MessageEntity[] = [{
      _: 'messageEntityPre',
      offset: 90,
      length: 30,
      language: 'js'
    }];

    // First part: [0, 100) — entity starts at 90, should be truncated to length 10
    const first = sliceMessageEntities(entities, 0, 100);
    expect(first).toEqual([{
      _: 'messageEntityPre',
      offset: 90,
      length: 10,
      language: 'js'
    }]);
  });

  test('messageEntityPre split at boundary — second part gets remainder with offset 0', () => {
    const entities: MessageEntity[] = [{
      _: 'messageEntityPre',
      offset: 90,
      length: 30,
      language: 'js'
    }];

    // Second part: [100, 120) — entity continues from 100 to 120, offset becomes 0, length 20
    const second = sliceMessageEntities(entities, 100, 20);
    expect(second).toEqual([{
      _: 'messageEntityPre',
      offset: 0,
      length: 20,
      language: 'js'
    }]);
  });

  test('entity entirely within first part is not included in second', () => {
    const entities: MessageEntity[] = [{
      _: 'messageEntityBold',
      offset: 10,
      length: 5
    }];

    const first = sliceMessageEntities(entities, 0, 100);
    expect(first).toEqual([{_: 'messageEntityBold', offset: 10, length: 5}]);

    const second = sliceMessageEntities(entities, 100, 100);
    expect(second).toEqual([]);
  });

  test('entity entirely within second part gets offset adjusted', () => {
    const entities: MessageEntity[] = [{
      _: 'messageEntityCode',
      offset: 150,
      length: 20
    }];

    const first = sliceMessageEntities(entities, 0, 100);
    expect(first).toEqual([]);

    const second = sliceMessageEntities(entities, 100, 100);
    expect(second).toEqual([{_: 'messageEntityCode', offset: 50, length: 20}]);
  });

  test('multiple entities across three parts', () => {
    const entities: MessageEntity[] = [
      {_: 'messageEntityBold', offset: 5, length: 10},
      {_: 'messageEntityPre', offset: 80, length: 60, language: 'ts'},
      {_: 'messageEntityItalic', offset: 200, length: 15}
    ];

    // Part 1: [0, 100)
    const p1 = sliceMessageEntities(entities, 0, 100);
    expect(p1).toEqual([
      {_: 'messageEntityBold', offset: 5, length: 10},
      {_: 'messageEntityPre', offset: 80, length: 20, language: 'ts'}
    ]);

    // Part 2: [100, 200)
    const p2 = sliceMessageEntities(entities, 100, 100);
    expect(p2).toEqual([
      {_: 'messageEntityPre', offset: 0, length: 40, language: 'ts'}
    ]);

    // Part 3: [200, 300)
    const p3 = sliceMessageEntities(entities, 200, 100);
    expect(p3).toEqual([
      {_: 'messageEntityItalic', offset: 0, length: 15}
    ]);
  });

  test('empty entities array returns empty', () => {
    expect(sliceMessageEntities([], 0, 100)).toEqual([]);
  });

  test('undefined-like entities returns empty', () => {
    expect(sliceMessageEntities(undefined as any, 0, 100)).toEqual([]);
  });

  test('entity exactly at boundary end is excluded', () => {
    const entities: MessageEntity[] = [{
      _: 'messageEntityBold',
      offset: 100,
      length: 10
    }];

    // Part [0, 100) — entity starts exactly at boundary, not included
    const first = sliceMessageEntities(entities, 0, 100);
    expect(first).toEqual([]);

    // Part [100, 200) — entity fully in this part
    const second = sliceMessageEntities(entities, 100, 100);
    expect(second).toEqual([{_: 'messageEntityBold', offset: 0, length: 10}]);
  });

  test('messageEntityTextUrl split preserves url on both halves', () => {
    const entities: MessageEntity[] = [{
      _: 'messageEntityTextUrl',
      offset: 40,
      length: 30,
      url: 'https://example.com'
    }];

    // Part [0, 50) — first 10 chars of link text
    const first = sliceMessageEntities(entities, 0, 50);
    expect(first).toEqual([{
      _: 'messageEntityTextUrl',
      offset: 40,
      length: 10,
      url: 'https://example.com'
    }]);

    // Part [50, 100) — remaining 20 chars of link text
    const second = sliceMessageEntities(entities, 50, 50);
    expect(second).toEqual([{
      _: 'messageEntityTextUrl',
      offset: 0,
      length: 20,
      url: 'https://example.com'
    }]);
  });

  test('entity ending exactly at boundary is included in first, not second', () => {
    const entities: MessageEntity[] = [{
      _: 'messageEntityBold',
      offset: 90,
      length: 10
    }];

    // Part [0, 100) — entity [90, 100) fully inside
    const first = sliceMessageEntities(entities, 0, 100);
    expect(first).toEqual([{_: 'messageEntityBold', offset: 90, length: 10}]);

    // Part [100, 200) — entity ends at 100, entityEnd <= offset
    const second = sliceMessageEntities(entities, 100, 100);
    expect(second).toEqual([]);
  });
});
