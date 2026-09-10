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

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.Qualifier;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.VariableSymbol;
import io.ballerina.compiler.syntax.tree.CheckExpressionNode;
import io.ballerina.compiler.syntax.tree.FunctionArgumentNode;
import io.ballerina.compiler.syntax.tree.ListenerDeclarationNode;
import io.ballerina.compiler.syntax.tree.MappingConstructorExpressionNode;
import io.ballerina.compiler.syntax.tree.MappingFieldNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.NamedArgumentNode;
import io.ballerina.compiler.syntax.tree.NewExpressionNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NonTerminalNode;
import io.ballerina.compiler.syntax.tree.PositionalArgumentNode;
import io.ballerina.compiler.syntax.tree.SeparatedNodeList;
import io.ballerina.compiler.syntax.tree.SpecificFieldNode;
import io.ballerina.compiler.syntax.tree.TypeCastExpressionNode;
import io.ballerina.projects.Document;
import io.ballerina.projects.DocumentId;
import io.ballerina.projects.Project;
import io.ballerina.servicemodelgenerator.extension.model.Codedata;
import io.ballerina.servicemodelgenerator.extension.model.PropertyType;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import io.ballerina.servicemodelgenerator.extension.util.ListenerUtil;
import io.ballerina.servicemodelgenerator.extension.util.Utils;
import io.ballerina.tools.diagnostics.Location;
import io.ballerina.tools.text.TextRange;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.logging.Level;
import java.util.logging.Logger;

import static io.ballerina.servicemodelgenerator.extension.connector.ValueTreeUtils.argName;
import static io.ballerina.servicemodelgenerator.extension.connector.ValueTreeUtils.fieldName;
import static io.ballerina.servicemodelgenerator.extension.connector.ValueTreeUtils.isChoice;
import static io.ballerina.servicemodelgenerator.extension.connector.ValueTreeUtils.isGroup;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.ARG_TYPE_CDC_OPERATION_ENABLE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.ARG_TYPE_LISTENER_PARAM_CONFIG_FIELD;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.ARG_TYPE_LISTENER_PARAM_INCLUDED_DEFAULTABLE_FIELD;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.ARG_TYPE_LISTENER_PARAM_INCLUDED_FIELD;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.ARG_TYPE_LISTENER_PARAM_REQUIRED;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_ENUM_VALUE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_LISTENER_TYPE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_LISTENER_VAR_NAME;

/**
 * Builds the "use existing" listener selector for the schema-driven path, resolving each existing
 * listener's configuration from both the model (field template) and the source ({@code new(...)} args)
 * as read-only fields.
 *
 * @since 1.8.0
 */
public final class ExistingListenerResolver {

    private static final Logger LOGGER = Logger.getLogger(ExistingListenerResolver.class.getName());

    private ExistingListenerResolver() {
    }

    /**
     * Builds a {@code SINGLE_SELECT} of the given listeners; selecting one reveals its config
     * (read-only) resolved from source, using {@code createNewBranch} as the field template.
     */
    public static Value buildSelector(Value createNewBranch, List<String> listenerNames,
                                      SemanticModel semanticModel, Project project, String protocol) {
        // Resolved once for every name here, instead of each parseListener call re-scanning every
        // module symbol — O(listenerNames + moduleSymbols) instead of O(listenerNames * moduleSymbols).
        Map<String, VariableSymbol> listenerSymbolsByName = listenerSymbolsByName(semanticModel);
        List<Value> typeBranches = listenerTypeBranches(createNewBranch);
        Map<Value, ListenerTemplate> templatesByBranch = new IdentityHashMap<>();
        ListenerTemplate singleTemplate = typeBranches.isEmpty() ? collectTemplate(createNewBranch) : null;
        Map<String, Value> perListenerConfigs = new LinkedHashMap<>();
        for (String name : listenerNames) {
            Value branch = typeBranches.isEmpty() ? createNewBranch
                    : matchByListenerType(typeBranches, declaredTypeOf(listenerSymbolsByName.get(name)));
            ListenerTemplate template = typeBranches.isEmpty() ? singleTemplate
                    : templatesByBranch.computeIfAbsent(branch, ExistingListenerResolver::collectTemplate);
            Map<String, Value> createNewProps = branch == null ? null : branch.getProperties();
            Map<String, Value> fields = new LinkedHashMap<>();
            parseListener(name, listenerSymbolsByName, project).ifPresent(parsed -> {
                fields.putAll(buildFieldsFromParsed(parsed, template));
                // putIfAbsent: resolveIncludedFields walks the whole tree unconditionally and would
                // otherwise re-resolve (and clobber) a key already handled positionally above.
                resolveIncludedFields(createNewProps, parsed.named()).forEach(fields::putIfAbsent);
            });
            Value configGroup = new Value.ValueBuilder()
                    .metadata(name, protocol + " listener: " + name)
                    .value(name)
                    .types(List.of(PropertyType.types(Value.FieldType.FORM)))
                    .enabled(true)
                    .editable(false)
                    .setProperties(fields)
                    .build();
            perListenerConfigs.put(name, configGroup);
        }
        return assembleSelector(listenerNames, perListenerConfigs, protocol);
    }

    /**
     * Every module-level listener-qualified variable symbol, keyed by name; first declaration wins on a
     * duplicate name, matching the single declaration a valid Ballerina file would have anyway. An
     * absent semantic model yields an empty map, so every listener degrades to "no config resolved from
     * source" exactly as it did when this lookup happened inside {@link #parseListener}'s try/catch.
     */
    private static Map<String, VariableSymbol> listenerSymbolsByName(SemanticModel semanticModel) {
        Map<String, VariableSymbol> byName = new LinkedHashMap<>();
        if (semanticModel == null) {
            return byName;
        }
        for (Symbol symbol : semanticModel.moduleSymbols()) {
            if (symbol instanceof VariableSymbol variableSymbol
                    && variableSymbol.qualifiers().contains(Qualifier.LISTENER)) {
                variableSymbol.getName().ifPresent(name -> byName.putIfAbsent(name, variableSymbol));
            }
        }
        return byName;
    }

    /**
     * Assembles the {@code existingListener} dropdown (pure; unit-testable). Must NOT carry
     * {@code options} — that would route it to the expression/enum editor instead of the nested
     * per-listener config view (front-end {@code DropdownChoiceForm}).
     *
     * @throws IllegalArgumentException if {@code listenerNames} is empty -- callers must only reach
     *                                  this once at least one compatible listener is known to exist
     */
    static Value assembleSelector(List<String> listenerNames, Map<String, Value> perListenerConfigs,
                                  String protocol) {
        if (listenerNames == null || listenerNames.isEmpty()) {
            throw new IllegalArgumentException("listenerNames must not be empty");
        }
        return new Value.ValueBuilder()
                .metadata("Select Listener", String.format("Select from the existing %s listeners", protocol))
                .value(listenerNames.getFirst())
                .types(List.of(PropertyType.types(Value.FieldType.SINGLE_SELECT)))
                .enabled(true)
                .editable(true)
                .setItems(new ArrayList<>(listenerNames))
                .setProperties(perListenerConfigs)
                .build();
    }

    /** The per-listener-type branches, or empty when the connector declares one listener. */
    static List<Value> listenerTypeBranches(Value createNewBranch) {
        if (createNewBranch == null) {
            return List.of();
        }
        Value selector = findListenerTypeSelector(createNewBranch.getProperties());
        return selector == null || selector.getChoices() == null ? List.of() : selector.getChoices();
    }

    private static Value findListenerTypeSelector(Map<String, Value> properties) {
        if (properties == null) {
            return null;
        }
        for (Value value : properties.values()) {
            if (value == null) {
                continue;
            }
            Codedata codedata = value.getCodedata();
            if (codedata != null && CD_TYPE_LISTENER_TYPE.equals(codedata.getType())) {
                return value;
            }
            if (isGroup(value)) {
                Value nested = findListenerTypeSelector(value.getProperties());
                if (nested != null) {
                    return nested;
                }
            }
        }
        return null;
    }

    /**
     * The type a declared listener was written as, e.g. {@code StreamableHttpListener} for
     * {@code listener mcp:StreamableHttpListener l = ...}. Null when it cannot be read.
     */
    private static String declaredTypeOf(VariableSymbol symbol) {
        if (symbol == null || symbol.typeDescriptor() == null) {
            return null;
        }
        return symbol.typeDescriptor().getName()
                .orElseGet(() -> {
                    String signature = symbol.typeDescriptor().signature();
                    return signature == null || signature.isBlank()
                            ? null : TriggerModelSynthesizer.simpleName(signature);
                });
    }

    /**
     * The branch describing {@code typeSimpleName}, matched on the listener type its name field states. An
     * unreadable or unrecognised type falls back to the selected branch, then the first.
     */
    static Value matchByListenerType(List<Value> branches, String typeSimpleName) {
        if (typeSimpleName != null) {
            for (Value branch : branches) {
                String branchType = branchListenerType(branch);
                if (branchType != null && branchType.equalsIgnoreCase(typeSimpleName)) {
                    return branch;
                }
            }
        }
        for (Value branch : branches) {
            if (branch.isEnabled()) {
                return branch;
            }
        }
        return branches.isEmpty() ? null : branches.getFirst();
    }

    /** The listener type one branch describes, from its {@code LISTENER_VAR_NAME} field's declared type. */
    private static String branchListenerType(Value branch) {
        Value varName = findListenerVarName(branch == null ? null : branch.getProperties());
        if (varName == null || varName.getTypes() == null) {
            return null;
        }
        for (PropertyType type : varName.getTypes()) {
            if (type.ballerinaType() != null && !type.ballerinaType().isBlank()) {
                return TriggerModelSynthesizer.simpleName(type.ballerinaType());
            }
        }
        return null;
    }

    private static Value findListenerVarName(Map<String, Value> properties) {
        if (properties == null) {
            return null;
        }
        for (Value value : properties.values()) {
            if (value == null) {
                continue;
            }
            Codedata codedata = value.getCodedata();
            if (codedata != null && CD_TYPE_LISTENER_VAR_NAME.equals(codedata.getType())) {
                return value;
            }
            Value nested = findListenerVarName(value.getProperties());
            if (nested != null) {
                return nested;
            }
        }
        return null;
    }

    /** The listener-parameter field template derived from the create-new branch. */
    static final class ListenerTemplate {
        final Map<Integer, Field> positionalScalars = new LinkedHashMap<>();
        final Map<Integer, LinkedHashMap<String, Value>> recordGroups = new LinkedHashMap<>();
        // position -> a record-shaping CHOICE (key + template value), e.g. sap.jco's
        // ServerConfig|AdvancedConfig union: which branch applies is only known once matched against source.
        final Map<Integer, Field> positionalChoices = new LinkedHashMap<>();
        // named (included/config) params: name -> template value
        final LinkedHashMap<String, Value> named = new LinkedHashMap<>();
    }

    record Field(String key, Value template) {
    }

    static ListenerTemplate collectTemplate(Value createNewBranch) {
        ListenerTemplate template = new ListenerTemplate();
        collectTemplate(createNewBranch == null ? null : createNewBranch.getProperties(), template);
        return template;
    }

    private static void collectTemplate(Map<String, Value> properties, ListenerTemplate template) {
        if (properties == null) {
            return;
        }
        for (Map.Entry<String, Value> entry : properties.entrySet()) {
            Value field = entry.getValue();
            if (isChoice(field)) {
                // Only a CHOICE whose branches carry their own position (e.g. sap.jco's ServerConfig/
                // AdvancedConfig) occupies a positional slot; a nested, slot-less CHOICE (repositoryDestination)
                // is resolved later, from within the matched branch.
                Integer choicePosition = choicePositionalSlot(field);
                if (choicePosition != null) {
                    template.positionalChoices.put(choicePosition, new Field(entry.getKey(), field));
                }
                continue;
            }
            if (isGroup(field)) {
                Codedata groupCodedata = field.getCodedata();
                boolean groupHasSlot = groupCodedata != null
                        && ARG_TYPE_LISTENER_PARAM_REQUIRED.equals(groupCodedata.getArgType())
                        && groupCodedata.getPosition() != null;
                LinkedHashMap<String, Value> configChildren = new LinkedHashMap<>();
                Map<String, Value> rest = new LinkedHashMap<>();
                if (field.getProperties() != null) {
                    for (Map.Entry<String, Value> child : field.getProperties().entrySet()) {
                        Codedata childCodedata = child.getValue().getCodedata();
                        if (childCodedata != null
                                && ARG_TYPE_LISTENER_PARAM_CONFIG_FIELD.equals(childCodedata.getArgType())) {
                            String name = fieldName(childCodedata, child.getKey());
                            if (groupHasSlot) {
                                configChildren.put(name, child.getValue());
                            } else if (childCodedata.getPosition() != null) {
                                template.recordGroups
                                        .computeIfAbsent(childCodedata.getPosition(),
                                                ignored -> new LinkedHashMap<>())
                                        .put(name, child.getValue());
                            } else {
                                template.named.put(name, child.getValue());
                            }
                        } else {
                            rest.put(child.getKey(), child.getValue());
                        }
                    }
                }
                if (groupHasSlot && !configChildren.isEmpty()) {
                    template.recordGroups.put(groupCodedata.getPosition(), configChildren);
                }
                collectTemplate(rest, template);
                continue;
            }
            Codedata codedata = field.getCodedata();
            if (codedata == null) {
                continue;
            }
            String argType = codedata.getArgType();
            if (ARG_TYPE_LISTENER_PARAM_REQUIRED.equals(argType) && codedata.getPosition() != null) {
                template.positionalScalars.put(codedata.getPosition(), new Field(entry.getKey(), field));
            } else if (ARG_TYPE_LISTENER_PARAM_INCLUDED_FIELD.equals(argType)
                    || ARG_TYPE_LISTENER_PARAM_INCLUDED_DEFAULTABLE_FIELD.equals(argType)) {
                template.named.put(argName(codedata, entry.getKey()), field);
            } else if (ARG_TYPE_LISTENER_PARAM_CONFIG_FIELD.equals(argType)) {
                template.named.put(fieldName(codedata, entry.getKey()), field);
            }
        }
    }

    /** The position a record-shaping CHOICE occupies, taken from its branches; {@code null} if none carry one. */
    private static Integer choicePositionalSlot(Value field) {
        List<Value> branches = field.getChoices();
        if (branches == null) {
            return null;
        }
        for (Value branch : branches) {
            Codedata branchCodedata = branch.getCodedata();
            if (branchCodedata != null && branchCodedata.getPosition() != null) {
                return branchCodedata.getPosition();
            }
        }
        return null;
    }

    // ------------------------------------------------------------------
    // Mapping — parsed source args onto the template as read-only fields
    // ------------------------------------------------------------------

    /**
     * A parsed {@code new(...)}: positional args (scalar or record) and named args (as a nested-record tree).
     *
     * @param positional the args passed by position
     * @param named      the args passed by name, as a nested-record tree
     */
    record ParsedListener(List<ParsedArg> positional, LinkedHashMap<String, Object> named) {
    }

    /**
     * One argument: exactly one of {@code scalar} / {@code recordFields} is set.
     *
     * @param scalar       the argument's rendered source text, when it is a scalar/expression
     * @param recordFields the argument's field name -> value tree map, when it is a record literal
     *                     (values are recursively {@code String} or nested {@code Map<String, Object>})
     */
    record ParsedArg(String scalar, LinkedHashMap<String, Object> recordFields) {
        static ParsedArg scalar(String value) {
            return new ParsedArg(value, null);
        }

        static ParsedArg record(LinkedHashMap<String, Object> fields) {
            return new ParsedArg(null, fields);
        }
    }

    static Map<String, Value> buildFieldsFromParsed(ParsedListener parsed, ListenerTemplate template) {
        Map<String, Value> fields = new LinkedHashMap<>();
        List<ParsedArg> positional = parsed.positional();
        for (int i = 0; i < positional.size(); i++) {
            int position = i + 1;
            ParsedArg arg = positional.get(i);
            if (arg.recordFields() != null && template.recordGroups.containsKey(position)) {
                LinkedHashMap<String, Value> configTemplates = template.recordGroups.get(position);
                arg.recordFields().forEach((name, value) ->
                        fields.put(name, readOnly(configTemplates.get(name), name, renderValue(value))));
            } else if (arg.recordFields() != null && template.positionalChoices.containsKey(position)) {
                Field choiceField = template.positionalChoices.get(position);
                Value resolved = resolvePositionalChoice(choiceField.template(), arg.recordFields());
                if (resolved != null) {
                    fields.put(choiceField.key(), resolved);
                }
            } else if (template.positionalScalars.containsKey(position)) {
                Field field = template.positionalScalars.get(position);
                String value = arg.scalar() != null ? arg.scalar() : renderRecordTree(arg.recordFields());
                fields.put(field.key(), readOnly(field.template(), field.key(), value));
            }
        }
        return fields;
    }

    private static String renderValue(Object value) {
        return value instanceof String scalar ? scalar : renderRecordTree((Map<?, ?>) value);
    }

    // ------------------------------------------------------------------
    // Included (named) args — resolved against the create-new field tree so a record-typed
    // included param modeled as a nested CHOICE/GROUP (auth) or dotted paths (database.*) is
    // rebuilt as structured, read-only fields instead of a raw record blob.
    // ------------------------------------------------------------------

    /**
     * Walks the create-new field tree and, for every included-field leaf / CHOICE, resolves its value
     * from the parsed named-arg tree by the leaf's dotted {@code path}. Fields whose value cannot be
     * located are dropped. GROUP_SECTIONs and enum-value CHOICEs are flattened; a record-shaping CHOICE
     * is kept as a read-only radio with only the matching branch selected and populated.
     */
    static Map<String, Value> resolveIncludedFields(Map<String, Value> templateProps,
                                                    Map<String, Object> named) {
        return resolveIncludedFieldsWithCount(templateProps, named).resolved();
    }

    /**
     * A subtree's resolved fields paired with its total count of included-field leaves -- every leaf
     * across every CHOICE branch, matched or not, identical to what {@link #countIncludedLeaves} reports
     * for the same subtree. Carrying the count out of the resolve walk means a record CHOICE's per-branch
     * scoring no longer walks each branch's subtree a second time just to size it.
     *
     * @param resolved    the fields resolved from the parsed source
     * @param totalLeaves the total count of included-field leaves in the subtree
     */
    private record IncludedFieldsResult(Map<String, Value> resolved, int totalLeaves) {
    }

    private static IncludedFieldsResult resolveIncludedFieldsWithCount(Map<String, Value> templateProps,
                                                                       Map<String, Object> named) {
        Map<String, Value> resolved = new LinkedHashMap<>();
        if (templateProps == null) {
            return new IncludedFieldsResult(resolved, 0);
        }
        int totalLeaves = 0;
        for (Map.Entry<String, Value> entry : templateProps.entrySet()) {
            Value field = entry.getValue();
            if (isChoice(field)) {
                List<Value> branches = field.getChoices() == null ? List.<Value>of() : field.getChoices();
                if (isEnumValueChoiceField(field)) {
                    // Only the selected branch's fields are kept, so only it is worth resolving; the
                    // others just contribute leaf counts (an enclosing record CHOICE's tie-break needs
                    // them) via the cheaper count-only walk.
                    int selected = selectEnumBranchIndex(field, branches, named);
                    for (int i = 0; i < branches.size(); i++) {
                        if (i == selected) {
                            IncludedFieldsResult branchResult =
                                    resolveIncludedFieldsWithCount(branches.get(i).getProperties(), named);
                            resolved.putAll(branchResult.resolved());
                            totalLeaves += branchResult.totalLeaves();
                        } else {
                            totalLeaves += countIncludedLeaves(branches.get(i).getProperties());
                        }
                    }
                    continue;
                }
                // A record-shaping CHOICE scores every branch, so every branch has to be resolved
                // regardless -- pairing each branch's count with its resolve is what removes the
                // formerly duplicated second walk.
                List<IncludedFieldsResult> branchResults = new ArrayList<>(branches.size());
                for (Value branch : branches) {
                    IncludedFieldsResult branchResult = resolveIncludedFieldsWithCount(branch.getProperties(), named);
                    branchResults.add(branchResult);
                    totalLeaves += branchResult.totalLeaves();
                }
                Value choice = resolveRecordChoice(branches, branchResults, field);
                if (choice != null) {
                    resolved.put(entry.getKey(), choice);
                }
                continue;
            }
            if (isGroup(field)) {
                IncludedFieldsResult nested = resolveIncludedFieldsWithCount(field.getProperties(), named);
                resolved.putAll(nested.resolved());
                totalLeaves += nested.totalLeaves();
                continue;
            }
            Codedata codedata = field.getCodedata();
            if (!isIncludedField(codedata) || isCdcOperationFlag(codedata)) {
                continue;
            }
            totalLeaves++;
            String value = resolveByPath(named, lookupSegments(codedata, entry.getKey()));
            if (value != null && !value.isBlank()) {
                resolved.put(entry.getKey(), readOnlyClone(field, value));
            }
        }
        return new IncludedFieldsResult(resolved, totalLeaves);
    }

    /**
     * Picks the record-shaping CHOICE branch that best matches the source (most resolved values wins,
     * ties break toward the smaller branch) and returns a read-only radio with only that branch populated.
     * {@code branchResults} is {@code branches}' already-computed {@link IncludedFieldsResult}s (the
     * caller resolves every branch once regardless), so scoring never re-walks a branch's subtree.
     */
    private static Value resolveRecordChoice(List<Value> branches, List<IncludedFieldsResult> branchResults,
                                             Value field) {
        if (branches.isEmpty()) {
            return null;
        }
        int bestIndex = -1;
        int bestScore = -1;
        int bestLeaves = Integer.MAX_VALUE;
        for (int i = 0; i < branches.size(); i++) {
            int score = branchResults.get(i).resolved().size();
            int leaves = branchResults.get(i).totalLeaves();
            if (score > bestScore || (score == bestScore && leaves < bestLeaves)) {
                bestScore = score;
                bestLeaves = leaves;
                bestIndex = i;
            }
        }
        if (bestIndex < 0) {
            return null;
        }
        List<Value> readOnlyBranches = new ArrayList<>();
        for (int i = 0; i < branches.size(); i++) {
            Value branch = new Value(branches.get(i));
            branch.setEditable(false);
            if (i == bestIndex) {
                branch.setEnabled(true);
                branch.setProperties(branchResults.get(i).resolved());
            } else {
                branch.setEnabled(false);
                branch.setProperties(new LinkedHashMap<>());
            }
            readOnlyBranches.add(branch);
        }
        Value choice = new Value(field);
        choice.setChoices(readOnlyBranches);
        choice.setProperties(null);
        choice.setValue("");
        choice.setEnabled(true);
        choice.setEditable(false);
        choice.setOptional(false);
        choice.setAdvanced(false);
        choice.setValidations(null);
        return choice;
    }

    /**
     * Resolves the enum CHOICE's own value and returns the matching branch's index, falling back to the
     * enabled/first branch's index; {@code -1} when there are no branches.
     */
    private static int selectEnumBranchIndex(Value field, List<Value> branches, Map<String, Object> named) {
        if (branches.isEmpty()) {
            return -1;
        }
        String own = resolveByPath(named, lookupSegments(field.getCodedata(), null));
        if (own != null && !own.isBlank()) {
            String selected = stripModulePrefix(own);
            for (int i = 0; i < branches.size(); i++) {
                if (selected.equalsIgnoreCase(stripModulePrefix(branches.get(i).getValue()))) {
                    return i;
                }
            }
        }
        for (int i = 0; i < branches.size(); i++) {
            if (branches.get(i).isEnabled()) {
                return i;
            }
        }
        return 0;
    }

    /** Navigates the parsed named-arg tree along the dotted path, rendering a sub-record if it terminates on one. */
    private static String resolveByPath(Map<String, Object> named, List<String> segments) {
        if (named == null || segments.isEmpty()) {
            return null;
        }
        Object current = named;
        for (String segment : segments) {
            if (!(current instanceof Map<?, ?> map)) {
                return null;
            }
            current = map.get(segment);
            if (current == null) {
                return null;
            }
        }
        if (current instanceof String scalar) {
            return scalar;
        }
        if (current instanceof Map<?, ?> record) {
            return renderRecordTree(record);
        }
        return null;
    }

    /** Renders a (possibly nested) record literal from a field-name-to-value tree; a leaf value renders
     *  via {@code String.valueOf}, so leaves may be pre-rendered strings or any other object. Shared with
     *  {@link SchemaDrivenSourceGenerator}, which walks the same shape of tree. */
    @SuppressWarnings("unchecked")
    static String renderRecordTree(Map<?, ?> record) {
        if (record.isEmpty()) {
            return "{}";
        }
        List<String> parts = new ArrayList<>();
        for (Map.Entry<?, ?> entry : record.entrySet()) {
            Object value = entry.getValue();
            String rendered = value instanceof Map<?, ?> nested
                    ? renderRecordTree(nested) : String.valueOf(value);
            parts.add(entry.getKey() + ": " + rendered);
        }
        return "{" + String.join(", ", parts) + "}";
    }

    /** The named-arg lookup path for a leaf: a multi-segment {@code path}, or the emitted arg name. */
    private static List<String> lookupSegments(Codedata codedata, String key) {
        String path = codedata == null ? null : codedata.getPath();
        if (path != null && !path.isBlank()) {
            String[] segments = path.split("\\.");
            if (segments.length > 1) {
                return List.of(segments);
            }
        }
        String name = argName(codedata, key);
        if (name != null && !name.isBlank()) {
            return List.of(name);
        }
        return path != null && !path.isBlank() ? List.of(path) : List.of();
    }

    /**
     * A subtree's included-field leaf count without resolving anything -- the cheap path for a subtree
     * whose resolved fields would be discarded (a non-selected enum CHOICE branch). Counts exactly what
     * {@link #resolveIncludedFieldsWithCount}'s {@code totalLeaves} counts, so a record CHOICE's
     * tie-break sees the same numbers whichever path produced them.
     */
    private static int countIncludedLeaves(Map<String, Value> properties) {
        if (properties == null) {
            return 0;
        }
        int count = 0;
        for (Value field : properties.values()) {
            if (isChoice(field)) {
                for (Value branch : field.getChoices() == null ? List.<Value>of() : field.getChoices()) {
                    count += countIncludedLeaves(branch.getProperties());
                }
            } else if (isGroup(field)) {
                count += countIncludedLeaves(field.getProperties());
            } else {
                Codedata codedata = field.getCodedata();
                if (isIncludedField(codedata) && !isCdcOperationFlag(codedata)) {
                    count++;
                }
            }
        }
        return count;
    }

    private static boolean isIncludedField(Codedata codedata) {
        if (codedata == null) {
            return false;
        }
        String argType = codedata.getArgType();
        return ARG_TYPE_LISTENER_PARAM_INCLUDED_FIELD.equals(argType)
                || ARG_TYPE_LISTENER_PARAM_INCLUDED_DEFAULTABLE_FIELD.equals(argType);
    }

    private static boolean isCdcOperationFlag(Codedata codedata) {
        return codedata != null && ARG_TYPE_CDC_OPERATION_ENABLE.equals(codedata.getArgType());
    }

    /** A CHOICE whose (enabled/first) branch is a bare enum literal selector (ftp's protocol). */
    private static boolean isEnumValueChoiceField(Value field) {
        if (field.getChoices() == null) {
            return false;
        }
        return field.getChoices().stream()
                .anyMatch(branch -> branch.getCodedata() != null
                        && CD_TYPE_ENUM_VALUE.equals(branch.getCodedata().getType()));
    }

    // ------------------------------------------------------------------
    // Positional record-shaping CHOICE (e.g. sap.jco's ServerConfig|AdvancedConfig) — the positional-arg
    // counterpart of resolveIncludedFields / resolveRecordChoice below, against a positional record tree.
    // ------------------------------------------------------------------

    /** Picks the branch of a record-shaping CHOICE that best matches the parsed positional record, per
     *  the same heuristic as {@link #resolveRecordChoice}. */
    private static Value resolvePositionalChoice(Value field, Map<String, Object> recordTree) {
        List<Value> branches = field.getChoices();
        if (branches == null || branches.isEmpty() || recordTree == null) {
            return null;
        }
        int bestIndex = -1;
        int bestScore = -1;
        int bestLeaves = Integer.MAX_VALUE;
        List<Map<String, Value>> resolvedBranches = new ArrayList<>();
        for (int i = 0; i < branches.size(); i++) {
            Map<String, Value> branchFields = resolveConfigFields(branches.get(i).getProperties(), recordTree);
            resolvedBranches.add(branchFields);
            int leaves = countConfigLeaves(branches.get(i).getProperties());
            int score = branchFields.size();
            if (score > bestScore || (score == bestScore && leaves < bestLeaves)) {
                bestScore = score;
                bestLeaves = leaves;
                bestIndex = i;
            }
        }
        if (bestIndex < 0) {
            return null;
        }
        List<Value> readOnlyBranches = new ArrayList<>();
        for (int i = 0; i < branches.size(); i++) {
            Value branch = new Value(branches.get(i));
            branch.setEditable(false);
            if (i == bestIndex) {
                branch.setEnabled(true);
                branch.setProperties(resolvedBranches.get(i));
            } else {
                branch.setEnabled(false);
                branch.setProperties(new LinkedHashMap<>());
            }
            readOnlyBranches.add(branch);
        }
        Value choice = new Value(field);
        choice.setChoices(readOnlyBranches);
        choice.setProperties(null);
        choice.setValue("");
        choice.setEnabled(true);
        choice.setEditable(false);
        choice.setOptional(false);
        choice.setAdvanced(false);
        choice.setValidations(null);
        return choice;
    }

    /** Resolves each {@code LISTENER_PARAM_CONFIG_FIELD} leaf's value from the parsed record tree by its
     *  dotted {@code path}; a {@code LISTENER_PARAM_REQUIRED} leaf renders the whole record instead. */
    private static Map<String, Value> resolveConfigFields(Map<String, Value> templateProps,
                                                          Map<String, Object> recordTree) {
        Map<String, Value> resolved = new LinkedHashMap<>();
        if (templateProps == null) {
            return resolved;
        }
        for (Map.Entry<String, Value> entry : templateProps.entrySet()) {
            Value field = entry.getValue();
            if (isChoice(field)) {
                Value choice = resolvePositionalChoice(field, recordTree);
                if (choice != null) {
                    resolved.put(entry.getKey(), choice);
                }
                continue;
            }
            if (isGroup(field)) {
                resolved.putAll(resolveConfigFields(field.getProperties(), recordTree));
                continue;
            }
            Codedata codedata = field.getCodedata();
            if (codedata == null) {
                continue;
            }
            if (ARG_TYPE_LISTENER_PARAM_REQUIRED.equals(codedata.getArgType())) {
                String whole = renderRecordTree(recordTree);
                if (!"{}".equals(whole)) {
                    resolved.put(entry.getKey(), readOnlyClone(field, whole));
                }
                continue;
            }
            if (!ARG_TYPE_LISTENER_PARAM_CONFIG_FIELD.equals(codedata.getArgType())) {
                continue;
            }
            String value = resolveByPath(recordTree, lookupSegments(codedata, entry.getKey()));
            if (value != null && !value.isBlank()) {
                resolved.put(entry.getKey(), readOnlyClone(field, value));
            }
        }
        return resolved;
    }

    private static int countConfigLeaves(Map<String, Value> properties) {
        if (properties == null) {
            return 0;
        }
        int count = 0;
        for (Value field : properties.values()) {
            if (isChoice(field)) {
                for (Value branch : field.getChoices() == null ? List.<Value>of() : field.getChoices()) {
                    count += countConfigLeaves(branch.getProperties());
                }
            } else if (isGroup(field)) {
                count += countConfigLeaves(field.getProperties());
            } else {
                Codedata codedata = field.getCodedata();
                if (codedata != null
                        && (ARG_TYPE_LISTENER_PARAM_CONFIG_FIELD.equals(codedata.getArgType())
                                || ARG_TYPE_LISTENER_PARAM_REQUIRED.equals(codedata.getArgType()))) {
                    count++;
                }
            }
        }
        return count;
    }

    private static String stripModulePrefix(String value) {
        if (value == null) {
            return "";
        }
        int colon = value.lastIndexOf(':');
        return colon >= 0 ? value.substring(colon + 1).trim() : value.trim();
    }

    /** Clones the template leaf (preserving label/type) as a read-only value carrying the resolved source. */
    private static Value readOnlyClone(Value template, String value) {
        Value copy = new Value(template);
        copy.setChoices(null);
        copy.setProperties(null);
        copy.setValue(value);
        copy.setEnabled(true);
        copy.setEditable(false);
        // Must be non-optional/non-advanced: DropdownChoiceForm hides those fields on the front end.
        copy.setOptional(false);
        copy.setAdvanced(false);
        copy.setValidations(null);
        return copy;
    }

    /** Clones the template field (preserving label/type) as a read-only value; falls back to a text value. */
    private static Value readOnly(Value template, String key, String value) {
        if (template == null) {
            return ListenerUtil.buildReadOnlyTextValue(key, "", value);
        }
        Value copy = new Value(template);
        copy.setValue(value);
        copy.setEnabled(true);
        copy.setEditable(false);
        copy.setOptional(false);
        copy.setAdvanced(false);
        copy.setValidations(null);
        return copy;
    }

    // ------------------------------------------------------------------
    // Source side — parse a listener declaration's new(...) arguments
    // ------------------------------------------------------------------

    static Optional<ParsedListener> parseListener(String listenerName,
                                                  Map<String, VariableSymbol> listenerSymbolsByName, Project project) {
        try {
            ListenerDeclarationNode declaration = findListenerDeclaration(listenerName, listenerSymbolsByName,
                    project);
            if (declaration == null) {
                return Optional.empty();
            }
            NewExpressionNode newExpression = asNewExpression(declaration.initializer());
            if (newExpression == null) {
                return Optional.empty();
            }
            SeparatedNodeList<FunctionArgumentNode> arguments = ListenerUtil.getArgList(newExpression);
            if (arguments == null) {
                return Optional.empty();
            }
            List<ParsedArg> positional = new ArrayList<>();
            LinkedHashMap<String, Object> named = new LinkedHashMap<>();
            for (FunctionArgumentNode argument : arguments) {
                if (argument instanceof PositionalArgumentNode positionalArg) {
                    positional.add(toParsedArg(positionalArg.expression()));
                } else if (argument instanceof NamedArgumentNode namedArg) {
                    named.put(namedArg.argumentName().name().text().trim(),
                            parseExpression(namedArg.expression()));
                }
            }
            return Optional.of(new ParsedListener(positional, named));
        } catch (RuntimeException e) {
            // Never fail the "use existing listener" dropdown over one unparsable declaration.
            LOGGER.log(Level.FINE, e,
                    () -> "Failed to parse existing listener declaration '%s'".formatted(listenerName));
            return Optional.empty();
        }
    }

    /**
     * A named-arg expression as a nested-record tree: a record literal becomes a
     * {@code Map<String, Object>} (recursively), anything else its trimmed source. Lets a leaf's dotted
     * {@code path} be navigated back to the exact scalar (or whole sub-record) it was emitted from.
     *
     * <p>A type-cast (e.g. sap.jco's {@code <jco:ServerConfig>{...}}) is unwrapped first — it carries no
     * field data itself.
     */
    private static Object parseExpression(Node expression) {
        if (expression instanceof TypeCastExpressionNode typeCast) {
            return parseExpression(typeCast.expression());
        }
        if (expression instanceof MappingConstructorExpressionNode mapping) {
            LinkedHashMap<String, Object> record = new LinkedHashMap<>();
            for (MappingFieldNode fieldNode : mapping.fields()) {
                if (fieldNode instanceof SpecificFieldNode specificField) {
                    String name = Utils.unquote(specificField.fieldName().toSourceCode().trim());
                    Object value = specificField.valueExpr()
                            .map(ExistingListenerResolver::parseExpression)
                            .orElse("");
                    record.put(name, value);
                }
            }
            return record;
        }
        return expression.toSourceCode().trim();
    }

    /** Parses a positional arg via {@link #parseExpression}, so a nested record literal is captured as a
     *  navigable tree rather than flattened to raw source text. */
    @SuppressWarnings("unchecked")
    private static ParsedArg toParsedArg(Node expression) {
        Object parsed = parseExpression(expression);
        if (parsed instanceof LinkedHashMap<?, ?> record) {
            return ParsedArg.record((LinkedHashMap<String, Object>) record);
        }
        return ParsedArg.scalar((String) parsed);
    }

    private static NewExpressionNode asNewExpression(Node initializer) {
        if (initializer instanceof CheckExpressionNode checkExpression
                && checkExpression.expression() instanceof NewExpressionNode newExpression) {
            return newExpression;
        }
        if (initializer instanceof NewExpressionNode newExpression) {
            return newExpression;
        }
        return null;
    }

    private static ListenerDeclarationNode findListenerDeclaration(String listenerName,
                                                                   Map<String, VariableSymbol> listenerSymbolsByName,
                                                                   Project project) {
        VariableSymbol listenerSymbol = listenerSymbolsByName.get(listenerName);
        if (listenerSymbol == null || listenerSymbol.getLocation().isEmpty()) {
            return null;
        }
        Location location = listenerSymbol.getLocation().get();
        Path path = project.sourceRoot().resolve(location.lineRange().fileName());
        DocumentId documentId = project.documentId(path);
        Document document = project.currentPackage().getDefaultModule().document(documentId);
        if (document == null) {
            return null;
        }
        ModulePartNode rootNode = document.syntaxTree().rootNode();
        TextRange range = TextRange.from(location.textRange().startOffset(), location.textRange().length());
        NonTerminalNode node = rootNode.findNode(range);
        while (node != null && !(node instanceof ListenerDeclarationNode)) {
            node = node.parent();
        }
        return (ListenerDeclarationNode) node;
    }

}
