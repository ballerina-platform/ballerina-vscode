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
import io.ballerina.flowmodelgenerator.core.model.FormBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.flowmodelgenerator.core.utils.FlowNodeUtil;
import io.ballerina.flowmodelgenerator.core.utils.ParamUtils;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.FunctionData;
import io.ballerina.modelgenerator.commons.FunctionDataBuilder;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.ParameterData;
import io.ballerina.projects.Module;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Represents vector store node in the flow model.
 *
 * @since 1.1.0
 */
public class VectorStoreBuilder extends CallBuilder {

    public static final String LABEL = "Vector Store";
    public static final String DESCRIPTION = "Vector stores available in the integration";

    private static final String VECTOR_STORE_NAME_LABEL = "Vector Store Name";
    private static final String VECTOR_STORE_NAME_LABEL_DOC = "Vector store instance name";
    private static final String CHECK_ERROR_DOC = "Terminate on error";

    @Override
    public void setConcreteConstData() {
        metadata().label(LABEL);
        codedata().node(NodeKind.VECTOR_STORE);
    }

    @Override
    protected NodeKind getFunctionNodeKind() {
        return NodeKind.VECTOR_STORE;
    }

    @Override
    protected FunctionData.Kind getFunctionResultKind() {
        return FunctionData.Kind.VECTOR_STORE;
    }

    @Override
    public Map<Path, List<TextEdit>> toSource(SourceBuilder sourceBuilder) {
        return sourceBuilder.token().keyword(SyntaxKind.FINAL_KEYWORD).stepOut().newVariable()
                .token().keyword(SyntaxKind.CHECK_KEYWORD).keyword(SyntaxKind.NEW_KEYWORD)
                .stepOut().functionParameters(sourceBuilder.flowNode,
                        Set.of(Property.VARIABLE_KEY, Property.TYPE_KEY, Property.SCOPE_KEY, Property.CHECK_ERROR_KEY))
                .textEdit().acceptImport().build();
    }

    @Override
    public void setConcreteTemplateData(NodeBuilder.TemplateContext context) {
        Codedata codedata = context.codedata();
        ModuleInfo codedataModuleInfo = new ModuleInfo(codedata.org(), codedata.resolvePackageName(),
                codedata.module(), codedata.version());

        FunctionData functionData = new FunctionDataBuilder()
                .parentSymbolType(codedata.object()).name(codedata.symbol())
                .moduleInfo(codedataModuleInfo)
                .lsClientLogger(context.lsClientLogger()).functionResultKind(FunctionData.Kind.VECTOR_STORE)
                .userModuleInfo(moduleInfo)
                .workspaceManager(context.workspaceManager())
                .filePath(context.filePath())
                .build();

        metadata().label(functionData.packageName()).description(functionData.description())
                .icon(CommonUtils.generateIcon(functionData.org(), functionData.packageName(), functionData.version()));

        codedata().node(NodeKind.VECTOR_STORE).org(functionData.org()).module(functionData.moduleName())
                .packageName(functionData.packageName()).object(functionData.name()).version(functionData.version());

        if (CommonUtils.hasReturn(functionData.returnType())) {
            setReturnTypeProperties(functionData, context, VECTOR_STORE_NAME_LABEL, VECTOR_STORE_NAME_LABEL_DOC,
                    false);
        }
        Module module = context.workspaceManager().module(context.filePath()).orElse(null);
        setParameterProperties(functionData, module);
        properties().scope(Property.GLOBAL_SCOPE).checkError(true, CHECK_ERROR_DOC, false);
    }

    protected void setParameterProperties(FunctionData function, Module module) {
        boolean hasOnlyRestParams = function.parameters().size() == 1;

        for (ParameterData paramResult : function.parameters().values()) {
            if (paramResult.kind() == ParameterData.Kind.PARAM_FOR_TYPE_INFER) {
                buildInferredTypeProperty(this, paramResult, null, module);
                continue;
            }

            if (paramResult.kind().equals(ParameterData.Kind.INCLUDED_RECORD)) {
                continue;
            }

            String unescapedParamName = ParamUtils.removeLeadingSingleQuote(paramResult.name());
            Property.Builder<FormBuilder<NodeBuilder>> customPropBuilder = properties().custom();
            String label = paramResult.label();
            customPropBuilder
                    .metadata()
                        .label(label == null || label.isEmpty() ? unescapedParamName : label)
                        .description(paramResult.description())
                        .stepOut()
                    .codedata()
                        .kind(paramResult.kind().name())
                        .originalName(paramResult.name())
                        .stepOut()
                    .placeholder(paramResult.placeholder())
                    .defaultValue(paramResult.defaultValue())
                    .editable()
                    .defaultable(paramResult.optional());

            switch (paramResult.kind()) {
                case INCLUDED_RECORD_REST -> {
                    if (hasOnlyRestParams) {
                        customPropBuilder.defaultable(false);
                    }
                    unescapedParamName = "additionalValues";
                    Property template = customPropBuilder.buildRepeatableTemplates(paramResult.typeSymbol(),
                            semanticModel, moduleInfo);
                    customPropBuilder.type()
                            .fieldType(Property.ValueType.REPEATABLE_MAP)
                            .ballerinaType(paramResult.type())
                            .template(template)
                            .selected(true)
                            .stepOut();
                }
                case REST_PARAMETER -> {
                    if (hasOnlyRestParams) {
                        customPropBuilder.defaultable(false);
                    }
                    Property template = customPropBuilder.buildRepeatableTemplates(paramResult.typeSymbol(),
                            semanticModel, moduleInfo);
                    customPropBuilder.type()
                            .fieldType(Property.ValueType.REPEATABLE_LIST)
                            .ballerinaType(paramResult.type())
                            .template(template)
                            .selected(true)
                            .stepOut();
                }
                default -> {
                    customPropBuilder.typeWithExpression(paramResult.typeSymbol(), moduleInfo);
                }
            }

            customPropBuilder
                    .stepOut()
                    .addProperty(FlowNodeUtil.getPropertyKey(unescapedParamName));
        }
    }
}
