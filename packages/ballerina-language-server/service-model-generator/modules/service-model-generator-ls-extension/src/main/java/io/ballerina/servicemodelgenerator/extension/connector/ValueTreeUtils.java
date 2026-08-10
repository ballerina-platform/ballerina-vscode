/*
 *  Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com)
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

package io.ballerina.servicemodelgenerator.extension.connector;

import io.ballerina.servicemodelgenerator.extension.model.Codedata;
import io.ballerina.servicemodelgenerator.extension.model.Value;

/**
 * Small field-shape checks shared by every walker of the wire {@code Value}/{@code Codedata} tree in
 * this package.
 *
 * @since 1.9.0
 */
final class ValueTreeUtils {

    private ValueTreeUtils() {
    }

    static boolean isChoice(Value field) {
        return hasFieldType(field, Value.FieldType.CHOICE);
    }

    static boolean isGroup(Value field) {
        return hasFieldType(field, Value.FieldType.GROUP_SECTION);
    }

    static boolean hasFieldType(Value field, Value.FieldType fieldType) {
        return field.getTypes() != null
                && field.getTypes().stream().anyMatch(type -> type.fieldType() == fieldType);
    }

    /**
     * The record-field name a leaf's {@code codedata} addresses: {@code path}, else {@code originalName},
     * else {@code key}.
     */
    static String fieldName(Codedata codedata, String key) {
        if (codedata != null && codedata.getPath() != null && !codedata.getPath().isBlank()) {
            return codedata.getPath();
        }
        if (codedata != null && codedata.getOriginalName() != null && !codedata.getOriginalName().isBlank()) {
            return codedata.getOriginalName();
        }
        return key;
    }

    /** The argument name a leaf's {@code codedata} is emitted/matched under: {@code originalName}, else {@code key}. */
    static String argName(Codedata codedata, String key) {
        if (codedata != null && codedata.getOriginalName() != null && !codedata.getOriginalName().isBlank()) {
            return codedata.getOriginalName();
        }
        return key;
    }
}
