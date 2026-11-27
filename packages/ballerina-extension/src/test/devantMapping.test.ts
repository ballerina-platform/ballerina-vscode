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

// L1: what the Devant manager reads of Devant's shapes. Pure.

import type { ComponentKind, Environment } from "@wso2/wso2-platform-core";
import { isComponent, toEnvironment } from "../rpc-managers/platform-ext/devant/mapping";

const component = (metadata: Partial<ComponentKind["metadata"]>) => ({ metadata }) as ComponentKind;

describe("Devant shapes", () => {
    it("names a component by its id, its name or its handle, and by nothing else", () => {
        const orders = component({ id: "c-1", name: "orders", handler: "orders-api" });
        expect(isComponent(orders, "c-1")).toBe(true);
        expect(isComponent(orders, "orders")).toBe(true);
        expect(isComponent(orders, "orders-api")).toBe(true);
        expect(isComponent(orders, "billing")).toBe(false);
    });

    it("matches nothing without a component, a reference or metadata", () => {
        expect(isComponent(undefined, "c-1")).toBe(false);
        expect(isComponent(component({ id: "c-1" }), undefined)).toBe(false);
        expect(isComponent(component({ id: "c-1" }), "")).toBe(false);
        expect(isComponent({} as ComponentKind, "c-1")).toBe(false);
    });

    it("keeps a Devant environment's fields and adds what WSO2 Cloud's screens read", () => {
        const env = { id: "e-1", name: "Development", templateId: "tpl-dev", critical: false } as Environment;
        expect(toEnvironment(env)).toEqual({ ...env, scaleToZeroEnabled: false });
    });
});
