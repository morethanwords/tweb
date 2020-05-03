/*!
 * Webogram v0.7.0 - messaging web application for MTProto
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */

import {bigint, intToUint, bigStringInt, bytesToHex, uintToInt, isObject} from '../bin_utils';
import Schema from './schema';

/// #if MTPROTO_WORKER
// @ts-ignore
import {gzipUncompress} from '../crypto/crypto_utils';
/// #else
// @ts-ignore
import {gzipUncompress} from '../bin_utils';
/// #endif

const boolFalse = +Schema.API.constructors.find((c: any) => c.predicate == 'boolFalse').id >>> 0;
const boolTrue = +Schema.API.constructors.find((c: any) => c.predicate == 'boolTrue').id >>> 0;
const vector = +Schema.API.constructors.find((c: any) => c.predicate == 'vector').id >>> 0;
const gzipPacked = +Schema.MTProto.constructors.find((c: any) => c.predicate == 'gzip_packed').id >>> 0;

//console.log('boolFalse', boolFalse == 0xbc799737);

class TLSerialization {
  public maxLength = 2048; // 2Kb
  public offset = 0; // in bytes
  public mtproto = false;
  private debug = false;//Modes.debug;

  public buffer: ArrayBuffer;
  public intView: Int32Array;
  public byteView: Uint8Array;

  constructor(options: any = {}) {
    this.maxLength = options.startMaxLength || 2048 // 2Kb
    this.mtproto = options.mtproto || false;
    this.createBuffer();
  }

  public createBuffer() {
    this.buffer = new ArrayBuffer(this.maxLength);
    this.intView = new Int32Array(this.buffer);
    this.byteView = new Uint8Array(this.buffer);
  }

  public getArray() {
    let resultBuffer = new ArrayBuffer(this.offset);
    let resultArray = new Int32Array(resultBuffer);
  
    resultArray.set(this.intView.subarray(0, this.offset / 4));
  
    return resultArray;
  }

  public getBuffer() {
    return this.getArray().buffer;
  }

  public getBytes(typed: true): Uint8Array;
  public getBytes(typed?: false): number[];
  public getBytes(typed?: boolean): number[] | Uint8Array {
    if(typed) {
      let resultBuffer = new ArrayBuffer(this.offset);
      let resultArray = new Uint8Array(resultBuffer);
  
      resultArray.set(this.byteView.subarray(0, this.offset));
  
      return resultArray;
    }
  
    let bytes: number[] = [];
    for(var i = 0; i < this.offset; i++) {
      bytes.push(this.byteView[i]);
    }
    return bytes;
  }

  public checkLength(needBytes: number) {
    if(this.offset + needBytes < this.maxLength) {
      return;
    }
  
    ///console.trace('Increase buffer', this.offset, needBytes, this.maxLength);
    this.maxLength = Math.ceil(Math.max(this.maxLength * 2, this.offset + needBytes + 16) / 4) * 4;
    var previousBuffer = this.buffer;
    var previousArray = new Int32Array(previousBuffer);
  
    this.createBuffer();
  
    new Int32Array(this.buffer).set(previousArray);
  }

  public writeInt(i: number, field: string) {
    this.debug && console.log('>>>', i.toString(16), i, field);
  
    this.checkLength(4);
    this.intView[this.offset / 4] = i;
    this.offset += 4;
  }
  
  public storeInt(i: number, field?: string) {
    this.writeInt(i, (field || '') + ':int');
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
      if(sLong.length == 2) {
        return this.storeLongP(sLong[0], sLong[1], field);
      } else {
        return this.storeIntBytes(sLong, 64, field);
      }
    }
  
    if(typeof sLong != 'string') {
      sLong = sLong ? sLong.toString() : '0';
    }
    var divRem = bigStringInt(sLong).divideAndRemainder(bigint(0x100000000));
  
    this.writeInt(intToUint(divRem[1].intValue()), (field || '') + ':long[low]');
    this.writeInt(intToUint(divRem[0].intValue()), (field || '') + ':long[high]');
  }
  
  public storeDouble(f: any, field?: string) {
    var buffer = new ArrayBuffer(8);
    var intView = new Int32Array(buffer);
    var doubleView = new Float64Array(buffer);
  
    doubleView[0] = f;
  
    this.writeInt(intView[0], (field || '') + ':double[low]');
    this.writeInt(intView[1], (field || '') + ':double[high]');
  }
  
  public storeString(s: string, field?: string) {
    this.debug && console.log('>>>', s, (field || '') + ':string');
  
    if(s === undefined) {
      s = '';
    }
    var sUTF8 = unescape(encodeURIComponent(s));
  
    this.checkLength(sUTF8.length + 8);
  
    var len = sUTF8.length;
    if(len <= 253) {
      this.byteView[this.offset++] = len;
    } else {
      this.byteView[this.offset++] = 254;
      this.byteView[this.offset++] = len & 0xFF;
      this.byteView[this.offset++] = (len & 0xFF00) >> 8;
      this.byteView[this.offset++] = (len & 0xFF0000) >> 16;
    }
    for(var i = 0; i < len; i++) {
      this.byteView[this.offset++] = sUTF8.charCodeAt(i);
    }
  
    // Padding
    while(this.offset % 4) {
      this.byteView[this.offset++] = 0;
    }
  }
  
  public storeBytes(bytes: any, field?: string) {
    if(bytes instanceof ArrayBuffer) {
      bytes = new Uint8Array(bytes);
    } else if(bytes === undefined) {
      bytes = [];
    }
    this.debug && console.log('>>>', bytesToHex(bytes), (field || '') + ':bytes');
  
    // if uint8array were json.stringified, then will be: {'0': 123, '1': 123}
    var len = bytes.byteLength || bytes.length;
    this.checkLength(len + 8)
    if(len <= 253) {
      this.byteView[this.offset++] = len;
    } else {
      this.byteView[this.offset++] = 254;
      this.byteView[this.offset++] = len & 0xFF;
      this.byteView[this.offset++] = (len & 0xFF00) >> 8;
      this.byteView[this.offset++] = (len & 0xFF0000) >> 16;
    }
  
    this.byteView.set(bytes, this.offset);
    this.offset += len;
  
    // Padding
    while(this.offset % 4) {
      this.byteView[this.offset++] = 0;
    }
  }
  
  public storeIntBytes(bytes: any, bits: any, field?: string) {
    if(bytes instanceof ArrayBuffer) {
      bytes = new Uint8Array(bytes);
    }

    var len = bytes.length;
    if((bits % 32) || (len * 8) != bits) {
      throw new Error('Invalid bits: ' + bits + ', ' + bytes.length);
    }
  
    this.debug && console.log('>>>', bytesToHex(bytes), (field || '') + ':int' + bits);
    this.checkLength(len);
  
    this.byteView.set(bytes, this.offset);
    this.offset += len;
  }
  
  public storeRawBytes(bytes: any, field?: string) {
    if(bytes instanceof ArrayBuffer) {
      bytes = new Uint8Array(bytes);
    }

    var len = bytes.length;
  
    this.debug && console.log('>>>', bytesToHex(bytes), (field || ''));
    this.checkLength(len);
  
    this.byteView.set(bytes, this.offset);
    this.offset += len;
  }
  
  public storeMethod(methodName: string, params: any) {
    var schema = this.mtproto ? Schema.MTProto : Schema.API;
    var methodData: any = false,
      i;
  
    for(i = 0; i < schema.methods.length; i++) {
      if(schema.methods[i].method == methodName) {
        methodData = schema.methods[i];
        break;
      }
    }
    if(!methodData) {
      throw new Error('No method ' + methodName + ' found');
    }
  
    this.storeInt(intToUint(methodData.id), methodName + '[id]');
  
    var param, type;
    var i, condType;
    var fieldBit;
    var len = methodData.params.length;
    //console.log('storeMethod', len, methodData);
    for(i = 0; i < len; i++) {
      param = methodData.params[i];
      type = param.type;
      if(type.indexOf('?') !== -1) {
        condType = type.split('?');
        fieldBit = condType[0].split('.');
        if(!(params[fieldBit[0]] & (1 << fieldBit[1]))) {
          continue;
        }
        type = condType[1];
      }
  
      this.storeObject(params[param.name], type, methodName + '[' + param.name + ']');
    }
  
    return methodData.type;
  }
  
  public storeObject(obj: any, type: string, field?: string) {
    //console.log('storeObject', obj, type, field, this.offset, this.getBytes(true).hex);
    switch(type) {
      case '#':
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
        return
    }
  
    if(Array.isArray(obj)) {
      if(type.substr(0, 6) == 'Vector') {
        this.writeInt(vector, field + '[id]');
      } else if (type.substr(0, 6) != 'vector') {
        throw new Error('Invalid vector type ' + type);
      }

      var itemType = type.substr(7, type.length - 8); // for "Vector<itemType>"
      this.writeInt(obj.length, field + '[count]');
      for(var i = 0; i < obj.length; i++) {
        this.storeObject(obj[i], itemType, field + '[' + i + ']');
      }

      return true;
    } else if (type.substr(0, 6).toLowerCase() == 'vector') {
      throw new Error('Invalid vector object');
    }
    
    if(!isObject(obj)) {
      throw new Error('Invalid object for type ' + type);
    }
  
    var schema = this.mtproto ? Schema.MTProto : Schema.API;
    var predicate = obj['_'];
    var isBare = false;
    var constructorData: any = false;
  
    if(isBare = (type.charAt(0) == '%')) {
      type = type.substr(1);
    }
  
    for(i = 0; i < schema.constructors.length; i++) {
      if(schema.constructors[i].predicate == predicate) {
        constructorData = schema.constructors[i];
        break;
      }
    }
    if(!constructorData) {
      throw new Error('No predicate ' + predicate + ' found');
    }
  
    if(predicate == type) {
      isBare = true;
    }
  
    if(!isBare) {
      this.writeInt(intToUint(constructorData.id), field + '[' + predicate + '][id]');
    }
  
    var param, type: string;
    var condType;
    var fieldBit;
    var len = constructorData.params.length;
    //console.log('storeObject', len, constructorData);
    for(i = 0; i < len; i++) {
      param = constructorData.params[i];
      type = param.type;

      //console.log('storeObject', param, type);
      if(type.indexOf('?') !== -1) {
        condType = type.split('?');
        fieldBit = condType[0].split('.');
        //console.log('storeObject fieldBit', fieldBit, obj[fieldBit[0]]);
        if(!(obj[fieldBit[0]] & (1 << +fieldBit[1]))) {
          continue;
        }
        type = condType[1];
      }
      //console.log('storeObject', param, type);
  
      this.storeObject(obj[param.name], type, field + '[' + predicate + '][' + param.name + ']');
    }
  
    return constructorData.type;
  }
}

class TLDeserialization {
  public offset = 0; // in bytes
  public override: any;

  public buffer: ArrayBuffer;
  //public intView: Uint32Array;
  public byteView: Uint8Array;

  // this.debug = 
  public mtproto: boolean = false;
  private debug: boolean;

  constructor(buffer: ArrayBuffer | Uint8Array, options: any = {}) {
    //buffer = addPadding(buffer, 4, true); // fix 21.01.2020 for wss
    if(buffer instanceof ArrayBuffer) {
      this.buffer = buffer;
      this.byteView = new Uint8Array(this.buffer);
    } else {
      this.buffer = buffer.buffer;
      this.byteView = buffer;
    }
    
    //console.log("TCL: TLDeserialization -> constructor -> buffer", buffer, this.byteView, this.byteView.hex);
    /* this.buffer = buffer;
    //this.intView = new Uint32Array(this.buffer);
    this.byteView = new Uint8Array(this.buffer); */

    //console.log(this.intView);

    this.override = 'override' in options ? options.override : {};
    this.mtproto = 'mtproto' in options ? options.mtproto : false;
    this.debug = options.debug !== undefined ? options.debug : /* Modes.debug */false;
  }

  public readInt(field: string) {
    //if(this.offset >= this.intView.length * 4) {
    if((this.byteView.length - this.offset) < 4) {
      console.error(this.byteView, this.offset);
      throw new Error('Nothing to fetch: ' + field);
    }
  
    //var i = this.intView[this.offset / 4];
    let i = new Uint32Array(this.byteView.buffer.slice(this.offset, this.offset + 4))[0];
  
    this.debug/*  || field.includes('[dialog][read_outbox_max_id]') */ 
      && console.log('<<<', i.toString(16), i, field, 
      this.byteView.slice(this.offset - 16, this.offset + 16), 
      this.byteView.slice(this.offset - 16, this.offset + 16).hex);
  
    this.offset += 4;
  
    return i;
  }
  
  public fetchInt(field?: string) {
    return this.readInt((field || '') + ':int');
  }
  
  public fetchDouble(field?: string) {
    var buffer = new ArrayBuffer(8);
    var intView = new Int32Array(buffer);
    var doubleView = new Float64Array(buffer);
  
    intView[0] = this.readInt((field || '') + ':double[low]'),
    intView[1] = this.readInt((field || '') + ':double[high]');
  
    return doubleView[0];
  }
  
  public fetchLong(field?: string) {
    var iLow = this.readInt((field || '') + ':long[low]');
    var iHigh = this.readInt((field || '') + ':long[high]');
  
    var longDec = bigint(iHigh).shiftLeft(32).add(bigint(iLow)).toString();
  
    return longDec;
  }
  
  public fetchBool(field?: string) {
    var i = this.readInt((field || '') + ':bool');
    if(i == boolTrue) {
      return true;
    } else if(i == boolFalse) {
      return false;
    }

    this.offset -= 4;
    return this.fetchObject('Object', field);
  }
  
  public fetchString(field?: string) {
    var len = this.byteView[this.offset++];
  
    if(len == 254) {
      var len = this.byteView[this.offset++] |
        (this.byteView[this.offset++] << 8) |
        (this.byteView[this.offset++] << 16);
    }
  
    var sUTF8 = '';
    for(var i = 0; i < len; i++) {
      sUTF8 += String.fromCharCode(this.byteView[this.offset++]);
    }
  
    // Padding
    while(this.offset % 4) {
      this.offset++;
    }
  
    try {
      var s = decodeURIComponent(escape(sUTF8));
    } catch (e) {
      var s = sUTF8;
    }
  
    this.debug && console.log('<<<', s, (field || '') + ':string');
  
    return s;
  }
  
  public fetchBytes(field?: string) {
    var len = this.byteView[this.offset++];
  
    if(len == 254) {
      len = this.byteView[this.offset++] |
        (this.byteView[this.offset++] << 8) |
        (this.byteView[this.offset++] << 16);
    }
  
    var bytes = this.byteView.subarray(this.offset, this.offset + len);
    this.offset += len;
  
    // Padding
    while(this.offset % 4) {
      this.offset++;
    }
  
    this.debug && console.log('<<<', bytesToHex(bytes), (field || '') + ':bytes');
  
    return bytes;
  }
  
  public fetchIntBytes(bits: number, typed: true, field?: string): Uint8Array;
  public fetchIntBytes(bits: number, typed?: false, field?: string): number[];
  public fetchIntBytes(bits: number, typed?: boolean, field?: string) {
    if(bits % 32) {
      throw new Error('Invalid bits: ' + bits);
    }
  
    var len = bits / 8;
    if(typed) {
      var result = this.byteView.subarray(this.offset, this.offset + len);
      this.offset += len;
      return result;
    }
  
    var bytes = [];
    for(var i = 0; i < len; i++) {
      bytes.push(this.byteView[this.offset++]);
    }
  
    this.debug && console.log('<<<', bytesToHex(bytes), (field || '') + ':int' + bits);
  
    return bytes;
  }
  
  public fetchRawBytes(len: any, typed: true, field: string): Uint8Array;
  public fetchRawBytes(len: any, typed: false, field: string): number[];
  public fetchRawBytes(len: any, typed: boolean, field: string) {
    if(len === false) {
      len = this.readInt((field || '') + '_length');
      if(len > this.byteView.byteLength) {
        throw new Error('Invalid raw bytes length: ' + len + ', buffer len: ' + this.byteView.byteLength);
      }
    }
  
    if(typed) {
      let bytes = new Uint8Array(len);
      bytes.set(this.byteView.subarray(this.offset, this.offset + len));
      this.offset += len;
      return bytes;
    }
  
    var bytes = [];
    for(var i = 0; i < len; i++) {
      bytes.push(this.byteView[this.offset++]);
    }
  
    this.debug && console.log('<<<', bytesToHex(bytes), (field || ''));
  
    return bytes;
  }
  
  public fetchObject(type: any, field?: string): any {
    switch(type) {
      case '#':
      case 'int':
        return this.fetchInt(field);
      case 'long':
        return this.fetchLong(field);
      case 'int128':
        return this.fetchIntBytes(128, false, field);
      case 'int256':
        return this.fetchIntBytes(256, false, field);
      case 'int512':
        return this.fetchIntBytes(512, false, field);
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
  
    if(type.substr(0, 6) == 'Vector' || type.substr(0, 6) == 'vector') {
      if(type.charAt(0) == 'V') {
        var constructor = this.readInt(field + '[id]');
        var constructorCmp = uintToInt(constructor);
  
        if(constructorCmp == gzipPacked) { // Gzip packed
          var compressed = this.fetchBytes(field + '[packed_string]');
          var uncompressed = gzipUncompress(compressed);
          var newDeserializer = new TLDeserialization(uncompressed);
  
          return newDeserializer.fetchObject(type, field);
        }

        if(constructorCmp != vector) {
          throw new Error('Invalid vector constructor ' + constructor);
        }
      }

      var len = this.readInt(field + '[count]');
      var result: any = [];
      if(len > 0) {
        var itemType = type.substr(7, type.length - 8); // for "Vector<itemType>"
        for(var i = 0; i < len; i++) {
          result.push(this.fetchObject(itemType, field + '[' + i + ']'));
        }
      }
  
      return result;
    }
  
    var schema = (this.mtproto ? Schema.MTProto : Schema.API) as any;
    var predicate = false;
    var constructorData: any = false;
  
    if(type.charAt(0) == '%') {
      var checkType = type.substr(1);
      for(var i = 0; i < schema.constructors.length; i++) {
        if(schema.constructors[i].type == checkType) {
          constructorData = schema.constructors[i];
          break;
        }
      }

      if(!constructorData) {
        throw new Error('Constructor not found for type: ' + type);
      }
    } else if(type.charAt(0) >= 97 && type.charAt(0) <= 122) {
      for(var i = 0; i < schema.constructors.length; i++) {
        if(schema.constructors[i].predicate == type) {
          constructorData = schema.constructors[i];
          break;
        }
      }

      if(!constructorData) {
        throw new Error('Constructor not found for predicate: ' + type);
      }
    } else {
      var constructor = this.readInt(field + '[id]');
      var constructorCmp = uintToInt(constructor);
  
      if(constructorCmp == gzipPacked) { // Gzip packed
        var compressed = this.fetchBytes(field + '[packed_string]');
        var uncompressed = gzipUncompress(compressed);
        var newDeserializer = new TLDeserialization(uncompressed);
  
        return newDeserializer.fetchObject(type, field);
      }
  
      var index = schema.constructorsIndex;
      if(!index) {
        schema.constructorsIndex = index = {};
        for(var i = 0; i < schema.constructors.length; i++) {
          index[schema.constructors[i].id] = i;
        }
      }

      var i: number = index[constructorCmp];
      if(i) {
        constructorData = schema.constructors[i];
      }
  
      var fallback = false;
      if(!constructorData && this.mtproto) {
        var schemaFallback = Schema.API;
        for(i = 0; i < schemaFallback.constructors.length; i++) {
          if(+schemaFallback.constructors[i].id == constructorCmp) {
            constructorData = schemaFallback.constructors[i];
  
            delete this.mtproto;
            fallback = true;
            break;
          }
        }
      }

      if(!constructorData) {
        throw new Error('Constructor not found: ' + constructor + ' ' + this.fetchInt() + ' ' + this.fetchInt() + ' ' + field);
      }
    }
  
    predicate = constructorData.predicate;
  
    var result: any = {'_': predicate};
    var overrideKey = (this.mtproto ? 'mt_' : '') + predicate;
    var self = this;
  
    if(this.override[overrideKey]) {
      this.override[overrideKey].apply(this, [result, field + '[' + predicate + ']']);
    } else {
      var i: number, param;
      var type, isCond;
      var condType, fieldBit;
      var value;
      var len: number = constructorData.params.length;
      for(i = 0; i < len; i++) {
        param = constructorData.params[i];
        type = param.type;

        if(type == '#' && result.pFlags === undefined) {
          result.pFlags = {};
        }

        if(isCond = (type.indexOf('?') !== -1)) {
          condType = type.split('?');
          fieldBit = condType[0].split('.');

          if(!(result[fieldBit[0]] & (1 << fieldBit[1]))) {
            //console.log('fetchObject bad', constructorData, result[fieldBit[0]], fieldBit);
            continue;
          }

          //console.log('fetchObject good', constructorData, result[fieldBit[0]], fieldBit);

          type = condType[1];
        }
  
        value = self.fetchObject(type, field + '[' + predicate + '][' + param.name + ']');
  
        if(isCond && type === 'true') {
          result.pFlags[param.name] = value;
        } else {
          /* if(param.name == 'read_outbox_max_id') {
            console.log(result, param.name, value, field + '[' + predicate + '][' + param.name + ']');
          } */
            
          result[param.name] = value;
        }
      }
    }
  
    if(fallback) {
      this.mtproto = true;
    }
  
    return result;
  }
  
  public getOffset() {
    return this.offset;
  }
  
  public fetchEnd() {
    if(this.offset != this.byteView.length) {
      throw new Error('Fetch end with non-empty buffer');
    }

    return true;
  }
}

export {TLDeserialization, TLSerialization};
