const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MediaQueryPlugin = require('media-query-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const postcssPresetEnv = require('postcss-preset-env');
// const ServiceWorkerWebpackPlugin = require('serviceworker-webpack-plugin');
const {RetryChunkLoadPlugin} = require('webpack-retry-chunk-load-plugin');
const fs = require('fs');
const Dotenv = require('dotenv-webpack');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
const keepAsset = require('./keepAsset');
const HtmlWebpackInjectPreload = require('@principalstudio/html-webpack-inject-preload');

const allowedIPs = ['127.0.0.1'];
const devMode = process.env.NODE_ENV !== 'production';
const useLocal = true;
const useLocalNotLocal = false;

if(devMode) {
  console.log('DEVMODE IS ON!');
}

const MTPROTO_HTTP = false;
const MTPROTO_AUTO = true;

const opts = {
  'MTPROTO_WORKER': true,
  'MTPROTO_SW': false,
  'MTPROTO_HTTP': MTPROTO_HTTP,
  'MTPROTO_HTTP_UPLOAD': false,
  'MTPROTO_AUTO': MTPROTO_AUTO, // use HTTPS when WS is unavailable
  'MTPROTO_HAS_HTTP': MTPROTO_AUTO || MTPROTO_HTTP,
  'MTPROTO_HAS_WS': MTPROTO_AUTO || !MTPROTO_HTTP,
  'SAFARI_PROXY_WEBSOCKET': false,
  'DEBUG': devMode,

  'version': 3,
  'ifdef-verbose': devMode, // add this for verbose output
  'ifdef-triple-slash': false, // add this to use double slash comment instead of default triple slash
  'ifdef-fill-with-blanks': true // add this to remove code with blank spaces instead of "//" comments
};

const domain = 'yourdomain.com';
const localIp = '192.168.92.78';

const middleware = (req, res, next) => {
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
};

module.exports = {
  module: {
    rules: [
      {
        test: /\.scss$/,
        use: [
          devMode ? 'style-loader' : MiniCssExtractPlugin.loader, /* {
            loader: MiniCssExtractPlugin.loader,
            options: {
              hmr: devMode,
              reloadAll: true,
            }
          }, */

          // Webpack 4
          // 'css-loader?url=false',
          // Webpack 5
          {
            loader: 'css-loader',
            options: {
              url: false
            }
          },

          devMode ? undefined : MediaQueryPlugin.loader,
          {
            loader: 'postcss-loader',
            options: {
              // Webpack 4
              // ident: 'postcss',
              // plugins: [
              //   postcssPresetEnv(),
              // ],

              // Webpack 5
              postcssOptions: {
                plugins: [
                  'postcss-import',
                  [
                    'postcss-preset-env',
                    {
                      features: {
                        'custom-properties': false
                      }
                    }
                  ],
                  'cssnano'
                ]
              }
            }
          },
          {
            loader: 'sass-loader',
            options: {
              sourceMap: devMode
            }
          }
        ].filter(Boolean)
      },
      // {
      //   test: /\.worker\.ts$/i,
      //   loader: "worker-loader",
      //   // options: {
      //   //   filename: "[name].[contenthash].worker.js",
      //   // }
      // },
      {
        test: /\.ts?$/,
        use: [
          // { loader: 'babel-loader', options: require('./babel.config') },
          'ts-loader',
          {loader: 'ifdef-loader', options: opts}
        ],
        exclude: /node_modules/
      },
      {
        test: /\.hbs$/,
        loader: 'handlebars-loader',
        options: {
          helperDirs: __dirname + '/handlebarsHelpers'
        }
        // loader: 'handlebars-loader?helperDirs[]=' + __dirname + '/handlebarsHelpers',
        // use: [
        //   'handlebars-loader'
        // ]
      }
    ]
  },

  resolve: {
    extensions: ['.ts', '.js']
  },

  entry: './src/index.ts',
  // entry: {
  //   index: './src/index.ts',
  //   // sw: {import: './src/lib/serviceWorker/index.service.ts', filename: 'sw.js'}
  // },
  /* entry: {
    index: './src/index.ts',
    pluralPolyfill: './src/lib/pluralPolyfill.ts'
  }, */
  // devtool: 'inline-source-map',

  output: {
    globalObject: 'this',
    path: path.resolve(__dirname, 'public'),
    filename: devMode ? '[name].bundle.js' : '[name].[chunkhash].bundle.js',
    chunkFilename: devMode ? '[name].chunk.js' : '[name].[chunkhash].chunk.js',

    // Webpack 5
    clean: {
      keep: keepAsset
    }
  },

  devServer: {
    // Webpack 4 options
    // contentBase: path.join(__dirname, 'public'),
    // watchContentBase: true,
    // before: useLocal ? undefined : function(app, server, compiler) {
    //   app.use(middleware);
    // },
    // public: useLocal ? undefined : domain,
    // sockHost: useLocal ? undefined : domain,
    // overlay: true,

    // static: {
    // directory: path.join(__dirname, 'public')
    // },
    compress: true,
    http2: useLocalNotLocal ? true : (useLocal ? undefined : true),
    https: useLocal ? undefined : { // generated keys using mkcert
      key: fs.readFileSync(__dirname + '/certs/localhost-key.pem', 'utf8'),
      cert: fs.readFileSync(__dirname + '/certs/localhost.pem', 'utf8')
    },
    allowedHosts: useLocal ? undefined : [
      domain
    ],
    host: useLocalNotLocal ? localIp : (useLocal ? undefined : '0.0.0.0'),
    // host: domain, // '0.0.0.0'
    port: useLocal ? undefined : 443,


    // Webpack 5
    hot: false,
    setupMiddlewares: useLocal ? undefined : (middlewares, devServer) => {
      middlewares.push(middleware);

      return middlewares;
    },
    client: {
      overlay: true,
      progress: false
    }
  },

  plugins: [
    devMode ? undefined : new BundleAnalyzerPlugin({
      analyzerMode: 'static',
      openAnalyzer: false,
      generateStatsFile: false,
      defaultSizes: 'gzip'
    }),

    new Dotenv(),

    // new ServiceWorkerWebpackPlugin({
    //   entry: path.join(__dirname, 'src/lib/serviceWorker/index.service.ts'),
    //   filename: 'sw.js',
    //   //excludes: ['**/*'],
    //   includes: [
    //     '**/*.js',
    //     '**/*.css',
    //     '**/*.json',
    //     '**/*.wasm',
    //     '**/*.mp3',
    //     '**/*.svg',
    //     '**/*.tgs',
    //     '**/*.ico',
    //     '**/*.woff',
    //     '**/*.woff2',
    //     '**/*.ttf',
    //     '**/*.webmanifest'
    //   ],
    // }),

    new HtmlWebpackPlugin({
      title: 'Telegram Web',
      description: 'Telegram is a cloud-based mobile and desktop messaging app with a focus on security and speed.',
      url: 'https://web.telegram.org/k/',
      origin: 'https://web.telegram.org/',
      filename: 'index.html',
      // template: 'public/index_template.html',
      template: 'src/index.hbs',
      inject: 'body', // true, 'head'
      scriptLoading: 'blocking',
      minify: devMode ? false : {
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

    new HtmlWebpackInjectPreload({
      files: [
        {
          match: /(mtproto).*\.js$/,
          attributes: {rel: 'modulepreload'}
        }
      ]
    }),

    new MiniCssExtractPlugin({
      // Options similar to the same options in webpackOptions.output
      // both options are optional
      filename: '[name].[contenthash].css',
      chunkFilename: '[id].[contenthash].css'
    }),

    new MediaQueryPlugin({
      include: [
        'style'
      ],
      queries: {
        'only screen and (max-width: 720px)': 'mobile',
        'only screen and (min-width: 721px)': 'desktop'
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
      maxRetries: 999999
      // optional list of chunks to which retry script should be injected
      // if not set will add retry script to all chunks that have webpack script loading
      // chunks: ['chunkName'],
      // optional code to be executed in the browser context if after all retries chunk is not loaded.
      // if not set - nothing will happen and error will be returned to the chunk loader.
      // lastResortScript: "window.location.href='/500.html';",
    })
  ].filter(Boolean)
};
