/* eslint-disable */
const VueLoaderPlugin = require("vue-loader/lib/plugin")

module.exports = {
    mode: "development",
    entry: "./src/main.ts",
    devtool: "inline-source-map",
    plugins: [new VueLoaderPlugin()],
    module: {
        rules: [
            {
                test: /\.vue$/,
                loader: "vue-loader",
                options: {
                    loaders: {
                    // Since sass-loader (weirdly) has SCSS as its default parse mode, we map
                    // the "scss" and "sass" values for the lang attribute to the right configs here.
                    // other preprocessors should work out of the box, no loader config like this necessary.
                    "scss": "vue-style-loader!css-loader!sass-loader",
                    "sass": "vue-style-loader!css-loader!sass-loader?indentedSyntax",
                    }
                    // other vue-loader options go here
                }
            },
            {
                test: /\.pug$/,
                loader: 'pug-plain-loader'
            },
            {
                test: /\.scss$/,
                use: [
                  'vue-style-loader',
                  'css-loader',
                  'sass-loader'
                ]
            },
            {
                test: /\.ts?$/,
                loader: "ts-loader",
                options: { appendTsSuffixTo: [/\.vue$/] },
                exclude: /node_modules/,
            }
        ]
    },
    externals: {

    },
    resolve: {
        extensions: [".ts", ".js", ".vue"],
    },
    output: {
        path: __dirname + "/site/build",
        filename: "bundle.js",
    }
}