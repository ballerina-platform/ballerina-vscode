/*
 *  Copyright (c) 2025, WSO2 LLC. (http://www.wso2.com)
 *
 *  WSO2 LLC. licenses this file to you under the Apache License,
 *  Version 2.0 (the "License"); you may not use this file except
 *  in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing,
 *  software distributed under the License is distributed on an
 *  "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 *  KIND, either express or implied.  See the License for the
 *  specific language governing permissions and limitations
 *  under the License.
 */

package io.ballerina.copilotagent.core.models;

/**
 * Enum to represent different kinds of nodes.
 *
 * @since 1.5.0
 */
public enum NodeKind {
    MODULE_FUNCTION,
    OBJECT_FUNCTION,
    TYPE_DEFINITION,
    DATA_MAPPING_FUNCTION,
    // The kinds below have no diagram representation; the review UI renders them as
    // source-level changes. Only append new constants — the wire format is the ordinal.
    MODULE_VARIABLE,
    CONSTANT,
    LISTENER,
    CLASS_DEFINITION,
    ENUM_DECLARATION,
    IMPORT_DECLARATION
}
