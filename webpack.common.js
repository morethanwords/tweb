const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MediaQueryPlugin = require('media-query-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const postcssPresetEnv = require('postcss-preset-env');
const fs = require('fs');

const allowedIPs = ['195.66.140.39', '192.168.31.144', '127.0.0.1', '192.168.31.1', '192.168.31.192'];

const devMode = process.env.NODE_ENV !== 'production';

console.log('DEVMODE:', devMode);

const opts = {
  MTPROTO_WORKER: true,
  version: 3,
  "ifdef-verbose": true,       // add this for verbose output
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
      /* {
        test: /\.s[ac]ss$/i,
        use: [
          // Creates `style` nodes from JS strings
          'style-loader',
          // Translates CSS into CommonJS
          'css-loader',
          // Compiles Sass to CSS
          {
            loader: 'resolve-url-loader'
          },
          {
            loader: 'sass-loader',
            options: {
              sourceMap: true
            }
          },
        ],
      },
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader'],
      }, */
      {
        test: /\.ts?$/,
        use: [
          'ts-loader', 
          { loader: "ifdef-loader", options: opts }
        ],
        exclude: /node_modules/,
      },
      /* {
        test: /\.(woff2?|ttf|otf|eot|svg|jpg)$/,
        exclude: /node_modules/,
        loader: 'file-loader',
        options: {
          outputPath: 'assets/',
          publicPath: 'assets/',
          name: '[folder]/[name].[ext]'
        }
      }, */
      {
        test: /\.worker\.(js|ts)$/,
        use: { loader: 'worker-loader' }
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
    extensions: [ '.ts', '.js' ],
  },
  //entry: './src/index.ts',
  entry: {
    index: './src/index.ts',
    webp: './src/lib/webp.ts'/* ,
    lottie: './src/lib/lottie.ts' */
  },
  /* entry: {
    index: './src/index.ts',
    'lottie-web': ['lottie-web']
    //lottieLoader: './src/lib/lottieLoader.ts'
  }, */
  //devtool: 'inline-source-map',
  output: {
    path: path.resolve(__dirname, 'public'),
    //filename: 'bundle.js',
    filename: "[name].bundle.js",
    chunkFilename: "[name].chunk.js"
  },
  devServer: {
    contentBase: path.join(__dirname, 'public'),
    watchContentBase: true,
    compress: true,
    http2: true,
    https: {
      key: fs.readFileSync(__dirname + '/certs/server-key.pem', 'utf8'),
      cert: fs.readFileSync(__dirname + '/certs/server-cert.pem', 'utf8')
    },
    allowedHosts: [
      'tweb.enko.club'
    ],
    host: '0.0.0.0',
    public: 'tweb.enko.club',
    //host: '192.168.0.105', // '0.0.0.0'
    //host: 'tweb.enko.club', // '0.0.0.0'
    port: 443,
    overlay: true,
    before: function(app, server, compiler) {
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
          console.log(req.url, IP);
          next();
        }
      });
    },
    sockHost: 'tweb.enko.club',
  },
  plugins: [
    new HtmlWebpackPlugin({
      filename: `index.html`,
      //template: 'public/index_template.html',
      template: 'src/index.hbs',
      //inject: true, 
      inject: false, 
      //inject: 'head',
      /* minify: {
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
      }, */
      chunks: "all",
      excludeChunks: ['npm.webp-hero'/* , 'npm.lottie-web' */]
    }),
    
    new MiniCssExtractPlugin({
      // Options similar to the same options in webpackOptions.output
      // both options are optional
      filename: '[name].css',
      chunkFilename: '[id].css',
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
