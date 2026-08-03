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
import io.ballerina.flowmodelgenerator.core.utils.FileSystemUtils;
import org.ballerinalang.langserver.common.utils.NameUtil;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;

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
        if (codedata != null && codedata.symbol() != null) {
            metadata().label(codedata.symbol()).description(DESCRIPTION);
            codedata()
                    .node(NodeKind.WORKFLOW_RUN)
                    .org(codedata.org())
                    .module(codedata.module())
                    .symbol(codedata.symbol())
                    .version(codedata.version());
        }

        // Get the input parameter type from the workflow function's second parameter
        TypeSymbol inputType = getWorkflowInputType(context, codedata);

        if  (inputType != null) {
            properties().custom()
                    .metadata()
                    .label(INPUT_LABEL)
                    .description(INPUT_DOC)
                    .stepOut()
                    .typeWithExpression(inputType, moduleInfo)
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

        // Get workflow function from codedata.symbol()
        String workflowFunction = flowNode.codedata().symbol();
        if (workflowFunction == null) {
            throw new IllegalStateException("Workflow symbol is required for WORKFLOW_RUN");
        }

        // Get input property
        Optional<Property> inputProp = sourceBuilder.getProperty(INPUT_KEY);
        Optional<String> input = inputProp
                .map(p -> p.value().toString())
                .filter(value -> !value.isBlank());

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
