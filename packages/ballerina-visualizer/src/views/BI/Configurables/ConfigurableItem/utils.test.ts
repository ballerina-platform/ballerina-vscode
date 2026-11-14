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

// L1 (#596): every LS error on a configurable, at node level or on its `variable` property,
// reaches the configurables view; warnings, infos and blank messages do not.

import { getConfigurableErrorMessages } from "./utils";

const diag = (message: string, severity: "ERROR" | "WARNING" | "INFO" = "ERROR") => ({ message, severity });

describe("getConfigurableErrorMessages", () => {
    it("INVARIANT: collects ERROR messages from the node and the variable property", () => {
        const variable = {
            diagnostics: { diagnostics: [diag("node error")] },
            properties: { variable: { diagnostics: { diagnostics: [diag("redeclared symbol 'port'")] } } },
        };
        expect(getConfigurableErrorMessages(variable)).toEqual(["node error", "redeclared symbol 'port'"]);
    });

    it("INVARIANT: ignores non-error severities and blank messages", () => {
        const variable = {
            diagnostics: { diagnostics: [diag("w", "WARNING"), diag("i", "INFO"), diag("  ")] },
            properties: { variable: { diagnostics: { diagnostics: [diag("w2", "WARNING")] } } },
        };
        expect(getConfigurableErrorMessages(variable)).toEqual([]);
    });

    it("INVARIANT: the same message on both levels is reported once", () => {
        const variable = {
            diagnostics: { diagnostics: [diag("dup")] },
            properties: { variable: { diagnostics: { diagnostics: [diag("dup")] } } },
        };
        expect(getConfigurableErrorMessages(variable)).toEqual(["dup"]);
    });

    it("INVARIANT: tolerates missing diagnostics", () => {
        for (const variable of [undefined, {}, { properties: {} }, { diagnostics: {} }]) {
            expect(getConfigurableErrorMessages(variable)).toEqual([]);
        }
    });
});
