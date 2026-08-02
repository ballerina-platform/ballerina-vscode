/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

// Copies the visualizer's Module Federation remote into resources/jslibs/federation.
// The visualizer's own postbuild:federation also writes here, but that only runs when
// the visualizer actually builds — on a rush cache hit it does not. Doing the copy from
// the extension makes packaging depend on build-federation/ existing on disk (restored
// or freshly built) rather than on the visualizer's side effect.
const fs = require('fs');
const path = require('path');

const source = path.resolve(__dirname, '..', '..', 'ballerina-visualizer', 'build-federation');
const target = path.resolve(__dirname, '..', 'resources', 'jslibs', 'federation');

if (!fs.existsSync(path.join(source, 'remoteEntry.js'))) {
    console.error(
        `Module Federation remote not found at ${source}/remoteEntry.js.\n` +
            "The VSIX would ship without it, so this is a hard failure. Rebuild the visualizer " +
            "('rush rebuild --to ballerina', or 'pnpm run build:federation' in packages/ballerina-visualizer); " +
            'if this happened in CI, a stale rush build cache entry for ballerina-visualizer predates ' +
            "build-federation being a cached output folder."
    );
    process.exit(1);
}

// Replace rather than merge: chunk filenames are content-hashed, so stale ones accumulate.
fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });

let copied = 0;
for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.js')) {
        fs.copyFileSync(path.join(source, entry.name), path.join(target, entry.name));
        copied++;
    }
}

const images = path.join(source, 'images');
if (fs.existsSync(images)) {
    for (const entry of fs.readdirSync(images, { withFileTypes: true })) {
        if (entry.isFile()) {
            fs.mkdirSync(path.join(target, 'images'), { recursive: true });
            fs.copyFileSync(path.join(images, entry.name), path.join(target, 'images', entry.name));
            copied++;
        }
    }
}

console.log(`Copied ${copied} federation file(s) to ${target}`);
