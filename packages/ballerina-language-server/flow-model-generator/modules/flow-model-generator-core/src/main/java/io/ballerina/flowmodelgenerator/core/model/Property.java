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

package io.ballerina.flowmodelgenerator.core.model;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.reflect.TypeToken;
import io.ballerina.compiler.api.ModuleID;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.ArrayTypeSymbol;
import io.ballerina.compiler.api.symbols.MapTypeSymbol;
import io.ballerina.compiler.api.symbols.TypeDescKind;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.api.symbols.UnionTypeSymbol;
import io.ballerina.compiler.syntax.tree.BindingPatternNode;
import io.ballerina.compiler.syntax.tree.ExpressionNode;
import io.ballerina.compiler.syntax.tree.FieldBindingPatternFullNode;
import io.ballerina.compiler.syntax.tree.ListBindingPatternNode;
import io.ballerina.compiler.syntax.tree.ListConstructorExpressionNode;
import io.ballerina.compiler.syntax.tree.MappingBindingPatternNode;
import io.ballerina.compiler.syntax.tree.MappingConstructorExpressionNode;
import io.ballerina.compiler.syntax.tree.MappingFieldNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.SeparatedNodeList;
import io.ballerina.compiler.syntax.tree.SpecificFieldNode;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.compiler.syntax.tree.WaitFieldNode;
import io.ballerina.flowmodelgenerator.core.DiagnosticHandler;
import io.ballerina.flowmodelgenerator.core.TypeParameterReplacer;
import io.ballerina.flowmodelgenerator.core.model.node.WaitBuilder;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.ModuleAliasResolver;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.ParameterMemberTypeData;
import org.ballerinalang.langserver.common.utils.CommonUtil;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

/**
 * Represents an expression in the flow model.
 *
 * @param metadata      metadata of the property
 * @param types         acceptable value types of the property
 * @param value         value of the property
 * @param oldValue      old value of the property (before modification)
 * @param placeholder   placeholder value of the property
 * @param defaultValue  default value of the property
 * @param optional      whether the property can be left empty
 * @param editable      whether the property is not readonly
 * @param advanced      whether the property should be shown in the advanced tab
 * @param hidden        whether the property should be hidden
 * @param modified      Whether the property is modified in the UI.
 * @param diagnostics   diagnostics of the property
 * @param codedata      codedata of the property
 * @param advancedValue advanced value of the property
 * @param imports       import statements of the dependent types in the format prefix -> moduleId
 * @param comment           leading and trailing comments of the property
 * @param dynamicFormFields maps dropdown option values to their conditional sub-fields keyed by property name
 *                          (for DropdownChoiceForm)
 * @param itemOptions       dropdown item options for DROPDOWN_CHOICE fields (id, content, value)
 * @since 1.0.0
 */
public record Property(Metadata metadata, List<PropertyType> types, Object value, Object oldValue,
                       String placeholder, boolean optional, boolean editable, boolean advanced, boolean hidden,
                       Boolean modified, Diagnostics diagnostics, PropertyCodedata codedata, Object advancedValue,
                       Map<String, String> imports, String defaultValue, CommentProperty comment,
                       Map<String, Map<String, Property>> dynamicFormFields, List<ItemOption> itemOptions) {

    private static final Gson gson = new GsonBuilder().setPrettyPrinting().disableHtmlEscaping().create();

    public static final TypeToken<List<Property>> PROPERTY_LIST_TYPE_TOKEN = new TypeToken<>() {
    };
    public static final TypeToken<List<PropertyType>> PROPERTY_TYPE_LIST_TYPE_TOKEN = new TypeToken<>() {
    };
    public static final String SQL_PARAMETERIZED_QUERY = "sql:ParameterizedQuery";
    public static final String SQL_CALL_QUERY = "sql:ParameterizedCallQuery";

    @SuppressWarnings("unchecked")
    public <T> T valueAsType(TypeToken<T> typeToken) {
        if (value instanceof List) {
            return gson.fromJson(gson.toJson(value), typeToken.getType());
        }
        return (T) value;
    }

    public static final String VARIABLE_KEY = "variable";
    public static final String VARIABLE_NAME = "Variable Name";
    public static final String VARIABLE_DOC = "Name of the variable";
    public static final String PARAMETER_VARIABLE_DOC = "Name of the parameter";
    public static final String IMPLICIT_VARIABLE_LABEL = "Name";
    public static final String ARGUMENT_LABEL = "Argument";
    public static final String ARGUMENT_DOC = "Value to be passed";

    public static final String RESULT_NAME = "Result";
    public static final String RESULT_DOC = "Name of the result variable";

    public static final String WORKER_NAME = "Worker Name";
    public static final String WORKER_DOC = "Name of the worker";

    public static final String NAME_KEY = "name";
    public static final String DESCRIPTION_KEY = "description";
    public static final String FUNCTION_NAME_DESCRIPTION_KEY = "functionNameDescription";
    public static final String PARAMETER_DESCRIPTION_KEY = "parameterDescription";
    public static final String RETURN_DESCRIPTION_KEY = "typeDescription";
    public static final String IS_ARRAY_KEY = "isArray";
    public static final String ARRAY_SIZE = "arraySize";

    public static final String IS_PUBLIC_KEY = "isPublic";
    public static final String IS_PUBLIC_LABEL = "public";
    public static final String IS_PUBLIC_DOC = "Make visible across the project";

    public static final String IS_PRIVATE_KEY = "isPrivate";
    public static final String IS_PRIVATE_LABEL = "private";
    public static final String IS_PRIVATE_DOC = "Is this private";

    public static final String IS_ISOLATED_KEY = "isIsolated";
    public static final String IS_ISOLATED_LABEL = "isolated";
    public static final String IS_ISOLATED_DOC = "Is this isolated";

    public static final String IS_READ_ONLY_KEY = "isReadOnly";
    public static final String IS_READ_ONLY_LABEL = "readonly";
    public static final String IS_READ_ONLY_DOC = "Is this readonly";

    public static final String IS_DISTINCT_KEY = "isDistinct";
    public static final String IS_DISTINCT_LABEL = "distinct";
    public static final String IS_DISTINCT_DOC = "Is this distinct";

    public static final String NETWORK_QUALIFIER_KEY = "networkQualifier";
    public static final String NETWORK_QUALIFIER_LABEL = "Network Qualifier";
    public static final String NETWORK_QUALIFIER_DOC = "Network qualifier";

    public static final String TYPE_KEY = "type";
    public static final String TYPE_LABEL = "Variable Type";
    public static final String RESULT_TYPE_LABEL = "Result Type";
    public static final String PARAMETER_TYPE_DOC = "Type of the parameter";
    public static final String IMPLICIT_TYPE_LABEL = "Type";
    public static final String DESCRIPTION_LABEL = "Description";
    public static final String RETURN_DESCRIPTION_LABEL = "Description";
    public static final String DESCRIPTION_TYPE_DOC = "Description of the function";
    public static final String RETURN_DESCRIPTION_TYPE_DOC = "Description of the return value";
    public static final String PARAMETER_DESCRIPTION_TYPE_DOC = "Description of the parameter";

    public static final String TYPE_DOC = "Type of the variable";

    public static final String TYPE_NAME_LABEL = "Type name";
    public static final String TYPE_NAME_DOC = "Unique name to identify the type";
    public static final String TYPE_DESC_LABEL = "Type description";
    public static final String TYPE_DESC_DOC = "Detailed description about the type";
    public static final String TYPE_IS_ARRAY_LABEL = "Is array type";
    public static final String TYPE_IS_ARRAY_DOC = "Is this type an array or list value";
    public static final String TYPE_ARRAY_SIZE_LABEL = "Size of the array";
    public static final String TYPE_ARRAY_SIZE_DOC = "Array dimensions";

    public static final String QUALIFIERS_KEY = "qualifiers";
    public static final String TYPE_QUALIFIERS_LABEL = "Type Qualifiers";
    public static final String TYPE_QUALIFIERS_DOC = "Qualifiers of the type";

    public static final String RETURN_TYPE_LABEL = "Return Type";
    public static final String RETURN_TYPE_DOC = "Type of the return value";

    public static final String EXPRESSION_KEY = "expression";
    public static final String EXPRESSION_LABEL = "Expression";
    public static final String EXPRESSION_DOC = "Expression";

    public static final String CONDITION_KEY = "condition";
    public static final String CONDITION_LABEL = "Condition";
    public static final String CONDITION_DOC = "Boolean Condition";

    public static final String MATCH_TARGET_KEY = "matchTarget";
    public static final String MATCH_TARGET_LABEL = "Target";
    public static final String MATCH_TARGET_DOC = "Match target expression";

    public static final String IGNORE_KEY = "ignore";
    public static final String IGNORE_LABEL = "Ignore";
    public static final String IGNORE_DOC = "Ignore the error value";

    public static final String ON_ERROR_VARIABLE_KEY = "errorVariable";
    public static final String ON_ERROR_VARIABLE_LABEL = "Error Variable";
    public static final String ON_ERROR_VARIABLE_DOC = "Name of the error variable";

    public static final String ON_ERROR_TYPE_KEY = "errorType";
    public static final String ON_ERROR_TYPE_LABEL = "Error Type";
    public static final String ON_ERROR_TYPE_DOC = "Type of the error";

    public static final String COLLECTION_KEY = "collection";
    public static final String COLLECTION_LABEL = "Collection";
    public static final String COLLECTION_DOC = "Collection to iterate";

    public static final String CHECK_ERROR_KEY = "checkError";
    public static final String CHECK_ERROR_LABEL = "Check Error";
    public static final String CHECK_ERROR_DOC = "Trigger error flow";

    public static final String SCOPE_KEY = "scope";
    public static final String SCOPE_LABEL = "Connection Scope";
    public static final String SCOPE_DOC = "Scope of the connection, Global or Local";
    public static final String GLOBAL_SCOPE = "Global";
    public static final String SERVICE_SCOPE = "Service";
    public static final String SERVICE_INIT_SCOPE = "ServiceInit";
    public static final String OBJECT_SCOPE = "Object";
    public static final String LOCAL_SCOPE = "Local";
    public static final String CONNECTION_KEY = "connection";
    public static final String CONNECTION_LABEL = "Connection";
    public static final String CONNECTION_DOC = "Connection to use";
    public static final String METHOD_EXPRESSION_LABEL = "Object";
    public static final String METHOD_EXPRESSION_DOC = "The object which you want to call the method on";

    public static final String RESOURCE_PATH_KEY = "resourcePath";
    public static final String RESOURCE_PATH_LABEL = "Resource Path";
    public static final String RESOURCE_PATH_DOC = "Resource Path";

    public static final String COMMENT_KEY = "comment";
    public static final String COMMENT_LABEL = "Comment";
    public static final String COMMENT_DOC = "Comment to describe the flow";

    public static final String PATTERNS_KEY = "patterns";
    public static final String PATTERNS_LABEL = "Patterns";
    public static final String PATTERNS_DOC = "List of binding patterns";
    public static final String PATTERN_LABEL = "Pattern";
    public static final String PATTERN_DOC = "Binding pattern";

    public static final String GUARD_KEY = "guard";
    public static final String GUARD_DOC = "Guard expression";

    public static final String RETRY_COUNT_KEY = "retryCount";
    public static final String RETRY_COUNT_LABEL = "Retry Count";
    public static final String RETRY_COUNT_DOC = "Number of retries";

    public static final String DEFAULT_VALUE_KEY = "defaultValue";
    public static final String DEFAULT_VALUE_LABEL = "Default Value";
    public static final String DEFAULT_VALUE_DOC = "Default value of the variable";

    public static final String CONFIG_VALUE_KEY = "configValue";
    public static final String CONFIG_VALUE_LABEL = "Config Value";
    public static final String CONFIG_VALUE_DOC = "Config value of the variable, to be used in Config.toml";

    public static final String TEST_CONFIG_VALUE_KEY = "testConfigValue";
    public static final String TEST_CONFIG_VALUE_LABEL = "Test Config Value";
    public static final String TEST_CONFIG_VALUE_DOC =
            "Config value of the variable for tests, to be used in tests/Config.toml";

    public static final String CONFIG_VAR_DOC_KEY = "documentation";
    public static final String CONFIG_VAR_DOC_LABEL = "Documentation";
    public static final String CONFIG_VAR_DOC_DOC = "Variable documentation in Markdown format";

    public static final String PARAMETER_LABEL = "Parameter";
    public static final String PARAMETER_DOC = "Function parameter";

    public static final String FUNCTION_NAME_KEY = "functionName";
    public static final String ANNOTATIONS_KEY = "annotations";
    public static final String PARAMETERS_KEY = "parameters";

    public static final String ADVANCED_PARAM_KEY = "advanced";

    public static final Set<String> RESERVED_PROPERTY_KEYS = Set.of(VARIABLE_KEY, NAME_KEY, TYPE_KEY,
            DESCRIPTION_KEY, IS_ARRAY_KEY, IS_PUBLIC_KEY, IS_PRIVATE_KEY, IS_ISOLATED_KEY, IS_READ_ONLY_KEY,
            IS_DISTINCT_KEY, NETWORK_QUALIFIER_KEY, QUALIFIERS_KEY, EXPRESSION_KEY,
            CONDITION_KEY, IGNORE_KEY, ON_ERROR_VARIABLE_KEY, ON_ERROR_TYPE_KEY, COLLECTION_KEY,
            CHECK_ERROR_KEY, SCOPE_KEY, CONNECTION_KEY, RESOURCE_PATH_KEY, COMMENT_KEY,
            PATTERNS_KEY, GUARD_KEY, RETRY_COUNT_KEY);

    public String toSourceCode() {
        if (value == null || value.toString().isEmpty()) {
            return placeholder == null ? "" : placeholder;
        }

        if (value instanceof Map<?, ?> valueMap) {
            return buildMapSourceCode(valueMap);
        } else if (value instanceof List<?> valueList) {
            return buildListSourceCode(valueList);
        }

        return CommonUtils.extractLiteralFromStringTemplate(value.toString());
    }

    private static String buildMapSourceCode(Map<?, ?> valueMap) {
        if (valueMap.isEmpty()) {
            return "";
        }

        List<String> keyValuePairs = new ArrayList<>();
        valueMap.forEach((keyObj, valueObj) -> {
            String key = (String) keyObj;
            String propertyValue = convertToProperty(valueObj).toSourceCode();
            if (!propertyValue.isEmpty()) {
                keyValuePairs.add(key + ": " + propertyValue);
            }
        });

        return keyValuePairs.isEmpty() ? "" : "{%s}".formatted(String.join(", ", keyValuePairs));
    }

    public static Property convertToProperty(Object propObj) {
        Property.Builder<Object> builder = new Property.Builder<>(null);
        if (propObj instanceof Map<?, ?> propMap) {
            builder.value(propMap.get("value"));
        }
        return builder.build();
    }

    private static String buildListSourceCode(List<?> valueList) {
        if (valueList.isEmpty()) {
            return "[]";
        }

        List<String> stringValues = valueList.stream()
                .filter(Map.class::isInstance)
                .map(Map.class::cast)
                .map(val -> new Property.Builder<>(null).value(val.get("value")).build().toSourceCode())
                .toList();

        return stringValues.isEmpty() ? "[]" : "[%s]".formatted(String.join(", ", stringValues));
    }

    // Enum for backward compatibility
    public enum ValueType {
        EXPRESSION,
        FLAG,
        SINGLE_SELECT,
        MULTI_SELECT,
        MULTIPLE_SELECT,
        FIXED_PROPERTY,
        REPEATABLE_PROPERTY,
        RAW_TEMPLATE,
        REPEATABLE_LIST,
        REPEATABLE_MAP,
        MAPPING_EXPRESSION_SET,
        EXPRESSION_SET,
        MAPPING_EXPRESSION,
        TEXT_SET,
        LV_EXPRESSION,
        ACTION_PATH,
        ACTION_OR_EXPRESSION,
        IDENTIFIER,
        TEXT,
        DOC_TEXT,
        TYPE,
        ENUM,
        VIEW,
        NUMBER,
        ACTION_TYPE,
        DATA_MAPPING_EXPRESSION,
        RECORD_MAP_EXPRESSION,
        PROMPT,
        CLAUSE_EXPRESSION,
        SQL_QUERY,
        /**
         * A property type that renders a record field selector in the UI. Properties of this type carry a
         * {@link RecordSelectorType} model so the client can display a tree of record fields for the user
         * to choose from, generating a typed subset record on save.
         */
        RECORD_FIELD_SELECTOR,
        ADVANCE_PARAM_LIST,
        DROPDOWN_CHOICE,
        /**
         * A property type that renders a connection picker in the UI. The compatible
         * connection kinds are advertised through {@link PropertyCodedata#searchNodesKind()}.
         * The property value carries the picked connection variable name, or
         * {@code "NEW_CONNECTION"} when the user has not yet picked one (which the UI
         * surfaces as a shortcut to create a new connection).
         */
        CONNECTION
    }

    public static class Builder<T> extends FacetedBuilder<T> implements DiagnosticHandler.DiagnosticCapable {

        /**
         * Guards against infinite recursion when expanding self-referential union types
         * (e.g., {@code ai:Cloneable = Cloneable[]|map<Cloneable>|...}).
         * Tracks the fully-qualified type signatures currently being expanded on each thread.
         */
        private static final ThreadLocal<Set<String>> TYPE_EXPANSION_VISITED =
                ThreadLocal.withInitial(HashSet::new);

        private List<PropertyType> types = new ArrayList<>();
        private Object value;
        private Object oldValue;
        private String placeholder;
        private boolean optional;
        private boolean editable;
        private boolean advanced;
        private boolean hidden;
        private Boolean modified;
        private Metadata.Builder<Builder<T>> metadataBuilder;
        private Diagnostics.Builder<Builder<T>> diagnosticsBuilder;
        private PropertyCodedata.Builder<Builder<T>> codedataBuilder;
        private Object advancedValue;
        private Map<String, String> imports;
        private String defaultValue;
        private CommentProperty commentProperty;
        private Map<String, Map<String, Property>> dynamicFormFields;
        private List<ItemOption> itemOptions;

        /**
         * Creates a builder pre-populated with all fields from an existing property.
         * Use this instead of constructing a {@code new Property(...)} manually when only a subset
         * of fields needs to be changed — avoids fragile positional {@code null} arguments when
         * the record gains new components.
         *
         * @param original the property to copy all fields from
         * @return a new {@code Builder<Object>} initialised from {@code original}
         */
        public static Builder<Object> copyFrom(Property original) {
            Builder<Object> builder = new Builder<>(null);
            if (original.types() != null) {
                // Deep-copy each PropertyType so that mutating `selected` on the copy
                // does not alias back to the original's type entries.
                for (PropertyType t : original.types()) {
                    builder.types.add(new PropertyType(t.fieldType(), t.ballerinaType(), t.scope(),
                            t.options(), t.template(), t.typeMembers(), t.recordSelectorType(), t.selected()));
                }
            }
            builder.value = original.value();
            builder.oldValue = original.oldValue();
            builder.placeholder = original.placeholder();
            builder.optional = original.optional();
            builder.editable = original.editable();
            builder.advanced = original.advanced();
            builder.hidden = original.hidden();
            builder.modified = original.modified();
            builder.advancedValue = original.advancedValue();
            builder.imports = original.imports() != null ? new HashMap<>(original.imports()) : null;
            builder.defaultValue = original.defaultValue();
            builder.commentProperty = original.comment();
            if (original.dynamicFormFields() != null) {
                builder.dynamicFormFields = new LinkedHashMap<>();
                for (Map.Entry<String, Map<String, Property>> e : original.dynamicFormFields().entrySet()) {
                    builder.dynamicFormFields.put(e.getKey(), new LinkedHashMap<>(e.getValue()));
                }
            } else {
                builder.dynamicFormFields = null;
            }
            builder.itemOptions = original.itemOptions() != null
                    ? new ArrayList<>(original.itemOptions()) : null;
            if (original.metadata() != null) {
                builder.metadataBuilder = new Metadata.Builder<>(builder);
                builder.metadataBuilder.label(original.metadata().label())
                        .description(original.metadata().description())
                        .keywords(original.metadata().keywords())
                        .icon(original.metadata().icon())
                        .functionKind(original.metadata().functionKind())
                        .data(original.metadata().data())
                        .connectors(original.metadata().connectors());
            }
            if (original.diagnostics() != null) {
                builder.diagnosticsBuilder = new Diagnostics.Builder<>(builder);
                if (original.diagnostics().diagnostics() != null) {
                    builder.diagnosticsBuilder.diagnostics(original.diagnostics().diagnostics());
                }
            }
            if (original.codedata() != null) {
                builder.codedataBuilder = new PropertyCodedata.Builder<>(builder);
                builder.codedataBuilder.copyFrom(original.codedata());
            }
            return builder;
        }

        public Builder(T parentBuilder) {
            super(parentBuilder);
        }

        public Builder<T> value(Object value) {
            this.value = value;
            return this;
        }

        public Builder<T> oldValue(Object oldValue) {
            this.oldValue = oldValue;
            return this;
        }

        public Builder<T> advancedValue(Object advancedValue) {
            this.advancedValue = advancedValue;
            return this;
        }

        public Builder<T> optional(boolean optional) {
            this.optional = optional;
            return this;
        }

        public Builder<T> defaultable(boolean defaultable) {
            this.optional = defaultable;
            this.advanced = defaultable;
            return this;
        }

        public Builder<T> advanced(boolean advanced) {
            this.advanced = advanced;
            return this;
        }

        public Builder<T> modified(Boolean modified) {
            this.modified = modified;
            return this;
        }

        public Builder<T> editable() {
            this.editable = true;
            return this;
        }

        public Builder<T> editable(boolean editable) {
            this.editable = editable;
            return this;
        }

        public Builder<T> placeholder(String placeholder) {
            this.placeholder = placeholder;
            return this;
        }

        public Builder<T> hidden(boolean hidden) {
            this.hidden = hidden;
            return this;
        }

        public Builder<T> hidden() {
            this.hidden = true;
            return this;
        }

        public Metadata.Builder<Builder<T>> metadata() {
            if (this.metadataBuilder == null) {
                this.metadataBuilder = new Metadata.Builder<>(this);
            }
            return this.metadataBuilder;
        }

        // TODO: Need to improve the index to obtain this structured information
        /**
         * Records the modules this property's type text names, keyed by the qualifier the text uses.
         * <p>
         * The key comes from the encoded statement when it carries one, since a qualifier is not derivable from a
         * module name — two modules ending in the same dot-segment share a natural one, and only the renderer knows
         * which of them got it. See {@link CommonUtils#parseImportStatements}.
         * </p>
         */
        public Builder<T> imports(String importStatements) {
            Map<String, String> parsed = CommonUtils.parseImportStatements(importStatements);
            if (parsed.isEmpty()) {
                return this;
            }
            if (this.imports == null) {
                this.imports = new LinkedHashMap<>();
            }
            for (Map.Entry<String, String> entry : parsed.entrySet()) {
                String existing = this.imports.get(entry.getKey());
                // A module already recorded under another key keeps that key: the first spelling wins, and the
                // later one is a duplicate of a module already carried.
                if (Objects.equals(existing, entry.getValue()) || this.imports.containsValue(entry.getValue())) {
                    continue;
                }
                // A key already standing for a different module gets a free one rather than displacing it, which
                // would drop that module's import. Allocated from the module name, not the key, so the alias is
                // the one TypeQualifierAllocator and ModulePrefixContext would pick for the same module.
                this.imports.put(existing == null ? entry.getKey()
                        : ModuleAliasResolver.allocatePrefix(moduleNameOf(entry.getValue()), this.imports.keySet()),
                        entry.getValue());
            }
            return this;
        }

        /** The bare module name of an {@code org/module[:version]} entry, which is what an alias is derived from. */
        private static String moduleNameOf(String importSignature) {
            String withoutVersion = importSignature.split(":")[0];
            int slash = withoutVersion.indexOf('/');
            return slash < 0 ? withoutVersion : withoutVersion.substring(slash + 1);
        }

        public PropertyCodedata.Builder<Builder<T>> codedata() {
            if (this.codedataBuilder == null) {
                this.codedataBuilder = new PropertyCodedata.Builder<>(this);
            }
            return this.codedataBuilder;
        }

        @Override
        public Diagnostics.Builder<Builder<T>> diagnostics() {
            if (this.diagnosticsBuilder == null) {
                this.diagnosticsBuilder = new Diagnostics.Builder<>(this);
            }
            return this.diagnosticsBuilder;
        }

        public Builder<T> defaultValue(String defaultValue) {
            this.defaultValue = defaultValue;
            return this;
        }

        public Builder<T> comment(CommentProperty comment) {
            this.commentProperty = comment;
            return this;
        }

        public Builder<T> dynamicFormFields(Map<String, Map<String, Property>> dynamicFormFields) {
            this.dynamicFormFields = dynamicFormFields;
            return this;
        }

        public Builder<T> itemOptions(List<ItemOption> itemOptions) {
            this.itemOptions = itemOptions;
            return this;
        }

        /**
         * Discards all previously accumulated type entries so the caller can add
         * a fresh set of types (e.g. to replace EXPRESSION with SINGLE_SELECT).
         */
        public Builder<T> clearTypes() {
            this.types.clear();
            return this;
        }

        public class TypeBuilder {

            private Property.ValueType fieldType;
            private String ballerinaType;
            private String scope;
            private List<Option> options;
            private Property template;
            private List<PropertyTypeMemberInfo> typeMembers;
            private RecordSelectorType recordSelectorType;
            private boolean selected = false;

            private TypeBuilder() {
            }

            public TypeBuilder fieldType(Property.ValueType fieldType) {
                this.fieldType = fieldType;
                return this;
            }

            public TypeBuilder ballerinaType(String ballerinaType) {
                this.ballerinaType = TypeParameterReplacer.replaceTypeParameters(ballerinaType);
                return this;
            }

            public TypeBuilder ballerinaType(TypeSymbol typeSymbol) {
                this.ballerinaType = CommonUtils.getTypeSignature(null, typeSymbol, false);
                return this;
            }

            public TypeBuilder scope(String scope) {
                this.scope = scope;
                return this;
            }

            public TypeBuilder options(List<Option> options) {
                this.options = options;
                return this;
            }

            public TypeBuilder options(Option... options) {
                this.options = List.of(options);
                return this;
            }

            public TypeBuilder template(Property template) {
                this.template = template;
                return this;
            }

            public TypeBuilder typeMembers(List<PropertyTypeMemberInfo> typeMembers) {
                this.typeMembers = typeMembers;
                return this;
            }

            public TypeBuilder setTypeMembers(List<ParameterMemberTypeData> memberTypeData) {
                this.typeMembers = memberTypeData.stream().map(m -> new PropertyTypeMemberInfo(m.type(),
                        m.packageInfo(), m.packageName(), m.kind(), false)).toList();
                return this;
            }

            public TypeBuilder selected(boolean selected) {
                this.selected = selected;
                return this;
            }

            public TypeBuilder recordSelectorType(RecordSelectorType recordSelectorType) {
                this.recordSelectorType = recordSelectorType;
                return this;
            }

            public Builder<T> stepOut() {
                if (fieldType != null) {
                    Builder.this.types.add(new PropertyType(fieldType, ballerinaType, scope, options, template,
                            typeMembers, recordSelectorType, selected));
                }
                reset();
                return Builder.this;
            }

            private void reset() {
                fieldType = null;
                ballerinaType = null;
                scope = null;
                options = null;
                template = null;
                typeMembers = null;
                recordSelectorType = null;
                selected = false;
            }
        }

        public TypeBuilder type() {
            return new TypeBuilder();
        }

        public Builder<T> type(Property.ValueType valueType) {
            type().fieldType(valueType).stepOut();
            return this;
        }

        public Builder<T> type(Property.ValueType valueType, String ballerinaType) {
            type().fieldType(valueType).ballerinaType(ballerinaType).stepOut();
            return this;
        }

        public Builder<T> typeWithScope(ValueType valueType, String scope) {
            type().fieldType(valueType).scope(scope).stepOut();
            return this;
        }

        public Builder<T> typeWithOptions(Property.ValueType valueType, List<Option> options) {
            type().fieldType(valueType).options(options).stepOut();
            return this;
        }

        public Builder<T> typeWithTemplate(Property.ValueType valueType, Property template) {
            type().fieldType(valueType).template(template).stepOut();
            return this;
        }

        public Builder<T> typeWithExpression(TypeSymbol typeSymbol, ModuleInfo moduleInfo) {
            return typeWithExpression(typeSymbol, moduleInfo, null);
        }

        public Builder<T> typeWithExpression(TypeSymbol typeSymbol, ModuleInfo moduleInfo, String defaultValue) {
            return typeWithExpression(typeSymbol, moduleInfo, null, null, defaultValue, this, null);
        }

        public Builder<T> typeWithExpression(TypeSymbol typeSymbol, ModuleInfo moduleInfo,
                                             Node value, SemanticModel semanticModel,
                                             Property.Builder<?> builder) {
            return typeWithExpression(typeSymbol, moduleInfo, value, semanticModel, null, builder, null);
        }

        public Builder<T> typeWithExpression(TypeSymbol typeSymbol, ModuleInfo moduleInfo,
                                             Node value, SemanticModel semanticModel,
                                             Property.Builder<?> builder,
                                             DiagnosticHandler diagnosticHandler) {
            return typeWithExpression(typeSymbol, moduleInfo, value, semanticModel, null, builder,
                    diagnosticHandler);
        }

        public Builder<T> typeWithExpression(TypeSymbol typeSymbol, ModuleInfo moduleInfo,
                                             Node value, SemanticModel semanticModel, String defaultValue,
                                             Property.Builder<?> builder,
                                             DiagnosticHandler diagnosticHandler) {
            if (typeSymbol == null) {
                return this;
            }
            String ballerinaType = CommonUtils.getTypeSignature(typeSymbol, moduleInfo);

            // Handle the primitive input types
            boolean success = handlePrimitiveType(typeSymbol, ballerinaType, semanticModel, moduleInfo, builder);

            TypeSymbol rawType = CommonUtil.getRawType(typeSymbol);
            // Handle union of singleton types as single-select options
            if (!success && rawType instanceof UnionTypeSymbol unionTypeSymbol) {
                // Guard against infinite recursion for self-referential types such as
                // ai:Cloneable = Cloneable[]|map<Cloneable>|boolean|int|...
                // When this type is already being expanded on the current call stack.
                Set<String> visited = TYPE_EXPANSION_VISITED.get();
                if (visited.add(ballerinaType)) {
                    try {
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
                            // Reorder options so that the default value appears first
                            if (defaultValue != null && !defaultValue.isEmpty()) {
                                options = reorderOptionsByDefaultValue(options, defaultValue);
                            }
                            builder.type().fieldType(ValueType.SINGLE_SELECT).options(options).stepOut();
                        } else {
                            // Handle union of primitive types by defining an input type for each primitive type
                            for (TypeSymbol ts : typeSymbols) {
                                handlePrimitiveType(ts, CommonUtils.getTypeSignature(ts, moduleInfo), semanticModel,
                                        moduleInfo, builder);
                            }
                            // group by the fieldType
                            List<PropertyType> propTypes = builder.types;
                            propTypes.stream()
                                    .filter(pt -> !(pt.fieldType() == ValueType.REPEATABLE_LIST
                                            || pt.fieldType() == ValueType.REPEATABLE_MAP))
                                    .collect(java.util.stream.Collectors.groupingBy(PropertyType::fieldType))
                                    .forEach((fieldType, groupedTypes) -> {
                                        if (groupedTypes.size() > 1) {
                                            // merge the ballerina types
                                            String mergedBallerinaType = groupedTypes.stream()
                                                    .map(PropertyType::ballerinaType)
                                                    .distinct()
                                                    .reduce((a, b) -> a + "|" + b)
                                                    .orElse("");
                                            // find the index of the first grouped type to preserve order
                                            int insertIndex = builder.types.indexOf(groupedTypes.getFirst());
                                            // remove the existing types
                                            builder.types.removeIf(t -> t.fieldType() == fieldType);

                                            List<PropertyTypeMemberInfo> distinctMembers = null;
                                            if (fieldType == ValueType.RECORD_MAP_EXPRESSION) {
                                                distinctMembers = new ArrayList<>(groupedTypes.stream()
                                                        .filter(t -> t.typeMembers() != null)
                                                        .flatMap(t -> t.typeMembers().stream())
                                                        .distinct()
                                                        .toList());
                                            }

                                            // insert the merged type at the original position
                                            builder.types.add(insertIndex, new PropertyType(fieldType,
                                                    mergedBallerinaType, null, null,
                                                    null, distinctMembers, null, false));
                                        }
                                    });
                        }
                    } finally {
                        visited.remove(ballerinaType);
                    }
                }
            }

            // All the ballerina types will have a default to expression type
            builder.type().fieldType(ValueType.EXPRESSION)
                    .ballerinaType(ballerinaType)
                    .stepOut();

            // get value node kind
            // from the node kind map its belonging prop kind
            // filter the prop type list and set the selected flag to true
            if (value != null) {
                ValueType matchingValueType = findMatchingValueType(value);
                // if matching type is mapping_expression_set
                // need to check if it's a map or a record if its a map then need to set the matching type
                if (matchingValueType == ValueType.REPEATABLE_MAP) {
                    Optional<TypeSymbol> paramType = semanticModel.typeOf(value);
                    boolean hasRecordValue = handleRecordValue(value, semanticModel, builder, paramType);
                    if (!hasRecordValue) {
                        handleMapValue(typeSymbol, moduleInfo, builder, value, paramType,
                                diagnosticHandler);
                    }
                } else if (matchingValueType == ValueType.REPEATABLE_LIST) {
                    handleListValue(typeSymbol, moduleInfo, builder, value, semanticModel, diagnosticHandler);
                } else if (matchingValueType == ValueType.EXPRESSION) {
                    boolean foundMatch = false;
                    PropertyType expressionPropType = null;
                    for (PropertyType propType : builder.types) {
                        if (propType.fieldType() == ValueType.SINGLE_SELECT) {
                            String valueStr = value.toSourceCode().trim();
                            for (Option option : propType.options()) {
                                if (option.value().equals(valueStr)) {
                                    propType.selected(true);
                                    foundMatch = true;
                                    break;
                                }
                            }
                        }
                        if (propType.fieldType() == ValueType.EXPRESSION) {
                            expressionPropType = propType;
                        }
                    }
                    if (!foundMatch && expressionPropType != null) {
                        expressionPropType.selected(true);
                    }
                } else {
                    ValueType finalMatchingValueType = matchingValueType;
                    builder.types.stream()
                            .filter(propType -> propType.fieldType() == finalMatchingValueType)
                            .findFirst()
                            .ifPresent(propType -> propType.selected(true));
                    if (finalMatchingValueType.equals(ValueType.TEXT)) {
                        String valueStr = value.toSourceCode().strip();
                        builder.value(CommonUtils.unescapeContent(valueStr));
                    }
                }
            }
            return this;
        }

        private void handleListValue(TypeSymbol typeSymbol, ModuleInfo moduleInfo, Builder<?> builder,
                                    Node value, SemanticModel semanticModel,
                                    DiagnosticHandler diagnosticHandler) {
            // Determine list elements based on node type
            Iterable<? extends Node> elements;
            if (value instanceof ListBindingPatternNode bindingPatternNode) {
                elements = bindingPatternNode.bindingPatterns();
            } else if (value instanceof ListConstructorExpressionNode listCtrExprNode) {
                elements = listCtrExprNode.expressions();
            } else {
                return;
            }

            Optional<TypeSymbol> paramType = semanticModel.typeOf(value);

            // Collect candidate array type symbols
            List<TypeSymbol> candidateArrayTypes = new ArrayList<>();
            if (typeSymbol instanceof UnionTypeSymbol unionType) {
                unionType.memberTypeDescriptors().stream()
                        .filter(ArrayTypeSymbol.class::isInstance)
                        .forEach(candidateArrayTypes::add);
            } else if (typeSymbol instanceof ArrayTypeSymbol) {
                candidateArrayTypes.add(typeSymbol);
            }

            // Find the matching type symbol that is a subtype of the parameter type.
            // When the inferred type is unavailable or a compilation error, skip the subtype check
            // and use the declared type directly.
            if (paramType.isPresent()
                    && paramType.get().typeKind() != TypeDescKind.COMPILATION_ERROR) {
                TypeSymbol actualParamType = paramType.get();
                TypeSymbol matchingType = candidateArrayTypes.stream()
                        .filter(candidate -> candidate.subtypeOf(actualParamType))
                        .findFirst()
                        .orElse(null);
                if (matchingType == null) {
                    return;
                }
            } else if (candidateArrayTypes.isEmpty()) {
                return;
            }

            String ballerinaType = CommonUtils.getTypeSignature(typeSymbol, moduleInfo);

            // Find and update the matching property type
            builder.types.stream()
                    .filter(propType -> propType.fieldType().equals(ValueType.REPEATABLE_LIST)
                                     && propType.ballerinaType().equals(ballerinaType))
                    .findFirst()
                    .ifPresent(matchingPropType -> {
                        matchingPropType.selected(true);

                        Property template = matchingPropType.template();
                        if (template == null) {
                            return;
                        }

                        // Build value list from list elements
                        List<Property> valueList = new ArrayList<>();
                        for (Node elementNode : elements) {
                            String elementValue = elementNode.toSourceCode().trim();

                            Builder<Object> templateBuilder = createPropertyBuilderFrom(template);
                            templateBuilder.types.stream()
                                    .filter(pt -> pt.fieldType() == ValueType.EXPRESSION)
                                    .findFirst()
                                    .ifPresent(pt -> pt.selected(true));
                            templateBuilder.value(elementValue);
                            if (diagnosticHandler != null) {
                                diagnosticHandler.handle(templateBuilder, elementNode.lineRange(), true);
                            }

                            valueList.add(templateBuilder.build());
                        }

                        builder.value(valueList);
                    });
        }

        public void handleRestArguments(Builder<?> builder, List<Node> values,
                                        DiagnosticHandler diagnosticHandler) {
            // Find and update the matching property type
            builder.types.stream()
                    .filter(propType -> propType.fieldType().equals(ValueType.REPEATABLE_LIST))
                    .findFirst()
                    .ifPresent(matchingPropType -> {
                        matchingPropType.selected(true);

                        Property template = matchingPropType.template();
                        if (template == null) {
                            return;
                        }

                        // Build value list from binding pattern nodes
                        List<Property> valueList = new ArrayList<>();
                        for (Node value : values) {
                            String expr = value.toSourceCode().trim();

                            Builder<Object> templateBuilder = createPropertyBuilderFrom(template);
                            templateBuilder.types.stream()
                                    .filter(pt -> pt.fieldType() == ValueType.EXPRESSION)
                                    .findFirst()
                                    .ifPresent(pt -> pt.selected(true));
                            templateBuilder.value(expr);
                            // TODO: Handle per value diagnostics related to restArguments, includedRecordRestArgs etc.
                            //  in a single location
                            if (diagnosticHandler != null) {
                                diagnosticHandler.handle(templateBuilder, value.lineRange(), true);
                            }
                            valueList.add(templateBuilder.build());
                        }
                        builder.value(valueList);
                    });
        }

        public void handleIncludedRecordRestArgs(Builder<?> builder, List<LinkedHashMap<String, Node>> values,
                                                  DiagnosticHandler diagnosticHandler) {
            // Find and update the matching property type
            builder.types.stream()
                    .filter(propType -> propType.fieldType().equals(ValueType.REPEATABLE_MAP))
                    .findFirst()
                    .ifPresent(matchingPropType -> {
                        matchingPropType.selected(true);

                        Property template = matchingPropType.template();
                        if (template == null) {
                            return;
                        }

                        // Build value list from binding pattern nodes
                        Map<String, Property> valueMap = new LinkedHashMap<>();
                        for (LinkedHashMap<String, Node> arg : values) {
                            for (Map.Entry<String, Node> entry : arg.entrySet()) {
                                String fieldKey = entry.getKey();
                                Node fieldValueNode = entry.getValue();

                                Builder<Object> templateBuilder = createPropertyBuilderFrom(template);
                                templateBuilder.types.stream()
                                        .filter(pt -> pt.fieldType() == ValueType.EXPRESSION)
                                        .findFirst()
                                        .ifPresent(pt -> pt.selected(true));
                                templateBuilder.value(fieldValueNode.toSourceCode().trim());
                                if (diagnosticHandler != null) {
                                    diagnosticHandler.handle(templateBuilder, fieldValueNode.lineRange(), true);
                                }

                                valueMap.put(fieldKey, templateBuilder.build());
                                break; // Only process the first entry since we expect one entry per map
                            }
                        }

                        builder.value(valueMap);
                    });
        }

        private void handleMapValue(TypeSymbol typeSymbol, ModuleInfo moduleInfo, Builder<?> builder,
                                    Node value, Optional<TypeSymbol> paramType,
                                    DiagnosticHandler diagnosticHandler) {
            // Determine field entries based on node type
            if (!(value instanceof MappingBindingPatternNode)
                    && !(value instanceof MappingConstructorExpressionNode)) {
                return;
            }

            List<TypeSymbol> candidateMapTypes = new ArrayList<>();
            if (typeSymbol instanceof UnionTypeSymbol unionType) {
                unionType.memberTypeDescriptors().stream()
                        .filter(MapTypeSymbol.class::isInstance)
                        .forEach(candidateMapTypes::add);
            } else if (typeSymbol instanceof MapTypeSymbol) {
                candidateMapTypes.add(typeSymbol);
            }

            // Find the matching type symbol that is a subtype of the parameter type.
            // When the inferred type is unavailable or a compilation error, skip the subtype check
            // and use the declared type directly.
            TypeSymbol resolvedType = typeSymbol;
            if (paramType.isPresent()
                    && paramType.get().typeKind() != TypeDescKind.COMPILATION_ERROR) {
                TypeSymbol actualParamType = paramType.get();
                TypeSymbol matchingType = candidateMapTypes.stream()
                        .filter(candidate -> candidate.subtypeOf(actualParamType))
                        .findFirst()
                        .orElse(null);
                if (matchingType == null) {
                    return;
                }
                resolvedType = matchingType;
            } else if (candidateMapTypes.isEmpty()) {
                return;
            }

            String ballerinaType = CommonUtils.getTypeSignature(resolvedType, moduleInfo);

            // Find and update the matching property type
            builder.types.stream()
                    .filter(propType -> propType.fieldType().equals(ValueType.REPEATABLE_MAP)
                                     && propType.ballerinaType().equals(ballerinaType))
                    .findFirst()
                    .ifPresent(matchingPropType -> {
                        matchingPropType.selected(true);

                        Property template = matchingPropType.template();
                        if (template == null) {
                            return;
                        }

                        // Build value map from field entries
                        Map<String, Property> valueMap = new LinkedHashMap<>();

                        if (value instanceof MappingBindingPatternNode bindingPatternNode) {
                            SeparatedNodeList<BindingPatternNode> fieldBindings =
                                    bindingPatternNode.fieldBindingPatterns();
                            for (BindingPatternNode bindingNode : fieldBindings) {
                                if (bindingNode instanceof FieldBindingPatternFullNode fieldBinding) {
                                    String fieldKey = fieldBinding.variableName().name().text().trim();
                                    String fieldValue = fieldBinding.bindingPattern().toSourceCode().trim();

                                    Builder<Object> templateBuilder = createPropertyBuilderFrom(template);
                                    templateBuilder.types.stream()
                                            .filter(pt -> pt.fieldType() == ValueType.EXPRESSION)
                                            .findFirst()
                                            .ifPresent(pt -> pt.selected(true));
                                    templateBuilder.value(fieldValue);
                                    if (diagnosticHandler != null) {
                                        diagnosticHandler.handle(templateBuilder, fieldBinding.lineRange(), true);
                                    }

                                    valueMap.put(fieldKey, templateBuilder.build());
                                }
                            }
                        } else {
                            MappingConstructorExpressionNode mappingCtrExprNode =
                                    (MappingConstructorExpressionNode) value;

                            boolean hasSpreadField = mappingCtrExprNode.fields().stream()
                                    .anyMatch(f -> !(f instanceof SpecificFieldNode));
                            if (hasSpreadField) {
                                matchingPropType.selected(false);
                                builder.types.stream()
                                        .filter(pt -> pt.fieldType() == ValueType.EXPRESSION)
                                        .findFirst()
                                        .ifPresent(pt -> {
                                            pt.selected(true);
                                            builder.value(mappingCtrExprNode.toSourceCode().trim());
                                        });
                                return;
                            }

                            for (MappingFieldNode fieldNode : mappingCtrExprNode.fields()) {
                                if (fieldNode instanceof SpecificFieldNode specificField) {
                                    String fieldKey = specificField.fieldName().toSourceCode().trim();
                                    String fieldValue = specificField.valueExpr()
                                            .map(expr -> expr.toSourceCode().trim())
                                            .orElse(fieldKey);

                                    Builder<Object> templateBuilder = createPropertyBuilderFrom(template);
                                    templateBuilder.types.stream()
                                            .filter(pt -> pt.fieldType() == ValueType.EXPRESSION)
                                            .findFirst()
                                            .ifPresent(pt -> pt.selected(true));
                                    templateBuilder.value(fieldValue);
                                    if (diagnosticHandler != null) {
                                        Node diagnosticNode = specificField.valueExpr()
                                                .map(expr -> (Node) expr)
                                                .orElse(specificField.fieldName());
                                        diagnosticHandler.handle(templateBuilder,
                                                diagnosticNode.lineRange(), true);
                                    }

                                    valueMap.put(fieldKey, templateBuilder.build());
                                }
                            }
                        }

                        builder.value(valueMap);
                    });
        }

        public Builder<T> handleWaitNode(List<Node> nodes) {
            Map<String, Property> valueMap = new LinkedHashMap<>();
            Node waitField;
            ExpressionNode expressionNode;
            String fieldKey;
            Property template = WaitBuilder.futureTemplate();
            for (Node n : nodes) {
                if (n.kind() == SyntaxKind.WAIT_FIELD) {
                    waitField = ((WaitFieldNode) n).fieldName();
                    expressionNode = ((WaitFieldNode) n).waitFutureExpr();
                    fieldKey = waitField.toSourceCode();
                } else {
                    expressionNode = (ExpressionNode) n;
                    fieldKey = n.toSourceCode();
                }

                Property.Builder<Object> templateBuilder = createPropertyBuilderFrom(template);
                templateBuilder.types.stream()
                        .filter(pt -> pt.fieldType() == Property.ValueType.EXPRESSION)
                        .findFirst()
                        .ifPresent(pt -> pt.selected(true));
                templateBuilder.value(expressionNode.toSourceCode().trim());
                valueMap.put(fieldKey, templateBuilder.build());
            }
            this.value(valueMap);
            return this;
        }

        /**
         * Creates a new property builder based on an existing property template.
         * This method copies all type information from the template property to create
         * a new builder instance that can be further customized.
         *
         * @param template the property to use as a template
         * @return a new Builder instance with copied type information
         */
        public Builder<Object> createPropertyBuilderFrom(Property template) {
            Builder<Object> builder = new Builder<>(null);

            if (template.types != null) {
                for (PropertyType type : template.types) {
                    builder.type()
                            .fieldType(type.fieldType())
                            .ballerinaType(type.ballerinaType())
                            .template(type.template())
                            .options(type.options())
                            .typeMembers(type.typeMembers())
                            .stepOut();
                }
            }

            return builder;
        }

        private boolean handleRecordValue(Node value, SemanticModel semanticModel, Builder<?> builder,
                                          Optional<TypeSymbol> paramType) {
            if (!(paramType.isPresent() && CommonUtil.getRawType(paramType.get()).typeKind() == TypeDescKind.RECORD)) {
               return false;
            }
            builder.types.stream()
                    .filter(propType -> propType.fieldType() == ValueType.RECORD_MAP_EXPRESSION)
                    .findFirst()
                    .ifPresent(propType -> {
                        propType.selected(true);
                        if (propType.fieldType() == ValueType.RECORD_MAP_EXPRESSION) {
                            String selectedType = getSelectedType(value, semanticModel, builder);
                            if (selectedType != null) {
                                propType.typeMembers().stream().filter(typeMember ->
                                        typeMember.type().equals(selectedType)).forEach(t -> t.selected(true));
                            }
                        }
                    });
            return true;
        }

        private String getSelectedType(Node value, SemanticModel semanticModel,  Property.Builder<?> builder) {
            if (value != null) {
                builder.value = value.toSourceCode().strip();
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

        private boolean handlePrimitiveType(TypeSymbol typeSymbol, String ballerinaType, SemanticModel semanticModel,
                                            ModuleInfo moduleInfo, Property.Builder<?> builder) {

            // Check for SQL query types first
            if (SQL_PARAMETERIZED_QUERY.equals(ballerinaType) || SQL_CALL_QUERY.equals(ballerinaType)) {
                type().fieldType(ValueType.SQL_QUERY).ballerinaType(ballerinaType).selected(true).stepOut();
                return true;
            }

            TypeSymbol rawType = CommonUtil.getRawType(typeSymbol);
            switch (rawType.typeKind()) {
                case INT, INT_SIGNED8, INT_UNSIGNED8, INT_SIGNED16, INT_UNSIGNED16,
                     INT_SIGNED32, INT_UNSIGNED32, BYTE, FLOAT, DECIMAL ->
                        builder.type(ValueType.NUMBER, ballerinaType);
                case STRING, STRING_CHAR -> builder.type(ValueType.TEXT, ballerinaType);
                case BOOLEAN -> builder.type(ValueType.FLAG, ballerinaType);
                case ARRAY -> builder.type()
                        .fieldType(ValueType.REPEATABLE_LIST)
                        .ballerinaType(ballerinaType)
                        .template(buildRepeatableTemplates(typeSymbol, semanticModel, moduleInfo))
                        .stepOut();
                case MAP -> builder.type()
                        .fieldType(ValueType.REPEATABLE_MAP)
                        .ballerinaType(ballerinaType)
                        .template(buildRepeatableTemplates(typeSymbol, semanticModel, moduleInfo))
                        .stepOut();
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
                        builder.type()
                                .fieldType(ValueType.RECORD_MAP_EXPRESSION)
                                .ballerinaType(ballerinaType)
                                .setTypeMembers(List.of(new ParameterMemberTypeData(type, "RECORD_TYPE",
                                        packageIdentifier, id.packageName())))
                                .stepOut();
                        return true;
                    }
                    return false;
                }
                default -> {
                    return false;
                }
            }
            return true;
        }

        public Property buildRepeatableTemplates(TypeSymbol tSymbol, SemanticModel semanticModel,
                                                  ModuleInfo moduleInfo) {
            Builder<Object> builder = new Builder<>(null);

            TypeSymbol rawType = CommonUtil.getRawType(tSymbol);
            if (rawType.typeKind() == TypeDescKind.ARRAY) {
                ArrayTypeSymbol arrayTypeSymbol = (ArrayTypeSymbol) rawType;
                TypeSymbol memberTypeSymbol = arrayTypeSymbol.memberTypeDescriptor();
                typeWithExpression(memberTypeSymbol, moduleInfo, null, semanticModel, builder);
            } else if (rawType.typeKind() == TypeDescKind.MAP) {
                MapTypeSymbol mapTypeSymbol = (MapTypeSymbol) rawType;
                TypeSymbol constrainedTypeSymbol = mapTypeSymbol.typeParam();
                typeWithExpression(constrainedTypeSymbol, moduleInfo, null, semanticModel, builder);
            } else {
                typeWithExpression(tSymbol, moduleInfo, null, semanticModel, builder);
            }

            return builder.build();
        }

        // need to handle the enums separately
        private ValueType findMatchingValueType(Node node) {
            return switch (node.kind()) {
                case STRING_TEMPLATE_EXPRESSION, STRING_LITERAL -> ValueType.TEXT;
                case NUMERIC_LITERAL -> ValueType.NUMBER;
                case TRUE_KEYWORD, FALSE_KEYWORD, BOOLEAN_LITERAL -> ValueType.FLAG;
                case MAPPING_BINDING_PATTERN, MAPPING_CONSTRUCTOR -> ValueType.REPEATABLE_MAP;
                case LIST_BINDING_PATTERN, LIST_CONSTRUCTOR -> ValueType.REPEATABLE_LIST;
                default -> ValueType.EXPRESSION;
            };
        }

        /**
         * Reorders enum options so that the option matching the defaultValue appears first in the list.
         * This improves user experience by showing the default option at the top of dropdown lists.
         * Returns a new list without modifying the input list.
         *
         * @param options      The list of Option objects to reorder
         * @param defaultValue The default value to prioritize (may contain quotes)
         * @return A new list with the default option first, or the original list if no match found
         */
        private static List<Option> reorderOptionsByDefaultValue(List<Option> options, String defaultValue) {
            if (options == null || options.isEmpty() || defaultValue == null || defaultValue.isEmpty()) {
                return new ArrayList<>(options != null ? options : List.of());
            }

            String cleanedDefaultValue = CommonUtils.removeQuotes(defaultValue);
            List<Option> reorderedOptions = new ArrayList<>(options);

            // Find and move matching option to front
            for (int i = 0; i < reorderedOptions.size(); i++) {
                Option option = reorderedOptions.get(i);
                String cleanedOptionValue = CommonUtils.removeQuotes(option.value());
                if (cleanedDefaultValue.equalsIgnoreCase(cleanedOptionValue) ||
                        cleanedDefaultValue.equalsIgnoreCase(option.value())) {
                    if (i > 0) {
                        reorderedOptions.remove(i);
                        reorderedOptions.addFirst(option);
                    }
                    break;
                }
            }
            return reorderedOptions;
        }

        public Builder<T> types(List<PropertyType> existingTypes) {
            if (existingTypes != null) {
                this.types.addAll(existingTypes);
            }
            return this;
        }

        public Property build() {
            List<PropertyType> finalTypes = types.isEmpty() ? null : new ArrayList<>(types);
            Property property = new Property(metadataBuilder == null ? null : metadataBuilder.build(), finalTypes,
                    value, oldValue, placeholder, optional, editable, advanced, hidden, modified,
                    diagnosticsBuilder == null ? null : diagnosticsBuilder.build(),
                    codedataBuilder == null ? null : codedataBuilder.build(), advancedValue,
                    imports == null ? null : imports, defaultValue, commentProperty, dynamicFormFields,
                    itemOptions);
            this.metadataBuilder = null;
            this.types = new ArrayList<>();
            this.value = null;
            this.oldValue = null;
            this.placeholder = null;
            this.optional = false;
            this.editable = false;
            this.advanced = false;
            this.hidden = false;
            this.diagnosticsBuilder = null;
            this.codedataBuilder = null;
            this.advancedValue = null;
            this.defaultValue = null;
            this.commentProperty = null;
            this.imports = null;
            this.dynamicFormFields = null;
            this.itemOptions = null;
            return property;
        }
    }
}
