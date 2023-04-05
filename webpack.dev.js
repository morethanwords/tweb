process.env.NODE_ENV = 'development';

const webpack = require('webpack');
const {merge} = require('webpack-merge');
const common = require('./webpack.common.js');


module.exports = merge(common, {
  mode: 'development',
  devtool: 'inline-source-map',
  plugins: [
    // new webpack.optimize.LimitChunkCountPlugin({
    //   maxChunks: 1
    // })
  ]
});
