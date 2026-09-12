// Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com/) All Rights Reserved.

// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at

// http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.

/**
 * Class type definitions: recognising one, and collecting the types its members name.
 *
 * "Class" covers class declarations and object types alike — the language server maps
 * `TypeDescKind.OBJECT` to `TypeCategory.CLASS`, so both arrive under one discriminator.
 *
 * Kept out of `function-registry` for the reason `library-selection` is: that module reaches the language
 * server through `activator`, so importing it starts VS Code.
 */

import {
    ClassTypeDefinition,
    Parameter,
    Type,
    TypeDefinition,
} from "./library-types";

/** The `type` discriminator a class declaration or object type carries. */
export const TYPE_CLASS = "Class";

/**
 * Whether a type definition should be treated as a class.
 *
 * Older language servers omitted the discriminator on class declarations, and `renderTypeDef` dispatches on
 * it — an unlabelled class rendered as `// Unknown type: X`, silently dropping the whole API. `functions` is
 * used as the fallback signal because no other category carries it.
 */
export function isClassTypeDef(typeDef: TypeDefinition): boolean {
    if (typeDef.type === TYPE_CLASS) {
        return true;
    }
    return !typeDef.type && Array.isArray((typeDef as ClassTypeDefinition).functions);
}

/**
 * The types a class's members name — each method's parameter and return types, constructor included.
 *
 * A class is the one category whose members are API rather than shape, so the type closure has to descend
 * into it: `Workbook.getSheet()` is the only path to `Sheet`, and without this the prompt renders a
 * signature naming a type it never defines. The constructor is walked because it names the configuration
 * record.
 */
export function collectClassMemberTypeRefs(typeDef: TypeDefinition): Type[] {
    const refs: Type[] = [];
    // `functions` is `any[]` and this runs on language-server output, so every hop is guarded.
    const functions = (typeDef as ClassTypeDefinition).functions;
    if (!Array.isArray(functions)) {
        return refs;
    }
    for (const func of functions) {
        if (!func) {
            continue;
        }
        for (const param of (func.parameters ?? []) as Parameter[]) {
            if (param?.type) {
                refs.push(param.type);
            }
        }
        if (func.return?.type) {
            refs.push(func.return.type);
        }
    }
    return refs;
}
