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
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.FlowNode;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.flowmodelgenerator.core.utils.FlowNodeUtil;
import io.ballerina.modelgenerator.commons.FunctionData;
import io.ballerina.modelgenerator.commons.PackageUtil;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;
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
