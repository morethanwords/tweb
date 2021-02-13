const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MediaQueryPlugin = require('media-query-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const postcssPresetEnv = require('postcss-preset-env');
const ServiceWorkerWebpackPlugin = require('serviceworker-webpack-plugin');
const fs = require('fs');

const allowedIPs = ['194.58.97.147', '195.66.140.39', '127.0.0.1', '176.100.8.254'];
const devMode = process.env.NODE_ENV !== 'production';
const useLocal = true;
const useLocalNotLocal = false;

if(devMode) {
  console.log('DEVMODE IS ON!');
}

const opts = {
  MTPROTO_WORKER: true,
  MTPROTO_HTTP: false,
  MTPROTO_HTTP_UPLOAD: false,
  DEBUG: devMode,
  version: 3,
  "ifdef-verbose": devMode,    // add this for verbose output
  "ifdef-triple-slash": true   // add this to use double slash comment instead of default triple slash
};

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
          { loader: "ifdef-loader", options: opts }
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
    index: './src/index.ts'
  }, */
  //devtool: 'inline-source-map',

  output: {
    path: path.resolve(__dirname, 'public'),
    filename: "[name].[chunkhash].bundle.js",
    chunkFilename: "[name].[chunkhash].chunk.js"
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
      'tweb.enko.club'
    ],
    host: useLocalNotLocal ? '192.168.93.209' : (useLocal ? undefined : '0.0.0.0'),
    public: useLocal ? undefined : 'tweb.enko.club',
    //host: '192.168.0.105', // '0.0.0.0'
    //host: 'tweb.enko.club', // '0.0.0.0'
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
    sockHost: useLocal ? undefined : 'tweb.enko.club',
  },

  plugins: [
    new ServiceWorkerWebpackPlugin({
      entry: path.join(__dirname, 'src/lib/mtproto/mtproto.service.ts'),
      filename: 'sw.js',
      excludes: ['**/*'],
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
      chunks: "all",
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
  ],
};
