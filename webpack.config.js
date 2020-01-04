module.exports = {
    mode: "development",
    entry: "./src/main.ts",
    devtool: "inline-source-map",
    devServer: {
        contentBase: __dirname + "/site",
        host: "0.0.0.0", // open to local network
        port: 8080,
    },
    module: {
        rules: [
            {
                test: /\.css$/,
                use: [
                  'style-loader',
                  'css-loader',
                ],
                exclude: /node_modules/,
            },
            {
                test: /\.scss$/,
                use: [
                  'style-loader',
                  'css-loader',
                  'sass-loader'
                ]
            },
            {
                test: /\.ts?$/,
                loader: "ts-loader",
                exclude: /node_modules/,
            }
        ]
    },
    externals: {

    },
    resolve: {
        extensions: [".ts", ".js"],
    },
    output: {
        path: __dirname + "/site",
        filename: "bundle.js",
    }
}