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

import { TypeField } from "@wso2/ballerina-core";

// `readonly & T` arrives from the language server as an `intersection` whose members are a
// `readonly` marker and the type that actually carries the shape. The record editor dispatches
// on `typeName` and has no `intersection` renderer, so such a node falls through to the leaf
// renderer labelled "intersection", and the LS's value generator falls through to the literal
// string `"intersection"`. Collapse the wrapper to the member carrying the shape before the
// model reaches the form — `typeInfo` keeps the original `readonly & T` identity, and the same
// collapsed node is what goes back out on the generateValue request.
//
// The language server collapses these itself (`IntersectionNormalizer`), so on a matching LS this
// pass finds nothing and returns its input by identity. It stays because the LS can be an older
// one: `ballerina.useDistributionLanguageServer` (on by default below Ballerina 2201.12.3) and
// `ballerina.langServerPath` both let an arbitrary language server serve these endpoints.

/** The only member that constrains mutability without carrying a shape of its own. */
const READONLY_TYPE_NAME = "readonly";

/**
 * The single member of an intersection that carries its shape, or undefined when there is no
 * unambiguous one — `Foo & Bar` has no single member to render in the intersection's place.
 */
function shapeMember(tf: TypeField | null | undefined): TypeField | undefined {
    if (!tf || tf.typeName !== "intersection" || !Array.isArray(tf.members)) {
        return undefined;
    }
    // A member with no typeName names no shape, and the editor would have nothing to dispatch on if it
    // stood in for the intersection. The language server's `IntersectionNormalizer` skips it the same way.
    const shapeMembers = tf.members.filter(
        (member) => member?.typeName && member.typeName !== READONLY_TYPE_NAME
    );
    return shapeMembers.length === 1 ? shapeMembers[0] : undefined;
}

export function isUnwrappableIntersection(tf: TypeField | null | undefined): boolean {
    return shapeMember(tf) !== undefined;
}

/**
 * Merge the wrapper's identity onto the member that replaces it. Mirrors `IntersectionNormalizer.merge`
 * in the language server; the two have to agree, or the same payload collapses differently depending on
 * which side got to it (see AGENTS.md rule 7).
 */
function mergeWrapper(wrapper: TypeField, member: TypeField): TypeField {
    const merged: TypeField = { ...member };
    // The wrapper is the field: its name and position in the record win.
    if (wrapper.name !== undefined) {
        merged.name = wrapper.name;
    }
    if (wrapper.typeInfo !== undefined) {
        merged.typeInfo = wrapper.typeInfo;
    }
    if (wrapper.displayAnnotation !== undefined) {
        merged.displayAnnotation = wrapper.displayAnnotation;
    }
    if (wrapper.optional !== undefined) {
        merged.optional = wrapper.optional;
    }
    if (wrapper.defaultable !== undefined) {
        merged.defaultable = wrapper.defaultable;
    }
    if (wrapper.isRestType !== undefined) {
        merged.isRestType = wrapper.isRestType;
    }
    if (wrapper.selected !== undefined) {
        merged.selected = wrapper.selected;
    }
    // Field metadata the Java `Type` has no counterpart for, so it reaches these nodes only from a
    // producer other than the language server. Spreading the member drops whatever the field slot
    // carried, which for `hide` would put a hidden field back on screen — fill them back in, but let
    // the member win where it names its own.
    if (member.displayName === undefined && wrapper.displayName !== undefined) {
        merged.displayName = wrapper.displayName;
    }
    if (member.hide === undefined && wrapper.hide !== undefined) {
        merged.hide = wrapper.hide;
    }
    if (member.position === undefined && wrapper.position !== undefined) {
        merged.position = wrapper.position;
    }
    // The member describes the shape, so anything it states about the value stands.
    if (member.documentation === undefined && wrapper.documentation !== undefined) {
        merged.documentation = wrapper.documentation;
    }
    if (member.value === undefined && wrapper.value !== undefined) {
        merged.value = wrapper.value;
    }
    if (member.defaultValue === undefined && wrapper.defaultValue !== undefined) {
        merged.defaultValue = wrapper.defaultValue;
    }
    return merged;
}

/**
 * Collapse one node's intersection wrappers. Returns the input by identity when there is nothing
 * to collapse. Repeats to a fixpoint so `readonly & (readonly & T)` unwraps all the way to T.
 */
export function unwrapIntersection(tf: TypeField): TypeField {
    let current = tf;
    let member = shapeMember(current);
    while (member) {
        current = mergeWrapper(current, member);
        member = shapeMember(current);
    }
    return current;
}

function normalizeList(list: TypeField[] | undefined): TypeField[] | undefined {
    if (!Array.isArray(list)) {
        return list;
    }
    const normalized = list.map((child) => (child ? normalizeIntersections(child) : child));
    return normalized.some((child, index) => child !== list[index]) ? normalized : list;
}

function normalizeChild(child: TypeField | undefined): TypeField | undefined {
    return child ? normalizeIntersections(child) : child;
}

/**
 * Collapse every intersection wrapper in the tree — a `readonly & record` field is as common as a
 * `readonly & record` root. Never mutates the input and shares every untouched subtree, so it must
 * run once when the model arrives (the form mutates the returned nodes in place afterwards).
 */
export function normalizeIntersections(tf: TypeField): TypeField {
    if (!tf) {
        return tf;
    }
    const node = unwrapIntersection(tf);

    const fields = normalizeList(node.fields);
    const members = normalizeList(node.members);
    const elements = normalizeList(node.elements);
    const memberType = normalizeChild(node.memberType);
    const inclusionType = normalizeChild(node.inclusionType);
    const restType = normalizeChild(node.restType);

    if (node === tf && fields === node.fields && members === node.members && elements === node.elements &&
        memberType === node.memberType && inclusionType === node.inclusionType && restType === node.restType) {
        return tf;
    }

    const normalized: TypeField = { ...node };
    if (fields !== node.fields) {
        normalized.fields = fields;
    }
    if (members !== node.members) {
        normalized.members = members;
    }
    if (elements !== node.elements) {
        normalized.elements = elements;
    }
    if (memberType !== node.memberType) {
        normalized.memberType = memberType;
    }
    if (inclusionType !== node.inclusionType) {
        normalized.inclusionType = inclusionType;
    }
    if (restType !== node.restType) {
        normalized.restType = restType;
    }
    return normalized;
}
