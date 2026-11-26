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

const PURPOSE = "Use when the user asks for a configurable, or to keep a secret such as a key or password out of the code. "
    + "It can also hold part of a value, e.g. the token inside an auth record: then submit a value that uses its name.";

const INPUT = {
    name: z.string().describe("camelCase name from the field's label, e.g. apiKey"),
    type: z.string().describe("The configurable's own Ballerina type, in its simplest form, e.g. string"),
    documentation: z.string().describe("One short plain-language sentence about the value"),
    useFieldValue: z.boolean().describe("true to keep the field's current value as the configurable's value"),
};

type Input = { name: string; type: string; documentation: string; useFieldValue: boolean };

// A configurable whose type fits the whole value is the value; one that does not is a part of it.
type Proposal = { action: CreateConfigurableAction; whole: boolean };

// The configurable to declare, or what to fix first.
async function propose(check: Check, { name, type, documentation, useFieldValue }: Input): Promise<Proposal | string> {
    if (!CAMEL_CASE.test(name)) {
        return "Use a camelCase name of letters and digits, e.g. apiKey.";
    }
    // A name that compiles is already declared here.
    if ((await check(name)).length === 0) {
        return `${name} already exists here. Submit it as the value, or pick another name.`;
    }
    // Any value of the configurable's type stands in for it, since it is not declared yet.
    const whole = (await check(`<${type}><any>()`)).length === 0;
    // The current value moves into the configurable only when the configurable replaces all of it.
    const keep = whole && useFieldValue ? true : undefined;
    return { action: { kind: "createConfigurable", name, type, documentation, useFieldValue: keep }, whole };
}

const partReply = ({ name }: CreateConfigurableAction, where: string) =>
    `OK. ${name} does not fit ${where} on its own, so submit a value of ${where} that uses ${name}, e.g. inside a record.`;

/** The configurables a value names. */
export const namedIn = (expression: string, proposed: CreateConfigurableAction[]) =>
    proposed.filter(({ name }) => new RegExp(`\\b${name}\\b`).test(expression));

/** The value as it compiles once the configurables it names are declared: each stands in as a let variable of its type. */
export const asDeclared = (expression: string, named: CreateConfigurableAction[]) => named.length
    ? `let ${named.map(({ name, type }) => `${type} ${name} = <${type}><any>()`).join(", ")} in (${expression})`
    : expression;

/**
 * Proposes a new configurable for the field's value. Nothing is written here: the editor declares it when the value
 * lands, and moves the field's value there itself, so a secret never reaches the model.
 */
export function createConfigurableTool(check: Check, onWhole: (action: CreateConfigurableAction) => void, onPart: (action: CreateConfigurableAction) => void) {
    return tool({
        description: `Declare a new configurable and use it as this field's value. ${PURPOSE}`,
        inputSchema: z.object(INPUT),
        execute: async (input) => {
            const proposed = await propose(check, input);
            if (typeof proposed === "string") {
                return proposed;
            }
            (proposed.whole ? onWhole : onPart)(proposed.action);
            return proposed.whole ? "OK" : partReply(proposed.action, "this field");
        },
    });
}

/** Proposes a new configurable for one of a form's values, by its path; the form's submit then uses its name. */
export function createFormConfigurableTool(paths: string[], checkAt: (path: string) => Check, onProposed: (action: CreateConfigurableAction) => void) {
    return tool({
        description: `Declare a new configurable for the value at path, then submit a value that uses its name. ${PURPOSE}`,
        inputSchema: z.object({ path: z.enum(paths as [string, ...string[]]).describe("The path of the value it holds"), ...INPUT }),
        execute: async ({ path, ...input }) => {
            const proposed = await propose(checkAt(path), input);
            if (typeof proposed === "string") {
                return proposed;
            }
            onProposed(proposed.action);
            return proposed.whole ? `OK. Submit ${proposed.action.name} as the value of ${path}.` : partReply(proposed.action, path);
        },
    });
}
