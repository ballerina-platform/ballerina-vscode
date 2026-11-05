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

// Reading a test function item's ID back, as the Testing view's edit and delete actions do.

import { parseTestFunctionId } from '../features/test-explorer/test-id';

/** The ID discovery gives a test function, `test:${projectPath}:${fileName}:${functionName}`. */
const idOf = (projectPath: string, fileName: string, functionName: string) =>
    `test:${projectPath}:${fileName}:${functionName}`;

const PROJECT_PATHS = [
    '/Users/dan/Projects/hotelagent',
    'c:\\Users\\damsith0\\Projects\\Integrations\\Agent_Test\\hotels\\hotelagent',
    'C:\\Users\\Dan\\wso2integrator\\fresh_agent\\assistant',
    '\\\\server\\share\\agents\\hotelagent',
];

describe('parseTestFunctionId', () => {
    it.each(PROJECT_PATHS)('reads the project path, file and function back from an ID for %s', (projectPath) => {
        expect(parseTestFunctionId(idOf(projectPath, 'tests.bal', 'evaluateHotelAgentHelpfulness'))).toEqual({
            projectPath,
            fileName: 'tests.bal',
            functionName: 'evaluateHotelAgentHelpfulness',
        });
    });

    it('rejects IDs that are not test functions', () => {
        expect(parseTestFunctionId('group:/Users/dan/Projects/hotelagent:evaluations')).toBeUndefined();
        expect(parseTestFunctionId('test:tests.bal:evaluate')).toBeUndefined();
    });
});
