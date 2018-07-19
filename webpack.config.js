const path = require('path')
const UglifyJsPlugin = require('uglifyjs-webpack-plugin')

module.exports = {
    entry: './src/resources/index.ts',
//    mode: 'development', // production
    mode: 'production', // production
    devtool: 'inline-source-map',
    output: {
        path: path.resolve(__dirname, 'src/resources/'),
        filename: 'index.js'
    },
    module: {
        rules: [
          {
            test: /\.tsx?$/,
            use: 'ts-loader',
            exclude: /node_modules/
          }
        ]
    },
    resolve: {
        extensions: ['.js', '.ts', '.tsx'],
        alias: {
            vue: 'vue/dist/vue.js'
        }
    },
    target:'electron-renderer',
    optimization: {
        minimizer: [
            new UglifyJsPlugin()
        ]
    }
};
