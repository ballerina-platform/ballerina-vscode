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

import type { TypeHelperCategory, TypeHelperItem } from "@wso2/type-editor";

/** Where a type comes from; also the order sources rank in when matches tie. */
export type TypeSource = "builtin" | "project" | "imported" | "library";

const SOURCE_ORDER: Record<TypeSource, number> = { builtin: 0, project: 1, imported: 2, library: 3 };

// Breaks ties between equally good matches, so `str` offers string before stream.
const COMMON_TYPES = ["string", "int", "boolean", "decimal", "float", "json", "anydata", "byte", "error", "map", "xml"];
const commonness = (name: string) => {
    const index = COMMON_TYPES.indexOf(name);
    return index < 0 ? COMMON_TYPES.length : index;
};

// Among library types, the standard library before connectors before everything else on Central.
const ORG_ORDER = ["ballerina", "ballerinax"];
const orgOrder = ({ item }: TypeOption) => {
    const index = ORG_ORDER.indexOf(item.codedata?.org ?? "");
    return index < 0 ? ORG_ORDER.length : index;
};

export interface TypeOption {
    item: TypeHelperItem;
    source: TypeSource;
    // The module a library type comes from, shown beside its name.
    module?: string;
}

// Anonymous descriptors such as `isolated service object {...}` are not names a user picks.
const isNamedType = (name: string) => !!name && name !== "record" && !/[\s{}()]/.test(name);

const TYPE_WORD = /[A-Za-z0-9_':]*$/;
const TYPE_WORD_AHEAD = /^[A-Za-z0-9_':]*/;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function toTypeOptions(categories: TypeHelperCategory[], source: TypeSource): TypeOption[] {
    const items = categories.flatMap((category) => [
        ...(category.items ?? []),
        ...(category.subCategory ?? []).flatMap((sub) => sub.items ?? []),
    ]);
    const seen = new Set<string>();
    return items
        .filter((item) => isNamedType(item.name))
        .map((item) => ({ item, source, module: source === "builtin" || source === "project" ? undefined : item.codedata?.module }))
        .filter(({ item, module }) => {
            const key = `${module ?? ""}:${item.name}`;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
}

// Positions where a word starts inside a name: after a lower-case letter (camelCase) or a separator.
function wordStarts(name: string): number[] {
    const starts: number[] = [];
    for (let i = 1; i < name.length; i++) {
        const humped = /[A-Z]/.test(name[i]) && /[a-z0-9]/.test(name[i - 1]);
        if (humped || /[_:.]/.test(name[i - 1])) {
            starts.push(i);
        }
    }
    return starts;
}

/** Where `query` matches `name` and how well: exact, prefix, start of an inner word, then anywhere. */
export function matchType(name: string, query: string): { rank: number; start: number } | undefined {
    const lowerName = name.toLowerCase();
    const lowerQuery = query.toLowerCase();
    if (lowerName === lowerQuery) {
        return { rank: name === query ? 0 : 1, start: 0 };
    }
    if (lowerName.startsWith(lowerQuery)) {
        return { rank: 2, start: 0 };
    }
    const wordStart = wordStarts(name).find((index) => lowerName.startsWith(lowerQuery, index));
    if (wordStart !== undefined) {
        return { rank: 3, start: wordStart };
    }
    const anywhere = lowerName.indexOf(lowerQuery);
    return anywhere >= 0 ? { rank: 4, start: anywhere } : undefined;
}

/** Splits `http:Cli` into the module it names and the type name being typed. */
export function splitTypeQuery(query: string): { module?: string; name: string } {
    const colon = query.lastIndexOf(":");
    return colon < 0 ? { name: query } : { module: query.slice(0, colon), name: query.slice(colon + 1) };
}

// `http` names the module `http`, and also the last part of a dotted one such as `health.fhir.r4`.
const inModule = (option: TypeOption, module: string) =>
    option.module === module || option.module?.split(".").pop() === module;

export function rankTypes(options: TypeOption[], query: string, limit = 50): TypeOption[] {
    const { module, name } = splitTypeQuery(query);
    return options
        .filter((option) => !module || inModule(option, module))
        .map((option) => ({ option, match: name ? matchType(option.item.name, name) : { rank: 2, start: 0 } }))
        .filter(({ match }) => match)
        .sort((a, b) => a.match.rank - b.match.rank
            || SOURCE_ORDER[a.option.source] - SOURCE_ORDER[b.option.source]
            || orgOrder(a.option) - orgOrder(b.option)
            || commonness(a.option.item.name) - commonness(b.option.item.name)
            || a.option.item.name.length - b.option.item.name.length
            || a.option.item.name.localeCompare(b.option.item.name))
        .slice(0, limit)
        .map(({ option }) => option);
}

/** The type name being typed at the cursor, e.g. `str` in `map<str|>`. */
export const typeQueryAt = (text: string, cursor: number): string => TYPE_WORD.exec(text.slice(0, cursor))?.[0] ?? "";

/** Replaces the type name around the cursor with `insert`, returning the new text and cursor. */
export function replaceTypeAt(text: string, cursor: number, insert: string): { text: string; cursor: number } {
    const start = cursor - typeQueryAt(text, cursor).length;
    const end = cursor + (TYPE_WORD_AHEAD.exec(text.slice(cursor))?.[0].length ?? 0);
    return { text: text.slice(0, start) + insert + text.slice(end), cursor: start + insert.length };
}

/** A new type can be created for a plain name that no known type already has. */
export const canCreateType = (name: string, options: TypeOption[]): boolean =>
    IDENTIFIER.test(name) && !options.some((option) => option.item.name === name);
