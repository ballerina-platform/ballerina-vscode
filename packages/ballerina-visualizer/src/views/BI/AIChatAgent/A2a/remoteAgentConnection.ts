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

import { A2aAgentCardInfo } from "@wso2/ballerina-core";

/**
 * Rules for a remote agent's `ai:A2aToolKit` that the form checks before it saves. The toolkit files its one `secret`
 * under the scheme the Agent Card requires, so the card decides whether a secret is needed.
 */

/** Whether an expression gives no secret: nothing, nil (the parameter's default), or an empty string literal. */
function isEmptyExpression(expression: string): boolean {
    const text = expression.trim();
    return text === "" || text === "()" || text === '""' || /^string\s*``$/.test(text);
}

/** The one scheme the card requires, when it requires exactly one. */
function requiredScheme(card: A2aAgentCardInfo) {
    if (card.requiredSchemes.length !== 1) {
        return undefined;
    }
    const name = card.requiredSchemes[0];
    return { name, ...card.securitySchemes.find((s) => s.name === name) };
}

/** Whether the card requires a credential that the toolkit's `secret` carries: Bearer, Basic or a header API key. */
export function needsSecret(card: A2aAgentCardInfo): boolean {
    return requiredScheme(card)?.acceptsSecret === true;
}

/**
 * What is wrong with the secret for this card, or undefined when nothing is. A card that requires a Bearer, Basic or
 * header API key credential needs a secret. A card that requires none can't take one, as `ai:A2aToolKit` fails when it
 * is created with one; and the secret is not sent for any other kind, such as OAuth2.
 */
export function secretProblem(card: A2aAgentCardInfo, secret: string): string | undefined {
    const empty = isEmptyExpression(secret);
    const scheme = requiredScheme(card);
    if (scheme?.acceptsSecret && empty) {
        return `This agent requires a credential (${scheme.kind ? `${scheme.kind}, ` : ""}scheme "${scheme.name}"). `
            + "Enter it as the secret.";
    }
    if (scheme && !scheme.acceptsSecret && !empty) {
        return `The secret isn't sent for ${scheme.kind ?? `scheme "${scheme.name}"`}. Clear it, and set the `
            + "credential in Client Config or Headers under Advanced Configurations.";
    }
    if (card.requiredSchemes.length === 0 && !empty) {
        return "This agent's card requires no credential, so the toolkit can't take a secret. Clear it.";
    }
    return undefined;
}

/**
 * Where the credential goes when the card requires one that the secret can't carry, such as OAuth2: the toolkit's
 * `clientConfig.auth` or `headers`.
 */
export function credentialHint(card: A2aAgentCardInfo): string | undefined {
    const scheme = requiredScheme(card);
    if (!scheme || scheme.acceptsSecret) {
        return undefined;
    }
    return `This agent asks for ${scheme.kind ?? `scheme "${scheme.name}"`}. Set the credential in Client Config `
        + "(its auth field) or Headers under Advanced Configurations.";
}

/** The identifiers an expression reads, so the configurables behind a toolkit can be found. */
export function identifiersIn(expression: string | undefined): string[] {
    const withoutStrings = (expression ?? "").replace(/"(?:[^"\\]|\\.)*"/g, '""');
    return Array.from(new Set(withoutStrings.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []));
}
