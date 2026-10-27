/*
 * `toJSONValue` builds the MTProto JSONValue the app log is sent with. The deserializer turns one
 * back into a plain value, so a round trip through both has to give back what went in.
 */

import {describe, expect, test} from 'vitest';
import toJSONValue from '@appManagers/utils/toJSONValue';
import {TLDeserialization, TLSerialization} from '@lib/mtproto/tl_utils';

function roundTrip(value: any) {
  const serializer = new TLSerialization();
  serializer.storeObject(toJSONValue(value), 'JSONValue');
  return new TLDeserialization(serializer.getBuffer()).fetchObject('JSONValue');
}

describe('toJSONValue', () => {
  test('spells each kind of value as its constructor', () => {
    expect(toJSONValue(null)).toEqual({_: 'jsonNull'});
    expect(toJSONValue(undefined)).toEqual({_: 'jsonNull'});
    expect(toJSONValue(false)).toEqual({_: 'jsonBool', value: false});
    expect(toJSONValue(1.5)).toEqual({_: 'jsonNumber', value: 1.5});
    expect(toJSONValue('x')).toEqual({_: 'jsonString', value: 'x'});
    expect(toJSONValue(['a', 1])).toEqual({_: 'jsonArray', value: [
      {_: 'jsonString', value: 'a'},
      {_: 'jsonNumber', value: 1}
    ]});
    expect(toJSONValue({a: true})).toEqual({_: 'jsonObject', value: [
      {_: 'jsonObjectValue', key: 'a', value: {_: 'jsonBool', value: true}}
    ]});
  });

  test.each([
    null,
    true,
    0,
    -12.25,
    '',
    'tme_getpremium_twitter',
    [],
    {},
    {premium_promo_order: ['stories', 'double_limits'], source: 'tme_getpremium'},
    {nested: {list: [1, 'two', null, {three: false}]}}
  ])('comes back from the wire as %j', (value) => {
    expect(roundTrip(value)).toEqual(value);
  });

  test('serializes the app log request the Premium offer sends', () => {
    const serializer = new TLSerialization();
    expect(() => serializer.storeMethod('help.saveAppLog', {
      events: [{
        _: 'inputAppEvent',
        time: 1760000000.25,
        type: 'premium.promo_screen_show',
        peer: 0,
        data: toJSONValue({premium_promo_order: ['stories'], source: 'tme_getpremium'})
      }]
    })).not.toThrow();
    expect(serializer.getBytes().length).toBeGreaterThan(0);
  });
});
