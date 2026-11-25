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

import { FieldType, LineRange } from "@wso2/ballerina-core";

/**
 * A blank variable for a class, to fill in with the variable form and add with `addClassField`. It is placed in the
 * class with the given range. The initial value is required: a class without an `init` has nothing else to set it.
 */
export function createClassField(classLineRange: LineRange): FieldType {
    return {
        isPrivate: true,
        isFinal: false,
        codedata: {
            lineRange: {
                fileName: classLineRange.fileName,
                startLine: { line: classLineRange.startLine.line, offset: classLineRange.startLine.offset },
                endLine: { line: classLineRange.endLine.line, offset: classLineRange.endLine.offset },
            },
        },
        type: {
            metadata: {
                label: "Variable Type",
                description: "The type of the variable",
            },
            enabled: true,
            editable: true,
            value: "",
            types: [{ fieldType: "TYPE", selected: false }],
            isType: true,
            optional: false,
            advanced: false,
            addNewButton: false,
        },
        name: {
            metadata: {
                label: "Variable Name",
                description: "The name of the variable",
            },
            enabled: true,
            editable: true,
            value: "",
            types: [{ fieldType: "IDENTIFIER", selected: false }],
            isType: false,
            optional: false,
            advanced: false,
            addNewButton: false,
        },
        defaultValue: {
            metadata: {
                label: "Initial Value",
                description: "The initial value of the variable",
            },
            value: "",
            enabled: true,
            editable: true,
            isType: false,
            optional: false,
            advanced: false,
            types: [{ fieldType: "EXPRESSION", selected: true }],
            addNewButton: false,
        },
        enabled: true,
        editable: true,
        optional: false,
        advanced: false,
    };
}
