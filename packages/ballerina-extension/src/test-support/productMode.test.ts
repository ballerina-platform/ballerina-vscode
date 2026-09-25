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

// The core barrel pulls in ESM-only LS transports jest can't load, so stand it up from the module
// defining the names — the real maps, not a copy that could drift.
jest.mock('@wso2/ballerina-core', () => jest.requireActual('@wso2/ballerina-core/lib/state-machine-types'));

import { ProductMode } from '@wso2/ballerina-core/lib/state-machine-types';
import { extensions } from 'vscode';
import { copilotName, getProductMode, WI_EXTENSION_ID } from '../utils/config';

// The mock's `getExtension` answers from this set.
const installed = (extensions as unknown as { installed: Set<string> }).installed;

describe('product mode', () => {
    let declaredMode: string | undefined;

    beforeEach(() => {
        declaredMode = process.env.WSO2_PRODUCT_MODE;
        delete process.env.WSO2_PRODUCT_MODE;
        installed.clear();
    });

    afterEach(() => {
        if (declaredMode === undefined) {
            delete process.env.WSO2_PRODUCT_MODE;
        } else {
            process.env.WSO2_PRODUCT_MODE = declaredMode;
        }
        installed.clear();
    });

    // product-integrator#1945: on its own this is the Ballerina plugin, not the Integrator.
    it('is Ballerina when the Integrator extension is not installed', () => {
        expect(getProductMode()).toBe(ProductMode.BALLERINA);
        expect(copilotName()).toBe('Ballerina Copilot');
    });

    it('is Integrator when the Integrator extension is installed alongside', () => {
        installed.add(WI_EXTENSION_ID);

        expect(getProductMode()).toBe(ProductMode.INTEGRATOR);
        expect(copilotName()).toBe('WSO2 Integrator Copilot');
    });

    // The Integrator app exports this, and it is the more direct signal.
    it('takes the host app\'s declared mode over the installed extensions', () => {
        process.env.WSO2_PRODUCT_MODE = ProductMode.INTEGRATOR;

        expect(getProductMode()).toBe(ProductMode.INTEGRATOR);
    });

    it('ignores a declared mode it does not recognise', () => {
        process.env.WSO2_PRODUCT_MODE = 'agent-builder';

        expect(getProductMode()).toBe(ProductMode.BALLERINA);

        installed.add(WI_EXTENSION_ID);
        expect(getProductMode()).toBe(ProductMode.INTEGRATOR);
    });

    // Installing the Integrator extension from the login panel must not leave a stale name behind.
    it('follows an extension installed after the first call', () => {
        expect(copilotName()).toBe('Ballerina Copilot');

        installed.add(WI_EXTENSION_ID);

        expect(copilotName()).toBe('WSO2 Integrator Copilot');
    });
});
