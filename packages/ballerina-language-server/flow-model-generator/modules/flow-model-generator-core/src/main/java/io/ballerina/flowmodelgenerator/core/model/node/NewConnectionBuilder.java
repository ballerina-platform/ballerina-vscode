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

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.flowmodelgenerator.core.ConnectionActionProvider;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.FormBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.flowmodelgenerator.core.utils.ConnectorUtil;
import io.ballerina.flowmodelgenerator.core.utils.FlowNodeUtil;
import io.ballerina.flowmodelgenerator.core.utils.ParamUtils;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.FunctionData;
import io.ballerina.modelgenerator.commons.FunctionDataBuilder;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.modelgenerator.commons.ParameterData;
import io.ballerina.projects.Module;
import io.ballerina.projects.Project;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.CompletableFuture;

/**
 * Represents a new connection node in the flow model.
 *
 * @since 1.0.0
 */
public class NewConnectionBuilder extends CallBuilder {

    private static final String NEW_CONNECTION_LABEL = "New Connection";

    public static final String INIT_SYMBOL = "init";
    public static final String CHECK_ERROR_DOC = "Terminate on error";
    public static final String CONNECTION_NAME_LABEL = "Connection Name";
    public static final String CONNECTION_TYPE_LABEL = "Connection Type";
    public static final String CONNECTION_NAME_DOC = "Name of the connection";
    private static final String CONNECTIONS_BAL = "connections.bal";
    private static final String DRIVER_SUB_PACKAGE = ".driver";

    @Override
    public void setConcreteConstData() {
        codedata().node(NodeKind.NEW_CONNECTION).symbol(INIT_SYMBOL);
    }

    @Override
    public Map<Path, List<TextEdit>> toSource(SourceBuilder sourceBuilder) {
        sourceBuilder
                .token().keyword(SyntaxKind.FINAL_KEYWORD).stepOut()
                .newVariable();

        sourceBuilder.token()
                .keyword(SyntaxKind.CHECK_KEYWORD)
                .keyword(SyntaxKind.NEW_KEYWORD)
                .stepOut()
                .functionParameters(sourceBuilder.flowNode,
                        Set.of(Property.VARIABLE_KEY, Property.TYPE_KEY, Property.SCOPE_KEY,
                                Property.CHECK_ERROR_KEY));

        Optional<Property> scope = sourceBuilder.getProperty(Property.SCOPE_KEY);
        if (scope.isEmpty()) {
            throw new IllegalStateException("Scope is not defined for the new connection node");
        }
        Codedata codedata = sourceBuilder.flowNode.codedata();
        Path filePath = sourceBuilder.filePath;
        switch (scope.get().value().toString()) {
            case Property.LOCAL_SCOPE -> {
                sourceBuilder.textEdit();
                checkDriverImport(sourceBuilder, codedata, filePath);
            }
            case Property.GLOBAL_SCOPE -> {
                sourceBuilder.textEdit();
                Path projectRoot = sourceBuilder.workspaceManager.projectRoot(filePath);
                checkDriverImport(sourceBuilder, codedata, projectRoot.resolve(CONNECTIONS_BAL));
            }
            default -> throw new IllegalStateException("Invalid scope for the new connection node");
        }

        if (Boolean.FALSE.equals(codedata.isGenerated())) {
            sourceBuilder.acceptImport();
        }

        preloadConnectorActions(sourceBuilder);
        return sourceBuilder.build();
    }

    private static void checkDriverImport(SourceBuilder sourceBuilder, Codedata codedata, Path filePath) {
        // TODO: This information should be embedded to the package index.
        // Check if the new connection requires a driver import
        if (CommonUtils.PERSIST_DB_DRIVERS.contains(codedata.getImportSignature())) {
            sourceBuilder.acceptImport(codedata.org(), codedata.module() + DRIVER_SUB_PACKAGE, true);
        }
    }

    @Override
    public void setConcreteTemplateData(TemplateContext context) {
        Codedata codedata = context.codedata();
        FunctionData functionData;

        FunctionDataBuilder functionDataBuilder = new FunctionDataBuilder()
                .parentSymbolType(codedata.object())
                .name(codedata.symbol())
                .moduleInfo(new ModuleInfo(codedata.org(), codedata.resolvePackageName(), codedata.module(),
                        codedata.version()))
                .lsClientLogger(context.lsClientLogger())
                .functionResultKind(FunctionData.Kind.CONNECTOR)
                .userModuleInfo(moduleInfo)
                .workspaceManager(context.workspaceManager())
                .filePath(context.filePath());

        // TODO: If we set the module info properly this logic can be removed.
        if (Boolean.TRUE.equals(codedata.isGenerated())) {
            Path projectPath = context.filePath().getParent();
            if (projectPath == null) {
                throw new IllegalStateException("Project path not found");
            }
            WorkspaceManager workspaceManager = context.workspaceManager();
            Project project = PackageUtil.loadProject(workspaceManager, context.filePath());
            SemanticModel semanticModel = null;
            for (Module module : project.currentPackage().modules()) {
                String moduleNamePath = module.moduleName().moduleNamePart();
                if (moduleNamePath != null && moduleNamePath.equals(codedata.module())) {
                    semanticModel = PackageUtil.getCompilation(project).getSemanticModel(module.moduleId());
                    break;
                }
            }
            if (semanticModel == null) {
                throw new IllegalStateException("Semantic model not found");
            }
            functionDataBuilder.semanticModel(semanticModel);
        }

        functionData = functionDataBuilder.build();
        metadata()
                .label(ConnectorUtil.getConnectorName(functionData.name(), functionData.moduleName()))
                .description(functionData.description())
                .icon(CommonUtils.generateIcon(functionData.org(), functionData.packageName(),
                        functionData.version()));
        codedata()
                .node(NodeKind.NEW_CONNECTION)
                .org(functionData.org())
                .module(functionData.moduleName())
                .packageName(functionData.packageName())
                .object(functionData.name())
                .version(functionData.version())
                .symbol(INIT_SYMBOL)
                .isGenerated(codedata.isGenerated());

        Module module = context.workspaceManager().module(context.filePath()).orElse(null);
        setParameterProperties(functionData, module);

        if (CommonUtils.hasReturn(functionData.returnType())) {
            setReturnTypeProperties(functionData, context, CONNECTION_NAME_LABEL, CONNECTION_NAME_DOC, true);
        }

        properties()
                .scope(Property.GLOBAL_SCOPE)
                .checkError(true, CHECK_ERROR_DOC, false);
    }

    private void preloadConnectorActions(SourceBuilder sourceBuilder) {
        CompletableFuture.runAsync(() -> {
            ConnectionActionProvider.getInstance().populate(sourceBuilder.flowNode.codedata(),
                    sourceBuilder.workspaceManager, sourceBuilder.filePath);
        });
    }

    @Override
    protected void setReturnTypeProperties(FunctionData functionData, TemplateContext context, String label, String doc,
                                           boolean hidden) {
        Set<String> existingNames = new HashSet<>(context.getAllModuleSymbolNames());
        if (context.position() != null) {
            existingNames.addAll(context.getAllVisibleSymbolNames());
        }
        properties()
                .type(functionData.returnType(), false, functionData.importStatements(), hidden,
                        Property.RESULT_TYPE_LABEL)
                .data(functionData.returnType(), existingNames, label, doc, true);
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
                    customPropBuilder.typeWithExpression(paramResult.typeSymbol(), moduleInfo,
                            paramResult.defaultValue());
                }
            }

            customPropBuilder
                    .stepOut()
                    .addProperty(FlowNodeUtil.getPropertyKey(unescapedParamName));
        }
    }

    @Override
    protected NodeKind getFunctionNodeKind() {
        return NodeKind.NEW_CONNECTION;
    }

    @Override
    protected FunctionData.Kind getFunctionResultKind() {
        return FunctionData.Kind.CONNECTOR;
    }
}
