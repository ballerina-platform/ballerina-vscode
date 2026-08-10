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

import com.google.gson.JsonPrimitive;
import io.ballerina.modelgenerator.commons.CommonUtils;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import static io.ballerina.modelgenerator.commons.CommonUtils.STRING_TEMPLATE_PATTERN;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.DOUBLE_QUOTE;

/**
 * Represents model to show input field in the UI.
 *
 * @since 1.0.0
 */
public class Value {
    private final Map<String, String> imports;
    private MetaData metadata;
    private Codedata codedata;
    private String placeholder;
    private Object value;
    private List<Object> values;
    private List<Object> items;
    private List<Value> choices;
    private Map<String, Value> properties;
    private List<PropertyType> types;
    private List<ValidationRule> validations;
    private boolean enabled;
    private boolean editable;
    private boolean optional;
    private boolean advanced;
    // A fixed/internal field the form must carry but never render (e.g. a service type the connector
    // pins for new services). Distinct from `enabled: false`, which means "not part of the model" and
    // is skipped by the source generator -- a hidden field still contributes its value.
    //
    // Boxed, unlike the other markers, so it stays absent from the wire unless a model declares it:
    // a primitive would serialize `hidden: false` onto every property of every response.
    private Boolean hidden;

    public Value(Value value) {
        this.metadata = value.metadata;
        this.enabled = value.enabled;
        this.editable = value.editable;
        this.value = value.value;
        this.values = value.values;
        this.placeholder = value.placeholder;
        this.optional = value.optional;
        this.advanced = value.advanced;
        this.hidden = value.hidden;
        this.properties = value.properties;
        this.items = value.items;
        this.codedata = value.codedata;
        this.choices = value.choices;
        this.imports = value.imports;
        this.types = value.types;
        this.validations = value.validations;
    }

    public Value(MetaData metadata, boolean enabled, boolean editable, Object value, List<Object> values,
                 String placeholder, boolean optional, boolean advanced,
                 Map<String, Value> properties, List<Object> items, Codedata codedata,
                 List<PropertyType> types, Map<String, String> imports) {
        this.metadata = metadata;
        this.enabled = enabled;
        this.editable = editable;
        this.value = value;
        this.values = values;
        this.types = types;
        this.placeholder = placeholder;
        this.optional = optional;
        this.advanced = advanced;
        this.properties = properties;
        this.items = items;
        this.codedata = codedata;
        this.imports = imports;
    }

    public enum FieldType {
        EXPRESSION,
        FLAG,
        SINGLE_SELECT,
        MULTI_SELECT,
        MULTIPLE_SELECT,
        MAPPING_EXPRESSION_SET,
        EXPRESSION_SET,
        TEXT_SET,
        IDENTIFIER,
        TEXT,
        // Front-end-recognized alias for a plain multi-line textarea (TextAreaEditor) — no expression
        // evaluation, just free text a user types (e.g. a parameter/header/tool description). Needs
        // its own constant for the same reason MULTI_SELECT_LISTENER does below: without one,
        // wireFieldType's valueOf(...) throws and silently falls back to EXPRESSION, rendering the
        // rich expression editor instead of a plain textarea.
        DOC_TEXT,
        TYPE,
        ENUM,
        NUMBER,
        RECORD_MAP_EXPRESSION,
        SERVICE_PATH,
        CHOICE,
        FORM,
        HEADER_SET,
        RAW_TEMPLATE,
        SINGLE_SELECT_LISTENER,
        MULTIPLE_SELECT_LISTENER,
        // The spelling connector-shipped trigger models use (phase-6 schema); without the constant
        // Gson silently nulls the fieldType on parse.
        MULTI_SELECT_LISTENER,
        FILE_SELECT,
        OPTIONAL_IDENTIFIER,
        ACTION_TYPE,
        REPEATABLE_LIST,
        REPEATABLE_MAP,
        GROUP_SECTION,
    }

    public MetaData getMetadata() {
        return metadata;
    }

    public void setMetadata(MetaData metadata) {
        this.metadata = metadata;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public boolean isEnabledWithValue() {
        return enabled && (
                (value != null && ((value instanceof String && !((String) value).isEmpty()) ||
                        (value instanceof JsonPrimitive jsonPrimitive && !jsonPrimitive.getAsString().isEmpty()) ||
                                (value instanceof Map<?, ?>) ||
                                (value instanceof List<?> list && !list.isEmpty()))) ||
                        (values != null && !values.isEmpty()));
    }

    public boolean isEditable() {
        return editable;
    }

    public void setEditable(boolean editable) {
        this.editable = editable;
    }

    public String getValue() {
        if (value == null || value.toString().isEmpty()) {
            return "";
        }

        if (value instanceof Map<?, ?> valueMap) {
            return buildMapSourceCode(valueMap);
        } else if (value instanceof List<?> valueList) {
            return buildListSourceCode(valueList);
        }

        return CommonUtils.extractLiteralFromStringTemplate(getValueString());
    }

    private static String buildMapSourceCode(Map<?, ?> valueMap) {
        if (valueMap.isEmpty()) {
            return "";
        }

        List<String> keyValuePairs = new ArrayList<>();
        valueMap.forEach((keyObj, valueObj) -> {
            String key = (String) keyObj;
            String propertyValue = convertToValue(valueObj).getValue();
            if (!propertyValue.isEmpty()) {
                keyValuePairs.add(key + ": " + propertyValue);
            }
        });

        return keyValuePairs.isEmpty() ? "" : "{%s}".formatted(String.join(", ", keyValuePairs));
    }

    public static Value convertToValue(Object propObj) {
        Value.ValueBuilder builder = new Value.ValueBuilder();
        if (propObj instanceof Map<?, ?> propMap) {
            builder.value(propMap.get("value"));
        }
        return builder.build();
    }

    private static String buildListSourceCode(List<?> valueList) {
        if (valueList.isEmpty()) {
            return "";
        }

        List<String> stringValues = valueList.stream()
                .filter(Map.class::isInstance)
                .map(Map.class::cast)
                .map(val -> new Value.ValueBuilder().value(val.get("value")).build().getValue())
                .toList();

        return stringValues.isEmpty() ? "" : "[%s]".formatted(String.join(", ", stringValues));
    }

    public String getValueString() {
        if (Objects.nonNull(values) && !values.isEmpty()) {
            if (values.getFirst() instanceof String) {
                return String.join(", ", values.stream().map(v -> (String) v).toList());
            }
            if (values.getFirst() instanceof JsonPrimitive) {
                return String.join(", ", values.stream().map(v -> (JsonPrimitive) v)
                        .map(JsonPrimitive::getAsString).toList());
            }
        }
        if (value instanceof String) {
            return (String) value;
        }
        if (value instanceof Boolean) {
            return String.valueOf(value);
        }
        if (value instanceof JsonPrimitive) {
            return ((JsonPrimitive) value).getAsString();
        }
        return null;
    }

    public void setValue(Object value) {
        this.value = value;
    }

    public String getLiteralValue() {
        String valueStr = getValue();
        if (valueStr != null && (STRING_TEMPLATE_PATTERN.matcher(valueStr).matches()
                || valueStr.startsWith(DOUBLE_QUOTE) && valueStr.endsWith(DOUBLE_QUOTE))) {
            return valueStr;
        }
        return DOUBLE_QUOTE + valueStr + DOUBLE_QUOTE;
    }

    public Object getValueAsObject() {
        return value;
    }

    public List<String> getValues() {
        if (Objects.nonNull(values) && !values.isEmpty()) {
            Object firstValue = values.getFirst();
            if (firstValue instanceof String) {
                return values.stream().map(v -> (String) v).toList();
            }
            return values.stream().map(v -> (JsonPrimitive) v).map(JsonPrimitive::getAsString).toList();
        }
        return null;
    }

    public void setValues(List<Object> values) {
        this.values = values;
    }

    public List<Object> getValuesAsObjects() {
        return values;
    }

    public void addValue(String value) {
        if (Objects.isNull(this.values)) {
            this.values = List.of(value);
        } else {
            this.values.add(value);
        }
    }

    public List<PropertyType> getTypes() {
        return types;
    }

    public void setTypes(List<PropertyType> types) {
        this.types = types;
    }

    public String getPlaceholder() {
        return placeholder;
    }

    public void setPlaceholder(String placeholder) {
        this.placeholder = placeholder;
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

    public boolean isHidden() {
        return Boolean.TRUE.equals(hidden);
    }

    public void setHidden(Boolean hidden) {
        this.hidden = hidden;
    }

    public Map<String, Value> getProperties() {
        return properties;
    }

    public void setProperties(Map<String, Value> properties) {
        this.properties = properties;
    }

    public List<String> getItems() {
        return items.stream().map(Object::toString).toList();
    }

//    public void setItems(List<Object> items) {
//        this.items = items;
//    }

    public Codedata getCodedata() {
        return codedata;
    }

    public void setCodedata(Codedata codedata) {
        this.codedata = codedata;
    }

    public List<Value> getChoices() {
        return choices;
    }

    public void setChoices(List<Value> choices) {
        this.choices = choices;
    }

    public Value getProperty(String key) {
        return properties.get(key);
    }

    public Map<String, String> getImports() {
        return imports;
    }

    public List<ValidationRule> getValidations() {
        return validations;
    }

    public void setValidations(List<ValidationRule> validations) {
        this.validations = validations;
    }

    public static class ValueBuilder {
        private MetaData metadata;
        private Codedata codedata;
        private Object value;
        private List<Object> values;
        private List<PropertyType> types;
        private String placeholder;
        private List<Object> items;
        private Map<String, Value> properties;
        private Map<String, String> imports;
        private List<ValidationRule> validations;
        private boolean enabled = false;
        private boolean editable = false;
        private boolean optional = false;
        private boolean advanced = false;
        private Boolean hidden;

        public ValueBuilder metadata(String label, String description) {
            this.metadata = new MetaData(label, description);
            return this;
        }

        public ValueBuilder setMetadata(MetaData metadata) {
            this.metadata = metadata;
            return this;
        }

        public ValueBuilder enabled(boolean enabled) {
            this.enabled = enabled;
            return this;
        }

        public ValueBuilder editable(boolean editable) {
            this.editable = editable;
            return this;
        }

        public ValueBuilder value(Object value) {
            this.value = value;
            return this;
        }

        public ValueBuilder types(List<PropertyType> types) {
            this.types = types;
            boolean hasSelected = types.stream().anyMatch(PropertyType::selected);
            if (!hasSelected) {
                this.types.getFirst().selected(true);
            }
            return this;
        }

        public ValueBuilder setPlaceholder(String placeholder) {
            this.placeholder = placeholder;
            return this;
        }

        public ValueBuilder optional(boolean optional) {
            this.optional = optional;
            return this;
        }

        public ValueBuilder setAdvanced(boolean advanced) {
            this.advanced = advanced;
            return this;
        }

        public ValueBuilder setHidden(Boolean hidden) {
            this.hidden = hidden;
            return this;
        }

        public ValueBuilder setProperties(Map<String, Value> properties) {
            this.properties = properties;
            return this;
        }

        public ValueBuilder setItems(List<Object> items) {
            this.items = items;
            return this;
        }

        public ValueBuilder setCodedata(Codedata codedata) {
            this.codedata = codedata;
            return this;
        }

        public ValueBuilder setValues(List<Object> values) {
            this.values = values;
            return this;
        }

        public ValueBuilder setImports(Map<String, String> imports) {
            this.imports = imports;
            return this;
        }

        public ValueBuilder addImport(String key, String value) {
            if (this.imports == null) {
                this.imports = new HashMap<>();
            }
            this.imports.put(key, value);
            return this;
        }

        public ValueBuilder setValidations(List<ValidationRule> validations) {
            this.validations = validations;
            return this;
        }

        public Value build() {
            Value built = new Value(metadata, enabled, editable, value, values, placeholder, optional, advanced,
                    properties, items, codedata, types, imports);
            built.setValidations(validations);
            built.setHidden(hidden);
            return built;
        }
    }
}
