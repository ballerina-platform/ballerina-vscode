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

// Keeps credentials out of AI requests. Heuristic: a secret in an unusual format can still look like plain text.

// `token` only at the end, so "accessToken" counts and "Maximum Tokens" does not.
const SENSITIVE_NAME = /(api[-_ ]?key|secret|token$|password|passwd|credential|private[-_ ]?key|^auth$)/i;

const CREDENTIAL_PATTERNS: RegExp[] = [
    /\bsk-[A-Za-z0-9_-]{16,}/,                         // OpenAI, Anthropic
    /\b(ghp|gho|ghs|ghu|github_pat)_[A-Za-z0-9_]{20,}/, // GitHub
    /\bAKIA[0-9A-Z]{16}\b/,                            // AWS access key
    /(?<![\w+/])(?=[A-Za-z0-9+/]*[A-Z])(?=[A-Za-z0-9+/]*[a-z])(?=[A-Za-z0-9+/]*\d)[A-Za-z0-9+/]{40}(?![\w+/=])/, // AWS secret key
    /\b[rs]k_(live|test)_[A-Za-z0-9]{16,}/,            // Stripe
    /\bxox[abprs]-[A-Za-z0-9-]{10,}/,                  // Slack
    /\bAIza[0-9A-Za-z_-]{35}\b/,                       // Google
    /\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/,            // JWT
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

// A long run mixing letters and digits, like a generated key; `/` and `_` end a run, so paths, URLs and snake_case names do not count.
const RANDOM_LOOKING = /(?=[A-Za-z0-9+=-]*\d)(?=[A-Za-z0-9+=-]*[A-Za-z])[A-Za-z0-9+=-]{32,}/;

const STRING_LITERAL = /"(?:[^"\\]|\\.)+"|`[^`]+`/;

export const isSensitiveField = (...names: (string | undefined)[]): boolean =>
    names.some((name) => !!name && SENSITIVE_NAME.test(name));

export const looksLikeCredential = (text: string): boolean =>
    CREDENTIAL_PATTERNS.some((pattern) => pattern.test(text)) || RANDOM_LOOKING.test(text);

/** A value is withheld when it looks like a credential, or when a sensitive field holds a typed literal. */
export const shouldWithhold = (value: string, sensitive: boolean): boolean =>
    looksLikeCredential(value) || (sensitive && STRING_LITERAL.test(value));

const CODE_LITERAL = /"(?:[^"\\\n]|\\.)*"|`[^`]*`/g;
// The name a literal is given or compared to, as in `password = "…"`, `token: "…"`, `"api-key": "…"` or `secret == "…"`.
const ASSIGNED_NAME = /(\w[\w-]*)"?\s*(?:[:=]|[=!]=)\s*(?:\w+\s*)?$/;

/** Source with every literal that looks like a credential, or is assigned to a name for a secret, replaced by `<redacted>`. */
export function redactSecrets(code: string): string {
    return code.replace(CODE_LITERAL, (literal, offset: number) => {
        const name = ASSIGNED_NAME.exec(code.slice(Math.max(0, offset - 80), offset))?.[1];
        return looksLikeCredential(literal) || isSensitiveField(name) ? `${literal[0]}<redacted>${literal[0]}` : literal;
    });
}

// A secret cell in a form's row reaches Copilot as this placeholder; a row that keeps it keeps the value.
export const withheldCell = (index: number): string => `<withheld ${index}>`;
export const isWithheldCell = (value: string): boolean => /^<withheld \d+>$/.test(value.trim());
