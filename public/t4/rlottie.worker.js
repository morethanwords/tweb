importScripts('rlottie-wasm.js');

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

  reply('loaded', this.reqId, this.frameCount, this.fps);
}

RLottieItem.prototype.init = function(jsString) {
  try {
    this.handle = RLottieWorker.Api.init();

    this.stringOnWasmHeap = allocate(intArrayFromString(jsString), 'i8', 0);

    this.frameCount = RLottieWorker.Api.loadFromData(this.handle, this.stringOnWasmHeap);

    RLottieWorker.Api.resize(this.handle, this.width, this.height);
  } catch(e) {
    console.error('init RLottieItem error:', e);
  }
};

RLottieItem.prototype.render = function(frameNo, clamped) {
  if(this.dead) return;
  //return;

  if(this.frameCount < frameNo || frameNo < 0) {
    return;
  }

  try {
    RLottieWorker.Api.render(this.handle, frameNo);

    var bufferPointer = RLottieWorker.Api.buffer(this.handle);

    var data = Module.HEAPU8.subarray(bufferPointer, bufferPointer + (this.width * this.height * 4));

    if(!clamped) {
      clamped = new Uint8ClampedArray(data);
    } else {
      clamped.set(data);
    }

    reply('frame', this.reqId, frameNo, clamped);
  } catch(e) {
    console.error('Render error:', e);
    this.dead = true;
  }
};

RLottieItem.prototype.destroy = function() {
  this.dead = true;

  RLottieWorker.Api.destroy(this.handle);
};

var RLottieWorker = (function() {
  var worker = {};
  worker.Api = {};
  //worker.lottieHandle = null;

  function initApi() {
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

  return worker;
}());

Module.onRuntimeInitialized = function() {
  RLottieWorker.init();
};

var items = {};
var queryableFunctions = {
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
  renderFrame: function(reqId, frameNo, clamped) {
    //console.log('worker renderFrame', reqId, frameNo, clamped);
    items[reqId].render(frameNo, clamped);
  }
};

function defaultReply(message) {
  // your default PUBLIC function executed only when main page calls the queryableWorker.postMessage() method directly
  // do something
}

/**
 * Returns true when run in WebKit derived browsers.
 * This is used as a workaround for a memory leak in Safari caused by using Transferable objects to
 * transfer data between WebWorkers and the main thread.
 * https://github.com/mapbox/mapbox-gl-js/issues/8771
 *
 * This should be removed once the underlying Safari issue is fixed.
 *
 * @private
 * @param scope {WindowOrWorkerGlobalScope} Since this function is used both on the main thread and WebWorker context,
 *      let the calling scope pass in the global scope object.
 * @returns {boolean}
 */
var _isSafari = null;
function isSafari(scope) {
  if(_isSafari == null) {
    var userAgent = scope.navigator ? scope.navigator.userAgent : null;
    _isSafari = !!scope.safari ||
    !!(userAgent && (/\b(iPad|iPhone|iPod)\b/.test(userAgent) || (!!userAgent.match('Safari') && !userAgent.match('Chrome'))));
  }
  return _isSafari;
}

function reply() {
  if(arguments.length < 1) { 
    throw new TypeError('reply - not enough arguments'); 
  }

  //if(arguments[0] == 'frame') return;

  var args = Array.prototype.slice.call(arguments, 1);
  if(isSafari(self)) {
    postMessage({ 'queryMethodListener': arguments[0], 'queryMethodArguments': args });
  } else {
    var transfer = [];
    for(var i = 0; i < args.length; i++) {
      if(args[i] instanceof ArrayBuffer) {
        transfer.push(args[i]);
      }
  
      if(args[i].buffer && args[i].buffer instanceof ArrayBuffer) {
        transfer.push(args[i].buffer);
        //args[i] = args[i].buffer;
      }
    }

    postMessage({ 'queryMethodListener': arguments[0], 'queryMethodArguments': args }, transfer);
  }

  //postMessage({ 'queryMethodListener': arguments[0], 'queryMethodArguments': Array.prototype.slice.call(arguments, 1) });
  //console.error(transfer, args);
}

onmessage = function(oEvent) {
  if(oEvent.data instanceof Object && oEvent.data.hasOwnProperty('queryMethod') && oEvent.data.hasOwnProperty('queryMethodArguments')) {
    queryableFunctions[oEvent.data.queryMethod].apply(self, oEvent.data.queryMethodArguments);
  } else {
    defaultReply(oEvent.data);
  }
};
