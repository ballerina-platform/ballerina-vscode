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

import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.flowmodelgenerator.core.AiUtils;
import io.ballerina.flowmodelgenerator.core.model.FormBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.flowmodelgenerator.core.utils.FlowNodeUtil;
import io.ballerina.flowmodelgenerator.core.utils.ParamUtils;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.FileSystemUtils;
import io.ballerina.modelgenerator.commons.FunctionData;
import io.ballerina.modelgenerator.commons.FunctionDataBuilder;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.ParameterData;
import io.ballerina.projects.Document;
import io.ballerina.projects.Project;
import io.ballerina.tools.text.LineRange;
import org.ballerinalang.langserver.commons.eventsync.exceptions.EventSyncException;
import org.ballerinalang.langserver.commons.workspace.WorkspaceDocumentException;
import org.eclipse.lsp4j.Range;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static io.ballerina.flowmodelgenerator.core.Constants.Ai;
import static io.ballerina.flowmodelgenerator.core.model.Property.CHECK_ERROR_KEY;
import static io.ballerina.flowmodelgenerator.core.model.Property.RESULT_DOC;
import static io.ballerina.flowmodelgenerator.core.model.Property.RESULT_NAME;
import static io.ballerina.flowmodelgenerator.core.model.Property.RESULT_TYPE_LABEL;
import static io.ballerina.flowmodelgenerator.core.model.Property.SCOPE_KEY;
import static io.ballerina.flowmodelgenerator.core.model.Property.TYPE_KEY;
import static io.ballerina.flowmodelgenerator.core.model.Property.VARIABLE_KEY;
import static io.ballerina.modelgenerator.commons.CommonUtils.generateIcon;
import static io.ballerina.modelgenerator.commons.ParameterData.Kind;

/**
 * Represents a connection to a remote A2A agent, {@code ai:A2aToolKit}, in the flow model. The form is built from the
 * toolkit's {@code init} method, and the generated code is a module variable
 * {@code final ai:A2aToolKit x = check new (url, ...)} in {@code connections.bal}.
 *
 * @since 1.4.0
 */
public class A2aToolKitBuilder extends NodeBuilder {

    public static final String A2A_TOOL_KIT_CLASS = "A2aToolKit";
    // The first ai version that has ai:A2aToolKit
    public static final String MINIMUM_A2A_AI_VERSION = "1.18.0";
    // The init parameter that takes the agent's address, shown to the user as "Agent Card"
    public static final String AGENT_PARAMETER = "agent";
    private static final String AGENT_URL_LABEL = "Agent Card";
    private static final String INIT_METHOD_NAME = "init";
    private static final String AI_A2A_TOOL_KIT_TYPE_WITH_PREFIX = "ai:A2aToolKit";
    private static final String CONNECTIONS_BAL = "connections.bal";

    @Override
    public void setConcreteConstData() {
        codedata().node(NodeKind.A2A_TOOL_KIT);
    }

    @Override
    public void setConcreteTemplateData(TemplateContext context) {
        ModuleInfo codedataModuleInfo =
                new ModuleInfo(Ai.BALLERINA_ORG, Ai.AI_PACKAGE, Ai.AI_PACKAGE, getAiModuleVersion(context));

        FunctionData functionData = new FunctionDataBuilder().parentSymbolType(A2A_TOOL_KIT_CLASS)
                .name(INIT_METHOD_NAME).moduleInfo(codedataModuleInfo).userModuleInfo(moduleInfo)
                .lsClientLogger(context.lsClientLogger()).functionResultKind(FunctionData.Kind.A2A_TOOL_KIT)
                .workspaceManager(context.workspaceManager())
                .filePath(context.filePath())
                .build();

        metadata().label(functionData.packageName()).description(functionData.description())
                .icon(generateIcon(functionData.org(), functionData.packageName(), functionData.version()));
        codedata().org(functionData.org()).module(functionData.moduleName()).packageName(functionData.packageName())
                .object(functionData.name()).version(functionData.version());

        setParameterProperties(functionData.parameters().values());
        AiUtils.setOptionalPropertiesAdvanced(this);
        setReturnType(context);
    }

    private void setParameterProperties(Iterable<ParameterData> parameters) {
        for (ParameterData param : parameters) {
            if (param.kind() == Kind.PARAM_FOR_TYPE_INFER || param.kind() == Kind.INCLUDED_RECORD) {
                continue;
            }
            String unescapedName = ParamUtils.removeLeadingSingleQuote(param.name());
            String label = AGENT_PARAMETER.equals(unescapedName) ? AGENT_URL_LABEL
                    : (param.label() == null || param.label().isEmpty()) ? unescapedName : param.label();
            Property.Builder<FormBuilder<NodeBuilder>> builder = properties().custom()
                    .metadata().label(label).description(param.description()).stepOut()
                    .codedata()
                        .kind(param.kind().name())
                        .originalName(param.name())
                        .stepOut()
                    .placeholder(param.placeholder())
                    .defaultValue(param.defaultValue())
                    .editable()
                    .optional(param.optional())
                    .advanced(param.advanced());
            builder.typeWithExpression(param.typeSymbol(), moduleInfo);
            builder.stepOut().addProperty(FlowNodeUtil.getPropertyKey(unescapedName));
        }
    }

    private void setReturnType(TemplateContext context) {
        properties().type(AI_A2A_TOOL_KIT_TYPE_WITH_PREFIX, false, null, true, RESULT_TYPE_LABEL)
                .data(AI_A2A_TOOL_KIT_TYPE_WITH_PREFIX, context.getAllVisibleSymbolNames(), RESULT_NAME, RESULT_DOC,
                        false);
    }

    private String getAiModuleVersion(TemplateContext context) {
        try {
            Project project = context.workspaceManager().loadProject(context.filePath());
            return AiUtils.getProjectPackageVersion(project, Ai.AI_PACKAGE);
        } catch (WorkspaceDocumentException | EventSyncException e) {
            return null;
        }
    }

    @Override
    public Map<Path, List<TextEdit>> toSource(SourceBuilder sourceBuilder) {
        // A new toolkit goes at the end of connections.bal; an existing one is rewritten where it is
        Path connectionsFilePath = sourceBuilder.workspaceManager.projectRoot(sourceBuilder.filePath)
                .resolve(CONNECTIONS_BAL);
        Range range;
        if (sourceBuilder.flowNode.codedata().isNew() == null || !sourceBuilder.flowNode.codedata().isNew()) {
            LineRange lineRange = sourceBuilder.flowNode.codedata().lineRange();
            connectionsFilePath = sourceBuilder.workspaceManager.projectRoot(sourceBuilder.filePath)
                    .resolve(lineRange.fileName());
            range = CommonUtils.toRange(lineRange);
        } else {
            range = endOfFile(sourceBuilder, connectionsFilePath);
        }

        // Generates: final ai:A2aToolKit agentTools = check new (url, headers = {...});
        Set<String> ignoredProperties = new HashSet<>(Set.of(VARIABLE_KEY, TYPE_KEY, SCOPE_KEY, CHECK_ERROR_KEY));
        sourceBuilder.token().keyword(SyntaxKind.FINAL_KEYWORD).stepOut().newVariable()
                .token().keyword(SyntaxKind.CHECK_KEYWORD).keyword(SyntaxKind.NEW_KEYWORD).stepOut()
                .functionParameters(sourceBuilder.flowNode, ignoredProperties)
                .acceptImport().textEdit(SourceBuilder.SourceKind.STATEMENT, connectionsFilePath, range);
        return sourceBuilder.build();
    }

    private static Range endOfFile(SourceBuilder sourceBuilder, Path filePath) {
        try {
            sourceBuilder.workspaceManager.loadProject(sourceBuilder.filePath);
            Document document = FileSystemUtils.getDocument(sourceBuilder.workspaceManager, filePath);
            return CommonUtils.toRange(document.syntaxTree().rootNode().lineRange().endLine());
        } catch (WorkspaceDocumentException | EventSyncException e) {
            throw new RuntimeException(e);
        }
    }
}
