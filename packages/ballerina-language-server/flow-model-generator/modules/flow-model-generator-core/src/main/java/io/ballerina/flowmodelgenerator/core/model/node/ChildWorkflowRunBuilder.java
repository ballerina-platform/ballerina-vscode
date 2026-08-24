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
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.SymbolKind;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
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

import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.RUN_CHILD_WORKFLOW_DESCRIPTION;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.RUN_CHILD_WORKFLOW_LABEL;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.RUN_CHILD_WORKFLOW_METHOD_NAME;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_MODULE;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_ORG;

/**
 * Represents a child-workflow start node. Generates a {@code ctx->runChildWorkflow(...)} call
 * that starts the selected workflow function as a Temporal child workflow and binds the new
 * child workflow ID without waiting for the child's result.
 *
 * <p>Generated source example:
 * <pre>{@code
 * string childWorkflowId = check ctx->runChildWorkflow(kycWorkflow, applicant);
 * }</pre>
 *
 * @since 1.9.0
 */
public class ChildWorkflowRunBuilder extends NodeBuilder {

    public static final String LABEL = RUN_CHILD_WORKFLOW_LABEL;
    public static final String DESCRIPTION = RUN_CHILD_WORKFLOW_DESCRIPTION;

    public static final String INPUT_KEY = "input";
    public static final String INPUT_LABEL = "Input";
    public static final String INPUT_DOC = "Input data for the child workflow";
    // Which workflow is started is the first thing this statement says, so the form shows it
    // rather than leaving it implicit in whatever the palette was clicked on.
    public static final String WORKFLOW_NAME_KEY = "workflow";
    public static final String WORKFLOW_NAME_LABEL = "Child Workflow";
    public static final String WORKFLOW_NAME_DOC = "The workflow to start as a child of this one";
    private static final String DEFAULT_VARIABLE_NAME = "childWorkflowId";

    @Override
    public void setConcreteConstData() {
        metadata().label(LABEL).description(DESCRIPTION);
        codedata()
                .node(NodeKind.CHILD_WORKFLOW_RUN)
                .org(WORKFLOW_ORG)
                .module(WORKFLOW_MODULE);
    }

    @Override
    public void setConcreteTemplateData(TemplateContext context) {
        Codedata codedata = context.codedata();

        // The symbol carries the workflow function selected from the workflow list.
        if (codedata != null && codedata.symbol() != null) {
            metadata().label(codedata.symbol()).description(DESCRIPTION);
            codedata()
                    .node(NodeKind.CHILD_WORKFLOW_RUN)
                    .org(codedata.org())
                    .module(codedata.module())
                    .symbol(codedata.symbol())
                    .version(codedata.version());
        }

        // Pre-selected to whatever the list was clicked on, and editable so the choice can be
        // changed — and read — from the form itself.
        String selectedWorkflow = codedata != null && codedata.symbol() != null ? codedata.symbol() : "";
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
                .value(selectedWorkflow)
                .editable(true)
                .stepOut()
                .addProperty(WORKFLOW_NAME_KEY);

        TypeSymbol inputType = findSelectedWorkflowInputType(context, codedata);
        if (inputType != null) {
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

        String childIdVarName = NameUtil.generateTypeName(DEFAULT_VARIABLE_NAME,
                context.getAllVisibleSymbolNames());
        properties().custom()
                .metadata()
                    .label("Child Workflow ID Variable Name")
                    .description("Variable name to receive the started child workflow ID.")
                    .stepOut()
                .type(Property.ValueType.IDENTIFIER)
                .value(childIdVarName)
                .editable(true)
                .stepOut()
                .addProperty(Property.VARIABLE_KEY);
    }

    @Override
    public Map<Path, List<TextEdit>> toSource(SourceBuilder sourceBuilder) {
        // The form's selection wins, so changing it in the form changes the generated call; the
        // codedata symbol is what the palette selected and remains the fallback.
        String childWorkflowFunction = sourceBuilder.getProperty(WORKFLOW_NAME_KEY)
                .map(property -> property.value() == null ? "" : property.value().toString().trim())
                .filter(value -> !value.isBlank())
                .orElseGet(() -> sourceBuilder.flowNode.codedata().symbol());
        if (childWorkflowFunction == null || childWorkflowFunction.isBlank()) {
            throw new IllegalStateException("A workflow function symbol is required for CHILD_WORKFLOW_RUN");
        }

        String variableName = sourceBuilder.getProperty(Property.VARIABLE_KEY)
                .map(p -> p.value().toString())
                .filter(value -> !value.isBlank())
                .orElse(DEFAULT_VARIABLE_NAME);
        Optional<String> input = sourceBuilder.getProperty(INPUT_KEY)
                .map(p -> p.value().toString())
                .filter(value -> !value.isBlank());

        String ctxParamName = ActivityCallBuilder.resolveContextParamName(sourceBuilder);

        sourceBuilder.token()
                .keyword(SyntaxKind.STRING_KEYWORD)
                .name(variableName)
                .whiteSpace()
                .keyword(SyntaxKind.EQUAL_TOKEN)
                .keyword(SyntaxKind.CHECK_KEYWORD)
                .name(ctxParamName)
                .keyword(SyntaxKind.RIGHT_ARROW_TOKEN)
                .name(RUN_CHILD_WORKFLOW_METHOD_NAME)
                .keyword(SyntaxKind.OPEN_PAREN_TOKEN)
                .name(childWorkflowFunction);
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
     * Resolves the input parameter type of the selected child workflow function: the first
     * parameter whose type is a subtype of {@code anydata}.
     *
     * @param context  the template context
     * @param codedata the codedata carrying the selected workflow function symbol
     * @return the input parameter type, or {@code null} when the function takes no input
     */
    static TypeSymbol findSelectedWorkflowInputType(TemplateContext context, Codedata codedata) {
        if (codedata == null || codedata.symbol() == null) {
            return null;
        }
        SemanticModel semanticModel = FileSystemUtils.getSemanticModel(context.workspaceManager(),
                context.filePath());
        Optional<Symbol> targetSymbol = semanticModel.moduleSymbols().stream()
                .filter(symbol -> symbol.kind() == SymbolKind.FUNCTION)
                .filter(symbol -> symbol.getName().orElse("").equals(codedata.symbol()))
                .findFirst();
        return targetSymbol
                .map(symbol -> WorkflowRunBuilder.findWorkflowInputType((FunctionSymbol) symbol, semanticModel))
                .orElse(null);
    }
}
