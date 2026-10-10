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

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.FunctionSymbol;
import io.ballerina.compiler.api.symbols.ParameterSymbol;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.SymbolKind;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.FlowNode;
import io.ballerina.flowmodelgenerator.core.model.NodeBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.modelgenerator.commons.FileSystemUtils;
import io.ballerina.modelgenerator.commons.ParameterData;
import org.ballerinalang.langserver.common.utils.NameUtil;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.DURABLE_AGENT_OBJECT_CLASS_NAME;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_MODULE;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_ORG;

/**
 * Represents a workflow start node that generates workflow:run calls.
 * This node is used to run a workflow function.
 *
 * @since 1.8.0
 */
public class WorkflowRunBuilder extends NodeBuilder {

    public static final String LABEL = "Run Workflow";
    public static final String DESCRIPTION = "Run a workflow instance";

    public static final String INPUT_KEY = "input";
    public static final String WORKFLOW_NAME_KEY = "workflow";
    public static final String WORKFLOW_NAME_LABEL = "Workflow";
    public static final String WORKFLOW_NAME_DOC = "The workflow to start";
    public static final String INPUT_LABEL = "Input";
    public static final String INPUT_DOC = "Input data for the workflow";
    private static final String RUN_METHOD = "run";

    @Override
    public void setConcreteConstData() {
        metadata().label(LABEL).description(DESCRIPTION);
        codedata()
                .node(NodeKind.WORKFLOW_RUN)
                .org(WORKFLOW_ORG)
                .module(WORKFLOW_MODULE);
    }

    @Override
    public void setConcreteTemplateData(TemplateContext context) {
        Codedata codedata = context.codedata();

        // Set metadata from codedata if available (from search result)
        boolean durableAgent = codedata != null
                && DURABLE_AGENT_OBJECT_CLASS_NAME.equals(codedata.object());
        if (codedata != null && codedata.symbol() != null) {
            metadata().label(codedata.symbol()).description(DESCRIPTION);
            codedata()
                    .node(NodeKind.WORKFLOW_RUN)
                    .org(codedata.org())
                    .module(codedata.module())
                    .symbol(codedata.symbol())
                    .object(codedata.object())
                    .version(codedata.version());
        }

        if (durableAgent) {
            // A durable agentic workflow starts with agent.run(query): its input defaults to
            // the query text (the agent's declared inputType, string unless overridden).
            properties().custom()
                    .metadata()
                    .label(INPUT_LABEL)
                    .description("The input the agent is started with (the query text by default)")
                    .stepOut()
                    .type(Property.ValueType.EXPRESSION)
                    .placeholder("\"\"")
                    .value("")
                    .editable(true)
                    .stepOut()
                    .addProperty(INPUT_KEY);
        }

        if (!durableAgent) {
            // Pre-selected to whatever the list was clicked on, and editable so the choice can be
            // changed — and read — from the form itself, as the child workflow forms do.
            properties().custom()
                    .metadata()
                        .label(WORKFLOW_NAME_LABEL)
                        .description(WORKFLOW_NAME_DOC)
                        .stepOut()
                    .type()
                        .fieldType(Property.ValueType.SINGLE_SELECT)
                        .options(SendDataBuilder.getAvailableWorkflowFunctions(context))
                        .selected(true)
                        .stepOut()
                    .codedata()
                        .kind(ParameterData.Kind.REQUIRED.name())
                        .stepOut()
                    .value(codedata != null && codedata.symbol() != null ? codedata.symbol() : "")
                    .editable(true)
                    .stepOut()
                    .addProperty(WORKFLOW_NAME_KEY);
        }

        // Get the input parameter type from the workflow function's second parameter
        TypeSymbol inputType = durableAgent ? null : getWorkflowInputType(context, codedata);

        if  (inputType != null) {
            properties().custom()
                    .metadata()
                    .label(INPUT_LABEL)
                    .description(INPUT_DOC)
                    .stepOut()
                    .typeWithExpression(inputType, moduleInfo)
                    // Typed from the chosen workflow, so a new choice in the form retypes it.
                    .codedata().dependentProperty(WORKFLOW_NAME_KEY).stepOut()
                    .placeholder("")
                    .value("")
                    .editable(true)
                    .stepOut()
                    .addProperty(INPUT_KEY);
        }

        // Variable property for result. Generate a unique default name so that adding
        // multiple Run Workflow nodes does not produce duplicate variable declarations.
        String workflowIdVarName = NameUtil.generateTypeName("workflowId", context.getAllVisibleSymbolNames());
        properties().custom()
                .metadata()
                    .label("Workflow ID Variable Name")
                    .description("Variable name to receive the started workflow ID.")
                    .stepOut()
                .type(Property.ValueType.IDENTIFIER)
                .value(workflowIdVarName)
                .editable(true)
                .stepOut()
                .addProperty(Property.VARIABLE_KEY);
    }

    @Override
    public Map<Path, List<TextEdit>> toSource(SourceBuilder sourceBuilder) {
        FlowNode flowNode = sourceBuilder.flowNode;

        // Get variable name property
        Optional<Property> variableProp = sourceBuilder.getProperty(Property.VARIABLE_KEY);
        String variableName = variableProp
                .map(p -> p.value().toString())
                .filter(value -> !value.isBlank())
                .orElse("workflowId");

        // Generate: string workflowId = check workflow:run(workflowFunction, input);
        sourceBuilder.token()
                .keyword(SyntaxKind.STRING_KEYWORD)
                .name(variableName)
                .whiteSpace()
                .keyword(SyntaxKind.EQUAL_TOKEN)
                .keyword(SyntaxKind.CHECK_KEYWORD);

        // The form's selection wins; the codedata symbol is what the palette selected and remains
        // the fallback (and the only source for a durable agent, whose form has no dropdown).
        String workflowFunction = sourceBuilder.getProperty(WORKFLOW_NAME_KEY)
                .map(p -> p.value() == null ? "" : p.value().toString().trim())
                .filter(value -> !value.isBlank())
                .orElseGet(() -> flowNode.codedata().symbol());
        if (workflowFunction == null) {
            throw new IllegalStateException("Workflow symbol is required for WORKFLOW_RUN");
        }

        // Get input property
        Optional<Property> inputProp = sourceBuilder.getProperty(INPUT_KEY);
        Optional<String> input = inputProp
                .map(p -> p.value().toString())
                .filter(value -> !value.isBlank());

        if (DURABLE_AGENT_OBJECT_CLASS_NAME.equals(flowNode.codedata().object())) {
            // Durable agentic workflow: agent.run(<input>) — the same unified start as the
            // management API; run always takes the query/input argument.
            sourceBuilder.token()
                    .name(workflowFunction)
                    .keyword(SyntaxKind.DOT_TOKEN)
                    .name(RUN_METHOD)
                    .keyword(SyntaxKind.OPEN_PAREN_TOKEN)
                    .name(input.orElse("\"\""))
                    .keyword(SyntaxKind.CLOSE_PAREN_TOKEN)
                    .endOfStatement();
            return sourceBuilder
                    .textEdit()
                    .acceptImport(WORKFLOW_ORG, WORKFLOW_MODULE)
                    .build();
        }

        // Build: workflow:run(workflowFunction, input)
        sourceBuilder.token()
                .name(WORKFLOW_MODULE)
                .keyword(SyntaxKind.COLON_TOKEN)
                .name(RUN_METHOD)
                .keyword(SyntaxKind.OPEN_PAREN_TOKEN)
                .name(workflowFunction);
        input.ifPresent(s -> sourceBuilder.token()
                .keyword(SyntaxKind.COMMA_TOKEN)
                .whiteSpace()
                .name(s));

        sourceBuilder.token()
                .keyword(SyntaxKind.CLOSE_PAREN_TOKEN)
                .endOfStatement();

        return sourceBuilder
                .textEdit()
                .acceptImport(WORKFLOW_ORG, WORKFLOW_MODULE)
                .build();
    }

    /**
     * Gets the input parameter type from the workflow process function.
     * The input parameter is the one whose type is a subtype of anydata.
     *
     * @param context  The template context
     * @param codedata The codedata containing the workflow function symbol
     * @return The type of the input parameter, or null if not found
     */
    private TypeSymbol getWorkflowInputType(TemplateContext context, Codedata codedata) {
        if (codedata == null || codedata.symbol() == null) {
            return null;
        }

        SemanticModel semanticModel = FileSystemUtils.getSemanticModel(context.workspaceManager(), context.filePath());
        // Find the function symbol matching the workflow function name
        Optional<Symbol> targetSymbol = semanticModel.moduleSymbols().stream()
                .filter(symbol -> symbol.kind() == SymbolKind.FUNCTION)
                .filter(symbol -> symbol.getName().orElse("").equals(codedata.symbol()))
                .findFirst();
        if  (targetSymbol.isEmpty()) {
            return null;
        }

        Symbol sym = targetSymbol.get();
        if (sym.kind() == SymbolKind.FUNCTION) {
            return findWorkflowInputType((FunctionSymbol) sym, semanticModel);
        }

        return null;
    }

    /**
     * Returns the type of a workflow function's input parameter: the first parameter whose type is
     * a subtype of {@code anydata} (the {@code workflow:Context} and events-record parameters are
     * not subtypes of {@code anydata}, so they are skipped). Returns {@code null} when the function
     * declares no input parameter.
     *
     * @param functionSymbol the workflow function symbol
     * @param semanticModel  the semantic model
     * @return the input parameter type, or {@code null} if the function takes no input
     */
    public static TypeSymbol findWorkflowInputType(FunctionSymbol functionSymbol, SemanticModel semanticModel) {
        List<ParameterSymbol> params = functionSymbol.typeDescriptor().params().orElse(List.of());
        for (ParameterSymbol param : params) {
            if (param.typeDescriptor().subtypeOf(semanticModel.types().ANYDATA)) {
                return param.typeDescriptor();
            }
        }
        return null;
    }
}
