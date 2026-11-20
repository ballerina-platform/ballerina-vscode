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

package io.ballerina.flowmodelgenerator.core.model;

import java.util.List;

/**
 * Represents the type configuration of a property in the flow model.
 *
 * @since 1.5.0
 */
public class PropertyType {
    
    private final Property.ValueType fieldType;
    private final String ballerinaType;
    private final String scope;
    private final List<Option> options;
    private final Property template;
    private final List<PropertyTypeMemberInfo> typeMembers;
    private final RecordSelectorType recordSelectorType;
    // The typedesc a TYPE input stands for, set only on a typedesc's type editor: the chosen type is written as the
    // typedesc's value, so it has to be one that can be named there.
    private final String typedesc;
    private boolean selected;

    public PropertyType(Property.ValueType fieldType, String ballerinaType, String scope, List<Option> options,
            Property template, List<PropertyTypeMemberInfo> typeMembers, RecordSelectorType recordSelectorType,
            boolean selected) {
        this(fieldType, ballerinaType, scope, options, template, typeMembers, recordSelectorType, null, selected);
    }

    public PropertyType(Property.ValueType fieldType, String ballerinaType, String scope, List<Option> options,
            Property template, List<PropertyTypeMemberInfo> typeMembers, RecordSelectorType recordSelectorType,
            String typedesc, boolean selected) {
        this.fieldType = fieldType;
        this.ballerinaType = ballerinaType;
        this.scope = scope;
        this.options = options;
        this.template = template;
        this.typeMembers = typeMembers;
        this.recordSelectorType = recordSelectorType;
        this.typedesc = typedesc;
        this.selected = selected;
    }

    public Property.ValueType fieldType() {
        return fieldType;
    }

    public String ballerinaType() {
        return ballerinaType;
    }

    public String scope() {
        return scope;
    }

    public List<Option> options() {
        return options;
    }

    public Property template() {
        return template;
    }

    public List<PropertyTypeMemberInfo> typeMembers() {
        return typeMembers;
    }

    public RecordSelectorType recordSelectorType() {
        return recordSelectorType;
    }

    public String typedesc() {
        return typedesc;
    }

    public boolean selected() {
        return selected;
    }

    public void selected(boolean selected) {
        this.selected = selected;
    }
}
