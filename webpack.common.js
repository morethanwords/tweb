const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

let allowedIPs = ['195.66.140.39', '192.168.31.144', '127.0.0.1', '192.168.31.1', '192.168.31.192'];

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
      },
      {
        test: /\.ts?$/,
        use: [
          'ts-loader', 
          { loader: "ifdef-loader", options: opts }
        ],
        exclude: /node_modules/,
      },
      {
        test: /\.(woff2?|ttf|otf|eot|svg|jpg)$/,
        exclude: /node_modules/,
        loader: 'file-loader',
        options: {
          outputPath: 'assets/',
          publicPath: 'assets/',
          name: '[folder]/[name].[ext]'
        }
      },
      {
        test: /\.worker\.(js|ts)$/,
        use: { loader: 'worker-loader' }
      },
    ],
  },
  resolve: {
    extensions: [ '.ts', '.js' ],
  },
  //entry: './src/index.ts',
  entry: {
    index: './src/index.ts',
    webp: './src/lib/webp.ts',
    lottie: './src/lib/lottie.ts'
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
    host: '0.0.0.0',
    port: 9000,
    overlay: true,
    useLocalIp: true,
    before: function(app, server, compiler) {
      app.use((req, res, next) => {
        let IP = '';
        if(req.headers['cf-connecting-ip']) {
          IP = req.headers['cf-connecting-ip'];
        } else {
          IP = req.connection.remoteAddress.split(':').pop();
        }
      
        if(!allowedIPs.includes(IP)) {
          console.log('Bad IP connecting: ' + IP, req.url);
          res.status(404).send('Nothing interesting here.');
        } else {
          console.log(req.url, IP);
          next();
        }
      });
    }
  },

  plugins: [
    new HtmlWebpackPlugin({
      filename: `index.html`,
      template: 'public/index_template.html',
      inject: true,
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
      excludeChunks: ['npm.webp-hero', 'npm.lottie-web']
    })
  ],
};
