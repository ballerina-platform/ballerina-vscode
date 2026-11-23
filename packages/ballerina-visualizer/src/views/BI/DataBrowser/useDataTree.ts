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

import { useEffect, useRef, useState } from "react";
import { ExpressionProperty, FlowNode, LineRange, Type, VisibleType } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { convertBalCompletion } from "../../../utils/bi";

export interface DataItem {
    path: string;
    name: string;
    type: string;
    enumMember?: boolean;
    // Set on the item row of a record array: the array's path, indexed by the row's stepper.
    elementOf?: string;
    // From the type's definition when the server knows it: whether the row has anything to open, and the values its type allows.
    opens?: boolean;
    values?: string[];
    // The value can be nil: its own type is optional, or a value before it in the path can be nil.
    nilable?: boolean;
}

interface TypeShape {
    values: string[];
    fields: Record<string, { opens: boolean; values: string[] }>;
}

const NO_SHAPE: TypeShape = { values: [], fields: {} };

const PRIMITIVE_TYPE = /^(string|int|float|decimal|boolean|byte|json|xml|anydata|any|error|\(\))$/;

// Field completions need a typed probe; `any` accepts every field the record exposes.
export const PROBE_PROPERTY: ExpressionProperty = {
    metadata: { label: "", description: "" },
    value: "",
    optional: true,
    editable: true,
    types: [{ fieldType: "EXPRESSION", ballerinaType: "any", selected: true }],
};

// Levels below a top-level value that search looks through: order.customer.shippingAddress.city.
const SEARCH_DEPTH = 3;
const SEARCH_DEBOUNCE_MS = 150;

const SUGGESTION_LIMIT = 5;
// Suggestions look two levels into records (order.customer.name); deeper fields are a search away.
const SUGGESTION_DEPTH = 2;

const unionMembers = (type: string) => type.replace(/\s/g, "").split("|").map((member) => member.replace(/\?$/, ""));

const nilable = (type: string) => /\?\s*$/.test(type) || type.replace(/\s/g, "").split("|").includes("()");

/**
 * A type fits a field when it shares a member with the field's expected type, e.g. `string|error` for `string`;
 * a value that may be nil fits only a field that takes nil.
 */
export const fitsType = (type: string | undefined, expected: string | undefined): boolean => {
    if (!type || !expected || expected === "any" || (nilable(type) && !nilable(expected))) {
        return false;
    }
    const wanted = unionMembers(expected);
    return unionMembers(type).some((member) => wanted.includes(member));
};

// Names split into lower-case words: shippingAddress reads as shipping, address.
const words = (text: string) =>
    text.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 1);

// Labels every field has, which say nothing about the value it wants.
const GENERIC_WORDS = new Set(["expression", "value", "values", "condition", "result", "variable", "name", "type", "input"]);

/** What a value is for, in words: the variable's name, and the field's label unless every field has it. */
export const hintFor = (name: string | undefined, label: string) =>
    [name ?? "", ...words(label).filter((word) => !GENERIC_WORDS.has(word))].join(" ");

/** How many words of the value's path the hint shares: `summary.patient.name` scores 2 for patientName. */
export const hintScore = (item: DataItem, hint: string): number => {
    const wanted = words(hint);
    return words(displayPath(item.path)).filter((word) => wanted.some((want) => word.startsWith(want) || want.startsWith(word))).length;
};

/** Values whose path shares the most words with the hint first, then those with fewer other words. */
export const rankByHint = (items: DataItem[], hint: string): DataItem[] => {
    const length = (item: DataItem) => words(displayPath(item.path)).length;
    return [...items].sort((a, b) => hintScore(b, hint) - hintScore(a, hint) || length(a) - length(b));
};

export const baseType = (type: string) => type.replace(/\?$/, "").replace(/\s*&\s*readonly$/, "").trim();

const isNamedType = (type: string) => /^[A-Za-z_][\w:]*$/.test(type) && !PRIMITIVE_TYPE.test(type);

// `Item[]?` and `Item[]|()` alike.
const withoutNil = (type: string) => baseType(type).split("|").map((member) => member.trim()).filter((member) => member !== "()").join("|");

const elementType = (type: string) => withoutNil(type).match(/^(.*)\[\]$/)?.[1];

const canBeNil = (item: DataItem) => item.nilable ?? nilable(item.type);

// Field access on `Order|error` does not compile until the error is handled.
const holdsError = (type: string) => baseType(type).split("|").some((member) => member.trim() === "error");

// The record inside `Order|error` or `Order?`, whose fields a value has once the error or nil is handled.
const recordOf = (type: string) => {
    const members = baseType(type).split("|").map((member) => member.trim()).filter((member) => member !== "error" && member !== "()");
    return members.length === 1 ? members[0] : baseType(type);
};

// A union of string values written in the type itself: "GET"|"POST".
export const literalValues = (type: string) => {
    const members = baseType(type).split("|").map((member) => member.trim()).filter((member) => member !== "()");
    return members.every((member) => /^".*"$/.test(member)) ? members : [];
};

/** The first item of a list value; a list that may be nil is indexed through `?: []`, as `parts[0]` on `T[]?` does not compile. */
export const firstItem = (parent: DataItem, element: string): DataItem => {
    const list = canBeNil(parent) ? `(${parent.path} ?: [])` : parent.path;
    return { path: `${list}[0]`, name: `${parent.name}[0]`, type: element, elementOf: list, opens: parent.opens, nilable: nilable(element) };
};

/** A field of `parent` from its completion; after a value that may be nil every access is `?.`, and so may be nil too. */
export const fieldItem = (parent: DataItem, insertText: string, label: string, type: string): DataItem => {
    const parentNil = canBeNil(parent);
    return { path: `${parent.path}${parentNil ? "?." : "."}${insertText}`, name: label, type, nilable: parentNil || nilable(type) };
};

/** A condition's choices under a value: order.status == PAID for each value its type allows. */
export const comparisonsWith = (parent: DataItem, values: string[]): DataItem[] =>
    values.map((value) => ({ path: `${parent.path} == ${value}`, name: `== ${value}`, type: "boolean", enumMember: true }));

// Without the type's definition, any named type may have fields.
export const canExpand = (item: DataItem) =>
    !item.enumMember &&
    !holdsError(item.type) &&
    (item.opens ?? (isNamedType(recordOf(item.type)) || isNamedType(elementType(item.type) ?? "")));

/** In a condition, a value whose type allows listed values opens too, to comparisons with each. */
export const canCompare = (item: DataItem) => canExpand(item) || (!item.enumMember && !!item.values?.length);

// A top-level value comes with its kind: a record opens, a string or number never does, the rest is found out on open.
const opensFor = (kind: string | undefined) => (kind === "record" ? true : PRIMITIVE_TYPE.test(kind ?? "") ? false : undefined);

// Quoted identifiers such as 'order read as plain names; the path keeps the quote for the inserted code.
export const displayPath = (path: string) => path.replace(/(^|\.)'/g, "$1");

// A host can hold the tree before it has a form; with no file it loads nothing.
export function useDataTree(fileName: string | undefined, targetLineRange: LineRange | undefined, codedata: FlowNode["codedata"] | undefined, refresh: number) {
    const { rpcClient } = useRpcContext();
    const diagram = rpcClient.getBIDiagramRpcClient();
    const [categories, setCategories] = useState<VisibleType[]>();
    const [failed, setFailed] = useState(false);
    const types = useRef<Promise<Map<string, Type>>>();
    const children = useRef(new Map<string, Promise<DataItem[]>>());
    const shapes = useRef(new Map<string, Promise<TypeShape>>());
    const filePath = fileName ?? "";
    const { line, offset } = targetLineRange?.startLine ?? { line: -1, offset: -1 };

    useEffect(() => {
        let cancelled = false;
        children.current.clear();
        shapes.current.clear();
        setFailed(false);
        if (!fileName) {
            setCategories(undefined);
            return;
        }
        const fetchTypes = () => diagram.getVisibleVariableTypes({ filePath, position: { line, offset } });
        const settle = (found?: VisibleType[]) => {
            if (!cancelled) {
                setCategories(found ?? []);
                setFailed(!found);
            }
        };
        // A compiler plugin can fail while the form is still updating the file; asking again once then succeeds.
        fetchTypes()
            .then((response) => (response?.categories ? response : fetchTypes()))
            .then((response) => settle(response?.categories))
            .catch(() => settle());
        return () => {
            cancelled = true;
        };
    }, [fileName, line, offset, refresh]);

    // The integration's own type definitions, for enum members the browser cannot get from completion.
    const projectTypes = () => {
        types.current ??= diagram.getTypes({ filePath }).then(
            (response) => new Map((response?.types ?? []).map((type) => [type.name, type])),
            () => new Map<string, Type>()
        );
        return types.current;
    };

    const fetchFields = async (parent: DataItem): Promise<DataItem[]> => {
        const expression = `${parent.path}${canBeNil(parent) ? "?." : "."}`;
        // Not debounced: the browser looks up many records at once and must not cancel the field's own completions.
        const completions = await diagram.getExpressionCompletionsNow({
            filePath,
            context: { expression, startLine: { line, offset }, lineOffset: 0, offset: expression.length, codedata, property: PROBE_PROPERTY },
            completionContext: { triggerKind: 2, triggerCharacter: "." },
        });
        return (completions ?? [])
            .map(convertBalCompletion)
            .filter((item) => item.kind === "field")
            // The server quotes a field named like a keyword ('type) in its insert text, not its label.
            .map((item) => fieldItem(parent, item.value || item.label, item.label, item.labelDetails?.detail || item.description || ""));
    };

    const fetchChildren = async (parent: DataItem): Promise<DataItem[]> => {
        const element = elementType(parent.type);
        if (element) {
            return [firstItem(parent, element)];
        }
        if (parent.opens && parent.values?.length) {
            return parent.values.map((value) => ({ path: value, name: value.replace(/^\w+:/, ""), type: parent.type, enumMember: true }));
        }
        const type = (await projectTypes()).get(recordOf(parent.type));
        if (type && isEnum(type)) {
            return type.members.map(({ name }) => ({ path: name, name, type: type.name, enumMember: true }));
        }
        // The type's definition says which fields open; it is looked up while the fields are.
        const [fields, shape] = await Promise.all([fetchFields(parent), shapeOf(parent.type)]);
        return fields.map((field) => ({ ...field, ...shape.fields[field.name.replace(/^'/, "")] }));
    };

    const childrenOf = (parent: DataItem): Promise<DataItem[]> => {
        let pending = children.current.get(parent.path);
        if (!pending) {
            // A failed lookup is not cached, so the next expand asks again.
            pending = fetchChildren(parent).catch((): DataItem[] => {
                children.current.delete(parent.path);
                return [];
            });
            children.current.set(parent.path, pending);
        }
        return pending;
    };

    // What a named type holds (the values it allows, which fields open), asked of the server once per type.
    function shapeOf(type: string): Promise<TypeShape> {
        const name = recordOf(type);
        if (!fileName || !isNamedType(name)) {
            return Promise.resolve({ values: literalValues(type), fields: {} });
        }
        let pending = shapes.current.get(name);
        if (!pending) {
            pending = diagram.getTypeShape({ filePath, type: name }).then(
                (response) => ({ values: response?.values ?? [], fields: response?.fields ?? {} }),
                () => {
                    shapes.current.delete(name);
                    return NO_SHAPE;
                }
            );
            shapes.current.set(name, pending);
        }
        return pending;
    }

    const valuesOf = (type: string) => shapeOf(type).then((shape) => shape.values);

    // In a condition, a value whose type allows listed values opens to comparisons with each; a top-level value asks for them.
    const comparisonsOf = async (parent: DataItem): Promise<DataItem[]> => {
        const allowed = parent.values ?? (await valuesOf(parent.type));
        return allowed.length > 0 ? comparisonsWith(parent, allowed) : childrenOf(parent);
    };

    const rootsOf = (names: string[]): DataItem[] =>
        (categories ?? [])
            .filter((category) => names.includes(category.name))
            .flatMap((category) => category.types)
            .map((variable) => ({ path: variable.name, name: variable.name, type: variable.type.name ?? "", opens: opensFor(variable.type.typeName) }));

    // Completing inside `{}` for the expected type fills its required fields, for the project's records and libraries' alike.
    const recordStarters = async (expectedType: string) => {
        const property: ExpressionProperty = { ...PROBE_PROPERTY, types: [{ fieldType: "EXPRESSION", ballerinaType: expectedType, selected: true }] };
        const completions = await diagram.getExpressionCompletionsNow({
            filePath,
            context: { expression: "{}", startLine: { line, offset }, lineOffset: 0, offset: 1, codedata, property },
            completionContext: { triggerKind: 1 },
        });
        return recordStartersFrom(completions ?? []);
    };

    return { categories, failed, childrenOf, rootsOf, recordStarters, valuesOf, comparisonsOf };
}

export interface RecordStarter {
    name: string;
    template: string;
}

const FILL_RECORD = /^Fill (.+) Required Fields$/;

// Placeholders become their default text, and an empty one nil, which the server leaves for a nilable field; one line.
const fromSnippet = (text: string) =>
    text
        .replace(/\$\{\d+:\}/g, "()")
        .replace(/\$\{\d+:([^}]*)\}/g, "$1")
        .replace(/\$\{?\d+\}?/g, "")
        .replace(/\s*\n\s*/g, " ");

/** The language server's "Fill … Required Fields" completions, one per record in the type, as record literals. */
export const recordStartersFrom = (items: { label: string; insertText?: string }[]): RecordStarter[] =>
    items
        .filter((item) => FILL_RECORD.test(item.label))
        .map((item) => ({ name: FILL_RECORD.exec(item.label)[1], template: `{${fromSnippet(item.insertText ?? "")}}` }));

const NO_RECORDS: RecordStarter[] = [];

/** Record literals of each record a field expects (`Order` and `Invoice` for `Order|Invoice|error`), required fields filled. */
export function useExpectedRecords(expectedType: string | undefined, recordStarters: (type: string) => Promise<RecordStarter[]>) {
    const [records, setRecords] = useState(NO_RECORDS);

    useEffect(() => {
        let cancelled = false;
        setRecords(NO_RECORDS);
        if (expectedType) {
            recordStarters(expectedType)
                .then((found) => !cancelled && setRecords(found))
                .catch((): void => undefined);
        }
        return () => {
            cancelled = true;
        };
    }, [expectedType]);

    return records;
}

/** The values the field's own type allows, such as "CAPTURE" and "AUTHORIZE" for a CheckoutPaymentIntent field. */
export function useAllowedValues(expectedType: string | undefined, valuesOf: (type: string) => Promise<string[]>): DataItem[] | undefined {
    const [allowed, setAllowed] = useState<DataItem[]>();

    useEffect(() => {
        let cancelled = false;
        setAllowed(undefined);
        valuesOf(expectedType ?? "").then((found) => {
            if (!cancelled) {
                setAllowed(found.map((value) => ({ path: value, name: value, type: recordOf(expectedType ?? ""), enumMember: true })));
            }
        });
        return () => {
            cancelled = true;
        };
    }, [expectedType]);

    return allowed;
}

const isEnum = (type: Type) => type.codedata?.node === "ENUM";

const matches = (item: DataItem, query: string) => displayPath(item.name).toLowerCase().includes(query);

export const descendantsWhere = async (
    roots: DataItem[],
    test: (item: DataItem) => boolean,
    childrenOf: (parent: DataItem) => Promise<DataItem[]>,
    maxDepth = SEARCH_DEPTH
): Promise<DataItem[]> => {
    const found: DataItem[] = [];
    let level = roots;
    for (let depth = 0; depth < maxDepth && level.length > 0; depth++) {
        const next = (await Promise.all(level.filter(canExpand).map(childrenOf))).flat();
        found.push(...next.filter(test));
        level = next;
    }
    return found;
};

/** Up to five of the flow's own values (inputs, local variables and their fields) that fit the field and are named like it. */
export function useSuggestions(
    expected: string | undefined,
    hint: string,
    roots: DataItem[],
    childrenOf: (parent: DataItem) => Promise<DataItem[]>,
    source: VisibleType[] | undefined
): DataItem[] | undefined {
    const [suggestions, setSuggestions] = useState<DataItem[]>();

    useEffect(() => {
        // With no type or no words to match, nothing can be suggested, so no record fields are looked up.
        if (!source || !expected || !words(hint).length) {
            setSuggestions(source ? [] : undefined);
            return;
        }
        let cancelled = false;
        const fits = (item: DataItem) => !item.enumMember && fitsType(item.type, expected);
        descendantsWhere(roots, fits, childrenOf, SUGGESTION_DEPTH).then((nested) => {
            if (cancelled) {
                return;
            }
            setSuggestions(rankByHint([...roots.filter(fits), ...nested], hint).filter((item) => hintScore(item, hint) > 0).slice(0, SUGGESTION_LIMIT));
        });
        return () => {
            cancelled = true;
        };
    }, [expected, hint, source]);

    return suggestions;
}

/** Values under each section that match the query, including record fields and enum members below the top level. */
export function useDataSearch(
    query: string,
    sections: { title: string; roots: DataItem[] }[],
    childrenOf: (parent: DataItem) => Promise<DataItem[]>,
    source: VisibleType[] | undefined
): Record<string, DataItem[]> | undefined {
    const [results, setResults] = useState<Record<string, DataItem[]>>();
    const q = query.trim().toLowerCase();

    useEffect(() => {
        if (!q || !source) {
            setResults(undefined);
            return;
        }
        let cancelled = false;
        const timer = setTimeout(async () => {
            const entries = await Promise.all(
                sections.map(async ({ title, roots }): Promise<[string, DataItem[]]> => [
                    title,
                    [...roots.filter((root) => matches(root, q)), ...(await descendantsWhere(roots, (item) => matches(item, q), childrenOf))],
                ])
            );
            if (!cancelled) {
                setResults(Object.fromEntries(entries));
            }
        }, SEARCH_DEBOUNCE_MS);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [q, source]);

    return results;
}
