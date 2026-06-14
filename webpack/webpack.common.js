const webpack = require("webpack");
const fs = require("fs");
const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");
const srcDir = path.join(__dirname, "..", "src");
const publicDir = path.join(__dirname, "..", "public");

// Manifest V3 background pages differ between browsers (Chrome requires a
// service_worker; Firefox uses a background script) and Firefox needs an
// explicit add-on ID for storage.sync, so each browser gets its own
// manifest.json, built by merging public/manifest.firefox.json's overrides
// into the shared public/manifest.json for Firefox builds.
module.exports = (env = {}) => {
    const browser = env.browser === "firefox" ? "firefox" : "chrome";
    const outDir = browser === "firefox" ? "dist-firefox" : "dist";

    return {
        entry: {
          popup: path.join(srcDir, 'popup.tsx'),
          options: path.join(srcDir, 'options.tsx'),
          background: path.join(srcDir, 'background.ts'),
          content_script: path.join(srcDir, 'content_script.tsx'),
        },
        output: {
            path: path.join(__dirname, `../${outDir}/js`),
            filename: "[name].js",
        },
        optimization: {
            splitChunks: {
                name: "vendor",
                chunks(chunk) {
                  return chunk.name !== 'background';
                }
            },
        },
        module: {
            rules: [
                {
                    test: /\.tsx?$/,
                    use: "ts-loader",
                    exclude: /node_modules/,
                },
            ],
        },
        resolve: {
            extensions: [".ts", ".tsx", ".js"],
        },
        plugins: [
            new CopyPlugin({
                patterns: [
                    {
                        from: "**/*",
                        to: "../",
                        context: "public",
                        globOptions: { ignore: ["**/manifest.json", "**/manifest.firefox.json"] },
                    },
                    {
                        from: "manifest.json",
                        to: "../manifest.json",
                        context: "public",
                        transform(content) {
                            const manifest = JSON.parse(content.toString());
                            if (browser !== "firefox") return JSON.stringify(manifest, null, 2);

                            const overrides = JSON.parse(
                                fs.readFileSync(path.join(publicDir, "manifest.firefox.json"), "utf-8")
                            );
                            return JSON.stringify({ ...manifest, ...overrides }, null, 2);
                        },
                    },
                ],
                options: {},
            }),
        ],
    };
};
