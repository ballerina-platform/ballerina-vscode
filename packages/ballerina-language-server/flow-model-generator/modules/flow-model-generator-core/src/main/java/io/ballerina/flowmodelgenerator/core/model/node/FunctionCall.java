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
import io.ballerina.flowmodelgenerator.core.Constants;
import io.ballerina.flowmodelgenerator.core.UserFacingException;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.FlowNode;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.flowmodelgenerator.core.utils.FlowNodeUtil;
import io.ballerina.modelgenerator.commons.FunctionData;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.modelgenerator.commons.ParameterData;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Represents a function call node.
 *
 * @since 1.0.0
 */
public class FunctionCall extends CallBuilder {

    @Override
    public Map<Path, List<TextEdit>> toSource(SourceBuilder sourceBuilder) {
        FlowNode flowNode = sourceBuilder.flowNode;
        Codedata codedata = flowNode.codedata();
        if (isRunWithId(codedata) && !sourceBuilder.isForDiagnostics() && isWorkflowArgumentBlank(flowNode)) {
            throw new UserFacingException("Select a workflow in the " + WorkflowRunBuilder.WORKFLOW_NAME_LABEL
                    + " field");
        }
        if (isGetDefaultModelCall(codedata)) {
            sourceBuilder.token().keyword(SyntaxKind.FINAL_KEYWORD);
        }

        String resolvedReturnType = resolveLangLibReturnType(sourceBuilder.workspaceManager,
                sourceBuilder.filePath, flowNode);
        if (resolvedReturnType != null) {
            sourceBuilder.newVariableWithType(resolvedReturnType);
        } else {
            sourceBuilder.newVariableWithInferredType();
        }
        if (FlowNodeUtil.hasCheckKeyFlagSet(flowNode)) {
            sourceBuilder.token().keyword(SyntaxKind.CHECK_KEYWORD);
        }

        if (PackageUtil.isLocalFunction(sourceBuilder.workspaceManager, sourceBuilder.filePath,
                codedata.org(), codedata.module())) {
            return sourceBuilder.token()
                    .name(codedata.symbol())
                    .stepOut()
                    .functionParameters(flowNode,
                            Set.of(Property.VARIABLE_KEY, Property.TYPE_KEY, Property.CHECK_ERROR_KEY, "view"))
                    .textEdit()
                    .acceptImport()
                    .build();
        }

        String methodCall = sourceBuilder.importQualifier() + flowNode.metadata().label();

        return sourceBuilder.token()
                .name(methodCall)
                .stepOut()
                .functionParameters(flowNode, Set.of("variable", "type", "view", "checkError"))
                .textEdit()
                .acceptImportWithVariableType()
                .build();
    }

    // A node without the workflow argument is treated as blank, or the call would be written without it.
    private static boolean isWorkflowArgumentBlank(FlowNode flowNode) {
        return workflowArgumentKey(flowNode)
                .map(key -> flowNode.properties().get(key))
                .map(property -> property.value() == null || property.value().toString().isBlank())
                .orElse(true);
    }

    /**
     * The key of {@code workflow:runWithId}'s workflow argument: its first required parameter, which the template
     * and the re-read node both place first and render as the workflow dropdown.
     *
     * @param flowNode a {@code workflow:runWithId} call node
     * @return the key of the workflow dropdown, or empty when the node has none
     */
    public static Optional<String> workflowArgumentKey(FlowNode flowNode) {
        if (flowNode.properties() == null) {
            return Optional.empty();
        }
        return flowNode.properties().entrySet().stream()
                .filter(entry -> entry.getValue().codedata() != null
                        && ParameterData.Kind.REQUIRED.name().equals(entry.getValue().codedata().kind()))
                .findFirst()
                .filter(entry -> entry.getValue().types() != null && entry.getValue().types().stream()
                        .anyMatch(type -> type.fieldType() == Property.ValueType.SINGLE_SELECT))
                .map(Map.Entry::getKey);
    }

    private boolean isGetDefaultModelCall(Codedata codedata) {
        return codedata != null && Constants.BALLERINA.equals(codedata.org())
                && Constants.AI.equals(codedata.module()) && Constants.DEFAULT_MODEL_PROVIDER.equals(codedata.symbol());
    }

    @Override
    protected NodeKind getFunctionNodeKind() {
        return NodeKind.FUNCTION_CALL;
    }

    @Override
    protected FunctionData.Kind getFunctionResultKind() {
        return FunctionData.Kind.FUNCTION;
    }
}
