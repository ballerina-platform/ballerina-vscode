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

import assert = require('assert');
import { join } from 'path';
import { ExtendedLangClient } from "../../src/core/extended-language-client";
import { commands, Uri } from "vscode";
import { log } from '../../src/utils';

// Resolved from out/test/language-server -> packages/ballerina-grammar/test/resources/config
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..', 'ballerina-grammar', 'test', 'resources',
    'config');

const TEST_CONFIG = [['class.bal'], ['object.bal'], ['service.bal'], ['test.bal'], ['semtype', 'main.bal'],
['semtype', 'bmain.bal'], ['semtype', 'modules', 'b', 'bbuild.bal'], ['semtype', 'modules', 'b', 'bparse.bal'],
['semtype', 'modules', 'b', 'btoken.bal'], ['semtype', 'modules', 'b', 'tests', 'btokentest.bal'],
['semtype', 'modules', 'bdd', 'bdd.bal'], ['semtype', 'modules', 'bdd', 'tests', 'bddtest.bal'],
['semtype', 'modules', 'core', 'boolean.bal'], ['semtype', 'modules', 'core', 'common.bal'],
['semtype', 'modules', 'core', 'core.bal'], ['semtype', 'modules', 'core', 'error.bal'],
['semtype', 'modules', 'core', 'function.bal'], ['semtype', 'modules', 'core', 'int.bal'],
['semtype', 'modules', 'core', 'list.bal'], ['semtype', 'modules', 'core', 'mapping.bal'],
['semtype', 'modules', 'core', 'string.bal'], ['semtype', 'modules', 'json', 'parse.bal'],
['semtype', 'modules', 'json', 'schema.bal'], ['semtype', 'tests', 'baltest.bal'],
['semtype', 'tests', 'data', 'basic.bal'], ['semtype', 'tests', 'data', 'boolean-subtype.bal'],
['semtype', 'tests', 'data', 'error1.bal'], ['semtype', 'tests', 'data', 'error2.bal'],
['semtype', 'tests', 'data', 'function.bal'], ['semtype', 'tests', 'data', 'hard.bal'],
['semtype', 'tests', 'data', 'int-singleton.bal'], ['semtype', 'tests', 'data', 'int-subtype.bal'],
['semtype', 'tests', 'data', 'never.bal'], ['semtype', 'tests', 'data', 'readonly1.bal'],
['semtype', 'tests', 'data', 'readonly2.bal'], ['semtype', 'tests', 'data', 'string-singleton.bal'],
['semtype', 'tests', 'data', 'tuple1.bal']];

// Cases run sequentially and are awaited end to end: the request is measured per
// file, so overlapping them would distort the timings the perf assertion checks.
export async function runSemanticTokensTestCases(langClient: ExtendedLangClient): Promise<boolean> {
    let status: boolean = true;
    for (const element of TEST_CONFIG) {
        const filePath = join(PROJECT_ROOT, ...element);
        const uri = Uri.file(filePath);

        await commands.executeCommand('vscode.open', uri);

        const start = Date.now();
        const response: any = await langClient.sendRequest("textDocument/semanticTokens/full", {
            textDocument: {
                uri: uri.toString()
            }
        });
        const diff = Date.now() - start;

        const result: boolean = response?.data?.length > 0;
        status = status && result;
        // Logged before the assertions so a failing case still reports its timing.
        log(`Time taken for ${filePath}: ${diff}`);
        assert.equal(result, true, `Semantic tokens API resulted in an incorrect response for ${filePath}`);
        assert.equal(diff < 5000, true, `Semantic token response took more than 5 seconds for ${filePath}.`);
    }
    return status;
}
