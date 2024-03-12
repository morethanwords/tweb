/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 *
 * Originally from:
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */

import Schema, {MTProtoConstructor, MTProtoMethod} from './schema';
import {JSONValue} from '../../layer';
import {MOUNT_CLASS_TO} from '../../config/debug';
import bytesToHex from '../../helpers/bytes/bytesToHex';
import isObject from '../../helpers/object/isObject';
import gzipUncompress from '../../helpers/gzipUncompress';
import bigInt from 'big-integer';
import ulongFromInts from '../../helpers/long/ulongFromInts';
import {safeBigInt} from '../../helpers/bigInt/bigIntConstants';
import {bigIntToSigned, bigIntToUnsigned} from '../../helpers/bigInt/bigIntConversion';

const boolFalse = +Schema.API.constructors.find((c) => c.predicate === 'boolFalse').id;
const boolTrue = +Schema.API.constructors.find((c) => c.predicate === 'boolTrue').id;
const vector = +Schema.API.constructors.find((c) => c.predicate === 'vector').id;
const gzipPacked = +Schema.MTProto.constructors.find((c) => c.predicate === 'gzip_packed').id;

// * using slice to have a new buffer, otherwise the buffer will be copied to main thread
const sliceMethod: 'slice' | 'subarray' = 'slice'; // subarray

class TLSerialization {
  private maxLength = 2048; // 2Kb
  private offset = 0; // in bytes
  private mtproto = false;
  private debug = false;// Modes.debug;

  private buffer: ArrayBuffer;
  private intView: Int32Array;
  private byteView: Uint8Array;

  constructor(options: Partial<{startMaxLength: number, mtproto: true}> = {}) {
    this.maxLength = options.startMaxLength || 2048; // 2Kb
    this.mtproto = options.mtproto || false;
    this.createBuffer();
  }

  public createBuffer() {
    this.buffer = new ArrayBuffer(this.maxLength);
    this.intView = new Int32Array(this.buffer);
    this.byteView = new Uint8Array(this.buffer);
  }

  public getArray() {
    const resultBuffer = new ArrayBuffer(this.offset);

    // let perf = performance.now();
    /* const resultUint8: any = new Uint8Array(resultBuffer);
    resultUint8.set(this.byteView.subarray(0, this.offset)); */
    // console.log('perf uint8', performance.now() - perf);

    // perf = performance.now();
    const resultInt32 = new Int32Array(resultBuffer);
    resultInt32.set(this.intView.subarray(0, this.offset / 4));
    // console.log('perf int32', performance.now() - perf);

    /* if(resultUint8.buffer.byteLength !== resultInt32.buffer.byteLength) {
      console.error(resultUint8, resultInt32);
    } */

    return resultInt32;
  }

  public getBuffer() {
    return this.getArray().buffer;
  }

  public getBytes(typed: true): Uint8Array;
  public getBytes(typed?: false): number[];
  public getBytes(typed: boolean = true): number[] | Uint8Array {
    if(typed) {
      const resultBuffer = new ArrayBuffer(this.offset);
      const resultArray = new Uint8Array(resultBuffer);

      resultArray.set(this.byteView.subarray(0, this.offset));

      return resultArray;
    }

    const bytes: number[] = new Array(this.offset);
    for(let i = 0; i < this.offset; ++i) {
      bytes[i] = this.byteView[i];
    }
    return bytes;
  }

  public getOffset() {
    return this.offset;
  }

  public checkLength(needBytes: number) {
    if(this.offset + needBytes < this.maxLength) {
      return;
    }

    // console.log('Increase buffer start', this.offset, needBytes, this.maxLength, this.byteView.slice(0, 32));
    this.maxLength = Math.ceil(Math.max(this.maxLength * 2, this.offset + needBytes + 16) / 4) * 4;
    const previousBuffer = this.buffer;
    // const previousByteView = this.byteView;
    const previousArray = new Int32Array(previousBuffer);

    this.createBuffer();

    new Int32Array(this.buffer).set(previousArray);
    /* console.log('Increase buffer end', this.offset, needBytes, this.maxLength, this.byteView.slice(0, 32),
      bytesCmp(previousByteView, this.byteView.slice(0, previousByteView.length))); */
  }

  public writeInt(i: number, field: string) {
    this.debug && console.log('>>>', i.toString(16), i, field);

    const offset = this.offset / 4;
    this.checkLength(4);
    this.intView[offset] = i;
    this.offset += 4;

    return offset;
  }

  public storeInt(i: number, field?: string) {
    return this.writeInt(i, (field || '') + ':int');
  }

  public storeBool(i: boolean, field?: string) {
    if(i) {
      this.writeInt(boolTrue, (field || '') + ':bool');
    } else {
      this.writeInt(boolFalse, (field || '') + ':bool');
    }
  }

  public storeLongP(iHigh: number, iLow: number, field?: string) {
    this.writeInt(iLow, (field || '') + ':long[low]');
    this.writeInt(iHigh, (field || '') + ':long[high]');
  }

  public storeLong(sLong: Array<number> | string | number, field?: string) {
    if(Array.isArray(sLong)) {
      if(sLong.length === 2) {
        return this.storeLongP(sLong[0], sLong[1], field);
      } else {
        return this.storeIntBytes(sLong, 64, field);
      }
    }

    const _bigInt = bigIntToUnsigned(bigInt(sLong as string));
    const {quotient, remainder} = _bigInt.divmod(0x100000000);
    const high = quotient.toJSNumber();
    const low = remainder.toJSNumber();

    this.writeInt(low, (field || '') + ':long[low]');
    this.writeInt(high, (field || '') + ':long[high]');
  }

  public storeDouble(f: any, field?: string) {
    const buffer = new ArrayBuffer(8);
    const intView = new Int32Array(buffer);
    const doubleView = new Float64Array(buffer);

    doubleView[0] = f;

    this.writeInt(intView[0], (field || '') + ':double[low]');
    this.writeInt(intView[1], (field || '') + ':double[high]');
  }

  public storeString(s: string, field?: string) {
    this.debug && console.log('>>>', s, (field || '') + ':string');

    if(s === undefined) {
      s = '';
    }
    const sUTF8 = unescape(encodeURIComponent(s));

    this.checkLength(sUTF8.length + 8);

    const len = sUTF8.length;
    if(len <= 253) {
      this.byteView[this.offset++] = len;
    } else {
      this.byteView[this.offset++] = 254;
      this.byteView[this.offset++] = len & 0xFF;
      this.byteView[this.offset++] = (len & 0xFF00) >> 8;
      this.byteView[this.offset++] = (len & 0xFF0000) >> 16;
    }
    for(let i = 0; i < len; ++i) {
      this.byteView[this.offset++] = sUTF8.charCodeAt(i);
    }

    // Padding
    while(this.offset % 4) {
      this.byteView[this.offset++] = 0;
    }
  }

  public storeBytes(bytes: ArrayBuffer | Uint8Array | number[], field?: string) {
    if(bytes instanceof ArrayBuffer) {
      bytes = new Uint8Array(bytes);
    } else if(bytes === undefined) {
      bytes = [];
    }

    this.debug && console.log('>>>', bytesToHex(bytes as number[]), (field || '') + ':bytes');

    // if uint8array was json.stringified, then will be: {'0': 123, '1': 123}
    const len = (bytes as Uint8Array).length;
    this.checkLength(len + 8);
    if(len <= 253) {
      this.byteView[this.offset++] = len;
    } else {
      this.byteView[this.offset++] = 254;
      this.byteView[this.offset++] = len & 0xFF;
      this.byteView[this.offset++] = (len & 0xFF00) >> 8;
      this.byteView[this.offset++] = (len & 0xFF0000) >> 16;
    }

    this.byteView.set(bytes as Uint8Array, this.offset);
    this.offset += len;

    // Padding
    while(this.offset % 4) {
      this.byteView[this.offset++] = 0;
    }
  }

  public storeIntBytes(bytes: ArrayBuffer | Uint8Array | number[], bits: number, field?: string) {
    if(bytes instanceof ArrayBuffer) {
      bytes = new Uint8Array(bytes);
    }

    const len = (bytes as Uint8Array).length;
    if((bits % 32) || (len * 8) !== bits) {
      const error = new Error('Invalid bits: ' + bits + ', ' + len);
      console.error(error, bytes, field);
      throw error;
    }

    this.debug && console.log('>>>', bytesToHex(bytes as Uint8Array), (field || '') + ':int' + bits);
    this.checkLength(len);

    this.byteView.set(bytes as Uint8Array, this.offset);
    this.offset += len;
  }

  public storeRawBytes(bytes: ArrayLike<number>, field?: string) {
    if(bytes instanceof ArrayBuffer) {
      bytes = new Uint8Array(bytes);
    }

    const len = bytes.length;

    this.debug && console.log('>>>', bytesToHex(bytes), (field || ''));
    this.checkLength(len);

    this.byteView.set(bytes, this.offset);
    this.offset += len;
  }

  public storeMethod(methodName: string, params: any) {
    const schema = this.mtproto ? Schema.MTProto : Schema.API;
    const methodData = schema.methods.find((m) => m.method === methodName);

    if(!methodData) {
      throw new Error('No method ' + methodName + ' found');
    }

    this.storeInt(methodData.id, methodName + '[id]');

    this.storeBody(params, methodData, methodName);

    return methodData.type;
  }

  public storeObject(obj: any, type: string, field?: string) {
    switch(type) {
      case '#':
        obj ||= 0;
      case 'int':
        return this.storeInt(obj, field);
      case 'long':
        return this.storeLong(obj, field);
      case 'int128':
        return this.storeIntBytes(obj, 128, field);
      case 'int256':
        return this.storeIntBytes(obj, 256, field);
      case 'int512':
        return this.storeIntBytes(obj, 512, field);
      case 'string':
        return this.storeString(obj, field);
      case 'bytes':
        return this.storeBytes(obj, field);
      case 'double':
        return this.storeDouble(obj, field);
      case 'Bool':
        return this.storeBool(obj, field);
      case 'true':
        return;
    }

    if(Array.isArray(obj)) {
      if(type.substr(0, 6) === 'Vector') {
        this.writeInt(vector, field + '[id]');
      } else if(type.substr(0, 6) !== 'vector') {
        throw new Error('Invalid vector type ' + type);
      }

      const itemType = type.substr(7, type.length - 8); // for "Vector<itemType>"
      this.writeInt(obj.length, field + '[count]');
      for(let i = 0; i < obj.length; ++i) {
        this.storeObject(obj[i], itemType, field + '[' + i + ']');
      }

      return true;
    } else if(type.substr(0, 6).toLowerCase() === 'vector') {
      throw new Error('Invalid vector object');
    }

    if(!isObject(obj)) {
      throw new Error('Invalid object for type ' + type);
    }

    const schema = this.mtproto ? Schema.MTProto : Schema.API;
    const predicate = obj['_'];
    let isBare = false;
    const constructorData: MTProtoConstructor = schema.constructors.find((c) => c.predicate === predicate);

    if(isBare = (type.charAt(0) === '%')) {
      type = type.substr(1);
    }

    if(!constructorData) {
      throw new Error('No predicate ' + predicate + ' found');
    }

    if(predicate === type) {
      isBare = true;
    }

    if(!isBare) {
      this.writeInt(constructorData.id, field + '[' + predicate + '][id]');
    }

    this.storeBody(obj, constructorData, field + '[' + predicate + ']');

    return constructorData.type;
  }

  private storeBody(obj: any, constructorData: MTProtoConstructor | MTProtoMethod, field: string) {
    const pFlags = obj.pFlags || obj; // * support pFlags, though am not expecting it to be there
    let flagsHandler: {[paramName: string]: {flags: number, offset?: number}};
    for(const param of constructorData.params) {
      let type = param.type;

      if(type.indexOf('?') !== -1) {
        const condType = type.split('?');
        const fieldBit = condType[0].split('.');

        // * commented to avoid using 'flags' property
        // if(!(obj[fieldBit[0]] & (1 << +fieldBit[1]))) {
        if(condType[1] === 'true' ? pFlags?.[param.name] : obj[param.name] !== undefined) {
          flagsHandler[fieldBit[0]].flags |= 1 << +fieldBit[1];
        } else {
          continue;
        }
        // }

        type = condType[1];
      }

      const isFlagHandler = type === '#';
      if(isFlagHandler) {
        (flagsHandler ??= {})[param.name] = {flags: 0};
      }

      const result = this.storeObject(
        isFlagHandler ? flagsHandler[param.name].flags : obj[param.name],
        type,
        field + '[' + param.name + ']'
      );

      if(isFlagHandler) {
        flagsHandler[param.name].offset = result as number;
      }
    }

    for(const paramName in flagsHandler) {
      const {flags, offset} = flagsHandler[paramName];
      this.intView[offset] = flags;
    }
  }
}

class TLDeserialization<FetchLongAs extends Long> {
  private offset = 0; // in bytes
  private override: {[key: string]: (result: any, field: string) => void};

  private buffer: ArrayBuffer;
  private intView: Int32Array;
  private byteView: Uint8Array;

  // this.debug =
  private mtproto: boolean = false;
  private debug: boolean;

  constructor(buffer: ArrayBuffer | Uint8Array, options: Partial<{override: any, mtproto: true, debug: true}> = {}) {
    // buffer = addPadding(buffer, 4, true); // fix 21.01.2020 for wss
    if(buffer instanceof ArrayBuffer) {
      this.buffer = buffer;
      this.intView = new Int32Array(buffer);
      this.byteView = new Uint8Array(this.buffer);
    } else {
      this.buffer = buffer.buffer;
      this.intView = new Int32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
      this.byteView = buffer;
    }

    this.override = options.override || {};
    this.mtproto = !!options.mtproto;
    this.debug = options.debug !== undefined ? options.debug : /* Modes.debug */false;
  }

  /* public setMtproto(mtproto: boolean) {
    this.mtproto = mtproto;
  } */

  private readInt(field: string) {
    // if(this.offset >= this.intView.length * 4) {
    if((this.byteView.length - this.offset) < 4) {
      console.error(this.byteView, this.offset);
      throw new Error('Nothing to fetch: ' + field);
    }

    const i = this.intView[this.offset / 4];
    // const i = new Uint32Array(this.byteView.buffer.slice(this.offset, this.offset + 4))[0];

    this.debug &&/*  || field.includes('[dialog][read_outbox_max_id]') */
      console.log('<<<', i.toString(16), i, field,
        this.byteView.slice(this.offset - 16, this.offset + 16),
        bytesToHex(this.byteView.slice(this.offset - 16, this.offset + 16)));

    this.offset += 4;

    return i;
  }

  public fetchInt(field?: string) {
    return this.readInt((field || '') + ':int');
  }

  public fetchDouble(field?: string) {
    const buffer = new ArrayBuffer(8);
    const intView = new Int32Array(buffer);
    const doubleView = new Float64Array(buffer);

    intView[0] = this.readInt((field || '') + ':double[low]'),
    intView[1] = this.readInt((field || '') + ':double[high]');

    return doubleView[0];
  }

  // ! it should've been signed
  public fetchLong(field?: string): FetchLongAs {
    const iLow = this.readInt((field || '') + ':long[low]');
    const iHigh = this.readInt((field || '') + ':long[high]');

    let ulong = ulongFromInts(iHigh, iLow);
    if(/* !unsigned &&  */!this.mtproto) { // make it signed
      ulong = bigIntToSigned(ulong);
    }

    if(!this.mtproto) {
      if(safeBigInt.greaterOrEquals(ulong.abs())) {
        // @ts-ignore
        return ulong.toJSNumber();
      }
    }

    // @ts-ignore
    return ulong.toString(10);
  }

  public fetchBool(field?: string): boolean {
    const i = this.readInt((field || '') + ':bool');
    if(i === boolTrue) {
      return true;
    } else if(i === boolFalse) {
      return false;
    }

    this.offset -= 4;
    return this.fetchObject('Object', field);
  }

  public fetchString(field?: string): string {
    let len = this.byteView[this.offset++];

    if(len === 254) {
      len = this.byteView[this.offset++] |
        (this.byteView[this.offset++] << 8) |
        (this.byteView[this.offset++] << 16);
    }

    let sUTF8 = '';
    for(let i = 0; i < len; ++i) {
      sUTF8 += String.fromCharCode(this.byteView[this.offset++]);
    }

    // Padding
    while(this.offset % 4) {
      ++this.offset;
    }

    let s: string;
    try {
      s = decodeURIComponent(escape(sUTF8));
    } catch(e) {
      s = sUTF8;
    }

    this.debug && console.log('<<<', s, (field || '') + ':string');

    return s;
  }

  public fetchBytes(field?: string) {
    let len = this.byteView[this.offset++];

    if(len === 254) {
      len = this.byteView[this.offset++] |
        (this.byteView[this.offset++] << 8) |
        (this.byteView[this.offset++] << 16);
    }

    const bytes = this.byteView[sliceMethod](this.offset, this.offset + len);
    this.offset += len;

    // Padding
    while(this.offset % 4) {
      ++this.offset;
    }

    this.debug && console.log('<<<', bytesToHex(bytes), (field || '') + ':bytes');

    return bytes;
  }

  public fetchIntBytes(bits: number, typed: true, field?: string): Uint8Array;
  public fetchIntBytes(bits: number, typed?: false, field?: string): number[];
  public fetchIntBytes(bits: number, typed: boolean = true, field?: string) {
    if(bits % 32) {
      throw new Error('Invalid bits: ' + bits);
    }

    const len = bits / 8;
    if(typed) {
      const result = this.byteView[sliceMethod](this.offset, this.offset + len);
      this.offset += len;
      return result;
    }

    const bytes: number[] = new Array(len);
    for(let i = 0; i < len; ++i) {
      bytes[i] = this.byteView[this.offset++];
    }

    this.debug && console.log('<<<', bytesToHex(bytes), (field || '') + ':int' + bits);

    return bytes;
  }

  public fetchRawBytes(len: number | false, typed: true, field: string): Uint8Array;
  public fetchRawBytes(len: number | false, typed: false, field: string): number[];
  public fetchRawBytes(len: number | false, typed: boolean = true, field: string) {
    if(len === false) {
      len = this.readInt((field || '') + '_length');
      if(len > this.byteView.byteLength) {
        throw new Error('Invalid raw bytes length: ' + len + ', buffer len: ' + this.byteView.byteLength);
      }
    }

    if(typed) {
      const bytes = new Uint8Array(len);
      bytes.set(this.byteView[sliceMethod](this.offset, this.offset + len));
      this.offset += len;
      return bytes;
    }

    const bytes: number[] = new Array(len);
    for(let i = 0; i < len; ++i) {
      bytes[i] = this.byteView[this.offset++];
    }

    this.debug && console.log('<<<', bytesToHex(bytes), (field || ''));

    return bytes;
  }

  private fetchVector(type: string, field?: string) {
    const len = this.readInt(field + '[count]');
    const result: any[] = new Array(len);
    if(len > 0) {
      const itemType = type.substr(7, type.length - 8); // for "Vector<itemType>"
      for(let i = 0; i < len; ++i) {
        result[i] = this.fetchObject(itemType, field + '[' + i + ']');
      }
    }

    return result;
  }

  public fetchObject(type: string, field?: string): any {
    switch(type) {
      case '#':
      case 'int':
        return this.fetchInt(field);
      case 'long':
        return this.fetchLong(field);
      case 'int128':
        return this.fetchIntBytes(128, true, field);
      case 'int256':
        return this.fetchIntBytes(256, true, field);
      case 'int512':
        return this.fetchIntBytes(512, true, field);
      case 'string':
        return this.fetchString(field);
      case 'bytes':
        return this.fetchBytes(field);
      case 'double':
        return this.fetchDouble(field);
      case 'Bool':
        return this.fetchBool(field);
      case 'true':
        return true;
    }

    field = field || type || 'Object';

    if(type.charAt(0) === 'v' && type.substr(1, 5) === 'ector') {
      return this.fetchVector(type, field);
    }

    const schema = this.mtproto ? Schema.MTProto : Schema.API;
    let constructorData: MTProtoConstructor = null;
    let fallback = false;

    if(type.charAt(0) === '%') {
      const checkType = type.substr(1);
      constructorData = schema.constructors.find((c) => c.type === checkType);
      if(!constructorData) {
        throw new Error('Constructor not found for type: ' + type);
      }
    }/*  else if(type.charAt(0) >= 97 && type.charAt(0) <= 122) {
      constructorData = schema.constructors.find((c) => c.predicate === type);
      if(!constructorData) {
        throw new Error('Constructor not found for predicate: ' + type);
      }
    } */ else {
      const constructorCmp = this.readInt(field + '[id]');

      if(constructorCmp === gzipPacked) { // Gzip packed
        const compressed = this.fetchBytes(field + '[packed_string]');
        const uncompressed = gzipUncompress(compressed) as Uint8Array;
        const newDeserializer = new TLDeserialization(uncompressed); // rpc_result is packed here

        return newDeserializer.fetchObject(type, field);
      }

      if(constructorCmp === vector) {
        return this.fetchVector(type, field);
      }

      let index = schema.constructorsIndex;
      if(!index) {
        schema.constructorsIndex = index = {};
        for(let i = 0, len = schema.constructors.length; i < len; ++i) {
          index[schema.constructors[i].id] = i;
        }
      }

      const i = index[constructorCmp];
      if(i !== undefined) {
        constructorData = schema.constructors[i];
      }

      if(!constructorData && this.mtproto) {
        const schemaFallback = Schema.API;
        for(let i = 0, len = schemaFallback.constructors.length; i < len; ++i) {
          if(+schemaFallback.constructors[i].id === constructorCmp) {
            constructorData = schemaFallback.constructors[i];

            delete this.mtproto;
            fallback = true;
            break;
          }
        }
      }

      if(!constructorData) {
        console.error('Constructor not found:', constructorCmp);

        let int1: number, int2: number;
        try {
          int1 = this.fetchInt(field);
          int2 = this.fetchInt(field);
        } catch(err) {

        }

        throw new Error('Constructor not found: ' + constructorCmp + ' ' + int1 + ' ' + int2 + ' ' + field);
      }
    }

    const predicate = constructorData.predicate;

    const result: any = {'_': predicate};
    const overrideKey = (this.mtproto ? 'mt_' : '') + predicate;
    if(this.override[overrideKey]) {
      this.override[overrideKey](result, field + '[' + predicate + ']');
    } else {
      // * will use local flags storage to avoid passing 'flags' property anywhere
      let flagsHandler: {[name: string]: number} = {};
      for(let i = 0, len = constructorData.params.length; i < len; ++i) {
        const param = constructorData.params[i];
        let type = param.type;

        const isFlagHandler = type === '#';
        if(isFlagHandler) {
          result.pFlags ??= {};
          (flagsHandler ??= {})[param.name] = 0;
        }

        const isCond = type.indexOf('?') !== -1;
        if(isCond) {
          const condType = type.split('?');
          const fieldBit = condType[0].split('.');

          if(!(flagsHandler[fieldBit[0]] & (1 << +fieldBit[1]))) {
            continue;
          }

          type = condType[1];
        }

        const value = this.fetchObject(type, field + '[' + predicate + '][' + param.name + ']');

        if(isCond && type === 'true') {
          result.pFlags[param.name] = value;
        } else {
          (isFlagHandler ? flagsHandler : result)[param.name] = value;
        }
      }
    }

    if(fallback) {
      this.mtproto = true;
    }

    if(type === 'JSONValue') {
      return this.formatJSONValue(result);
    }

    return result;
  }

  private formatJSONValue(jsonValue: JSONValue): any {
    if(!jsonValue._) return jsonValue;
    switch(jsonValue._) {
      case 'jsonNull':
        return null;
      case 'jsonObject': {
        const out: any = {};
        const objectValues = jsonValue.value;
        for(let i = 0, length = objectValues.length; i < length; ++i) {
          const objectValue = objectValues[i];
          out[objectValue.key] = this.formatJSONValue(objectValue.value);
        }
        return out;
      }
      default:
        return jsonValue.value;
    }
  }

  public getOffset() {
    return this.offset;
  }

  public setOffset(offset: number) {
    this.offset = offset;
  }

  /* public fetchEnd() {
    if(this.offset !== this.byteView.length) {
      throw new Error('Fetch end with non-empty buffer');
    }

    return true;
  } */
}

MOUNT_CLASS_TO.TLDeserialization = TLDeserialization;
MOUNT_CLASS_TO.TLSerialization = TLSerialization;
export {TLDeserialization, TLSerialization};
