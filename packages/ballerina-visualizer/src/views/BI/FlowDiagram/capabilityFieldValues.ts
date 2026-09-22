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

/**
 * A durable agent capability's form is a fresh template seeded with the entry's values, which the
 * language server hands over as source. A field offering both a text box and an expression editor
 * has to be put into the right one here: seeding the value alone leaves the template's mode, so a
 * reference lands in the text box and is written back as a literal of the same spelling.
 */

/** A form field's declared type, of which one is selected. */
interface FieldType {
    fieldType?: string;
    selected?: boolean;
}

/** The part of a form property this module reads and writes. */
export interface SeedableProperty {
    value?: unknown;
    types?: FieldType[];
}

// The modes that hold text rather than source. A doc box is one of them: it is a single mode, but a
// literal still belongs in it decoded.
const TEXT_MODES = ["TEXT", "DOC_TEXT"];
const EXPRESSION = "EXPRESSION";
const TEXT_SET = "TEXT_SET";

/** Whether the source is a plain string literal, the one shape a text box can hold. */
function stringLiteral(source: string): boolean {
    if (source.length < 2 || !source.startsWith('"') || !source.endsWith('"')) {
        return false;
    }
    // A closing quote that is escaped does not end the literal, so `"a\" + b` is an expression.
    let escaped = false;
    for (let i = 1; i < source.length - 1; i++) {
        if (escaped) {
            escaped = false;
        } else if (source[i] === "\\") {
            escaped = true;
        } else if (source[i] === '"') {
            return false;
        }
    }
    return !escaped;
}

/**
 * The text a string literal denotes, with the escapes it carries resolved. Read in one pass: an
 * escaped backslash consumes the character after it, so `"C:\\new"` is a path and not a line break.
 */
function literalText(source: string): string {
    const body = source.slice(1, -1);
    let text = "";
    for (let i = 0; i < body.length; i++) {
        if (body[i] !== "\\" || i === body.length - 1) {
            text += body[i];
            continue;
        }
        const escaped = body[i + 1];
        if (escaped === "u") {
            // `\u{1F600}`, the only escape with a body. An escape the syntax does not define, an
            // invalid code point or a lone surrogate stays as written, the way the language server
            // leaves it, so a literal does not read differently depending on which side decoded it.
            const close = body[i + 2] === "{" ? body.indexOf("}", i + 3) : -1;
            const digits = close === -1 ? "" : body.slice(i + 3, close);
            const code = /^[0-9a-fA-F]+$/.test(digits) ? Number.parseInt(digits, 16) : NaN;
            if (Number.isInteger(code) && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)) {
                text += String.fromCodePoint(code);
                i = close;
                continue;
            }
            text += "\\";
            continue;
        }
        switch (escaped) {
            case "\\": text += "\\"; break;
            case "\"": text += "\""; break;
            case "n": text += "\n"; break;
            case "t": text += "\t"; break;
            case "r": text += "\r"; break;
            // Not an escape the literal syntax defines: the backslash stays and the character
            // after it is read on its own.
            default: text += "\\"; continue;
        }
        i++;
    }
    return text;
}

/**
 * The text a hydrated value reads as: a string literal decoded, anything else as it stands. For
 * showing a value rather than editing it, such as the panel's subtitle.
 *
 * @param source the value as it stands in the declaration
 * @return the text to show
 */
export function capabilityValueText(source: string | undefined): string | undefined {
    if (!source) {
        return source;
    }
    return stringLiteral(source) ? literalText(source) : source;
}

/**
 * Seeds one property from the source the language server hydrated, choosing the field's mode with
 * it: a string literal fills the text box, anything else is an expression.
 *
 * @param property the form property to seed, edited in place
 * @param source   the value as it stands in the declaration
 */
export function seedCapabilityValue(property: SeedableProperty, source: string): void {
    const types = Array.isArray(property.types) ? property.types : [];
    if (!source) {
        // Nothing declared — `userRoles: ()` reaches here as blank. The field stays empty in
        // whichever mode its template opened in, rather than becoming an empty expression.
        property.value = "";
        return;
    }
    const textMode = types.find((type) => TEXT_MODES.includes(type.fieldType ?? ""));
    const expressionMode = types.find((type) => type.fieldType === EXPRESSION);

    // A list-of-text field (roles, users) shows names one by one: a literal or a list of them is
    // decoded into items; anything else is the expression it is.
    const listMode = types.find((type) => type.fieldType === TEXT_SET);
    if (listMode) {
        const items = literalItems(source);
        if (items !== undefined) {
            property.value = items;
            select(types, listMode);
            return;
        }
    }

    if (textMode && stringLiteral(source)) {
        property.value = literalText(source);
        select(types, textMode);
        return;
    }
    // Anything else is source. A field with no expression editor to switch to keeps the mode it
    // has — a type reference, an enum member or an identifier is already what that field holds.
    property.value = source;
    if (expressionMode) {
        select(types, expressionMode);
    }
}

/**
 * The names a role value states — one string literal, or a list of them — decoded; undefined for
 * anything else, which belongs to the expression mode. `()`, `[]` and nothing name nobody.
 *
 * <p>This is `parseTextArraySource` from `@wso2/ballerina-core`, and the two must agree — they
 * edit the same field, one seeding it on open and the other carrying it across a mode switch. It
 * is copied rather than imported because this package's jest config does not transform
 * `node_modules` and the core package ships ESM, so a source file that imports it cannot be
 * parsed by the suite that covers this module. Change one and change the other.
 */
function literalItems(source: string): string[] | undefined {
    const trimmed = source.trim();
    if (trimmed === "" || trimmed === "()" || trimmed === "[]") {
        return [];
    }
    if (stringLiteral(trimmed)) {
        return [literalText(trimmed)];
    }
    if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
        return undefined;
    }
    const items: string[] = [];
    let depth = 0;
    let quoted = false;
    let start = 0;
    const body = trimmed.slice(1, -1);
    const push = (part: string): boolean => {
        const candidate = part.trim();
        if (candidate === "") {
            return true;
        }
        if (!stringLiteral(candidate)) {
            return false;
        }
        items.push(literalText(candidate));
        return true;
    };
    for (let i = 0; i < body.length; i++) {
        const ch = body[i];
        if (quoted) {
            if (ch === "\\") {
                i++;
            } else if (ch === '"') {
                quoted = false;
            }
            continue;
        }
        if (ch === '"') {
            quoted = true;
        } else if (ch === "[" || ch === "{" || ch === "(") {
            depth++;
        } else if (ch === "]" || ch === "}" || ch === ")") {
            depth--;
        } else if (ch === "," && depth === 0) {
            if (!push(body.slice(start, i))) {
                return undefined;
            }
            start = i + 1;
        }
    }
    return push(body.slice(start)) ? items : undefined;
}

function select(types: FieldType[], chosen: FieldType): void {
    types.forEach((type) => {
        type.selected = type === chosen;
    });
}
