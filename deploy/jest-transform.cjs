const babel = require('babel-jest').createTransformer();
const {parse} = require('ifdef-loader/preprocessor');
// Same transport features as webpack.common.js; tests exercise the compiled branches.
const flags = {
  MTPROTO_WORKER: true, MTPROTO_SW: false, MTPROTO_HTTP: false,
  MTPROTO_HTTP_UPLOAD: false, MTPROTO_AUTO: true,
  MTPROTO_HAS_HTTP: true, MTPROTO_HAS_WS: true, DEBUG: false, version: 3
};
module.exports = {
  process(source, filename, ...args) {
    if(filename.endsWith('.ts')) source = parse(source, flags, false, true, filename, true);
    return babel.process(source, filename, ...args);
  }
};
