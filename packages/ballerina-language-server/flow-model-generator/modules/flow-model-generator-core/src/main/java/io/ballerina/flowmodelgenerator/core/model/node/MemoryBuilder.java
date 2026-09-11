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

package io.ballerina.flowmodelgenerator.core.model.node;

import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.flowmodelgenerator.core.utils.FlowNodeUtil;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.FunctionData;
import io.ballerina.modelgenerator.commons.FunctionDataBuilder;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.projects.Module;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Represents memory node in the flow model.
 *
 * @since 1.3.0
 */
public class MemoryBuilder extends CallBuilder {

    public static final String LABEL = "Memory";

    private static final String MEMORY_NAME_LABEL = "Memory Name";
    private static final String MEMORY_NAME_LABEL_DOC = "Name of the memory instance";
    private static final String MESSAGE_WINDOW_CHAT_MEMORY_CLASS = "MessageWindowChatMemory";

    @Override
    public void setConcreteConstData() {
        metadata().label(LABEL);
        codedata().node(NodeKind.MEMORY);
    }

    @Override
    protected NodeKind getFunctionNodeKind() {
        return NodeKind.MEMORY;
    }

    @Override
    protected FunctionData.Kind getFunctionResultKind() {
        return FunctionData.Kind.MEMORY;
    }

    @Override
    public void setConcreteTemplateData(TemplateContext context) {
        Codedata codedata = context.codedata();
        ModuleInfo codedataModuleInfo = new ModuleInfo(codedata.org(), codedata.resolvePackageName(),
                codedata.module(), codedata.version());

        FunctionData functionData = new FunctionDataBuilder().moduleInfo(codedataModuleInfo).userModuleInfo(moduleInfo)
                .parentSymbolType(codedata.object()).name(codedata.symbol())
                .lsClientLogger(context.lsClientLogger()).functionResultKind(FunctionData.Kind.MEMORY)
                .workspaceManager(context.workspaceManager())
                .filePath(context.filePath())
                .build();

        metadata().label(functionData.packageName()).description(functionData.description())
                .icon(CommonUtils.generateIcon(functionData.org(), functionData.packageName(), functionData.version()));

        codedata().node(NodeKind.MEMORY)
                .org(functionData.org()).module(functionData.moduleName())
                .packageName(functionData.packageName()).version(functionData.version())
                .object(functionData.name())
                .symbol(codedata.symbol());

        if (CommonUtils.hasReturn(functionData.returnType())) {
            setReturnTypeProperties(functionData, context, MEMORY_NAME_LABEL, MEMORY_NAME_LABEL_DOC,
                    false);
        }
        Module module = context.workspaceManager().module(context.filePath()).orElse(null);
        setParameterProperties(functionData, module);
        if (!codedata.object().equals(MESSAGE_WINDOW_CHAT_MEMORY_CLASS)) {
            properties().checkError(true, Property.CHECK_ERROR_DOC, false);
        }
    }

    @Override
    public Map<Path, List<TextEdit>> toSource(SourceBuilder sourceBuilder) {
        sourceBuilder.token().keyword(SyntaxKind.FINAL_KEYWORD).stepOut().newVariable();

        // Conditionally add check keyword based on the property
        if (FlowNodeUtil.hasCheckKeyFlagSet(sourceBuilder.flowNode) &&
                !sourceBuilder.flowNode.codedata().object().equals(MESSAGE_WINDOW_CHAT_MEMORY_CLASS)) {
            sourceBuilder.token().keyword(SyntaxKind.CHECK_KEYWORD);
        }

        sourceBuilder.token().keyword(SyntaxKind.NEW_KEYWORD);
        sourceBuilder.functionParameters(sourceBuilder.flowNode,
                Set.of(Property.VARIABLE_KEY, Property.TYPE_KEY, Property.SCOPE_KEY, Property.CHECK_ERROR_KEY));
        sourceBuilder.textEdit();
        sourceBuilder.acceptImport();
        return sourceBuilder.build();
    }

}
