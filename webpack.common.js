const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MediaQueryPlugin = require('media-query-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const postcssPresetEnv = require('postcss-preset-env');
const ServiceWorkerWebpackPlugin = require('serviceworker-webpack-plugin');
const { RetryChunkLoadPlugin } = require('webpack-retry-chunk-load-plugin');
const fs = require('fs');

const allowedIPs = ['127.0.0.1'];
const devMode = process.env.NODE_ENV !== 'production';
const useLocal = true;
const useLocalNotLocal = false;

if(devMode) {
  console.log('DEVMODE IS ON!');
}

const opts = {
  MTPROTO_WORKER: true,
  MTPROTO_SW: false,
  MTPROTO_HTTP: false,
  MTPROTO_HTTP_UPLOAD: false,
  DEBUG: devMode,
  version: 3,
  'ifdef-verbose': devMode,         // add this for verbose output
  'ifdef-triple-slash': true,       // add this to use double slash comment instead of default triple slash
  'ifdef-fill-with-blanks': true    // add this to remove code with blank spaces instead of "//" comments
};

const domain = 'yourdomain.com';
const localIp = '192.168.93.209';

module.exports = {
  module: {
    rules: [
      {
        test: /\.scss$/,
        use: [
          devMode ? 'style-loader' : MiniCssExtractPlugin.loader,/* {
            loader: MiniCssExtractPlugin.loader,
            options: {
              hmr: devMode,
              reloadAll: true,
            }
          }, */
          'css-loader?url=false',
          devMode ? undefined : MediaQueryPlugin.loader,
          {
            loader: 'postcss-loader',
            options: {
              ident: 'postcss',
              plugins: [
                postcssPresetEnv(),
              ]
            }
          },
          {
            loader: 'sass-loader',
            options: {
              sourceMap: devMode
            }
          }
        ].filter(l => !!l)
      },
      {
        test: /\.ts?$/,
        use: [
          //{ loader: 'babel-loader', options: require('./babel.config') },
          'ts-loader', 
          { loader: 'ifdef-loader', options: opts }
        ],
        exclude: /node_modules/,
      },
      {
        test: /\.hbs$/,
        use: [
          'handlebars-loader'
        ]
      }
    ],
  },
  
  resolve: {
    extensions: ['.ts', '.js'],
  },

  entry: './src/index.ts',
  /* entry: {
    index: './src/index.ts',
    pluralPolyfill: './src/lib/pluralPolyfill.ts'
  }, */
  //devtool: 'inline-source-map',

  output: {
    globalObject: 'this',
    path: path.resolve(__dirname, 'public'),
    filename: '[name].[chunkhash].bundle.js',
    chunkFilename: '[name].[chunkhash].chunk.js'
  },

  devServer: {
    contentBase: path.join(__dirname, 'public'),
    watchContentBase: true,
    compress: true,
    http2: useLocalNotLocal ? true : (useLocal ? undefined : true),
    https: useLocal ? undefined : {
      key: fs.readFileSync(__dirname + '/certs/server-key.pem', 'utf8'),
      cert: fs.readFileSync(__dirname + '/certs/server-cert.pem', 'utf8')
    },
    allowedHosts: useLocal ? undefined : [
      domain
    ],
    host: useLocalNotLocal ? localIp : (useLocal ? undefined : '0.0.0.0'),
    public: useLocal ? undefined : domain,
    //host: domain, // '0.0.0.0'
    port: useLocal ? undefined : 443,
    overlay: true,
    before: useLocal ? undefined : function(app, server, compiler) {
      app.use((req, res, next) => {
        let IP = '';
        if(req.headers['cf-connecting-ip']) {
          IP = req.headers['cf-connecting-ip'];
        } else {
          IP = req.connection.remoteAddress.split(':').pop();
        }

        if(!allowedIPs.includes(IP) && !/^192\.168\.\d{1,3}\.\d{1,3}$/.test(IP)) {
          console.log('Bad IP connecting: ' + IP, req.url);
          res.status(404).send('Nothing interesting here.');
        } else {
          if(req.url.indexOf('/assets/') !== 0) {
            console.log(req.url, IP);
          }

          next();
        }
      });
    },
    sockHost: useLocal ? undefined : domain,
  },

  plugins: [
    new ServiceWorkerWebpackPlugin({
      entry: path.join(__dirname, 'src/lib/serviceWorker/index.service.ts'),
      filename: 'sw.js',
      //excludes: ['**/*'],
      includes: [
        '**/*.js', 
        '**/*.css', 
        '**/*.json', 
        '**/*.wasm', 
        '**/*.mp3', 
        '**/*.svg', 
        '**/*.tgs', 
        '**/*.ico', 
        '**/*.woff', 
        '**/*.woff2', 
        '**/*.ttf', 
        '**/*.webmanifest'
      ],
    }),

    new HtmlWebpackPlugin({
      filename: `index.html`,
      //template: 'public/index_template.html',
      template: 'src/index.hbs',
      inject: false, // true, 'head'
      minify: {
        removeComments: true,
        collapseWhitespace: true,
        removeRedundantAttributes: true,
        useShortDoctype: true,
        removeEmptyAttributes: true,
        removeStyleLinkTypeAttributes: true,
        keepClosingSlash: true,
        minifyJS: true,
        minifyCSS: true,
        minifyURLs: true
      },
      chunks: 'all',
      excludeChunks: []
    }),
    
    new MiniCssExtractPlugin({
      // Options similar to the same options in webpackOptions.output
      // both options are optional
      filename: '[name].[contenthash].css',
      chunkFilename: '[id].[contenthash].css',
    }),

    new MediaQueryPlugin({
      include: [
        'style'
      ],
      queries: {
        'only screen and (max-width: 720px)': 'mobile',
        'only screen and (min-width: 721px)': 'desktop',
      }
    }),

    new RetryChunkLoadPlugin({
      // optional stringified function to get the cache busting query string appended to the script src
      // if not set will default to appending the string `?cache-bust=true`
      cacheBust: `function() {
        return Date.now();
      }`,
      // optional value to set the amount of time in milliseconds before trying to load the chunk again. Default is 0
      retryDelay: 3000,
      // optional value to set the maximum number of retries to load the chunk. Default is 1
      maxRetries: 999999,
      // optional list of chunks to which retry script should be injected
      // if not set will add retry script to all chunks that have webpack script loading
      //chunks: ['chunkName'],
      // optional code to be executed in the browser context if after all retries chunk is not loaded.
      // if not set - nothing will happen and error will be returned to the chunk loader.
      //lastResortScript: "window.location.href='/500.html';",
    }),
  ],
};
