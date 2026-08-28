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

import static io.ballerina.modelgenerator.commons.FunctionDataBuilder.GET_DEFAULT_MODEL_PROVIDER_FUNCTION_NAME;

/**
 * Represents model provider node in the flow model.
 *
 * @since 1.1.0
 */
public class ModelProviderBuilder extends CallBuilder {

    public static final String LABEL = "Model Provider";
    public static final String DESCRIPTION = "Model providers available within the integration " +
            "for connecting to an LLM";

    private static final String MODEL_PROVIDER_NAME_LABEL = "Model Provider Name";
    private static final String MODEL_PROVIDER_NAME_LABEL_DOC = "Name of the model-provider connection";
    private static final String CHECK_ERROR_DOC = "Terminate on error";

    @Override
    public void setConcreteConstData() {
        metadata().label(LABEL);
        codedata().node(NodeKind.MODEL_PROVIDER);
    }

    @Override
    protected NodeKind getFunctionNodeKind() {
        return NodeKind.MODEL_PROVIDER;
    }

    @Override
    protected FunctionData.Kind getFunctionResultKind() {
        return FunctionData.Kind.MODEL_PROVIDER;
    }

    @Override
    public Map<Path, List<TextEdit>> toSource(SourceBuilder sourceBuilder) {
        sourceBuilder.token().keyword(SyntaxKind.FINAL_KEYWORD).stepOut().newVariable();
        sourceBuilder.token().keyword(SyntaxKind.CHECK_KEYWORD);
        if (sourceBuilder.flowNode.codedata().symbol().equals(GET_DEFAULT_MODEL_PROVIDER_FUNCTION_NAME)) {
            sourceBuilder.token().name(methodCallWithModulePrefix(sourceBuilder));
        } else {
            sourceBuilder.token().keyword(SyntaxKind.NEW_KEYWORD);
        }
        sourceBuilder.functionParameters(sourceBuilder.flowNode,
                Set.of(Property.VARIABLE_KEY, Property.TYPE_KEY, Property.SCOPE_KEY, Property.CHECK_ERROR_KEY));
        sourceBuilder.textEdit();
        sourceBuilder.acceptImport();
        return sourceBuilder.build();
    }

    private static String methodCallWithModulePrefix(SourceBuilder sourceBuilder) {
        String module = sourceBuilder.flowNode.codedata().module();
        String methodCallPrefix = (module != null) ? module.substring(module.lastIndexOf('.') + 1) + ":" : "";
        return methodCallPrefix + GET_DEFAULT_MODEL_PROVIDER_FUNCTION_NAME;
    }

    @Override
    public void setConcreteTemplateData(TemplateContext context) {
        Codedata codedata = context.codedata();
        ModuleInfo codedataModuleInfo = new ModuleInfo(codedata.org(), codedata.resolvePackageName(),
                codedata.module(), codedata.version());

        FunctionData functionData = new FunctionDataBuilder().moduleInfo(codedataModuleInfo).userModuleInfo(moduleInfo)
                .parentSymbolType(codedata.object()).name(codedata.symbol())
                .lsClientLogger(context.lsClientLogger()).functionResultKind(FunctionData.Kind.MODEL_PROVIDER)
                .workspaceManager(context.workspaceManager())
                .filePath(context.filePath())
                .build();

        metadata().label(functionData.packageName()).description(functionData.description())
                .icon(CommonUtils.generateIcon(functionData.org(), functionData.packageName(), functionData.version()));

        codedata().node(NodeKind.MODEL_PROVIDER)
                .org(functionData.org()).module(functionData.moduleName())
                .packageName(functionData.packageName()).version(functionData.version())
                .symbol(codedata.symbol());

        if (!functionData.name().equals(GET_DEFAULT_MODEL_PROVIDER_FUNCTION_NAME)) {
            codedata().object(functionData.name());
        }

        if (CommonUtils.hasReturn(functionData.returnType())) {
            setReturnTypeProperties(functionData, context, MODEL_PROVIDER_NAME_LABEL, MODEL_PROVIDER_NAME_LABEL_DOC,
                    false);
        }
        Module module = context.workspaceManager().module(context.filePath()).orElse(null);
        setParameterProperties(functionData, module);
        properties().scope(Property.GLOBAL_SCOPE).checkError(true, CHECK_ERROR_DOC, false);
    }

    @Override
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
