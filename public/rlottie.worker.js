importScripts('rlottie-wasm.js');
//importScripts('pako-inflate.min.js');

function RLottieItem(reqId, jsString, width, height, fps) {
  this.stringOnWasmHeap = null;
  this.handle = null;
  this.frameCount = 0;

  this.reqId = reqId;
  this.width = width;
  this.height = height;
  this.fps = Math.max(1, Math.min(60, fps || 60));

  this.dead = false;

  this.init(jsString, width, height);
  this.render(0);
  
  reply('loaded', this.reqId, this.frameCount, this.fps);
}

RLottieItem.prototype.init = function(jsString) {
  try {
    this.handle = RLottieWorker.Api.init();

    /* var lengthBytes = lengthBytesUTF8(jsString) + 1;
    this.stringOnWasmHeap = _malloc(lengthBytes);
    stringToUTF8(jsString, this.stringOnWasmHeap, lengthBytes); */

    this.stringOnWasmHeap = allocate(intArrayFromString(jsString), 'i8', 0);
    //Module._free(this.stringOnWasmHeap);

    /* var data = new Uint8ClampedArray(Module.HEAP8.buffer, this.handle - 4, 28);
    console.warn('lottie handle:', this.handle, 'string:', this.stringOnWasmHeap, data);

    console.warn('lottie will free:', this.stringOnWasmHeap);
    Module._free(this.stringOnWasmHeap); */

    /* var buffer = RLottieWorker.Api.buffer(this.handle);
    console.warn('buffer after clean:', buffer); */

    this.frameCount = RLottieWorker.Api.loadFromData(this.handle, this.stringOnWasmHeap);

    //console.warn('lottie frameCount:', this.frameCount, this.handle);

    RLottieWorker.Api.resize(this.handle, this.width, this.height);
  } catch(e) {
    console.error('init RLottieItem error:', e);
  }
};

RLottieItem.prototype.render = function(frameNo) {
  if(this.dead) return;
  //return;

  if(this.frameCount < frameNo || frameNo < 0) {
    return;
  }

  try {
    RLottieWorker.Api.render(this.handle, frameNo);
    //this.dead = true;
    //this.pause();
    //return;

    var bufferPointer = RLottieWorker.Api.buffer(this.handle);
    var data = new Uint8ClampedArray(Module.HEAP8.buffer, bufferPointer, this.width * this.height * 4);
  
    var buffer = new Uint8ClampedArray(data);
    reply('frame', this.reqId, frameNo, buffer);
  } catch(e) {
    console.error('Render error:', e);
    this.dead = true;
    this.pause();
  }
};

RLottieItem.prototype.destroy = function() {
  this.dead = true;
  //Module._free(this.handle);
  //console.warn('lottie will destroy:', this.handle);
  RLottieWorker.Api.destroy(this.handle);

  /* var data = new Uint8ClampedArray(Module.HEAP8.buffer, this.handle - 4, 20);
  console.warn('lottie after destroy:', this.reqId, 'string:', data); */
};

var RLottieWorker = (function() {
  var worker = {};
  worker.Api = {};
  //worker.lottieHandle = null;

  function initApi() {
    /* worker.Api = {
      init: Module.cwrap('lottie_init', '', []),
      destroy: Module.cwrap('lottie_destroy', '', ['number']),
      resize: Module.cwrap('lottie_resize', '', ['number', 'number', 'number']),
      buffer: Module.cwrap('lottie_buffer', 'number', ['number']),
      frameCount: Module.cwrap('lottie_frame_count', 'number', ['number']),
      render: Module.cwrap('lottie_render', '', ['number', 'number']),
      loadFromData: Module.cwrap('lottie_load_from_data', 'number', ['number', 'number']),
    }; */
    worker.Api = {
      init: Module.cwrap('lottie_init', '', []),
      destroy: Module.cwrap('lottie_destroy', '', ['number']),
      resize: Module.cwrap('lottie_resize', '', ['number', 'number', 'number']),
      buffer: Module.cwrap('lottie_buffer', 'number', ['number']),
      render: Module.cwrap('lottie_render', '', ['number', 'number']),
      loadFromData: Module.cwrap('lottie_load_from_data', 'number', ['number', 'number']),
    };
  }

  worker.init = function() {
    initApi();
    reply('ready');
  };

  /* worker.loadSticker = function(url, callback) {
    getUrlContent(url, function(err, data) {
      if (err) {
        return console.warn('Can\'t fetch file ' + url, err);
      }
      try {
        var json = pako.inflate(data, {to: 'string'});
        var json_parsed = JSON.parse(json);
        if (!json_parsed.tgs) {
          throw new Error('Invalid file');
        }
      } catch (e) {
        return console.warn('Invalid file ' + url);
      }
      callback(json, json_parsed.fr);
    });
  } */
  return worker;
}());

Module.onRuntimeInitialized = function() {
  RLottieWorker.init();
};

var items = {};
var queryableFunctions = {
  /* loadSticker: function(reqId, url, width, height) {
    RLottieWorker.loadSticker(url, function(json, fr) {
      var frames = RLottieWorker.renderFrames(reqId, json, width, height, fr);
    });
  }, */
  loadFromData: function(reqId, jsString, width, height) {
    try {
      var json_parsed = jsString;//JSON.parse(jsString);
      if(!json_parsed.tgs) {
        throw new Error('Invalid file');
      }

      items[reqId] = new RLottieItem(reqId, JSON.stringify(jsString), width, height, json_parsed.fr);
    } catch(e) {}
  },
  destroy: function(reqId) {
    items[reqId].destroy();
    delete items[reqId];
  },
  renderFrame: function(reqId, frameNo) {
    items[reqId].render(frameNo);
  }
  /* renderFrames: function(reqId, jsString, width, height) {
    try {
      var json_parsed = jsString;//JSON.parse(jsString);
      if(!json_parsed.tgs) {
        throw new Error('Invalid file');
      }
      RLottieWorker.renderFrames(reqId, JSON.stringify(jsString), width, height, json_parsed.fr);
      // reply('result', reqId, width, height, frames);
    } catch(e) {}
  } */
};

function defaultReply(message) {
  // your default PUBLIC function executed only when main page calls the queryableWorker.postMessage() method directly
  // do something
}

function reply() {
  if(arguments.length < 1) { 
    throw new TypeError('reply - not enough arguments'); 
  }

  var transfer = [], args = Array.prototype.slice.call(arguments, 1);
  for(var i = 0; i < args.length; i++) {
    if(args[i] instanceof ArrayBuffer) {
      transfer.push(args[i]);
    }

    if(args[i].buffer && args[i].buffer instanceof ArrayBuffer) {
      transfer.push(args[i].buffer);
    }
  }

  postMessage({ 'queryMethodListener': arguments[0], 'queryMethodArguments': args }, transfer);
}

onmessage = function(oEvent) {
  if(oEvent.data instanceof Object && oEvent.data.hasOwnProperty('queryMethod') && oEvent.data.hasOwnProperty('queryMethodArguments')) {
    queryableFunctions[oEvent.data.queryMethod].apply(self, oEvent.data.queryMethodArguments);
  } else {
    defaultReply(oEvent.data);
  }
};

/* function getUrlContent(path, callback) {
  try {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', path, true);
    if ('responseType' in xhr) {
      xhr.responseType = 'arraybuffer';
    }
    if (xhr.overrideMimeType) {
      xhr.overrideMimeType('text/plain; charset=x-user-defined');
    }
    xhr.onreadystatechange = function (event) {
      if (xhr.readyState === 4) {
        if (xhr.status === 200 || xhr.status === 0) {
          callback(null, xhr.response || xhr.responseText);
        } else {
          callback(new Error('Ajax error: ' + this.status + ' ' + this.statusText));
        }
      }
    };
    xhr.send();
  } catch (e) {
    callback(new Error(e));
  }
}; */