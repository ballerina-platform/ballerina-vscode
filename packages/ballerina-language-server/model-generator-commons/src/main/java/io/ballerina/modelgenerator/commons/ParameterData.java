/*
 *  Copyright (c) 2024, WSO2 LLC. (http://www.wso2.com)
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

package io.ballerina.modelgenerator.commons;

import io.ballerina.compiler.api.symbols.ParameterKind;
import io.ballerina.compiler.api.symbols.TypeSymbol;

import java.util.ArrayList;
import java.util.List;

import static io.ballerina.modelgenerator.commons.CommonUtils.removeLeadingSingleQuote;

/**
 * Represents the result of a parameter.
 *
 * @param parameterId      the ID of the parameter
 * @param name             the name of the parameter
 * @param type             the type of the parameter
 * @param kind             the kind of the parameter
 * @param placeholder      the placeholder value of the parameter
 * @param defaultValue     the default value of the parameter
 * @param description      the description of the parameter
 * @param label            the label of the parameter
 * @param optional         whether the parameter can be left blank by the user
 * @param advanced         whether the property should be rendered in the advanced section of the form. Only record
 *                         fields declared optional (i.e. {@code field?:}) are advanced; a field or parameter that
 *                         merely has a default value is not
 * @param deprecated       whether the parameter is deprecated
 * @param importStatements import statements of the dependent types
 * @param typeMembers      the member types of the parameter
 * @param typeSymbol       the type symbol of the parameter
 * @since 1.0.0
 */
public record ParameterData(
        int parameterId,
        String name,
        String type,
        Kind kind,
        String placeholder,
        String defaultValue,
        String description,
        String label,
        boolean optional,
        boolean advanced,
        boolean deprecated,
        String importStatements,
        List<ParameterMemberTypeData> typeMembers,
        io.ballerina.compiler.api.symbols.TypeSymbol typeSymbol) {

    public static ParameterData from(String name, String type, Kind kind, String placeholder,
                                     String description, boolean optional) {
        return new ParameterData(0, name, type, kind, placeholder, null, description, null, optional, false, false,
                null, new ArrayList<>(), null);
    }

    public static ParameterData from(String name, String type, Kind kind, String placeholder,
                                     String description, boolean optional, TypeSymbol typeSymbol) {
        return new ParameterData(0, name, type, kind, placeholder, null, description, null, optional, false, false,
                null, new ArrayList<>(), typeSymbol);
    }

    public static ParameterData from(String name, String description, String label, String type, String placeholder,
                                     String defaultValue, Kind kind, boolean optional, boolean advanced,
                                     boolean deprecated, String importStatements,
                                     TypeSymbol typeSymbol) {
        return new ParameterData(0, name, type, kind, placeholder, defaultValue, description, label, optional,
                advanced, deprecated,
                importStatements, new ArrayList<>(), typeSymbol);
    }

    @Override
    public String label() {
        return label != null ? label : removeLeadingSingleQuote(name);
    }

    public enum Kind {
        REQUIRED,
        DEFAULTABLE,
        INCLUDED_RECORD,
        REST_PARAMETER,
        INCLUDED_FIELD,
        PARAM_FOR_TYPE_INFER,
        INCLUDED_RECORD_REST,
        PATH_PARAM,
        PATH_REST_PARAM,
        /**
         * A parameter whose type represents a record used for inferred typing in data-mapping contexts.
         * Unlike {@link #PARAM_FOR_TYPE_INFER}, this kind is used when the record type itself (rather than
         * a type parameter inside it) should drive the field selector UI.
         */
        RECORD_TYPE_INFER;

        public static Kind fromKind(ParameterKind parameterKind) {
            String value = parameterKind.name();
            if (value.equals("REST")) {
                return REST_PARAMETER;
            }
            return Kind.valueOf(value);
        }
    }

}
