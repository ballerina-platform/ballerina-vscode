/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

// Separate build that exposes the BI project-creation form as a Module
// Federation remote consumed by the WSO2 Integrator extension's webview. Kept
// apart from webpack.config.js so the main visualizer bundle is unaffected.
const path = require("path");
const webpack = require("webpack");
const { ModuleFederationPlugin } = require("webpack").container;

const REACT_VERSION = "18.2.0";

module.exports = {
    entry: "./src/views/BI/ProjectForm/embedded/federation-bootstrap.ts",
    target: "web",
    mode: !process.env.CI ? "development" : "production",
    devtool: !process.env.CI ? "source-map" : undefined,
    output: {
        path: path.resolve(__dirname, "build-federation"),
        clean: true,
        // `auto` lets the federation runtime derive the chunk base path from the
        // remoteEntry.js URL, so chunks are fetched from the same HTTP server.
        publicPath: "auto",
        uniqueName: "ballerinaBiForm",
    },
    resolve: {
        extensions: [".js", ".jsx", ".json", ".ts", ".tsx"],
        alias: {
            react: path.resolve(__dirname, "node_modules/react"),
            "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
            vscode: path.resolve(__dirname, "node_modules/vscode-uri"),
            crypto: false,
            net: false,
            os: false,
            path: false,
            fs: false,
            child_process: false,
        },
        fullySpecified: false,
    },
    module: {
        rules: [
            {
                test: /\.(ts|tsx)$/,
                loader: "ts-loader",
                exclude: "/node_modules/",
                options: { configFile: path.resolve(__dirname, "tsconfig.json") },
            },
            { test: /\.m?js$/, resolve: { fullySpecified: false } },
            { test: /\.css$/, use: ["style-loader", "css-loader"] },
            {
                test: /\.s[ac]ss$/i,
                use: ["style-loader", "css-loader", "sass-loader"],
            },
            { test: /\.(woff|woff2|ttf|otf|eot)$/, type: "asset/inline" },
            { test: /\.(svg)$/, type: "asset/resource", generator: { filename: "./images/[name][ext]" } },
        ],
    },
    optimization: {
        chunkIds: "deterministic",
    },
    plugins: [
        new webpack.ProvidePlugin({ Buffer: ["buffer", "Buffer"] }),
        new ModuleFederationPlugin({
            name: "ballerinaBiForm",
            filename: "remoteEntry.js",
            exposes: {
                "./EmbeddedBIProjectForm":
                    "./src/views/BI/ProjectForm/embedded/EmbeddedBIProjectForm.tsx",
                "./EmbeddedImportIntegration":
                    "./src/views/BI/ImportIntegration/EmbeddedImportIntegration.tsx",
            },
            // Only the React runtime is shared as a singleton so the host and
            // remote agree on one copy; everything else (ui-toolkit, core,
            // rpc-client, react-query) is bundled to keep the remote portable
            // across the extension boundary.
            shared: {
                react: { singleton: true, strictVersion: true, requiredVersion: REACT_VERSION },
                "react-dom": { singleton: true, strictVersion: true, requiredVersion: REACT_VERSION },
            },
        }),
    ],
};
