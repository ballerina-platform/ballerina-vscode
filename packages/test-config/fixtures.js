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

// Helpers for loading recorded fixtures in tests. Fixtures live under a
// package's src/test/fixtures/... directory; see docs/TEST_PLAN.md §5.

const fs = require('fs');
const path = require('path');

/**
 * Load and parse a single JSON fixture.
 *   loadFixture(__dirname, 'fields', 'issue-1491.json')
 */
function loadFixture(dir, ...segments) {
    return JSON.parse(fs.readFileSync(path.join(dir, ...segments), 'utf8'));
}

/**
 * Load every *.json fixture in a directory (non-recursive), sorted by name.
 * Returns [{ name, data }] — ideal for table-driven `it.each` invariant tests.
 *   loadFixtures(__dirname, 'fields')
 */
function loadFixtures(dir, ...segments) {
    const full = path.join(dir, ...segments);
    let entries;
    try {
        entries = fs.readdirSync(full);
    } catch {
        return [];
    }
    return entries
        .filter((f) => f.endsWith('.json'))
        .sort()
        .map((name) => ({
            name: name.replace(/\.json$/, ''),
            data: JSON.parse(fs.readFileSync(path.join(full, name), 'utf8')),
        }));
}

module.exports = { loadFixture, loadFixtures };
