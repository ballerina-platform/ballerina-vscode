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

package io.ballerina.flowmodelgenerator.core.model.node;

import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.flowmodelgenerator.core.AiUtils;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.FlowNode;
import io.ballerina.flowmodelgenerator.core.model.Metadata;
import io.ballerina.flowmodelgenerator.core.model.NodeBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.flowmodelgenerator.core.utils.FlowNodeUtil;
import io.ballerina.modelgenerator.commons.FunctionData;
import io.ballerina.modelgenerator.commons.ParameterData;
import org.ballerinalang.langserver.common.utils.NameUtil;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * Represents a function call node.
 *
 * @since 1.0.0
 */
public class AgentCallBuilder extends CallBuilder {

    private static final String BALLERINA = "ballerina";
    private Set<String> cachedVisibleSymbolNames;

    // Agent Properties
    public static final String AGENT = "AGENT";
    public static final String SYSTEM_PROMPT = "systemPrompt";
    public static final String TOOLS = "tools";
    public static final String MODEL = "model";
    public static final String MEMORY = "memory";

    // Agent Call Properties
    public static final String QUERY = "query";
    public static final String SESSION_ID = "sessionId";
    public static final String CONTEXT = "context";

    public static final String ROLE = "role";
    public static final String ROLE_LABEL = "Role";
    public static final String ROLE_DOC = "Define the agent's primary function";
    public static final String ROLE_PLACEHOLDER = "e.g., Customer Support Assistant, Sales Advisor, Data Analyst";

    public static final String INSTRUCTIONS = "instructions";
    public static final String INSTRUCTIONS_LABEL = "Instructions";
    public static final String INSTRUCTIONS_DOC = "Detailed instructions for the agent";
    public static final String INSTRUCTIONS_PLACEHOLDER = "e.g., You are a friendly assistant. Your goal is to...";

    public static final String DESCRIPTION = "Executes the agent for a given user query.";

    static final Set<String> AGENT_PARAMS_TO_HIDE =
            Set.of(SYSTEM_PROMPT, TOOLS, MEMORY, MODEL, Property.TYPE_KEY, Property.VARIABLE_KEY);
    static final Set<String> AGENT_CALL_PARAMS_TO_SHOW = Set.of(QUERY, SESSION_ID, CONTEXT);

    private static final String STRING = "string";
    private static final String AI_TRACE = "ai:Trace";
    private static final List<String> TD_OPTIONS = List.of(STRING, AI_TRACE);

    // Cache for agent templates to avoid expensive repeated creation
    private static final Map<String, FlowNode> agentTemplateCache = new ConcurrentHashMap<>();

    // Cache for agent call function templates to avoid repeated FunctionDataBuilder.build() calls
    private static final Map<String, FlowNode> agentCallFnCache = new ConcurrentHashMap<>();

    @Override
    protected NodeKind getFunctionNodeKind() {
        return NodeKind.AGENT_CALL;
    }

    @Override
    protected FunctionData.Kind getFunctionResultKind() {
        return FunctionData.Kind.FUNCTION;
    }

    @Override
    public void setConcreteConstData() {
        codedata().node(NodeKind.AGENT_CALL);
        metadata().description(DESCRIPTION);
    }

    @Override
    public void setConcreteTemplateData(TemplateContext context) {
        FlowNode callTemplate = getOrCreateCallFunctionTemplate(context);
        restoreFromTemplate(callTemplate);

        Codedata contextCd = context.codedata();
        codedata().lineRange(contextCd.lineRange()).sourceCode(contextCd.sourceCode());

        // TODO: This is a temporary solution until we have a proper plan for handling all generic types.
        makeInferredTypePropertyOptional();
        overrideVariableName(context);
    }

    private FlowNode getOrCreateCallFunctionTemplate(TemplateContext context) {
        Codedata cd = context.codedata();
        String cacheKey = String.format("%s|%s|%s|%s|%s",
                cd.org(), cd.packageName(), cd.version(), cd.symbol(), cd.object());
        return agentCallFnCache.computeIfAbsent(cacheKey, k -> {
            AgentCallBuilder temp = new AgentCallBuilder();
            temp.defaultModuleName(moduleInfo);
            temp.callSuperSetConcreteTemplateData(context);
            return temp.build();
        });
    }

    void callSuperSetConcreteTemplateData(TemplateContext context) {
        super.setConcreteTemplateData(context);
    }

    private void restoreFromTemplate(FlowNode template) {
        Metadata md = template.metadata();
        if (md != null) {
            metadata().label(md.label()).description(md.description());
            if (md.icon() != null) {
                metadata().icon(md.icon());
            }
        }

        Codedata cd = template.codedata();
        if (cd != null) {
            codedata().node(cd.node()).org(cd.org()).module(cd.module())
                    .packageName(cd.packageName()).object(cd.object())
                    .version(cd.version()).symbol(cd.symbol())
                    .inferredReturnType(cd.inferredReturnType());
        }

        if (template.properties() != null) {
            Map<String, Property> currentProps = properties().build();
            template.properties().forEach(currentProps::put);
        }

        if (template.flags() != 0) {
            flag(template.flags());
        }
    }

    private void makeInferredTypePropertyOptional() {
        if (formBuilder == null) {
            return;
        }
        Map<String, Property> props = formBuilder.build();
        for (Map.Entry<String, Property> entry : props.entrySet()) {
            Property prop = entry.getValue();
            if (prop.codedata() != null &&
                    ParameterData.Kind.PARAM_FOR_TYPE_INFER.name().equals(prop.codedata().kind())) {
                props.put(entry.getKey(), AiUtils.copyAsOptionalAdvanced(prop));
                postProcessTdProperty(this, entry.getKey());
            }
        }
    }

    /**
     * Post-processes the {@code td} inferred-type property on an AGENT_CALL node builder, converting it from a
     * free-form expression field to a SINGLE_SELECT dropdown. Safe to call for any node builder or key — exits
     * immediately when the conditions are not met.
     *
     * @param nodeBuilder the node builder to update
     * @param key         the inferred type parameter key
     */
    public static void postProcessTdProperty(NodeBuilder nodeBuilder, String key) {
        if (!(nodeBuilder instanceof AgentCallBuilder builder) || !"td".equals(key)
                || builder.formBuilder == null) {
            return;
        }
        Map<String, Property> props = builder.formBuilder.build();
        Property prop = props.get(key);
        if (prop == null || prop.metadata() == null) {
            return;
        }
        // Ensure optional/advanced are set (needed when called from CodeAnalyzer for existing nodes)
        Property updatedProperty = AiUtils.copyAsOptionalAdvanced(prop);
        updatedProperty = AiUtils.createPropertyWithUpdatedLabel(updatedProperty, "Type Descriptor");
        if (updatedProperty.value() == null || updatedProperty.value().toString().isEmpty()) {
            updatedProperty = AiUtils.createUpdatedProperty(updatedProperty, STRING);
        }
        props.put(key, AiUtils.convertToSingleSelect(updatedProperty, TD_OPTIONS));
    }

    private Set<String> getVisibleSymbolNames(TemplateContext context) {
        if (cachedVisibleSymbolNames == null) {
            cachedVisibleSymbolNames = context.getAllVisibleSymbolNames();
        }
        return cachedVisibleSymbolNames;
    }

    @Override
    protected void setReturnTypeProperties(FunctionData functionData, TemplateContext context,
                                           String label, String doc, boolean hidden) {
        properties()
                .type(functionData.returnType(), false, functionData.importStatements(), hidden,
                        Property.RESULT_TYPE_LABEL)
                .data(functionData.returnType(), getVisibleSymbolNames(context), label, doc, false);
    }

    private void overrideVariableName(TemplateContext context) {
        if (formBuilder == null) {
            return;
        }
        Map<String, Property> props = formBuilder.build();
        Property variableProp = props.get(Property.VARIABLE_KEY);
        if (variableProp == null) {
            return;
        }
        String uniqueVarName = NameUtil.generateVariableName("string", getVisibleSymbolNames(context));
        props.put(Property.VARIABLE_KEY, AiUtils.createUpdatedProperty(variableProp, uniqueVarName));
    }

    public static void setAgentProperties(NodeBuilder nodeBuilder, TemplateContext context,
                                          Map<String, AiUtils.AgentPropertyValue> propertyValues) {
        FlowNode agentNodeTemplate = getOrCreateAgentTemplate(context);
        agentNodeTemplate.properties().forEach((key, property) -> {
            String value = (propertyValues != null && propertyValues.containsKey(key))
                    ? propertyValues.get(key).value()
                    : null;
            boolean isHidden = AGENT_PARAMS_TO_HIDE.contains(key);
            AiUtils.addPropertyFromTemplate(nodeBuilder, key, property, value, isHidden);
        });
    }

    public static void setAdditionalAgentProperties(NodeBuilder nodeBuilder,
                                                    Map<String, AiUtils.AgentPropertyValue> propertyValues) {
        setAdditionalAgentProperties(nodeBuilder, propertyValues, true);
    }

    /**
     * Adds the friendly {@code role} and {@code instructions} fields. On the AGENT node these are required
     * (the systemPrompt record they back has no other visible field), whereas on AGENT_CALL they stay optional.
     *
     * @param optional whether the role/instructions fields are optional
     */
    public static void setAdditionalAgentProperties(NodeBuilder nodeBuilder,
                                                    Map<String, AiUtils.AgentPropertyValue> propertyValues,
                                                    boolean optional) {
        AiUtils.AgentPropertyValue roleProperty = (propertyValues != null && propertyValues.containsKey(ROLE)) ?
                propertyValues.get(ROLE) : null;
        AiUtils.AgentPropertyValue instructionsProperty =
                (propertyValues != null && propertyValues.containsKey(INSTRUCTIONS)) ?
                        propertyValues.get(INSTRUCTIONS) : null;

        String roleValue = roleProperty != null ? roleProperty.value() : "";
        String instructionsValue = instructionsProperty != null ? instructionsProperty.value() : "";

        // Restore backticks for UI display (in case values contain ${"`"} from templates)
        roleValue = AiUtils.restoreBackticksFromStringTemplate(roleValue);
        instructionsValue = AiUtils.restoreBackticksFromStringTemplate(instructionsValue);

        // Default to PROMPT when no property value is provided (new/empty values)
        Property.ValueType roleSelectedType = roleProperty != null ?
                roleProperty.selectedType() : Property.ValueType.PROMPT;
        Property.ValueType instructionsSelectedType = instructionsProperty != null ?
                instructionsProperty.selectedType() : Property.ValueType.PROMPT;

        AiUtils.addStringProperty(nodeBuilder, ROLE, ROLE_LABEL, ROLE_DOC, ROLE_PLACEHOLDER, roleValue,
                roleSelectedType, optional);
        AiUtils.addStringProperty(nodeBuilder, INSTRUCTIONS, INSTRUCTIONS_LABEL, INSTRUCTIONS_DOC,
                INSTRUCTIONS_PLACEHOLDER, instructionsValue, instructionsSelectedType, optional);
    }

    private static FlowNode getOrCreateAgentTemplate(TemplateContext context) {
        String cacheKey = String.format("%s|%s|%s",
                context.codedata().org(),
                context.codedata().packageName(),
                context.codedata().version());
        return agentTemplateCache.computeIfAbsent(cacheKey, k ->
                new AgentBuilder().setConstData().setTemplateData(context).build()
        );
    }

    private void newVariableWithInferredTypeAndDefault(SourceBuilder sourceBuilder) {
        FlowNode flowNode = sourceBuilder.flowNode;
        Optional<Property> optionalType = sourceBuilder.getProperty(Property.TYPE_KEY);
        Optional<Property> variable = sourceBuilder.getProperty(Property.VARIABLE_KEY);

        if (optionalType.isEmpty() || variable.isEmpty()) {
            return;
        }

        Property type = optionalType.get();
        String typeName = type.value().toString();

        if (flowNode.codedata().inferredReturnType() != null) {
            Optional<Property> inferredParam = flowNode.properties().values().stream()
                    .filter(property -> property.codedata() != null && property.codedata().kind() != null &&
                            property.codedata().kind().equals(ParameterData.Kind.PARAM_FOR_TYPE_INFER.name()))
                    .findFirst();
            if (inferredParam.isPresent()) {
                String returnType = flowNode.codedata().inferredReturnType();
                Object inferredValue = inferredParam.get().value();
                // Default to "string" when the inferred type value is null or empty
                String inferredType = (inferredValue != null && !inferredValue.toString().isEmpty())
                        ? inferredValue.toString()
                        : "string";
                String inferredTypeDef = inferredParam.get()
                        .codedata().originalName();
                typeName = returnType.replace(inferredTypeDef, inferredType);
            }
        }

        sourceBuilder.token().expressionWithType(typeName, variable.get()).keyword(SyntaxKind.EQUAL_TOKEN);
    }

    @Override
    public Map<Path, List<TextEdit>> toSource(SourceBuilder sourceBuilder) {
        newVariableWithInferredTypeAndDefault(sourceBuilder);
        FlowNode agentCallNode = sourceBuilder.flowNode;

        Optional<Property> connection = agentCallNode.getProperty(Property.CONNECTION_KEY);
        if (connection.isEmpty()) {
            throw new IllegalStateException("Agent variable must be defined for an agent call node");
        }

        if (FlowNodeUtil.hasCheckKeyFlagSet(agentCallNode)) {
            sourceBuilder.token().keyword(SyntaxKind.CHECK_KEYWORD);
        }

        Set<String> excludeKeys = getExcludeKeys(agentCallNode);
        return sourceBuilder.token()
                .name(connection.get().toSourceCode())
                .keyword(BALLERINA.equals(agentCallNode.codedata().org()) ?
                        SyntaxKind.DOT_TOKEN : SyntaxKind.RIGHT_ARROW_TOKEN)
                .name(agentCallNode.metadata().label())
                .stepOut()
                .functionParameters(agentCallNode, excludeKeys)
                .textEdit()
                .build();
    }

    private Set<String> getExcludeKeys(FlowNode agentCallNode) {
        return agentCallNode.properties() != null
                ? agentCallNode.properties().keySet().stream()
                .filter(key -> !AGENT_CALL_PARAMS_TO_SHOW.contains(key))
                .collect(Collectors.toSet())
                : new HashSet<>();
    }

    /**
     * Builds the {@code systemPrompt} record value from the friendly {@code role} and {@code instructions} fields and
     * writes it to the target node. The role/instructions are read from {@code roleSource} (which may be the same node
     * as {@code systemPromptTarget}, as is the case for the AGENT node). PROMPT-typed values are escaped as string
     * templates. No-op when the target has no {@code systemPrompt} property.
     *
     * @param roleSource         the node providing the {@code role}/{@code instructions} property values
     * @param systemPromptTarget the node whose {@code systemPrompt} property is updated
     */
    public static void writeSystemPromptFromRoleInstructions(FlowNode roleSource, FlowNode systemPromptTarget) {
        Property systemPrompt = systemPromptTarget.properties().get(SYSTEM_PROMPT);
        if (systemPrompt == null) {
            return;
        }
        String role = roleSource.getProperty(ROLE).map(Property::value).orElse("").toString();
        String instructions = roleSource.getProperty(INSTRUCTIONS).map(Property::value).orElse("").toString();

        String escapedRole = isPromptTypeSelected(roleSource.getProperty(ROLE).orElse(null))
                ? AiUtils.replaceBackticksForStringTemplate(role) : role;
        String escapedInstructions = isPromptTypeSelected(roleSource.getProperty(INSTRUCTIONS).orElse(null))
                ? AiUtils.replaceBackticksForStringTemplate(instructions) : instructions;

        String systemPromptValue =
                "{role: " + escapedRole + ", instructions: " + escapedInstructions + "}";

        Property updatedProperty = AiUtils.createUpdatedProperty(systemPrompt, systemPromptValue);
        systemPromptTarget.properties().put(SYSTEM_PROMPT, updatedProperty);
    }

    private static boolean isPromptTypeSelected(Property property) {
        if (property == null || property.types() == null) {
            return false;
        }
        return property.types().stream()
                .anyMatch(type -> type.fieldType() == Property.ValueType.PROMPT && type.selected());
    }
}
