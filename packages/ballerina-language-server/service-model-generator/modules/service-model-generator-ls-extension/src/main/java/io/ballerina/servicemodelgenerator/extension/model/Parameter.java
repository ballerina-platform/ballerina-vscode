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

package io.ballerina.servicemodelgenerator.extension.model;

import java.io.Serial;
import java.io.Serializable;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import static io.ballerina.servicemodelgenerator.extension.util.Constants.ARGUMENT_DEFAULT_VALUE_METADATA;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.ARGUMENT_DOCUMENTATION_METADATA;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.ARGUMENT_NAME_METADATA;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.ARGUMENT_TYPE_METADATA;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.FIELD_DEFAULT_VALUE_METADATA;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.FIELD_NAME_METADATA;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.FIELD_TYPE_METADATA;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.PARAMETER_DEFAULT_VALUE_METADATA;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.PARAMETER_DOCUMENTATION_METADATA;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.PARAMETER_NAME_METADATA;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.PARAMETER_TYPE_METADATA;

/**
 * Represents a parameter in service method.
 *
 * @since 1.0.0
 */
public class Parameter {
    private MetaData metadata;
    private String kind;
    private Value type;
    private Value name;
    private Value defaultValue;
    private Value documentation;
    private Value headerName;
    private boolean enabled;
    private boolean editable;
    private boolean optional;
    private boolean advanced;
    private boolean hidden;
    private boolean isGraphqlId;
    private String httpParamType;
    private Map<String, Value> properties;

    public Parameter(MetaData metadata, String kind, Value type, Value name, Value defaultValue, Value documentation,
                     boolean enabled, boolean editable, boolean optional, boolean advanced, String httpParamType,
                     boolean hidden, Map<String, Value> properties, boolean isGraphqlId) {
        this.metadata = metadata;
        this.kind = kind;
        this.type = type;
        this.name = name;
        this.defaultValue = defaultValue;
        this.documentation = documentation;
        this.enabled = enabled;
        this.editable = editable;
        this.optional = optional;
        this.advanced = advanced;
        this.httpParamType = httpParamType;
        this.hidden = hidden;
        this.properties = properties;
        this.isGraphqlId = isGraphqlId;
    }

    public Parameter(Parameter parameter) {
        this.metadata = parameter.metadata;
        this.kind = parameter.kind;
        this.documentation = parameter.documentation;
        this.type = parameter.type;
        this.name = parameter.name;
        this.defaultValue = parameter.defaultValue;
        this.enabled = parameter.enabled;
        this.editable = parameter.editable;
        this.optional = parameter.optional;
        this.advanced = parameter.advanced;
        this.httpParamType = parameter.httpParamType;
        this.hidden = parameter.hidden;
        this.headerName = parameter.headerName;
        this.properties = parameter.properties;
        this.isGraphqlId = parameter.isGraphqlId;
    }

    private static Value name(MetaData metadata) {
        return new Value.ValueBuilder()
                .setMetadata(metadata)
                .types(List.of(PropertyType.types(Value.FieldType.IDENTIFIER)))
                .enabled(true)
                .editable(true)
                .build();
    }

    private static Value type(MetaData metadata) {
        return new Value.ValueBuilder()
                .setMetadata(metadata)
                .types(List.of(PropertyType.types(Value.FieldType.TYPE)))
                .enabled(true)
                .editable(true)
                .build();
    }

    private static Value defaultValue(MetaData metadata) {
        return new Value.ValueBuilder()
                .setMetadata(metadata)
                .types(List.of(PropertyType.types(Value.FieldType.EXPRESSION)))
                .enabled(true)
                .editable(true)
                .optional(true)
                .build();
    }

    private static Value documentation(MetaData metadata) {
        return new Value.ValueBuilder()
                .setMetadata(metadata)
                .types(List.of(PropertyType.types(Value.FieldType.TEXT)))
                .enabled(true)
                .editable(true)
                .optional(true)
                .build();
    }

    public static Parameter getNewField() {
        return new Builder()
                .type(type(FIELD_TYPE_METADATA))
                .name(name(FIELD_NAME_METADATA))
                .defaultValue(defaultValue(FIELD_DEFAULT_VALUE_METADATA))
                .editable(true)
                .optional(true)
                .build();
    }

    public static Parameter graphqlParamSchema() {
        return new Parameter.Builder()
                .type(type(ARGUMENT_TYPE_METADATA))
                .name(name(ARGUMENT_NAME_METADATA))
                .defaultValue(defaultValue(ARGUMENT_DEFAULT_VALUE_METADATA))
                .documentation(documentation(ARGUMENT_DOCUMENTATION_METADATA))
                .enabled(true)
                .editable(true)
                .build();
    }

    public static Parameter functionParamSchema() {
        return new Parameter.Builder()
                .type(type(PARAMETER_TYPE_METADATA))
                .name(name(PARAMETER_NAME_METADATA))
                .defaultValue(defaultValue(PARAMETER_DEFAULT_VALUE_METADATA))
                .documentation(documentation(PARAMETER_DOCUMENTATION_METADATA))
                .enabled(true)
                .editable(true)
                .build();
    }

    public static Parameter getNewFunctionParameter() {
        return functionParamSchema();
    }

    public static Parameter getNewGraphqlParameter() {
        return graphqlParamSchema();
    }

    public MetaData getMetadata() {
        return metadata;
    }

    public void setMetadata(MetaData metadata) {
        this.metadata = metadata;
    }

    public String getKind() {
        return kind;
    }

    public void setKind(String kind) {
        this.kind = kind;
    }

    public Value getDocumentation() {
        if (Objects.isNull(documentation)) {
            documentation = new Value.ValueBuilder()
                    .types(List.of(PropertyType.types(Value.FieldType.TEXT)))
                    .enabled(true)
                    .optional(true)
                    .editable(true)
                    .build();
        }
        return documentation;
    }

    public void setDocumentation(Value documentation) {
        this.documentation = documentation;
    }

    public Value getType() {
        return type;
    }

    public void setType(Value type) {
        this.type = type;
    }

    public Value getName() {
        return name;
    }

    public void setName(Value name) {
        this.name = name;
    }

    public Value getDefaultValue() {
        return defaultValue;
    }

    public void setDefaultValue(Value defaultValue) {
        this.defaultValue = defaultValue;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public boolean isEditable() {
        return editable;
    }

    public void setEditable(boolean editable) {
        this.editable = editable;
    }

    public boolean isOptional() {
        return optional;
    }

    public void setOptional(boolean optional) {
        this.optional = optional;
    }

    public boolean isAdvanced() {
        return advanced;
    }

    public void setAdvanced(boolean advanced) {
        this.advanced = advanced;
    }

    public String getHttpParamType() {
        return httpParamType;
    }

    public void setHttpParamType(String httpParamType) {
        this.httpParamType = httpParamType;
    }

    public boolean isHidden() {
        return hidden;
    }

    public void setHidden(boolean hidden) {
        this.hidden = hidden;
    }

    public Value getHeaderName() {
        return headerName;
    }

    public void setHeaderName(Value headerName) {
        this.headerName = headerName;
    }

    public Map<String, Value> getProperties() {
        if (Objects.isNull(properties)) {
            properties = new LinkedHashMap<>();
        }
        return properties;
    }

    public void setProperties(Map<String, Value> properties) {
        this.properties = properties;
    }

    public boolean isGraphqlId() {
        return isGraphqlId;
    }

    public void setIsGraphqlId(boolean isGraphqlId) {
        this.isGraphqlId = isGraphqlId;
    }

    public static class RequiredParamSorter implements Comparator<Parameter>, Serializable {

        @Serial
        private static final long serialVersionUID = 1L; // Or any long value

        @Override
        public int compare(Parameter param1, Parameter param2) {
            Value param1DefaultValue = param1.getDefaultValue();
            Value param2DefaultValue = param2.getDefaultValue();
            if (param1DefaultValue == null && param2DefaultValue == null) {
                return 0;
            } else if (param1DefaultValue == null) {
                return -1;
            } else if (param2DefaultValue == null) {
                return 1;
            }

            boolean isEnabled1 = param1DefaultValue.isEnabledWithValue();
            boolean isEnabled2 = param2DefaultValue.isEnabledWithValue();

            if (isEnabled1 == isEnabled2) {
                return 0; // Both have the same enabled state, consider them equal
            } else if (isEnabled1) {
                return 1;  // true comes after false
            } else {
                return -1; // false comes before true
            }
        }

    }

    public static class Builder {
        private MetaData metadata;
        private String kind;
        private Value type;
        private Value name;
        private Value defaultValue;
        private Value documentation;
        private Value headerName;
        private boolean enabled;
        private boolean editable;
        private boolean optional;
        private boolean advanced;
        private boolean hidden;
        private boolean isGraphqlId;
        private String httpParamType;
        private Map<String, Value> properties;


        public Builder metadata(MetaData metadata) {
            this.metadata = metadata;
            return this;
        }

        public Builder kind(String kind) {
            this.kind = kind;
            return this;
        }

        public Builder documentation(Value documentation) {
            this.documentation = documentation;
            return this;
        }

        public Builder type(Value type) {
            this.type = type;
            return this;
        }

        public Builder name(Value name) {
            this.name = name;
            return this;
        }

        public Builder defaultValue(Value defaultValue) {
            this.defaultValue = defaultValue;
            return this;
        }

        public Builder headerName(Value headerName) {
            this.headerName = headerName;
            return this;
        }

        public Builder enabled(boolean enabled) {
            this.enabled = enabled;
            return this;
        }

        public Builder editable(boolean editable) {
            this.editable = editable;
            return this;
        }

        public Builder optional(boolean optional) {
            this.optional = optional;
            return this;
        }

        public Builder advanced(boolean advanced) {
            this.advanced = advanced;
            return this;
        }

        public Builder httpParamType(String httpParamType) {
            this.httpParamType = httpParamType;
            return this;
        }

        public Builder hidden(boolean hidden) {
            this.hidden = hidden;
            return this;
        }

        public Builder properties(Map<String, Value> properties) {
            this.properties = properties;
            return this;
        }

        public Builder addProperty(String key, Value value) {
            if (this.properties == null) {
                this.properties = new LinkedHashMap<>();
            }
            this.properties.put(key, value);
            return this;
        }

        public Builder isGraphqlId(boolean isGraphqlId) {
            this.isGraphqlId = isGraphqlId;
            return this;
        }

        public Parameter build() {
            Parameter parameter = new Parameter(metadata, kind, type, name, defaultValue, documentation, enabled,
                    editable, optional, advanced, httpParamType, hidden, properties, isGraphqlId);
            parameter.setHeaderName(headerName);
            return parameter;
        }
    }
}
