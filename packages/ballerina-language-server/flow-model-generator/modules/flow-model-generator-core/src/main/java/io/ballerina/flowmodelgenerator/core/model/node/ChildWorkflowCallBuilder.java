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
import io.ballerina.compiler.api.symbols.TypeDescKind;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.api.symbols.UnionTypeSymbol;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.NodeBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.FileSystemUtils;
import org.ballerinalang.langserver.common.utils.NameUtil;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.CALL_CHILD_WORKFLOW_DESCRIPTION;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.CALL_CHILD_WORKFLOW_LABEL;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.CALL_CHILD_WORKFLOW_METHOD_NAME;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_MODULE;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_ORG;

/**
 * Represents a synchronous child-workflow call node. Generates a {@code ctx->callWorkflow(...)}
 * call that runs the selected workflow function as a Temporal child workflow and durably waits
 * for its result in one step.
 *
 * <p>Generated source example:
 * <pre>{@code
 * LoanDecision result = check ctx->callWorkflow(loanWorkflow, application);
 * }</pre>
 *
 * @since 1.9.0
 */
public class ChildWorkflowCallBuilder extends NodeBuilder {

    public static final String LABEL = CALL_CHILD_WORKFLOW_LABEL;
    public static final String DESCRIPTION = CALL_CHILD_WORKFLOW_DESCRIPTION;

    public static final String INPUT_KEY = "input";
    public static final String INPUT_LABEL = "Input";
    public static final String INPUT_DOC = "Input data for the child workflow";
    private static final String DEFAULT_VARIABLE_NAME = "childResult";
    private static final String DEFAULT_RESULT_TYPE = "json";

    @Override
    public void setConcreteConstData() {
        metadata().label(LABEL).description(DESCRIPTION);
        codedata()
                .node(NodeKind.CHILD_WORKFLOW_CALL)
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
                    .node(NodeKind.CHILD_WORKFLOW_CALL)
                    .org(codedata.org())
                    .module(codedata.module())
                    .symbol(codedata.symbol())
                    .version(codedata.version());
        }

        TypeSymbol inputType = ChildWorkflowRunBuilder.findSelectedWorkflowInputType(context, codedata);
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

        // Result variable typed with the child workflow's return type (without the error part):
        // callWorkflow is dependently typed, so a concrete contextually-expected type is required.
        String resultType = resolveResultType(context, codedata);
        properties().custom()
                .metadata()
                    .label("Result Type")
                    .description("Type of the child workflow's result.")
                    .stepOut()
                .type(Property.ValueType.TYPE)
                .value(resultType)
                .editable(true)
                .stepOut()
                .addProperty(Property.TYPE_KEY);

        String resultVarName = NameUtil.generateTypeName(DEFAULT_VARIABLE_NAME,
                context.getAllVisibleSymbolNames());
        properties().custom()
                .metadata()
                    .label("Result Variable Name")
                    .description("Variable name to receive the child workflow's result.")
                    .stepOut()
                .type(Property.ValueType.IDENTIFIER)
                .value(resultVarName)
                .editable(true)
                .stepOut()
                .addProperty(Property.VARIABLE_KEY);
    }

    @Override
    public Map<Path, List<TextEdit>> toSource(SourceBuilder sourceBuilder) {
        String childWorkflowFunction = sourceBuilder.flowNode.codedata().symbol();
        if (childWorkflowFunction == null || childWorkflowFunction.isBlank()) {
            throw new IllegalStateException("A workflow function symbol is required for CHILD_WORKFLOW_CALL");
        }

        String resultType = sourceBuilder.getProperty(Property.TYPE_KEY)
                .map(p -> p.value().toString())
                .filter(value -> !value.isBlank())
                .orElse(DEFAULT_RESULT_TYPE);
        String variableName = sourceBuilder.getProperty(Property.VARIABLE_KEY)
                .map(p -> p.value().toString())
                .filter(value -> !value.isBlank())
                .orElse(DEFAULT_VARIABLE_NAME);
        Optional<String> input = sourceBuilder.getProperty(INPUT_KEY)
                .map(p -> p.value().toString())
                .filter(value -> !value.isBlank());

        String ctxParamName = ActivityCallBuilder.resolveContextParamName(sourceBuilder);

        sourceBuilder.token()
                .name(resultType)
                .whiteSpace()
                .name(variableName)
                .whiteSpace()
                .keyword(SyntaxKind.EQUAL_TOKEN)
                .keyword(SyntaxKind.CHECK_KEYWORD)
                .name(ctxParamName)
                .keyword(SyntaxKind.RIGHT_ARROW_TOKEN)
                .name(CALL_CHILD_WORKFLOW_METHOD_NAME)
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

    // Derives the child workflow's success return type (the union minus error); falls back to json.
    private String resolveResultType(TemplateContext context, Codedata codedata) {
        if (codedata == null || codedata.symbol() == null) {
            return DEFAULT_RESULT_TYPE;
        }
        try {
            SemanticModel semanticModel = FileSystemUtils.getSemanticModel(context.workspaceManager(),
                    context.filePath());
            Optional<Symbol> targetSymbol = semanticModel.moduleSymbols().stream()
                    .filter(symbol -> symbol.kind() == SymbolKind.FUNCTION)
                    .filter(symbol -> symbol.getName().orElse("").equals(codedata.symbol()))
                    .findFirst();
            if (targetSymbol.isEmpty()) {
                return DEFAULT_RESULT_TYPE;
            }
            Optional<TypeSymbol> returnType = ((FunctionSymbol) targetSymbol.get())
                    .typeDescriptor().returnTypeDescriptor();
            if (returnType.isEmpty()) {
                return DEFAULT_RESULT_TYPE;
            }
            String signature = successTypeSignature(semanticModel, returnType.get());
            if (signature.isBlank() || "()".equals(signature) || "error".equals(signature)) {
                return DEFAULT_RESULT_TYPE;
            }
            return signature;
        } catch (RuntimeException e) {
            return DEFAULT_RESULT_TYPE;
        }
    }

    /**
     * The signature of the return type with its error members removed — the generated statement
     * checks the error away, so the result variable must be typed with the success part alone.
     *
     * <p>{@code CommonUtils.getTypeSignature} already drops the error members of a union written
     * out at the return position, but not of a union hidden behind a type reference
     * ({@code type Outcome LoanDecision|error;}), which is why that one is resolved here. A union
     * that carries no error member keeps its declared name.
     *
     * @param semanticModel the semantic model owning the type
     * @param returnType    the workflow function's declared return type
     * @return the success type signature, or an empty string when the type is error-only
     */
    private static String successTypeSignature(SemanticModel semanticModel, TypeSymbol returnType) {
        TypeSymbol resolved = returnType.typeKind() == TypeDescKind.UNION
                ? returnType : CommonUtils.getRawType(returnType);
        if (resolved.typeKind() != TypeDescKind.UNION) {
            return CommonUtils.getTypeSignature(semanticModel, returnType, true);
        }
        List<TypeSymbol> members = ((UnionTypeSymbol) resolved).memberTypeDescriptors();
        List<TypeSymbol> successMembers = members.stream()
                .filter(member -> !member.subtypeOf(semanticModel.types().ERROR))
                .toList();
        if (successMembers.isEmpty()) {
            return "";
        }
        if (successMembers.size() == members.size()) {
            return CommonUtils.getTypeSignature(semanticModel, returnType, true);
        }
        return successMembers.stream()
                .map(member -> CommonUtils.getTypeSignature(semanticModel, member, true))
                .collect(Collectors.joining("|"));
    }
}
