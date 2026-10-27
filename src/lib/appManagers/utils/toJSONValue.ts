import {JSONValue} from '@layer';

/**
 * A plain value as the MTProto `JSONValue` it is sent as — the inverse of what the deserializer
 * hands back for one. `undefined` goes as `jsonNull`.
 */
export default function toJSONValue(value: any): JSONValue {
  if(value === null || value === undefined) {
    return {_: 'jsonNull'};
  }

  switch(typeof(value)) {
    case 'boolean':
      return {_: 'jsonBool', value};
    case 'number':
      return {_: 'jsonNumber', value};
    case 'string':
      return {_: 'jsonString', value};
  }

  if(Array.isArray(value)) {
    return {_: 'jsonArray', value: value.map(toJSONValue)};
  }

  return {
    _: 'jsonObject',
    value: Object.entries(value).map(([key, value]) => ({_: 'jsonObjectValue', key, value: toJSONValue(value)}))
  };
}
