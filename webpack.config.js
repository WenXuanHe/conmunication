var webpack = require('webpack');
var ExtractTextPlugin = require('extract-text-webpack-plugin');
var path = require("path");

module.exports = {
    entry: {
        index:path.resolve(__dirname, "public/src/js/index.js"),
        login:path.resolve(__dirname, "public/src/js/login.js")
    },
    output: {
        path: path.resolve(__dirname, 'public/dist/'),
        filename: "[name].js",
        sourceMapFilename: '[file].map',
    },
    module: {
        loaders: [
            {
                test: /\.js$/,
                loader: 'babel-loader',
                include: [path.resolve(__dirname, 'public/src/js')],
                exclude: /node_modules/,
                query: {
                    "presets":
                    [
                        "es2015",
                        "stage-0"
                    ],
                    plugins: ['transform-runtime']
                }
            },
            {
                test: /\.(gif|jpg|png|woff|svg|eot|ttf)\??.*$/,
                loader: 'url-loader?limit=50000&name=[path][name].[ext]'
            },
            {
                test: /\.css$/,
                loader: ExtractTextPlugin.extract(['css-loader']) //postcss-loader  自动补齐前缀
            },
            {
                test: /\.scss$/,
                loader: ExtractTextPlugin.extract('style-loader', ['css-loader', 'postcss-loader', 'sass-loader'])
            }
        ]
    },
    plugins:[
        new ExtractTextPlugin("./styles/[name].css")
    ],
    devtool: 'source-map'
}
