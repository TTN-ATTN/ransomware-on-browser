const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000/api';

module.exports = {
  entry: path.resolve(__dirname, 'src/main.js'),
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].[contenthash].js',
    assetModuleFilename: 'assets/[hash][ext][query]',
    clean: false
  },
  resolve: {
    extensions: ['.js'],
    alias: {
      '@cubbit/enigma': '@cubbit/enigma/web'
    },
    fallback: {
      buffer: require.resolve('buffer/'),
      process: require.resolve('process/browser'),
      stream: require.resolve('stream-browserify'),
      crypto: require.resolve('crypto-browserify'),
      vm: require.resolve('vm-browserify')
    }
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [['@babel/preset-env', { targets: 'defaults' }]]
          }
        }
      },
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, 'index.html'),
      inject: 'body'
    }),
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      process: ['process']
    }),
    new webpack.DefinePlugin({
      'process.env.API_BASE_URL': JSON.stringify(API_BASE_URL)
    })
  ],
  devServer: {
    static: {
      directory: path.resolve(__dirname, 'dist')
    },
    port: 8080,
    hot: true,
    historyApiFallback: true,
    allowedHosts: 'all'
  },
  devtool: 'source-map',
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development'
};
