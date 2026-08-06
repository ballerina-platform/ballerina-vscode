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

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonParser;
import com.google.gson.JsonPrimitive;
import com.google.gson.JsonSerializationContext;
import com.google.gson.JsonSerializer;
import com.google.gson.annotations.JsonAdapter;
import com.google.gson.reflect.TypeToken;
import io.ballerina.compiler.api.ModuleID;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.ArrayTypeSymbol;
import io.ballerina.compiler.api.symbols.MapTypeSymbol;
import io.ballerina.compiler.api.symbols.TypeDescKind;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.api.symbols.UnionTypeSymbol;
import io.ballerina.compiler.syntax.tree.BindingPatternNode;
import io.ballerina.compiler.syntax.tree.FieldBindingPatternFullNode;
import io.ballerina.compiler.syntax.tree.ListBindingPatternNode;
import io.ballerina.compiler.syntax.tree.MappingBindingPatternNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.SeparatedNodeList;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.ParameterMemberTypeData;
import org.ballerinalang.langserver.common.utils.CommonUtil;

import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Represents the type configuration of a property in the flow model.
 *
 * @since 1.5.0
 */
public class PropertyType {

    @JsonAdapter(FieldTypeSerializer.class)
    private final Value.FieldType fieldType;
    private final String ballerinaType;
    private final List<Option> options;
    private final List<PropertyTypeMemberInfo> typeMembers;
    private final Value template;
    private boolean selected;
    private final Integer minItems;
    private final Integer defaultItems;
    private final String pattern;
    private final String patternErrorMessage;
    // Validation rules scoped to THIS type member; run only while it is the active/selected mode.
    // Not a constructor param so the existing callers stay untouched; set via the Builder and
    // deserialized directly by Gson from the connector model.
    private List<ValidationRule> validations;

    public PropertyType(Value.FieldType fieldType, String ballerinaType, List<Option> options,
                        List<PropertyTypeMemberInfo> typeMembers, Value template, boolean selected, Integer minItems,
                        Integer defaultItems, String pattern, String patternErrorMessage) {
        this.fieldType = fieldType;
        this.ballerinaType = ballerinaType;
        this.options = options;
        this.typeMembers = typeMembers;
        this.template = template;
        this.selected = selected;
        this.minItems = minItems;
        this.defaultItems = defaultItems;
        this.pattern = pattern;
        this.patternErrorMessage = patternErrorMessage;
    }

    public static PropertyType types(Value.FieldType fieldType) {
        return new Builder().fieldType(fieldType).build();
    }

    public static PropertyType types(Value.FieldType fieldType, List<Option> options) {
        return new Builder().fieldType(fieldType).options(options).build();
    }

    public static PropertyType types(Value.FieldType fieldType, String ballerinaType) {
        return new Builder().fieldType(fieldType).ballerinaType(ballerinaType).build();
    }

    public static void typeWithExpression(Value.ValueBuilder valueBuilder, TypeSymbol typeSymbol,
                                          ModuleInfo moduleInfo, Node value, SemanticModel semanticModel) {
        if (typeSymbol == null) {
            valueBuilder.types(List.of());
            return;
        }
        String ballerinaType = CommonUtils.getTypeSignature(typeSymbol, moduleInfo);
        List<PropertyType> propertyTypes = new ArrayList<>();

        // Handle the primitive input types
        boolean success = handlePrimitiveType(typeSymbol, ballerinaType, semanticModel, moduleInfo,
                valueBuilder, propertyTypes);

        TypeSymbol rawType = CommonUtil.getRawType(typeSymbol);
        // Handle union of singleton types as single-select options
        if (!success && rawType instanceof UnionTypeSymbol unionTypeSymbol) {
            List<TypeSymbol> typeSymbols = unionTypeSymbol.memberTypeDescriptors();
            List<Option> options = new ArrayList<>();
            boolean allSingletons = true;
            for (TypeSymbol symbol : typeSymbols) {
                if (CommonUtil.getRawType(symbol).typeKind() == TypeDescKind.SINGLETON) {
                    String label = CommonUtils.removeQuotes(symbol.signature());
                    Option option = new Option(label, symbol.signature());
                    options.add(option);
                } else {
                    allSingletons = false;
                    break;
                }
            }

            // If all the member types are singletons, treat it as a single-select option
            if (allSingletons) {
                PropertyType propType = new Builder()
                        .fieldType(Value.FieldType.SINGLE_SELECT)
                        .options(options)
                        .ballerinaType(ballerinaType)
                        .build();
                propertyTypes.add(propType);
            } else {
                // Handle union of primitive types by defining an input type for each primitive type
                for (TypeSymbol ts : typeSymbols) {
                    handlePrimitiveType(ts, CommonUtils.getTypeSignature(ts, moduleInfo), semanticModel, moduleInfo,
                            valueBuilder, propertyTypes);
                }
                // group by the fieldType
                propertyTypes.stream()
                        .filter(pt -> !(pt.fieldType() == Value.FieldType.REPEATABLE_LIST
                                || pt.fieldType() == Value.FieldType.REPEATABLE_MAP))
                        .collect(java.util.stream.Collectors.groupingBy(PropertyType::fieldType))
                        .forEach((fieldType, groupedTypes) -> {
                            if (groupedTypes.size() > 1) {
                                // merge the ballerina types
                                String mergedBallerinaType = groupedTypes.stream()
                                        .map(PropertyType::ballerinaType)
                                        .distinct()
                                        .reduce((a, b) -> a + "|" + b)
                                        .orElse("");
                                // remove the existing types
                                propertyTypes.removeIf(t -> t.fieldType() == fieldType);

                                List<PropertyTypeMemberInfo> distinctMembers = null;
                                if (fieldType == Value.FieldType.RECORD_MAP_EXPRESSION) {
                                    distinctMembers = new ArrayList<>(groupedTypes.stream()
                                            .filter(t -> t.typeMembers() != null)
                                            .flatMap(t -> t.typeMembers().stream())
                                            .distinct()
                                            .toList());
                                }

                                // add the merged type
                                propertyTypes.add(new PropertyType(fieldType, mergedBallerinaType, null,
                                        distinctMembers, null, false, null, null,
                                        null, null));
                            }
                        });
            }
        }

        // All the ballerina types will have a default to expression type
        PropertyType expressionType = new Builder()
                .fieldType(Value.FieldType.EXPRESSION)
                .ballerinaType(ballerinaType)
                .build();
        propertyTypes.add(expressionType);

        // get value node kind
        // from the node kind map its belonging prop kind
        // filter the prop type list and set the selected flag to true
        if (value != null) {
            Value.FieldType matchingValueType = findMatchingValueType(value);
            // if matching type is mapping_expression_set
            // need to check if it's a map or a record if its a map then need to set the matching type
            if (matchingValueType == Value.FieldType.REPEATABLE_MAP) {
                Optional<TypeSymbol> paramType = semanticModel.typeOf(value);
                boolean hasRecordValue = handleRecordValue(value, semanticModel, valueBuilder, paramType,
                        propertyTypes);
                if (!hasRecordValue && value instanceof MappingBindingPatternNode bindingPatternNode) {
                    handleMapValue(typeSymbol, moduleInfo, valueBuilder, bindingPatternNode, paramType, propertyTypes);
                }
            } else if (matchingValueType == Value.FieldType.REPEATABLE_LIST) {
                handleListValue(typeSymbol, moduleInfo, valueBuilder, value, semanticModel, propertyTypes);
            } else if (matchingValueType == Value.FieldType.EXPRESSION) {
                boolean foundMatch = false;
                PropertyType expressionPropType = null;
                for (PropertyType propType : propertyTypes) {
                    if (propType.fieldType() == Value.FieldType.SINGLE_SELECT) {
                        String valueStr = value.toSourceCode().trim();
                        for (Option option : propType.options()) {
                            if (option.value().equals(valueStr)) {
                                propType.selected(true);
                                foundMatch = true;
                                break;
                            }
                        }
                    }
                    if (propType.fieldType() == Value.FieldType.EXPRESSION) {
                        expressionPropType = propType;
                    }
                }
                if (!foundMatch && expressionPropType != null) {
                    expressionPropType.selected(true);
                }
            } else {
                Value.FieldType finalMatchingValueType = matchingValueType;
                propertyTypes.stream()
                        .filter(propType -> propType.fieldType() == finalMatchingValueType)
                        .findFirst()
                        .ifPresent(propType -> propType.selected(true));
                if (finalMatchingValueType.equals(Value.FieldType.TEXT)) {
                    String valueStr = value.toSourceCode().strip();
                    valueBuilder.value(CommonUtils.unescapeContent(valueStr));
                }
            }
        }
        valueBuilder.types(propertyTypes);
    }

    private static boolean handlePrimitiveType(TypeSymbol typeSymbol, String ballerinaType,
                                                              SemanticModel semanticModel, ModuleInfo moduleInfo,
                                                              Value.ValueBuilder builder,
                                                              List<PropertyType> propertyTypes) {
        TypeSymbol rawType = CommonUtil.getRawType(typeSymbol);
        return switch (rawType.typeKind()) {
            case INT, INT_SIGNED8, INT_UNSIGNED8, INT_SIGNED16, INT_UNSIGNED16,
                 INT_SIGNED32, INT_UNSIGNED32, BYTE, FLOAT, DECIMAL -> {
                propertyTypes.add(PropertyType.types(Value.FieldType.NUMBER, ballerinaType));
                yield true;
            }
            case STRING, STRING_CHAR -> {
                propertyTypes.add(PropertyType.types(Value.FieldType.TEXT, ballerinaType));
                yield true;
            }
            case BOOLEAN -> {
                propertyTypes.add(PropertyType.types(Value.FieldType.FLAG, ballerinaType));
                yield true;
            }
            case ARRAY -> {
                PropertyType propertyType = new PropertyType.Builder()
                        .fieldType(Value.FieldType.REPEATABLE_LIST)
                        .ballerinaType(ballerinaType)
                        .template(buildRepeatableTemplates(typeSymbol, semanticModel, moduleInfo))
                        .build();
                propertyTypes.add(propertyType);
                yield true;
            }
            case MAP -> {
                PropertyType propertyType = new PropertyType.Builder()
                        .fieldType(Value.FieldType.REPEATABLE_MAP)
                        .ballerinaType(ballerinaType)
                        .template(buildRepeatableTemplates(typeSymbol, semanticModel, moduleInfo))
                        .build();
                propertyTypes.add(propertyType);
                yield true;
            }
            case RECORD -> {
                if (typeSymbol.typeKind() != TypeDescKind.RECORD && typeSymbol.getModule().isPresent()) {
                    // not an anonymous record
                    String type = ballerinaType;
                    String[] typeParts = ballerinaType.split(":");
                    if (typeParts.length > 1) {
                        type = typeParts[1];
                    }
                    ModuleID id = typeSymbol.getModule().get().id();
                    String packageIdentifier = "%s:%s:%s".formatted(id.orgName(), id.moduleName(), id.version());
                    PropertyType propertyType = new PropertyType.Builder()
                            .fieldType(Value.FieldType.RECORD_MAP_EXPRESSION)
                            .ballerinaType(ballerinaType)
                            .setTypeMembers(List.of(new ParameterMemberTypeData(type, "RECORD_TYPE",
                                    packageIdentifier, id.packageName())))
                            .build();
                    propertyTypes.add(propertyType);
                    yield true;
                }
                yield false;
            }
            default -> false;
        };
    }

    public static Value buildRepeatableTemplates(TypeSymbol tSymbol, SemanticModel semanticModel,
                                             ModuleInfo moduleInfo) {
        Value.ValueBuilder builder = new Value.ValueBuilder();

        TypeSymbol rawType = CommonUtil.getRawType(tSymbol);
        if (rawType.typeKind() == TypeDescKind.ARRAY) {
            ArrayTypeSymbol arrayTypeSymbol = (ArrayTypeSymbol) rawType;
            TypeSymbol memberTypeSymbol = arrayTypeSymbol.memberTypeDescriptor();
            typeWithExpression(builder, memberTypeSymbol, moduleInfo, null, semanticModel);
        } else if (rawType.typeKind() == TypeDescKind.MAP) {
            MapTypeSymbol mapTypeSymbol = (MapTypeSymbol) rawType;
            TypeSymbol constrainedTypeSymbol = mapTypeSymbol.typeParam();
            typeWithExpression(builder, constrainedTypeSymbol, moduleInfo, null, semanticModel);
        } else {
            typeWithExpression(builder, tSymbol, moduleInfo, null, semanticModel);
        }

        return builder.build();
    }


    private static Value.FieldType findMatchingValueType(Node node) {
        return switch (node.kind()) {
            case STRING_TEMPLATE_EXPRESSION, STRING_LITERAL -> Value.FieldType.TEXT;
            case NUMERIC_LITERAL -> Value.FieldType.NUMBER;
            case TRUE_KEYWORD, FALSE_KEYWORD, BOOLEAN_LITERAL -> Value.FieldType.FLAG;
            case MAPPING_BINDING_PATTERN, MAPPING_CONSTRUCTOR -> Value.FieldType.REPEATABLE_MAP;
            case LIST_BINDING_PATTERN, LIST_CONSTRUCTOR -> Value.FieldType.REPEATABLE_LIST;
            default -> Value.FieldType.EXPRESSION;
        };
    }

    private static void handleListValue(TypeSymbol typeSymbol, ModuleInfo moduleInfo, Value.ValueBuilder builder,
                                        Node value, SemanticModel semanticModel, List<PropertyType> propertyTypes) {
        Optional<TypeSymbol> paramType = semanticModel.typeOf(value);
        if (paramType.isEmpty() || !(value instanceof ListBindingPatternNode bindingPatternNode)) {
            return;
        }

        TypeSymbol actualParamType = paramType.get();

        // Collect candidate array type symbols
        List<TypeSymbol> candidateArrayTypes = new ArrayList<>();
        if (typeSymbol instanceof UnionTypeSymbol unionType) {
            unionType.memberTypeDescriptors().stream()
                    .filter(ArrayTypeSymbol.class::isInstance)
                    .forEach(candidateArrayTypes::add);
        } else if (typeSymbol instanceof ArrayTypeSymbol) {
            candidateArrayTypes.add(typeSymbol);
        }

        // Find the matching type symbol that is a subtype of the parameter type
        TypeSymbol matchingType = candidateArrayTypes.stream()
                .filter(candidate -> candidate.subtypeOf(actualParamType))
                .findFirst()
                .orElse(null);

        if (matchingType == null) {
            return;
        }

        String ballerinaType = CommonUtils.getTypeSignature(typeSymbol, moduleInfo);

        // Find and update the matching property type
        propertyTypes.stream()
                .filter(propType -> propType.fieldType().equals(Value.FieldType.REPEATABLE_LIST)
                        && propType.ballerinaType().equals(ballerinaType))
                .findFirst()
                .ifPresent(matchingPropType -> {
                    matchingPropType.selected(true);

                    Value template = matchingPropType.template();
                    if (template == null) {
                        return;
                    }

                    // Build value list from binding pattern nodes
                    List<Value> valueList = new ArrayList<>();
                    SeparatedNodeList<BindingPatternNode> bindingPatterns = bindingPatternNode.bindingPatterns();

                    for (BindingPatternNode bindingNode : bindingPatterns) {
                        String bindingValue = bindingNode.toSourceCode().trim();

                        Value property = createPropertyFrom(template);
                        property.getTypes().stream()
                                .filter(pt -> pt.fieldType() == Value.FieldType.EXPRESSION)
                                .findFirst()
                                .ifPresent(pt -> pt.selected(true));
                        property.setValue(bindingValue);

                        valueList.add(property);
                    }

                    builder.value(valueList);
                });
    }

    public static void handleRestArguments(Value.ValueBuilder builder, List<Node> values,
                                           List<PropertyType> propertyTypes) {
        // Find and update the matching property type
        propertyTypes.stream()
                .filter(propType -> propType.fieldType().equals(Value.FieldType.REPEATABLE_LIST))
                .findFirst()
                .ifPresent(matchingPropType -> {
                    matchingPropType.selected(true);

                    Value template = matchingPropType.template();
                    if (template == null) {
                        return;
                    }

                    // Build value list from binding pattern nodes
                    List<Value> valueList = new ArrayList<>();
                    for (Node value : values) {
                        String expr = value.toSourceCode().trim();

                        Value property = createPropertyFrom(template);
                        property.getTypes().stream()
                                .filter(pt -> pt.fieldType() == Value.FieldType.EXPRESSION)
                                .findFirst()
                                .ifPresent(pt -> pt.selected(true));
                        property.setValue(expr);

                        valueList.add(property);
                    }
                    builder.value(valueList);
                });
    }

    private static void handleMapValue(TypeSymbol typeSymbol, ModuleInfo moduleInfo, Value.ValueBuilder builder,
                                       MappingBindingPatternNode bindingPatternNode,
                                       Optional<TypeSymbol> paramType, List<PropertyType> propertyTypes) {
        if (paramType.isEmpty()) {
            return;
        }

        TypeSymbol actualParamType = paramType.get();

        List<TypeSymbol> candidateMapTypes = new ArrayList<>();
        if (typeSymbol instanceof UnionTypeSymbol unionType) {
            unionType.memberTypeDescriptors().stream()
                    .filter(MapTypeSymbol.class::isInstance)
                    .forEach(candidateMapTypes::add);
        } else if (typeSymbol instanceof MapTypeSymbol) {
            candidateMapTypes.add(typeSymbol);
        }

        // Find the matching type symbol that is a subtype of the parameter type
        TypeSymbol matchingType = candidateMapTypes.stream()
                .filter(candidate -> candidate.subtypeOf(actualParamType))
                .findFirst()
                .orElse(null);

        if (matchingType == null) {
            return;
        }

        String ballerinaType = CommonUtils.getTypeSignature(typeSymbol, moduleInfo);

        // Find and update the matching property type
        propertyTypes.stream()
                .filter(propType -> propType.fieldType().equals(Value.FieldType.REPEATABLE_MAP)
                        && propType.ballerinaType().equals(ballerinaType))
                .findFirst()
                .ifPresent(matchingPropType -> {
                    matchingPropType.selected(true);

                    Value template = matchingPropType.template();
                    if (template == null) {
                        return;
                    }

                    // Build value map from binding pattern nodes
                    Map<String, Value> valueMap = new LinkedHashMap<>();
                    SeparatedNodeList<BindingPatternNode> fieldBindings = bindingPatternNode.fieldBindingPatterns();

                    for (BindingPatternNode bindingNode : fieldBindings) {
                        if (bindingNode instanceof FieldBindingPatternFullNode fieldBinding) {
                            String fieldKey = fieldBinding.variableName().name().text().trim();
                            String fieldValue = fieldBinding.bindingPattern().toSourceCode().trim();

                            Value property = createPropertyFrom(template);
                            property.getTypes().stream()
                                    .filter(pt -> pt.fieldType() == Value.FieldType.EXPRESSION)
                                    .findFirst()
                                    .ifPresent(pt -> pt.selected(true));
                            property.setValue(fieldValue);

                            valueMap.put(fieldKey, property);
                        }
                    }

                    builder.value(valueMap);
                });
    }

    /**
     * Creates a new property builder based on an existing property template.
     * This method copies all type information from the template property to create
     * a new builder instance that can be further customized.
     *
     * @param template the property to use as a template
     * @return a new Builder instance with copied type information
     */
    public static Value createPropertyFrom(Value template) {
        Value.ValueBuilder builder = new Value.ValueBuilder();

        if (template.getTypes() != null) {
            List<PropertyType> propertyTypes = new ArrayList<>();
            for (PropertyType type : template.getTypes()) {
                PropertyType propertyType = new PropertyType.Builder()
                        .fieldType(type.fieldType())
                        .ballerinaType(type.ballerinaType())
                        .template(type.template())
                        .options(type.options())
                        .typeMembers(type.typeMembers())
                        .build();
                propertyTypes.add(propertyType);
            }
            builder.types(propertyTypes);
        }

        return builder.build();
    }

    private static boolean handleRecordValue(Node value, SemanticModel semanticModel, Value.ValueBuilder valueBuilder,
                                             Optional<TypeSymbol> paramType, List<PropertyType> propertyTypes) {
        if (!(paramType.isPresent() && CommonUtil.getRawType(paramType.get()).typeKind() == TypeDescKind.RECORD)) {
            return false;
        }
        propertyTypes.stream()
                .filter(propType -> propType.fieldType() == Value.FieldType.RECORD_MAP_EXPRESSION)
                .findFirst()
                .ifPresent(propType -> {
                    propType.selected(true);
                    if (propType.fieldType() == Value.FieldType.RECORD_MAP_EXPRESSION) {
                        String selectedType = getSelectedType(value, semanticModel, valueBuilder);
                        if (selectedType != null) {
                            propType.typeMembers().stream().filter(typeMember ->
                                    typeMember.type().equals(selectedType)).forEach(t -> t.selected(true));
                        }
                    }
                });
        return true;
    }

    private static String getSelectedType(Node value, SemanticModel semanticModel, Value.ValueBuilder builder) {
        if (value != null) {
            builder.value(value.toSourceCode().strip());
            Optional<TypeSymbol> paramType = semanticModel.typeOf(value);
            if (paramType.isPresent()) {
                if (paramType.get().getModule().isPresent()) {
                    ModuleID id = paramType.get().getModule().get().id();
                    return CommonUtils.getTypeSignature(paramType.get(), ModuleInfo.from(id));
                } else {
                    return CommonUtils.getTypeSignature(paramType.get(), null);
                }
            }
        }
        return null;
    }

    public Value.FieldType fieldType() {
        return fieldType;
    }

    public String ballerinaType() {
        return ballerinaType;
    }

    public List<Option> options() {
        return options;
    }

    public List<PropertyTypeMemberInfo> typeMembers() {
        return typeMembers;
    }

    public boolean selected() {
        return selected;
    }

    public void selected(boolean selected) {
        this.selected = selected;
    }

    public Integer minItems() {
        return minItems;
    }

    public Integer defaultItems() {
        return defaultItems;
    }

    public String pattern() {
        return pattern;
    }

    public String patternErrorMessage() {
        return patternErrorMessage;
    }

    public List<ValidationRule> validations() {
        return validations;
    }

    public void setValidations(List<ValidationRule> validations) {
        this.validations = validations;
    }

    public Value template() {
        return template;
    }

    public static class Builder {
        private Value.FieldType fieldType;
        private String ballerinaType;
        private List<Option> options;
        private List<PropertyTypeMemberInfo> typeMembers;
        private Value template;
        private boolean selected = false;
        private Integer minItems;
        private Integer defaultItems;
        private String pattern;
        private String patternErrorMessage;
        private List<ValidationRule> validations;

        public Builder() {
        }

        public Builder fieldType(Value.FieldType fieldType) {
            this.fieldType = fieldType;
            return this;
        }

        public Builder ballerinaType(String ballerinaType) {
            this.ballerinaType = ballerinaType;
            return this;
        }

        public Builder options(List<Option> options) {
            this.options = options;
            return this;
        }

        public Builder typeMembers(List<PropertyTypeMemberInfo> typeMembers) {
            this.typeMembers = typeMembers;
            return this;
        }

        public Builder setTypeMembers(List<ParameterMemberTypeData> typeMembers) {
            this.typeMembers = typeMembers.stream().map(memberType -> new PropertyTypeMemberInfo(memberType.type(),
                    memberType.packageInfo(), memberType.packageName(), memberType.kind(), false)).toList();
            return this;
        }

        public Builder setMembers(List<PropertyTypeMemberInfo> typeMembers) {
            this.typeMembers = typeMembers;
            return this;
        }

        public Builder selected(boolean selected) {
            this.selected = selected;
            return this;
        }

        public Builder minItems(Integer minItems) {
            this.minItems = minItems;
            return this;
        }

        public Builder defaultItems(Integer defaultItems) {
            this.defaultItems = defaultItems;
            return this;
        }

        public Builder pattern(String pattern) {
            this.pattern = pattern;
            return this;
        }

        public Builder patternErrorMessage(String patternErrorMessage) {
            this.patternErrorMessage = patternErrorMessage;
            return this;
        }

        public Builder template(Value template) {
            this.template = template;
            return this;
        }

        public Builder validations(List<ValidationRule> validations) {
            this.validations = validations;
            return this;
        }

        public PropertyType build() {
            PropertyType propertyType = new PropertyType(fieldType, ballerinaType, options, typeMembers, template,
                    selected, minItems, defaultItems, pattern, patternErrorMessage);
            propertyType.setValidations(validations);
            return propertyType;
        }
    }

    /**
     * Deserialize a list of PropertyType from a JSON string.
     *
     * @param jsonString the JSON string representing the list of PropertyType
     * @return the list of PropertyType objects
     */
    public static List<PropertyType> deserializeTypes(String jsonString) {
        JsonElement jsonElement = JsonParser.parseString(jsonString);
        Gson gson = new Gson();
        if (jsonElement.isJsonArray()) {
            JsonArray jsonArray = jsonElement.getAsJsonArray();
            Type listType = new TypeToken<List<PropertyType>>() { }.getType();
            return gson.fromJson(jsonArray, listType);
        }
        return new ArrayList<>();
    }

    public static class FieldTypeSerializer implements JsonSerializer<Value.FieldType> {
        @Override
        public JsonElement serialize(Value.FieldType src, Type typeOfSrc, JsonSerializationContext context) {
            return new JsonPrimitive(src.name());
        }
    }
}
