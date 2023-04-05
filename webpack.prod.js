process.env.NODE_ENV = 'production';

const path = require('path');
const {merge} = require('webpack-merge');
const common = require('./webpack.common.js');
const keepAsset = require('./keepAsset.js');

// const CompressionPlugin = require("compression-webpack-plugin");
const WebpackOnBuildPlugin = require('on-build-webpack');
// const TerserJSPlugin = require('terser-webpack-plugin');
// const OptimizeCSSAssetsPlugin = require('optimize-css-assets-webpack-plugin');
const fs = require('fs');

const buildDir = __dirname + '/public/';

module.exports = merge(common, {
  mode: 'production',

  devtool: 'source-map',

  optimization: {
    // minimizer: [new TerserJSPlugin({}), new OptimizeCSSAssetsPlugin({})],
    // runtimeChunk: 'single',
    splitChunks: {
      chunks: 'all',
      maxInitialRequests: Infinity,
      // minSize: 0,
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name(module) {
            // get the name. E.g. node_modules/packageName/not/this/part.js
            // or node_modules/packageName
            const packageName = module.context.match(/[\\/]node_modules[\\/](.*?)([\\/]|$)/)[1];

            // npm package names are URL-safe, but some servers don't like @ symbols
            return `npm.${packageName.replace('@', '')}`;
          }
        }
      }
    }
  },

  plugins: [
    /* new CompressionPlugin({
      filename: '[path].gz[query]',
      algorithm: 'gzip',
      test: /\.(js|css|html|svg)$/,
      threshold: 10240,
      minRatio: 0.8,
    }), */
    /* new CompressionPlugin({
      filename: '[path].br[query]',
      algorithm: 'brotliCompress',
      test: /\.(js|css|html|svg)$/,
      compressionOptions: { level: 11 },
      threshold: 10240,
      minRatio: 0.8,
      deleteOriginalAssets: false,
    }), */

    // new WebpackOnBuildPlugin(function(stats) {
    //   const newlyCreatedAssets = stats.compilation.assets;

    //   const unlinked = [];
    //   fs.readdir(path.resolve(buildDir), (err, files) => {
    //     files.forEach(file => {
    //       //console.log('to unlink 1:', file);

    //       if(keepAsset(file)) {
    //         return;
    //       }

    //       let p = path.resolve(buildDir + file);
    //       if(!newlyCreatedAssets[file] && ['.gz', '.js', '.ts', '.map', '.css', '.txt'].find(ext => file.endsWith(ext)) !== undefined) {

    //         //console.log('to unlink 2:', file);

    //         fs.unlinkSync(p);
    //         unlinked.push(file);
    //       }
    //     });

    //     if(unlinked.length > 0) {
    //       console.log('Removed old assets: ', unlinked);
    //     }
    //   });
    // })
  ]
});
