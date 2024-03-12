/* based on codem-isoboxer v0.3.8 https://github.com/madebyhiro/codem-isoboxer/blob/master/LICENSE.txt */

import bigInt from 'big-integer';

var ISOBoxer = {};

ISOBoxer.parseBuffer = function(arrayBuffer) {
  return new ISOFile(arrayBuffer).parse();
};

ISOBoxer.addBoxProcessor = function(type, parser) {
  if(typeof type !== 'string' || typeof parser !== 'function') {
    return;
  }
  ISOBox.prototype._boxProcessors[type] = parser;
};

ISOBoxer.createFile = function() {
  return new ISOFile();
};

// See ISOBoxer.append() for 'pos' parameter syntax
ISOBoxer.createBox = function(type, parent, pos) {
  var newBox = ISOBox.create(type);
  if(parent) {
    parent.append(newBox, pos);
  }
  return newBox;
};

// See ISOBoxer.append() for 'pos' parameter syntax
ISOBoxer.createFullBox = function(type, parent, pos) {
  var newBox = ISOBoxer.createBox(type, parent, pos);
  newBox.version = 0;
  newBox.flags = 0;
  return newBox;
};

ISOBoxer.Utils = {};
ISOBoxer.Utils.dataViewToString = function(dataView, encoding) {
  var impliedEncoding = encoding || 'utf-8';
  if(typeof TextDecoder !== 'undefined') {
    return new TextDecoder(impliedEncoding).decode(dataView);
  }
  var a = [];
  var i = 0;

  if(impliedEncoding === 'utf-8') {
    /* The following algorithm is essentially a rewrite of the UTF8.decode at
    http://bannister.us/weblog/2007/simple-base64-encodedecode-javascript/
    */

    while(i < dataView.byteLength) {
      var c = dataView.getUint8(i++);
      if(c < 0x80) {
        // 1-byte character (7 bits)
      } else if(c < 0xe0) {
        // 2-byte character (11 bits)
        c = (c & 0x1f) << 6;
        c |= (dataView.getUint8(i++) & 0x3f);
      } else if(c < 0xf0) {
        // 3-byte character (16 bits)
        c = (c & 0xf) << 12;
        c |= (dataView.getUint8(i++) & 0x3f) << 6;
        c |= (dataView.getUint8(i++) & 0x3f);
      } else {
        // 4-byte character (21 bits)
        c = (c & 0x7) << 18;
        c |= (dataView.getUint8(i++) & 0x3f) << 12;
        c |= (dataView.getUint8(i++) & 0x3f) << 6;
        c |= (dataView.getUint8(i++) & 0x3f);
      }
      a.push(String.fromCharCode(c));
    }
  } else { // Just map byte-by-byte (probably wrong)
    while(i < dataView.byteLength) {
      a.push(String.fromCharCode(dataView.getUint8(i++)));
    }
  }
  return a.join('');
};

ISOBoxer.Utils.utf8ToByteArray = function(string) {
  // Only UTF-8 encoding is supported by TextEncoder
  var u, i;
  if(typeof TextEncoder !== 'undefined') {
    u = new TextEncoder().encode(string);
  } else {
    u = [];
    for(i = 0; i < string.length; ++i) {
      var c = string.charCodeAt(i);
      if(c < 0x80) {
        u.push(c);
      } else if(c < 0x800) {
        u.push(0xC0 | (c >> 6));
        u.push(0x80 | (63 & c));
      } else if(c < 0x10000) {
        u.push(0xE0 | (c >> 12));
        u.push(0x80 | (63 & (c >> 6)));
        u.push(0x80 | (63 & c));
      } else {
        u.push(0xF0 | (c >> 18));
        u.push(0x80 | (63 & (c >> 12)));
        u.push(0x80 | (63 & (c >> 6)));
        u.push(0x80 | (63 & c));
      }
    }
  }
  return u;
};

// Method to append a box in the list of child boxes
// The 'pos' parameter can be either:
//   - (number) a position index at which to insert the new box
//   - (string) the type of the box after which to insert the new box
//   - (object) the box after which to insert the new box
ISOBoxer.Utils.appendBox = function(parent, box, pos) {
  box._offset = parent._cursor.offset;
  box._root = (parent._root ? parent._root : parent);
  box._raw = parent._raw;
  box._parent = parent;

  if(pos === -1) {
    // The new box is a sub-box of the parent but not added in boxes array,
    // for example when the new box is set as an entry (see dref and stsd for example)
    return;
  }

  if(pos === undefined || pos === null) {
    parent.boxes.push(box);
    return;
  }

  var index = -1,
    type;

  if(typeof pos === 'number') {
    index = pos;
  } else {
    if(typeof pos === 'string') {
      type = pos;
    } else if(typeof pos === 'object' && pos.type) {
      type = pos.type;
    } else {
      parent.boxes.push(box);
      return;
    }

    for(var i = 0; i < parent.boxes.length; i++) {
      if(type === parent.boxes[i].type) {
        index = i + 1;
        break;
      }
    }
  }
  parent.boxes.splice(index, 0, box);
};

ISOBoxer.Cursor = function(initialOffset) {
  this.offset = (typeof initialOffset == 'undefined' ? 0 : initialOffset);
};

var ISOFile = function(arrayBuffer) {
  this._cursor = new ISOBoxer.Cursor();
  this.boxes = [];
  if(arrayBuffer) {
    this._raw = new DataView(arrayBuffer);
  }
};

ISOFile.prototype.fetch = function(type) {
  var result = this.fetchAll(type, true);
  return (result.length ? result[0] : null);
};

ISOFile.prototype.fetchAll = function(type, returnEarly) {
  var result = [];
  ISOFile._sweep.call(this, type, result, returnEarly);
  return result;
};

ISOFile.prototype.parse = function() {
  this._cursor.offset = 0;
  this.boxes = [];
  while(this._cursor.offset < this._raw.byteLength) {
    var box = ISOBox.parse(this);

    // Box could not be parsed
    if(typeof box.type === 'undefined') break;

    this.boxes.push(box);
  }
  return this;
};

ISOFile._sweep = function(type, result, returnEarly) {
  if(this.type && this.type == type) result.push(this);
  for(var box in this.boxes) {
    if(result.length && returnEarly) return;
    ISOFile._sweep.call(this.boxes[box], type, result, returnEarly);
  }
};

ISOFile.prototype.write = function() {
  var length = 0,
    i;

  for(i = 0; i < this.boxes.length; i++) {
    length += this.boxes[i].getLength(false);
  }

  var bytes = new Uint8Array(length);
  this._rawo = new DataView(bytes.buffer);
  this.bytes = bytes;
  this._cursor.offset = 0;

  for(i = 0; i < this.boxes.length; i++) {
    this.boxes[i].write();
  }

  return bytes.buffer;
};

ISOFile.prototype.append = function(box, pos) {
  ISOBoxer.Utils.appendBox(this, box, pos);
};
var ISOBox = function() {
  this._cursor = new ISOBoxer.Cursor();
};

ISOBox.parse = function(parent) {
  var newBox = new ISOBox();
  newBox._offset = parent._cursor.offset;
  newBox._root = (parent._root ? parent._root : parent);
  newBox._raw = parent._raw;
  newBox._parent = parent;
  newBox._parseBox();
  parent._cursor.offset = newBox._raw.byteOffset + newBox._raw.byteLength;
  return newBox;
};

ISOBox.create = function(type) {
  var newBox = new ISOBox();
  newBox.type = type;
  newBox.boxes = [];
  return newBox;
};

ISOBox.prototype._boxContainers = ['dinf', 'edts', 'mdia', 'meco', 'mfra', 'minf', 'moof', 'moov', 'mvex', 'stbl', 'strk', 'traf', 'trak', 'tref', 'udta', 'vttc', 'sinf', 'schi', 'encv', 'enca', 'ilst'];

ISOBox.prototype._boxProcessors = {};

// /////////////////////////////////////////////////////////////////////////////////////////////////
// Generic read/write functions

ISOBox.prototype._procField = function(name, type, size) {
  if(this._parsing) {
    this[name] = this._readField(type, size);
  }
  else {
    this._writeField(type, size, this[name]);
  }
};

ISOBox.prototype._procFieldArray = function(name, length, type, size) {
  var i;
  if(this._parsing) {
    this[name] = [];
    for(i = 0; i < length; i++) {
      this[name][i] = this._readField(type, size);
    }
  }
  else {
    for(i = 0; i < this[name].length; i++) {
      this._writeField(type, size, this[name][i]);
    }
  }
};

ISOBox.prototype._procFullBox = function() {
  this._procField('version', 'uint', 8);
  this._procField('flags', 'uint', 24);
};

ISOBox.prototype._procEntries = function(name, length, fn) {
  var i;
  if(this._parsing) {
    this[name] = [];
    for(i = 0; i < length; i++) {
      this[name].push({});
      fn.call(this, this[name][i]);
    }
  }
  else {
    for(i = 0; i < length; i++) {
      fn.call(this, this[name][i]);
    }
  }
};

ISOBox.prototype._procSubEntries = function(entry, name, length, fn) {
  var i;
  if(this._parsing) {
    entry[name] = [];
    for(i = 0; i < length; i++) {
      entry[name].push({});
      fn.call(this, entry[name][i]);
    }
  }
  else {
    for(i = 0; i < length; i++) {
      fn.call(this, entry[name][i]);
    }
  }
};

ISOBox.prototype._procEntryField = function(entry, name, type, size) {
  if(this._parsing) {
    entry[name] = this._readField(type, size);
  }
  else {
    this._writeField(type, size, entry[name]);
  }
};

ISOBox.prototype._procSubBoxes = function(name, length = -1) {
  const untilEnd = length === -1;

  var i;
  if(this._parsing) {
    if(untilEnd) length = Infinity
    const end = this._offset + this.size;
    this[name] = [];
    for(i = 0; i < length; i++) {
      this[name].push(ISOBox.parse(this));
      if(untilEnd && this._cursor.offset >= end) {
        break;
      }
    }
  }
  else {
    if(untilEnd) length = this[name].length
    for(i = 0; i < length; i++) {
      if(this._rawo) {
        this[name][i].write();
      } else {
        this.size += this[name][i].getLength();
      }
    }
  }
};

// /////////////////////////////////////////////////////////////////////////////////////////////////
// Read/parse functions

ISOBox.prototype._readField = function(type, size) {
  switch(type) {
    case 'uint':
      return this._readUint(size);
    case 'int':
      return this._readInt(size);
    case 'template':
      return this._readTemplate(size);
    case 'string':
      return (size === -1) ? this._readTerminatedString() : this._readString(size);
    case 'data':
      return this._readData(size);
    case 'utf8':
      return this._readUTF8String();
    default:
      return -1;
  }
};

ISOBox.prototype._readInt = function(size) {
  var result = null,
    offset = this._cursor.offset - this._raw.byteOffset;
  switch(size) {
    case 8:
      result = this._raw.getInt8(offset);
      break;
    case 16:
      result = this._raw.getInt16(offset);
      break;
    case 32:
      result = this._raw.getInt32(offset);
      break;
    case 64: {
      const hi = this._raw.getInt32(offset);
      const lo = this._raw.getInt32(offset + 4);
      result = bigInt(hi).shiftLeft(32).add(lo);
      break;
    }
  }
  this._cursor.offset += (size >> 3);
  return result;
};

ISOBox.prototype._readUint = function(size) {
  var result = null,
    offset = this._cursor.offset - this._raw.byteOffset,
    s1, s2;
  switch(size) {
    case 8:
      result = this._raw.getUint8(offset);
      break;
    case 16:
      result = this._raw.getUint16(offset);
      break;
    case 24:
      s1 = this._raw.getUint16(offset);
      s2 = this._raw.getUint8(offset + 2);
      result = (s1 << 8) + s2;
      break;
    case 32:
      result = this._raw.getUint32(offset);
      break;
    case 64: {
      const hi = this._raw.getUint32(offset);
      const lo = this._raw.getUint32(offset + 4);
      result = bigInt(hi).shiftLeft(32).add(lo);
      break;
    }
  }
  this._cursor.offset += (size >> 3);
  return result;
};

ISOBox.prototype._readString = function(length) {
  var str = '';
  for(var c = 0; c < length; c++) {
    var char = this._readUint(8);
    str += String.fromCharCode(char);
  }
  return str;
};

ISOBox.prototype._readTemplate = function(size) {
  var pre = this._readUint(size / 2);
  var post = this._readUint(size / 2);
  return pre + (post / Math.pow(2, size / 2));
};

ISOBox.prototype._readTerminatedString = function() {
  var str = '';
  while(this._cursor.offset - this._offset < this._raw.byteLength) {
    var char = this._readUint(8);
    if(char === 0) break;
    str += String.fromCharCode(char);
  }
  return str;
};

ISOBox.prototype._readData = function(size) {
  var length = (size > 0) ? size : (this._raw.byteLength - (this._cursor.offset - this._offset));
  if(length > 0) {
    var data = new Uint8Array(this._raw.buffer, this._cursor.offset, length);

    this._cursor.offset += length;
    return data;
  }
  else {
    return null;
  }
};

ISOBox.prototype._readUTF8String = function() {
  var length = this._raw.byteLength - (this._cursor.offset - this._offset);
  var data = null;
  if(length > 0) {
    data = new DataView(this._raw.buffer, this._cursor.offset, length);
    this._cursor.offset += length;
  }

  return data ? ISOBoxer.Utils.dataViewToString(data) : data;
};

ISOBox.prototype._parseBox = function() {
  this._parsing = true;
  this._cursor.offset = this._offset;

  // return immediately if there are not enough bytes to read the header
  if(this._offset + 8 > this._raw.buffer.byteLength) {
    this._root._incomplete = true;
    return;
  }

  this._procField('size', 'uint', 32);
  this._procField('type', 'string', 4);

  if(this.size === 1)      { this._procField('largesize', 'uint', 64); }
  if(this.type === 'uuid') { this._procFieldArray('usertype', 16, 'uint', 8); }

  switch(this.size) {
    case 0:
    // Size zero indicates last box in the file. Consume remaining buffer.
      this._raw = new DataView(this._raw.buffer, this._offset);
      break;
    case 1:
      if(this._offset + this.size > this._raw.buffer.byteLength) {
        this._incomplete = true;
        this._root._incomplete = true;
      } else {
        this._raw = new DataView(this._raw.buffer, this._offset, this.largesize);
      }
      break;
    default:
      if(this._offset + this.size > this._raw.buffer.byteLength) {
        this._incomplete = true;
        this._root._incomplete = true;
      } else {
        this._raw = new DataView(this._raw.buffer, this._offset, this.size);
      }
  }

  // additional parsing
  if(!this._incomplete) {
    if(this._boxProcessors[this.type]) {
      this._boxProcessors[this.type].call(this);
    }
    if(this._boxContainers.indexOf(this.type) !== -1) {
      this._parseContainerBox();
    } else {
      // Unknown box => read and store box content
      this._data = this._readData();
    }
  }
};

ISOBox.prototype._parseFullBox = function() {
  this.version = this._readUint(8);
  this.flags = this._readUint(24);
};

ISOBox.prototype._parseContainerBox = function() {
  this.boxes = [];
  while(this._cursor.offset - this._raw.byteOffset < this._raw.byteLength) {
    this.boxes.push(ISOBox.parse(this));
  }
};

// /////////////////////////////////////////////////////////////////////////////////////////////////
// Write functions

ISOBox.prototype.append = function(box, pos) {
  ISOBoxer.Utils.appendBox(this, box, pos);
};

ISOBox.prototype.getLength = function() {
  this._parsing = false;
  this._rawo = null;

  this.size = 0;
  this._procField('size', 'uint', 32);
  this._procField('type', 'string', 4);

  if(this.size === 1)      { this._procField('largesize', 'uint', 64); }
  if(this.type === 'uuid') { this._procFieldArray('usertype', 16, 'uint', 8); }

  if(this._boxProcessors[this.type]) {
    this._boxProcessors[this.type].call(this);
  }

  if(this._boxContainers.indexOf(this.type) !== -1) {
    for(var i = 0; i < this.boxes.length; i++) {
      this.size += this.boxes[i].getLength();
    }
  }

  if(this._data) {
    this._writeData(this._data);
  }

  return this.size;
};

ISOBox.prototype.write = function() {
  this._parsing = false;
  if(!this._parent) throw new Error(`no root at ${this.type}`)
  this._cursor.offset = this._parent._cursor.offset;

  switch(this.size) {
    case 0:
      this._rawo = new DataView(this._parent._rawo.buffer, this._cursor.offset, (this.parent._rawo.byteLength - this._cursor.offset));
      break;
    case 1:
      this._rawo = new DataView(this._parent._rawo.buffer, this._cursor.offset, this.largesize);
      break;
    default:
      if(!this._parent._rawo) console.log(this.type)
      this._rawo = new DataView(this._parent._rawo.buffer, this._cursor.offset, this.size);
  }

  this._procField('size', 'uint', 32);
  this._procField('type', 'string', 4);

  if(this.size === 1)      { this._procField('largesize', 'uint', 64); }
  if(this.type === 'uuid') { this._procFieldArray('usertype', 16, 'uint', 8); }

  if(this._boxProcessors[this.type]) {
    this._boxProcessors[this.type].call(this);
  }

  if(this._boxContainers.indexOf(this.type) !== -1) {
    for(var i = 0; i < this.boxes.length; i++) {
      this.boxes[i].write();
    }
  }

  if(this._data) {
    this._writeData(this._data);
  }

  this._parent._cursor.offset += this.size;

  return this.size;
};

ISOBox.prototype._writeInt = function(size, value) {
  if(this._rawo) {
    var offset = this._cursor.offset - this._rawo.byteOffset;
    switch(size) {
      case 8:
        this._rawo.setInt8(offset, value);
        break;
      case 16:
        this._rawo.setInt16(offset, value);
        break;
      case 32:
        this._rawo.setInt32(offset, value);
        break;
      case 64:
        this._rawo.setUint32(offset, value.shiftRight(32).and(0xFFFFFFFF).toJSNumber());
        this._rawo.setUint32(offset + 4, value.and(0xFFFFFFFF).toJSNumber());
        break;
    }
    this._cursor.offset += (size >> 3);
  } else {
    this.size += (size >> 3);
  }
};

ISOBox.prototype._writeUint = function(size, value) {
  if(this._rawo) {
    var offset = this._cursor.offset - this._rawo.byteOffset,
      s1, s2;
    switch(size) {
      case 8:
        this._rawo.setUint8(offset, value);
        break;
      case 16:
        this._rawo.setUint16(offset, value);
        break;
      case 24:
        s1 = (value & 0xFFFF00) >> 8;
        s2 = (value & 0x0000FF);
        this._rawo.setUint16(offset, s1);
        this._rawo.setUint8(offset + 2, s2);
        break;
      case 32:
        this._rawo.setUint32(offset, value);
        break;
      case 64: {
        this._rawo.setUint32(offset, value.shiftRight(32).and(0xFFFFFFFF).toJSNumber());
        this._rawo.setUint32(offset + 4, value.and(0xFFFFFFFF).toJSNumber());
        break;
      }
    }
    this._cursor.offset += (size >> 3);
  } else {
    this.size += (size >> 3);
  }
};

ISOBox.prototype._writeString = function(size, str) {
  for(var c = 0; c < size; c++) {
    this._writeUint(8, str.charCodeAt(c));
  }
};

ISOBox.prototype._writeTerminatedString = function(str) {
  if(str.length === 0) {
    return;
  }
  for(var c = 0; c < str.length; c++) {
    this._writeUint(8, str.charCodeAt(c));
  }
  this._writeUint(8, 0);
};

ISOBox.prototype._writeTemplate = function(size, value) {
  var pre = Math.floor(value);
  var post = (value - pre) * Math.pow(2, size / 2);
  this._writeUint(size / 2, pre);
  this._writeUint(size / 2, post);
};

ISOBox.prototype._writeData = function(data) {
  var i;
  // data to copy
  if(data) {
    if(this._rawo) {
      // Array and Uint8Array has also to be managed
      if(data instanceof Array) {
        var offset = this._cursor.offset - this._rawo.byteOffset;
        for(var i = 0; i < data.length; i++) {
          this._rawo.setInt8(offset + i, data[i]);
        }
        this._cursor.offset += data.length;
      }

      if(data instanceof Uint8Array) {
        this._root.bytes.set(data, this._cursor.offset);
        this._cursor.offset += data.length;
      }
    } else {
      // nothing to copy only size to compute
      this.size += data.length;
    }
  }
};

ISOBox.prototype._writeUTF8String = function(string) {
  var u = ISOBoxer.Utils.utf8ToByteArray(string);
  if(this._rawo) {
    var dataView = new DataView(this._rawo.buffer, this._cursor.offset, u.length);
    for(var i = 0; i < u.length; i++) {
      dataView.setUint8(i, u[i]);
    }
  } else {
    this.size += u.length;
  }
};

ISOBox.prototype._writeField = function(type, size, value) {
  switch(type) {
    case 'uint':
      this._writeUint(size, value);
      break;
    case 'int':
      this._writeInt(size, value);
      break;
    case 'template':
      this._writeTemplate(size, value);
      break;
    case 'string':
      if(size == -1) {
        this._writeTerminatedString(value);
      } else {
        this._writeString(size, value);
      }
      break;
    case 'data':
      this._writeData(value);
      break;
    case 'utf8':
      this._writeUTF8String(value);
      break;
    default:
      break;
  }
};

// ISO/IEC 14496-15:2014 - avc1/2/3/4, hev1, hvc1, encv
ISOBox.prototype._boxProcessors['avc1'] =
ISOBox.prototype._boxProcessors['avc2'] =
ISOBox.prototype._boxProcessors['avc3'] =
ISOBox.prototype._boxProcessors['avc4'] =
ISOBox.prototype._boxProcessors['hvc1'] =
ISOBox.prototype._boxProcessors['hev1'] =
ISOBox.prototype._boxProcessors['encv'] = function() {
  // SampleEntry fields
  this._procFieldArray('reserved1', 6,    'uint', 8);
  this._procField('data_reference_index', 'uint', 16);
  // VisualSampleEntry fields
  this._procField('pre_defined1',         'uint',     16);
  this._procField('reserved2',            'uint',     16);
  this._procFieldArray('pre_defined2', 3, 'uint',     32);
  this._procField('width',                'uint',     16);
  this._procField('height',               'uint',     16);
  this._procField('horizresolution',      'template', 32);
  this._procField('vertresolution',       'template', 32);
  this._procField('reserved3',            'uint',     32);
  this._procField('frame_count',          'uint',     16);
  this._procFieldArray('compressorname', 32, 'uint',    8);
  this._procField('depth',                'uint',     16);
  this._procField('pre_defined3',         'int',      16);
  // Codec-specific fields
  this._procField('config', 'data', -1);
};

// ISO/IEC 14496-12:2012 - 8.6.1.3 Composition Time To Sample Box
ISOBox.prototype._boxProcessors['ctts'] = function() {
  this._procFullBox();
  this._procField('entry_count', 'uint', 32);
  this._procEntries('entries', this.entry_count, function(entry) {
    this._procEntryField(entry, 'sample_count', 'uint', 32);
    this._procEntryField(entry, 'sample_offset', (this.version === 1) ? 'int' : 'uint', 32);
  });
};

// ISO/IEC 14496-12:2012 - 8.7.2 Data Reference Box
ISOBox.prototype._boxProcessors['dref'] = function() {
  this._procFullBox();
  this._procField('entry_count', 'uint', 32);
  this._procSubBoxes('entries', this.entry_count);
};

// ISO/IEC 14496-12:2012 - 8.6.6 Edit List Box
ISOBox.prototype._boxProcessors['elst'] = function() {
  this._procFullBox();
  this._procField('entry_count', 'uint', 32);
  this._procEntries('entries', this.entry_count, function(entry) {
    this._procEntryField(entry, 'segment_duration',     'uint', (this.version === 1) ? 64 : 32);
    this._procEntryField(entry, 'media_time',           'int',  (this.version === 1) ? 64 : 32);
    this._procEntryField(entry, 'media_rate_integer',   'int',  16);
    this._procEntryField(entry, 'media_rate_fraction',  'int',  16);
  });
};

// ISO/IEC 23009-1:2014 - 5.10.3.3 Event Message Box
ISOBox.prototype._boxProcessors['emsg'] = function() {
  this._procFullBox();
  if(this.version == 1) {
    this._procField('timescale',                'uint',   32);
    this._procField('presentation_time',        'uint',   64);
    this._procField('event_duration',           'uint',   32);
    this._procField('id',                       'uint',   32);
    this._procField('scheme_id_uri',            'string', -1);
    this._procField('value',                    'string', -1);
  } else {
    this._procField('scheme_id_uri',            'string', -1);
    this._procField('value',                    'string', -1);
    this._procField('timescale',                'uint',   32);
    this._procField('presentation_time_delta',  'uint',   32);
    this._procField('event_duration',           'uint',   32);
    this._procField('id',                       'uint',   32);
  }
  this._procField('message_data',             'data',   -1);
};
// ISO/IEC 14496-12:2012 - 8.1.2 Free Space Box
ISOBox.prototype._boxProcessors['free'] = ISOBox.prototype._boxProcessors['skip'] = function() {
  this._procField('data', 'data', -1);
};

// ISO/IEC 14496-12:2012 - 8.12.2 Original Format Box
ISOBox.prototype._boxProcessors['frma'] = function() {
  this._procField('data_format', 'uint', 32);
};
// ISO/IEC 14496-12:2012 - 4.3 File Type Box / 8.16.2 Segment Type Box
ISOBox.prototype._boxProcessors['ftyp'] =
ISOBox.prototype._boxProcessors['styp'] = function() {
  this._procField('major_brand', 'string', 4);
  this._procField('minor_version', 'uint', 32);
  var nbCompatibleBrands = -1;
  if(this._parsing) {
    nbCompatibleBrands = (this._raw.byteLength - (this._cursor.offset - this._raw.byteOffset)) / 4;
  }
  this._procFieldArray('compatible_brands', nbCompatibleBrands, 'string', 4);
};

// ISO/IEC 14496-12:2012 - 8.4.3 Handler Reference Box
ISOBox.prototype._boxProcessors['hdlr'] = function() {
  this._procFullBox();
  this._procField('pre_defined',      'uint',   32);
  this._procField('handler_type',     'string', 4);
  this._procFieldArray('reserved', 3, 'uint', 32);
  this._procField('name',             'string', -1);
};

// ISO/IEC 14496-12:2012 - 8.1.1 Media Data Box
ISOBox.prototype._boxProcessors['mdat'] = function() {
  this._procField('data', 'data', -1);
};

// ISO/IEC 14496-12:2012 - 8.4.2 Media Header Box
ISOBox.prototype._boxProcessors['mdhd'] = function() {
  this._procFullBox();
  this._procField('creation_time',      'uint', (this.version == 1) ? 64 : 32);
  this._procField('modification_time',  'uint', (this.version == 1) ? 64 : 32);
  this._procField('timescale',          'uint', 32);
  this._procField('duration',           'uint', (this.version == 1) ? 64 : 32);
  if(!this._parsing && typeof this.language === 'string') {
    // In case of writing and language has been set as a string, then convert it into char codes array
    this.language = ((this.language.charCodeAt(0) - 0x60) << 10) |
                    ((this.language.charCodeAt(1) - 0x60) << 5) |
                    ((this.language.charCodeAt(2) - 0x60));
  }
  this._procField('language',           'uint', 16);
  if(this._parsing) {
    this.language = String.fromCharCode(((this.language >> 10) & 0x1F) + 0x60,
      ((this.language >> 5) & 0x1F) + 0x60,
      (this.language & 0x1F) + 0x60);
  }
  this._procField('pre_defined',        'uint', 16);
};

// ISO/IEC 14496-12:2012 - 8.8.2 Movie Extends Header Box
ISOBox.prototype._boxProcessors['mehd'] = function() {
  this._procFullBox();
  this._procField('fragment_duration', 'uint', (this.version == 1) ? 64 : 32);
};

// ISO/IEC 14496-12:2012 - 8.8.5 Movie Fragment Header Box
ISOBox.prototype._boxProcessors['mfhd'] = function() {
  this._procFullBox();
  this._procField('sequence_number', 'uint', 32);
};

// ISO/IEC 14496-12:2012 - 8.8.11 Movie Fragment Random Access Box
ISOBox.prototype._boxProcessors['mfro'] = function() {
  this._procFullBox();
  this._procField('mfra_size', 'uint', 32); // Called mfra_size to distinguish from the normal "size" attribute of a box
};


// ISO/IEC 14496-12:2012 - 8.5.2.2 mp4a box (use AudioSampleEntry definition and naming)
ISOBox.prototype._boxProcessors['mp4a'] = ISOBox.prototype._boxProcessors['enca'] = function() {
  // SampleEntry fields
  this._procFieldArray('reserved1', 6,    'uint', 8);
  this._procField('data_reference_index', 'uint', 16);
  // AudioSampleEntry fields
  this._procFieldArray('reserved2', 2,    'uint', 32);
  this._procField('channelcount',         'uint', 16);
  this._procField('samplesize',           'uint', 16);
  this._procField('pre_defined',          'uint', 16);
  this._procField('reserved3',            'uint', 16);
  this._procField('samplerate',           'template', 32);
  // ESDescriptor fields
  this._procSubBoxes('esds', 1);
};

// ISO/IEC 14496-12:2012 - 8.2.2 Movie Header Box
ISOBox.prototype._boxProcessors['mvhd'] = function() {
  this._procFullBox();
  this._procField('creation_time',      'uint',     (this.version == 1) ? 64 : 32);
  this._procField('modification_time',  'uint',     (this.version == 1) ? 64 : 32);
  this._procField('timescale',          'uint',     32);
  this._procField('duration',           'uint',     (this.version == 1) ? 64 : 32);
  this._procField('rate',               'template', 32);
  this._procField('volume',             'template', 16);
  this._procField('reserved1',          'uint',  16);
  this._procFieldArray('reserved2', 2,  'uint',     32);
  this._procFieldArray('matrix', 9,     'template', 32);
  this._procFieldArray('pre_defined', 6, 'uint',   32);
  this._procField('next_track_ID',      'uint',     32);
};

// ISO/IEC 14496-30:2014 - WebVTT Cue Payload Box.
ISOBox.prototype._boxProcessors['payl'] = function() {
  this._procField('cue_text', 'utf8');
};

// ISO/IEC 14496-12:2012 - 8.16.5 Producer Reference Time
ISOBox.prototype._boxProcessors['prft'] = function() {
  this._procFullBox();
  this._procField('reference_track_ID', 'uint', 32);
  this._procField('ntp_timestamp_sec', 'uint', 32);
  this._procField('ntp_timestamp_frac', 'uint', 32);
  this._procField('media_time', 'uint', (this.version == 1) ? 64 : 32);
};

// ISO/IEC 23001-7:2011 - 8.1 Protection System Specific Header Box
ISOBox.prototype._boxProcessors['pssh'] = function() {
  this._procFullBox();

  this._procFieldArray('SystemID', 16, 'uint', 8);
  this._procField('DataSize', 'uint', 32);
  this._procFieldArray('Data', this.DataSize, 'uint', 8);
};
// ISO/IEC 14496-12:2012 - 8.12.5 Scheme Type Box
ISOBox.prototype._boxProcessors['schm'] = function() {
  this._procFullBox();

  this._procField('scheme_type', 'uint', 32);
  this._procField('scheme_version', 'uint', 32);

  if(this.flags & 0x000001) {
    this._procField('scheme_uri', 'string', -1);
  }
};
// ISO/IEC 14496-12:2012 - 8.6.4.1 sdtp box
ISOBox.prototype._boxProcessors['sdtp'] = function() {
  this._procFullBox();

  var sample_count = -1;
  if(this._parsing) {
    sample_count = (this._raw.byteLength - (this._cursor.offset - this._raw.byteOffset));
  }

  this._procFieldArray('sample_dependency_table', sample_count, 'uint', 8);
};

// ISO/IEC 14496-12:2012 - 8.16.3 Segment Index Box
ISOBox.prototype._boxProcessors['sidx'] = function() {
  this._procFullBox();
  this._procField('reference_ID', 'uint', 32);
  this._procField('timescale', 'uint', 32);
  this._procField('earliest_presentation_time', 'uint', (this.version == 1) ? 64 : 32);
  this._procField('first_offset', 'uint', (this.version == 1) ? 64 : 32);
  this._procField('reserved', 'uint', 16);
  this._procField('reference_count', 'uint', 16);
  this._procEntries('references', this.reference_count, function(entry) {
    if(!this._parsing) {
      entry.reference  = (entry.reference_type  & 0x00000001) << 31;
      entry.reference |= (entry.referenced_size & 0x7FFFFFFF);
      entry.sap  = (entry.starts_with_SAP & 0x00000001) << 31;
      entry.sap |= (entry.SAP_type        & 0x00000003) << 28;
      entry.sap |= (entry.SAP_delta_time  & 0x0FFFFFFF);
    }
    this._procEntryField(entry, 'reference', 'uint', 32);
    this._procEntryField(entry, 'subsegment_duration', 'uint', 32);
    this._procEntryField(entry, 'sap', 'uint', 32);
    if(this._parsing) {
      entry.reference_type = (entry.reference >> 31) & 0x00000001;
      entry.referenced_size = entry.reference & 0x7FFFFFFF;
      entry.starts_with_SAP  = (entry.sap >> 31) & 0x00000001;
      entry.SAP_type = (entry.sap >> 28) & 0x00000007;
      entry.SAP_delta_time = (entry.sap  & 0x0FFFFFFF);
    }
  });
};

// ISO/IEC 14496-12:2012 - 8.4.5.3 Sound Media Header Box
ISOBox.prototype._boxProcessors['smhd'] = function() {
  this._procFullBox();
  this._procField('balance',  'uint', 16);
  this._procField('reserved', 'uint', 16);
};

// ISO/IEC 14496-12:2012 - 8.16.4 Subsegment Index Box
ISOBox.prototype._boxProcessors['ssix'] = function() {
  this._procFullBox();
  this._procField('subsegment_count', 'uint', 32);
  this._procEntries('subsegments', this.subsegment_count, function(subsegment) {
    this._procEntryField(subsegment, 'ranges_count', 'uint', 32);
    this._procSubEntries(subsegment, 'ranges', subsegment.ranges_count, function(range) {
      this._procEntryField(range, 'level', 'uint', 8);
      this._procEntryField(range, 'range_size', 'uint', 24);
    });
  });
};

// ISO/IEC 14496-12:2012 - 8.5.2 Sample Description Box
ISOBox.prototype._boxProcessors['stsd'] = function() {
  this._procFullBox();
  this._procField('entry_count', 'uint', 32);
  this._procSubBoxes('entries', this.entry_count);
};

// ISO/IEC 14496-12:2012 - 8.6.1.2 Decoding Time To Sample Box
ISOBox.prototype._boxProcessors['stts'] = function() {
  this._procFullBox();
  this._procField('entry_count', 'uint', 32);
  this._procEntries('entries', this.entry_count, function(entry) {
    this._procEntryField(entry, 'sample_count', 'uint', 32);
    this._procEntryField(entry, 'sample_delta', 'uint', 32);
  });
};

// ISO/IEC 14496-12:2015 - 8.7.7 Sub-Sample Information Box
ISOBox.prototype._boxProcessors['subs'] = function() {
  this._procFullBox();
  this._procField('entry_count', 'uint', 32);
  this._procEntries('entries', this.entry_count, function(entry) {
    this._procEntryField(entry, 'sample_delta', 'uint', 32);
    this._procEntryField(entry, 'subsample_count', 'uint', 16);
    this._procSubEntries(entry, 'subsamples', entry.subsample_count, function(subsample) {
      this._procEntryField(subsample, 'subsample_size', 'uint', (this.version === 1) ? 32 : 16);
      this._procEntryField(subsample, 'subsample_priority', 'uint', 8);
      this._procEntryField(subsample, 'discardable', 'uint', 8);
      this._procEntryField(subsample, 'codec_specific_parameters', 'uint', 32);
    });
  });
};

// ISO/IEC 23001-7:2011 - 8.2 Track Encryption Box
ISOBox.prototype._boxProcessors['tenc'] = function() {
  this._procFullBox();

  this._procField('default_IsEncrypted', 'uint', 24);
  this._procField('default_IV_size', 'uint', 8);
  this._procFieldArray('default_KID', 16,    'uint', 8);
};

// ISO/IEC 14496-12:2012 - 8.8.12 Track Fragmnent Decode Time
ISOBox.prototype._boxProcessors['tfdt'] = function() {
  this._procFullBox();
  this._procField('baseMediaDecodeTime', 'uint', (this.version == 1) ? 64 : 32);
};

// ISO/IEC 14496-12:2012 - 8.8.7 Track Fragment Header Box
ISOBox.prototype._boxProcessors['tfhd'] = function() {
  this._procFullBox();
  this._procField('track_ID', 'uint', 32);
  if(this.flags & 0x01) this._procField('base_data_offset',          'uint', 64);
  if(this.flags & 0x02) this._procField('sample_description_offset', 'uint', 32);
  if(this.flags & 0x08) this._procField('default_sample_duration',   'uint', 32);
  if(this.flags & 0x10) this._procField('default_sample_size',       'uint', 32);
  if(this.flags & 0x20) this._procField('default_sample_flags',      'uint', 32);
};

// ISO/IEC 14496-12:2012 - 8.8.10 Track Fragment Random Access Box
ISOBox.prototype._boxProcessors['tfra'] = function() {
  this._procFullBox();
  this._procField('track_ID', 'uint', 32);
  if(!this._parsing) {
    this.reserved = 0;
    this.reserved |= (this.length_size_of_traf_num  & 0x00000030) << 4;
    this.reserved |= (this.length_size_of_trun_num  & 0x0000000C) << 2;
    this.reserved |= (this.length_size_of_sample_num  & 0x00000003);
  }
  this._procField('reserved', 'uint', 32);
  if(this._parsing) {
    this.length_size_of_traf_num = (this.reserved & 0x00000030) >> 4;
    this.length_size_of_trun_num = (this.reserved & 0x0000000C) >> 2;
    this.length_size_of_sample_num = (this.reserved & 0x00000003);
  }
  this._procField('number_of_entry', 'uint', 32);
  this._procEntries('entries', this.number_of_entry, function(entry) {
    this._procEntryField(entry, 'time', 'uint', (this.version === 1) ? 64 : 32);
    this._procEntryField(entry, 'moof_offset', 'uint', (this.version === 1) ? 64 : 32);
    this._procEntryField(entry, 'traf_number', 'uint', (this.length_size_of_traf_num + 1) * 8);
    this._procEntryField(entry, 'trun_number', 'uint', (this.length_size_of_trun_num + 1) * 8);
    this._procEntryField(entry, 'sample_number', 'uint', (this.length_size_of_sample_num + 1) * 8);
  });
};

// ISO/IEC 14496-12:2012 - 8.3.2 Track Header Box
ISOBox.prototype._boxProcessors['tkhd'] = function() {
  this._procFullBox();
  this._procField('creation_time',      'uint',     (this.version == 1) ? 64 : 32);
  this._procField('modification_time',  'uint',     (this.version == 1) ? 64 : 32);
  this._procField('track_ID',           'uint',     32);
  this._procField('reserved1',          'uint',     32);
  this._procField('duration',           'uint',     (this.version == 1) ? 64 : 32);
  this._procFieldArray('reserved2', 2,  'uint',     32);
  this._procField('layer',              'uint',     16);
  this._procField('alternate_group',    'uint',     16);
  this._procField('volume',             'template', 16);
  this._procField('reserved3',          'uint',     16);
  this._procFieldArray('matrix', 9,     'template', 32);
  this._procField('width',              'template', 32);
  this._procField('height',             'template', 32);
};

// ISO/IEC 14496-12:2012 - 8.8.3 Track Extends Box
ISOBox.prototype._boxProcessors['trex'] = function() {
  this._procFullBox();
  this._procField('track_ID',                         'uint', 32);
  this._procField('default_sample_description_index', 'uint', 32);
  this._procField('default_sample_duration',          'uint', 32);
  this._procField('default_sample_size',              'uint', 32);
  this._procField('default_sample_flags',             'uint', 32);
};

// ISO/IEC 14496-12:2012 - 8.8.8 Track Run Box
// Note: the 'trun' box has a direct relation to the 'tfhd' box for defaults.
// These defaults are not set explicitly here, but are left to resolve for the user.
ISOBox.prototype._boxProcessors['trun'] = function() {
  this._procFullBox();
  this._procField('sample_count', 'uint', 32);
  if(this.flags & 0x1) this._procField('data_offset', 'int', 32);
  if(this.flags & 0x4) this._procField('first_sample_flags', 'uint', 32);
  this._procEntries('samples', this.sample_count, function(sample) {
    if(this.flags & 0x100) this._procEntryField(sample, 'sample_duration', 'uint', 32);
    if(this.flags & 0x200) this._procEntryField(sample, 'sample_size', 'uint', 32);
    if(this.flags & 0x400) this._procEntryField(sample, 'sample_flags', 'uint', 32);
    if(this.flags & 0x800) this._procEntryField(sample, 'sample_composition_time_offset', (this.version === 1) ? 'int' : 'uint',  32);
  });
};

// ISO/IEC 14496-12:2012 - 8.7.2 Data Reference Box
ISOBox.prototype._boxProcessors['url '] = ISOBox.prototype._boxProcessors['urn '] = function() {
  this._procFullBox();
  if(this.type === 'urn ') {
    this._procField('name', 'string', -1);
  }
  this._procField('location', 'string', -1);
};

// ISO/IEC 14496-30:2014 - WebVTT Source Label Box
ISOBox.prototype._boxProcessors['vlab'] = function() {
  this._procField('source_label', 'utf8');
};

// ISO/IEC 14496-12:2012 - 8.4.5.2 Video Media Header Box
ISOBox.prototype._boxProcessors['vmhd'] = function() {
  this._procFullBox();
  this._procField('graphicsmode', 'uint', 16);
  this._procFieldArray('opcolor', 3, 'uint', 16);
};

// ISO/IEC 14496-30:2014 - WebVTT Configuration Box
ISOBox.prototype._boxProcessors['vttC'] = function() {
  this._procField('config', 'utf8');
};

// ISO/IEC 14496-30:2014 - WebVTT Empty Sample Box
ISOBox.prototype._boxProcessors['vtte'] = function() {
  // Nothing should happen here.
};

ISOBox.prototype._boxProcessors['stco'] = function() {
  this._procFullBox();
  this._procField('entry_count', 'uint', 32);
  this._procFieldArray('chunk_offsets', this.entry_count, 'uint', 32);
};

ISOBox.prototype._boxProcessors['stsz'] = function() {
  this._procFullBox();
  this._procField('sample_size', 'uint', 32);
  this._procField('sample_count', 'uint', 32);
  if(this.sample_size === 0) {
    this._procFieldArray('entry_sizes', this.sample_count, 'uint', 32);
  }
};

ISOBox.prototype._boxProcessors['stsc'] = function() {
  this._procFullBox();
  this._procField('entry_count', 'uint', 32);
  this._procEntries('entries', this.entry_count, function(entry) {
    this._procEntryField(entry, 'first_chunk', 'uint', 32);
    this._procEntryField(entry, 'samples_per_chunk', 'uint', 32);
    this._procEntryField(entry, 'sample_description_index', 'uint', 32);
  });
};

ISOBox.prototype._boxProcessors['stss'] = function() {
  this._procFullBox();
  this._procField('entry_count', 'uint', 32);
  this._procFieldArray('sample_numbers', this.entry_count, 'uint', 32);
};

ISOBox.prototype._boxProcessors['hdlr'] = function() {
  this._procFullBox();
  this._procField('pre_defined', 'uint', 32);
  this._procField('handler_type', 'string', 4);
  this._procFieldArray('reserved', 3, 'uint', 32);
  this._procField('name', 'string', -1);
};

ISOBox.prototype._boxProcessors['Opus'] = function() {
  // SampleEntry
  this._procFieldArray('reserved1', 3, 'uint', 16);
  this._procField('data_reference_index', 'uint', 16);
  // AudioSampleEntry
  this._procFieldArray('reserved2', 2, 'uint', 32);
  this._procField('channel_count', 'uint', 16);
  this._procField('sample_size', 'uint', 16);
  this._procFieldArray('reserved3', 2, 'uint', 16);
  this._procField('samplerate', 'template', 32);
  this._procSubBoxes('entries');
}

ISOBox.prototype._boxProcessors['dOps'] = function() {
  this._procField('version', 'int', 8);
  this._procField('output_channel_count', 'uint', 8);
  this._procField('pre_skip', 'uint', 16);
  this._procField('input_sample_rate', 'uint', 32);
  this._procField('output_gain', 'uint', 16);
  this._procField('channel_mapping_family', 'uint', 8);
  if(this.channel_mapping_family !== 0) {
    this._procField('stream_count', 'uint', 8);
    this._procField('coupled_count', 'uint', 8);
    this._procFieldArray('channel_mapping', this.output_channel_count, 'uint', 8);
  }
}

ISOBox.prototype._boxProcessors['fLaC'] = function() {
  // SampleEntry
  this._procFieldArray('reserved1', 3, 'uint', 16);
  this._procField('data_reference_index', 'uint', 16);
  // AudioSampleEntry
  this._procFieldArray('reserved2', 2, 'uint', 32);
  this._procField('channel_count', 'uint', 16);
  this._procField('sample_size', 'uint', 16);
  this._procFieldArray('reserved3', 2, 'uint', 16);
  this._procField('sample_rate', 'template', 32);
  this._procSubBoxes('entries');
}

ISOBox.prototype._boxProcessors['dfLa'] = function() {
  this._procFullBox();
}

ISOBox.prototype._boxProcessors['btrt'] = function() {
  this._procField('bufferSizeDB', 'uint', 32);
  this._procField('maxBitrate', 'uint', 32);
  this._procField('avgBitrate', 'uint', 32);
}

export default ISOBoxer
