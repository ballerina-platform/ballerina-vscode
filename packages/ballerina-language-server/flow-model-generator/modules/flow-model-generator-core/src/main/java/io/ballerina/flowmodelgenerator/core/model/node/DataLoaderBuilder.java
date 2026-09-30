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
import io.ballerina.flowmodelgenerator.core.model.NodeBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
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
 * Represents data loader node in the flow model.
 *
 * @since 1.1.1
 */
public class DataLoaderBuilder extends CallBuilder {
    public static final String LABEL = "Data Loader";
    public static final String DESCRIPTION = "Data loaders available in the integration";

    private static final String DATA_LOADER_NAME_LABEL = "Data Loader Name";
    private static final String DATA_LOADER_NAME_LABEL_DOC = "Data loader instance name";
    private static final String CHECK_ERROR_DOC = "Terminate on error";

    @Override
    public void setConcreteConstData() {
        metadata().label(LABEL);
        codedata().node(NodeKind.DATA_LOADER);
    }

    @Override
    protected NodeKind getFunctionNodeKind() {
        return NodeKind.DATA_LOADER;
    }

    @Override
    protected FunctionData.Kind getFunctionResultKind() {
        return FunctionData.Kind.DATA_LOADER;
    }

    @Override
    public Map<Path, List<TextEdit>> toSource(SourceBuilder sourceBuilder) {
        return sourceBuilder.token().keyword(SyntaxKind.FINAL_KEYWORD).stepOut().newVariable()
                .token().keyword(SyntaxKind.CHECK_KEYWORD).stepOut()
                .token().keyword(SyntaxKind.NEW_KEYWORD).stepOut().functionParameters(sourceBuilder.flowNode,
                        Set.of(Property.VARIABLE_KEY, Property.TYPE_KEY, Property.SCOPE_KEY, Property.CHECK_ERROR_KEY))
                .textEdit().acceptImport().build();
    }

    @Override
    public void setConcreteTemplateData(NodeBuilder.TemplateContext context) {
        Codedata codedata = context.codedata();
        ModuleInfo codedataModuleInfo = new ModuleInfo(codedata.org(), codedata.resolvePackageName(),
                codedata.module(), codedata.version());

        FunctionData functionData = new FunctionDataBuilder().parentSymbolType(codedata.object())
                .name(codedata.symbol()).moduleInfo(codedataModuleInfo).userModuleInfo(moduleInfo)
                .lsClientLogger(context.lsClientLogger()).functionResultKind(FunctionData.Kind.DATA_LOADER)
                .workspaceManager(context.workspaceManager())
                .filePath(context.filePath())
                .build();

        metadata().label(functionData.packageName()).description(functionData.description())
                .icon(CommonUtils.generateIcon(functionData.org(), functionData.packageName(), functionData.version()));

        codedata().org(functionData.org()).module(functionData.moduleName())
                .packageName(functionData.packageName()).object(functionData.name())
                .version(functionData.version());

        if (CommonUtils.hasReturn(functionData.returnType())) {
            setReturnTypeProperties(functionData, context, DATA_LOADER_NAME_LABEL,
                    DATA_LOADER_NAME_LABEL_DOC, false);
        }
        Module module = context.workspaceManager().module(context.filePath()).orElse(null);
        setParameterProperties(functionData, module);
        properties().scope(Property.GLOBAL_SCOPE).checkError(true, CHECK_ERROR_DOC, false);
    }
}
