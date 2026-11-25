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

import { tool } from "ai";
import { z } from "zod";
import { CreateConfigurableAction } from "@wso2/ballerina-core";

const CAMEL_CASE = /^[a-z][A-Za-z0-9]*$/;

// Compiles one expression at the field and returns its errors.
type Check = (expression: string) => Promise<string[]>;

/**
 * Proposes a new configurable as the field's value. Nothing is written here: the editor declares it when the user
 * accepts, and moves the field's value there itself, so a secret never reaches the model.
 */
export function createConfigurableTool(check: Check, onProposed: (action: CreateConfigurableAction) => void) {
    return tool({
        description: "Declare a new configurable and use it as this field's value. Use when the user asks for a configurable, "
            + "or to keep a secret such as a key or password out of the code.",
        inputSchema: z.object({
            name: z.string().describe("camelCase name from the field's label, e.g. apiKey"),
            type: z.string().describe("The Ballerina type the field accepts, in its simplest form, e.g. string"),
            documentation: z.string().describe("One short plain-language sentence about the value"),
            useFieldValue: z.boolean().describe("true to keep the field's current value as the configurable's value"),
        }),
        execute: async ({ name, type, documentation, useFieldValue }) => {
            if (!CAMEL_CASE.test(name)) {
                return "Use a camelCase name of letters and digits, e.g. apiKey.";
            }
            // A name that compiles is already declared here.
            if ((await check(name)).length === 0) {
                return `${name} already exists here. Submit it as the value, or pick another name.`;
            }
            // Any value of the configurable's type stands in for it, since it is not declared yet.
            const typeErrors = await check(`<${type}><any>()`);
            if (typeErrors.length > 0) {
                return `A ${type} configurable does not fit this field: ${typeErrors[0]}`;
            }
            onProposed({ kind: "createConfigurable", name, type, documentation, useFieldValue: useFieldValue || undefined });
            return "OK";
        },
    });
}
