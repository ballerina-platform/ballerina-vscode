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
import io.ballerina.compiler.api.symbols.AnnotationAttachmentSymbol;
import io.ballerina.compiler.api.symbols.AnnotationSymbol;
import io.ballerina.compiler.api.symbols.RecordFieldSymbol;
import io.ballerina.compiler.api.symbols.RecordTypeSymbol;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.TypeDefinitionSymbol;
import io.ballerina.compiler.api.symbols.TypeDescKind;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.api.values.ConstantValue;
import io.ballerina.flowmodelgenerator.core.AiUtils;
import io.ballerina.flowmodelgenerator.core.model.FormBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.flowmodelgenerator.core.utils.FlowNodeUtil;
import io.ballerina.modelgenerator.commons.DefaultValueGeneratorUtil;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.projects.Project;
import org.ballerinalang.langserver.common.utils.CommonUtil;
import org.ballerinalang.langserver.commons.eventsync.exceptions.EventSyncException;
import org.ballerinalang.langserver.commons.workspace.WorkspaceDocumentException;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static io.ballerina.flowmodelgenerator.core.Constants.Ai;

/**
 * Represents a builder for the AgentIdAuthConfig node template in the flow model.
 *
 * @since 1.7.0
 */
public class AgentIdAuthConfigBuilder extends NodeBuilder {

    private static final String AGENT_ID_AUTH_CONFIG_TYPE = "AgentIdAuthConfig";
    private static final String LABEL = "Agent ID Auth Config";
    private static final String DESCRIPTION = "OAuth 2.0 client configuration for agent identity authentication";
    private static final String SCOPES_FIELD = "scopes";
    private static final String SCOPES_BALLERINA_TYPE = "string|string[]";
    private static final String DISPLAY_ANNOTATION = "display";
    private static final String LABEL_FIELD = "label";
    private static final String MINIMUM_AI_VERSION = "1.11.0";

    @Override
    public void setConcreteConstData() {
        metadata().label(LABEL).description(DESCRIPTION);
        codedata().node(NodeKind.AGENT_ID_AUTH_CONFIG);
    }

    @Override
    public void setConcreteTemplateData(TemplateContext context) {
        codedata()
                .org(Ai.BALLERINA_ORG)
                .module(Ai.AI_PACKAGE)
                .packageName(Ai.AI_PACKAGE)
                .symbol(AGENT_ID_AUTH_CONFIG_TYPE);

        String aiModuleVersion = getAiModuleVersion(context);
        if (aiModuleVersion != null && AiUtils.compareSemver(aiModuleVersion, MINIMUM_AI_VERSION) < 0) {
            return;
        }

        ModuleInfo aiModuleInfo = new ModuleInfo(Ai.BALLERINA_ORG, Ai.AI_PACKAGE, Ai.AI_PACKAGE, aiModuleVersion);
        Optional<SemanticModel> semanticModelOpt = PackageUtil.getSemanticModel(aiModuleInfo);
        if (semanticModelOpt.isEmpty()) {
            return;
        }
        SemanticModel aiSemanticModel = semanticModelOpt.get();

        Optional<Symbol> typeSymbolOpt = aiSemanticModel.types()
                .getTypeByName(Ai.BALLERINA_ORG, Ai.AI_PACKAGE, "", AGENT_ID_AUTH_CONFIG_TYPE);
        if (typeSymbolOpt.isEmpty() || !(typeSymbolOpt.get() instanceof TypeDefinitionSymbol typeDefSymbol)) {
            return;
        }

        TypeSymbol rawType = CommonUtil.getRawType(typeDefSymbol.typeDescriptor());
        if (rawType.typeKind() != TypeDescKind.RECORD) {
            return;
        }

        RecordTypeSymbol recordType = (RecordTypeSymbol) rawType;
        for (Map.Entry<String, RecordFieldSymbol> entry : recordType.fieldDescriptors().entrySet()) {
            RecordFieldSymbol field = entry.getValue();
            TypeSymbol fieldType = field.typeDescriptor();
            String fieldName = entry.getKey();
            String label = getDisplayLabel(field.annotAttachments(), fieldName);
            String description = field.documentation()
                    .flatMap(doc -> doc.description())
                    .orElse("");

            String placeholder = DefaultValueGeneratorUtil.getDefaultValueForType(
                    CommonUtil.getRawType(fieldType));
            boolean isOptional = field.isOptional() || field.hasDefaultValue();

            Property.Builder<FormBuilder<NodeBuilder>> builder = properties().custom()
                    .metadata().label(label).description(description).stepOut()
                    .placeholder(placeholder)
                    .editable()
                    .optional(isOptional);

            if (fieldName.equals(SCOPES_FIELD)) {
                builder.type()
                        .fieldType(Property.ValueType.TEXT_SET)
                        .ballerinaType(SCOPES_BALLERINA_TYPE)
                        .selected(true)
                        .stepOut()
                        .type()
                        .fieldType(Property.ValueType.EXPRESSION)
                        .ballerinaType(SCOPES_BALLERINA_TYPE)
                        .stepOut();
            } else {
                builder.typeWithExpression(fieldType, aiModuleInfo);
            }

            builder.optional(true).advanced(true);
            builder.stepOut().addProperty(FlowNodeUtil.getPropertyKey(fieldName));
        }
    }

    private static String getDisplayLabel(List<AnnotationAttachmentSymbol> annotations, String defaultLabel) {
        for (AnnotationAttachmentSymbol annotAttachment : annotations) {
            AnnotationSymbol annotationSymbol = annotAttachment.typeDescriptor();
            Optional<String> optName = annotationSymbol.getName();
            if (optName.isEmpty() || !optName.get().equals(DISPLAY_ANNOTATION)) {
                continue;
            }
            Optional<ConstantValue> optAttachmentValue = annotAttachment.attachmentValue();
            if (optAttachmentValue.isEmpty()) {
                break;
            }
            ConstantValue attachmentValue = optAttachmentValue.get();
            if (attachmentValue.valueType().typeKind() != TypeDescKind.RECORD) {
                break;
            }
            HashMap<?, ?> valueMap = (HashMap<?, ?>) attachmentValue.value();
            Object label = valueMap.get(LABEL_FIELD);
            if (label != null && !label.toString().isEmpty()) {
                return label.toString();
            }
        }
        return defaultLabel;
    }

    private String getAiModuleVersion(TemplateContext context) {
        try {
            Project project = context.workspaceManager().loadProject(context.filePath());
            String version = AiUtils.getBallerinaAiModuleVersion(project);
            if (version != null) {
                return version;
            }
        } catch (WorkspaceDocumentException | EventSyncException e) {
            // Fall through to resolve from local/distribution repo
        }

        // Fallback: resolve from local/distribution repo
        return AiUtils.resolvePackageVersion(Ai.BALLERINA_ORG, Ai.AI_PACKAGE).orElse(null);
    }

    @Override
    public Map<Path, List<TextEdit>> toSource(SourceBuilder sourceBuilder) {
        throw new UnsupportedOperationException("AgentIdAuthConfigBuilder does not support source generation");
    }
}
