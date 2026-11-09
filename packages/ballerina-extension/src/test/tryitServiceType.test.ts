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

/**
 * @jest-environment node
 *
 * Every type string below was observed on the design model response from the language
 * server jar this extension bundles.
 */

import { resolveServiceType, ServiceType } from '../features/tryit/service-type';

describe('resolveServiceType', () => {
    it.each([
        ['http:Service', ServiceType.HTTP],
        ['graphql:Service', ServiceType.GRAPHQL],
        ['ai:Service', ServiceType.AGENT],
        ['mcp:Service', ServiceType.MCP],
        ['mcp:StreamableHttpService', ServiceType.MCP],
    ])('%s resolves to %s', (type, expected) => {
        expect(resolveServiceType(type)).toBe(expected);
    });

    it.each([
        ['an unsupported module', 'tcp:Service'],
        ['a same-package type, which carries no module prefix', 'MyService'],
        ['a missing type, omitted for an unresolved listener', undefined],
        ['an empty type', ''],
    ])('excludes %s', (_case, type) => {
        expect(resolveServiceType(type as string)).toBeUndefined();
    });

    // The anonymous-listener path builds the type from the listener's source code, so
    // whatever trivia precedes the type descriptor rides along:
    //   service /x on new
    //           // a standalone comment
    //           http:Listener(9201)
    it.each([
        ['indentation', '        http:Service'],
        ['a standalone comment line', '        // a standalone comment\n        http:Service'],
    ])('sees past %s', (_case, type) => {
        expect(resolveServiceType(type)).toBe(ServiceType.HTTP);
    });
});
