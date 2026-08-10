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
// The push is kept for the visualizer-only dev loop; this pull replaces the directory
// wholesale, so the two cannot disagree about what ships.
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

// Deny-list rather than allow-list, so a new asset type (CSS, fonts) ships by default
// instead of being dropped silently. '.txt' mirrors the '-e build/*.txt' in the
// visualizer's sibling postbuild (webpack's *.LICENSE.txt); '.map' is excluded for the
// same reason that postbuild's 'build/*.js' glob skips it — source maps are ~3x the size
// of the bundles here and nothing debugs the remote from inside the VSIX.
const EXCLUDED = ['.txt', '.map'];

let copied = 0;
const copyDir = (from, to) => {
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
        const src = path.join(from, entry.name);
        const dst = path.join(to, entry.name);
        if (entry.isDirectory()) {
            copyDir(src, dst);
        } else if (entry.isFile() && !EXCLUDED.some((ext) => entry.name.endsWith(ext))) {
            fs.copyFileSync(src, dst);
            copied++;
        }
    }
};
copyDir(source, target);

console.log(`Copied ${copied} federation file(s) to ${target}`);
