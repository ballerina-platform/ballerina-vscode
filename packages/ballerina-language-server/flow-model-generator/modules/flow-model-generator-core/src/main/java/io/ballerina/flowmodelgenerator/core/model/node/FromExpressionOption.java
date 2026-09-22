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

package io.ballerina.flowmodelgenerator.core.model.node;

import io.ballerina.flowmodelgenerator.core.UserFacingException;
import io.ballerina.flowmodelgenerator.core.model.NodeBuilder;
import io.ballerina.flowmodelgenerator.core.model.Option;
import io.ballerina.flowmodelgenerator.core.model.Property;

import java.util.Map;

/**
 * The escape hatch every workflow dropdown carries: an option whose one sub-field is an expression
 * of the parameter's own type. A value the dropdown cannot show — a constant, a variable, a call —
 * is read into this option and written back as it was typed, so the form never rewrites it.
 *
 * @since 1.9.0
 */
public final class FromExpressionOption {

    public static final String VALUE = "FromExpression";
    private static final String LABEL = "From Expression";

    private FromExpressionOption() {
    }

    public static Option option() {
        return new Option(LABEL, VALUE);
    }

    public static boolean isSelected(String dropdownValue) {
        return VALUE.equals(dropdownValue);
    }

    /**
     * The expression sub-field rendered under the option. Required: choosing the option and leaving
     * it empty declares nothing the form could write.
     *
     * @param label         the field label
     * @param description   the field description
     * @param ballerinaType the parameter's type, so the editor completes and checks against it
     * @return the sub-property
     */
    public static Property subProperty(String label, String description, String ballerinaType) {
        return new Property.Builder<Void>(null)
                .metadata().label(label).description(description).stepOut()
                .type().fieldType(Property.ValueType.EXPRESSION).ballerinaType(ballerinaType).selected(true)
                    .stepOut()
                .value("")
                .editable(true)
                .build();
    }

    /**
     * The hidden root property that stores the sub-field's value, the way every dropdown sub-field
     * stores its value.
     */
    public static void addHiddenProperty(NodeBuilder nodeBuilder, String key, String label, String description,
                                         String ballerinaType, String value) {
        nodeBuilder.properties().custom()
                .metadata().label(label).description(description).stepOut()
                .type().fieldType(Property.ValueType.EXPRESSION).ballerinaType(ballerinaType).selected(true)
                    .stepOut()
                .value(value == null ? "" : value)
                .editable(true).optional(true).hidden(true)
                .stepOut()
                .addProperty(key);
    }

    /**
     * The expression the form holds under the option, as source.
     *
     * @param properties     the node's properties
     * @param key            the expression property's key
     * @param missingMessage the error shown when the option is selected but the field is empty
     * @return the trimmed expression source
     */
    public static String expression(Map<String, Property> properties, String key, String missingMessage) {
        Property property = properties == null ? null : properties.get(key);
        String value = property == null || property.value() == null ? "" : property.value().toString().trim();
        if (value.isBlank()) {
            throw new UserFacingException(missingMessage);
        }
        return value;
    }
}
