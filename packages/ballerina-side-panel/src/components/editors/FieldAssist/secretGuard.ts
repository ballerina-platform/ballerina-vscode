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

/** A text field for a secret, which should hold a configurable rather than the secret itself. */
export const isSecretField = (field: { key: string; label?: string; types?: { fieldType: string; ballerinaType?: string }[] }): boolean =>
    isSensitiveField(field.label, field.key)
    && !!field.types?.some((type) => type.fieldType === "TEXT" && type.ballerinaType?.replace(/\?$/, "") === "string");

export const looksLikeCredential = (text: string): boolean =>
    CREDENTIAL_PATTERNS.some((pattern) => pattern.test(text)) || RANDOM_LOOKING.test(text);

/** A value is withheld when it looks like a credential, or when a sensitive field holds a typed literal. */
export const shouldWithhold = (value: string, sensitive: boolean): boolean =>
    looksLikeCredential(value) || (sensitive && STRING_LITERAL.test(value));
