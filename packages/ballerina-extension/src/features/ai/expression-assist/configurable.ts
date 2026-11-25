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

// Compiles one expression where the configurable's value goes and returns its errors.
type Check = (expression: string) => Promise<string[]>;

const PURPOSE = "Use when the user asks for a configurable, or to keep a secret such as a key or password out of the code.";

const INPUT = {
    name: z.string().describe("camelCase name from the field's label, e.g. apiKey"),
    type: z.string().describe("The Ballerina type the field accepts, in its simplest form, e.g. string"),
    documentation: z.string().describe("One short plain-language sentence about the value"),
    useFieldValue: z.boolean().describe("true to keep the field's current value as the configurable's value"),
};

type Input = { name: string; type: string; documentation: string; useFieldValue: boolean };

// The configurable to declare, or what to fix first.
async function propose(check: Check, { name, type, documentation, useFieldValue }: Input): Promise<CreateConfigurableAction | string> {
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
        return `A ${type} configurable does not fit this value: ${typeErrors[0]}`;
    }
    return { kind: "createConfigurable", name, type, documentation, useFieldValue: useFieldValue || undefined };
}

/**
 * Proposes a new configurable as the field's value. Nothing is written here: the editor declares it when the value
 * lands, and moves the field's value there itself, so a secret never reaches the model.
 */
export function createConfigurableTool(check: Check, onProposed: (action: CreateConfigurableAction) => void) {
    return tool({
        description: `Declare a new configurable and use it as this field's value. ${PURPOSE}`,
        inputSchema: z.object(INPUT),
        execute: async (input) => {
            const proposed = await propose(check, input);
            if (typeof proposed === "string") {
                return proposed;
            }
            onProposed(proposed);
            return "OK";
        },
    });
}

/** Proposes a new configurable for one of a form's values, by its path; the form's submit then names it as that value. */
export function createFormConfigurableTool(paths: string[], checkAt: (path: string) => Check, onProposed: (path: string, action: CreateConfigurableAction) => void) {
    return tool({
        description: `Declare a new configurable for the value at path, then submit its name as that value. ${PURPOSE}`,
        inputSchema: z.object({ path: z.enum(paths as [string, ...string[]]).describe("The path of the value it holds"), ...INPUT }),
        execute: async ({ path, ...input }) => {
            const proposed = await propose(checkAt(path), input);
            if (typeof proposed === "string") {
                return proposed;
            }
            onProposed(path, proposed);
            return `OK. Submit ${proposed.name} as the value of ${path}.`;
        },
    });
}
