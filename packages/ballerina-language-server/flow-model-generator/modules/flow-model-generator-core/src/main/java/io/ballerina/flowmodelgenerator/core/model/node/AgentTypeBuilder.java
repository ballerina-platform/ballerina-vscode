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

import io.ballerina.flowmodelgenerator.core.AiUtils;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.projects.DocumentId;
import io.ballerina.projects.Module;
import io.ballerina.projects.Project;
import org.ballerinalang.langserver.common.utils.NameUtil;

import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Represents the declaration of a user-defined agent class that includes
 * {@code *ai:FixedReturnAgentType} or {@code *ai:InferredReturnAgentType}.
 * <p>
 * Distinct from {@link AgentBuilder}, which is reserved for the built-in
 * {@code ai:Agent} whose constructor exposes {@code systemPrompt}/{@code tools}/
 * {@code model}/{@code memory} directly. For custom agents those values live
 * inside the class body, not the constructor — so this builder defers to the
 * generic class-init rendering for now. A richer edit experience will be added
 * here when prompt/tool/model editing is wired through to the class source.
 *
 * @since 1.5.1
 */
public class AgentTypeBuilder extends ClassInitBuilder {

    private static final String AGENT_LABEL = "Agent";

    @Override
    protected NodeKind getFunctionNodeKind() {
        return NodeKind.AGENT_TYPE;
    }

    @Override
    public void setConcreteConstData() {
        metadata().label(AGENT_LABEL);
        codedata().node(NodeKind.AGENT_TYPE).symbol("init");
    }

    @Override
    public void setConcreteTemplateData(TemplateContext context) {
        TemplateContext resolvedContext = anchorToExistingFile(context);
        super.setConcreteTemplateData(resolvedContext);
        suggestResultVariableName(resolvedContext);
        // Render client-connection init params (e.g. calendar:Client) as a connection select in the configure form.
        try {
            Project project = PackageUtil.loadProject(resolvedContext.workspaceManager(),
                    resolvedContext.filePath());
            AiUtils.markClientConnectionParams(this, resolvedContext.codedata(), project);
        } catch (Throwable t) {
            // Best-effort: client params keep their default expression editor.
        }
    }

    // The class-init resolution + visible-symbol lookup need an existing document. When the target file doesn't
    // exist yet (e.g. adding the first agent in a package, where agents.bal isn't created) or is a directory,
    // anchor the context to an existing document in the same package so both succeed.
    private TemplateContext anchorToExistingFile(TemplateContext context) {
        if (context == null || context.filePath() == null || context.workspaceManager() == null
                || Files.isRegularFile(context.filePath())) {
            return context;
        }
        try {
            Path packageDir = context.filePath().getParent();
            Project project = context.workspaceManager().loadProject(packageDir);
            Module defaultModule = project.currentPackage().getDefaultModule();
            for (DocumentId documentId : defaultModule.documentIds()) {
                Path docPath = project.sourceRoot().resolve(defaultModule.document(documentId).name());
                if (Files.isRegularFile(docPath)) {
                    return new TemplateContext(context.workspaceManager(), docPath, context.position(),
                            context.codedata(), context.lsClientLogger());
                }
            }
        } catch (Throwable t) {
            // Fall back to the original context.
        }
        return context;
    }

    // The default result name appends module + class (e.g. "mathtutorMathtutoragent"); derive it from just the
    // class name (e.g. "mathTutorAgent") instead, kept unique against visible symbols.
    private void suggestResultVariableName(TemplateContext context) {
        if (context == null || context.codedata() == null) {
            return;
        }
        String className = context.codedata().object();
        Property variable = properties().build().get(Property.VARIABLE_KEY);
        if (className == null || className.isEmpty() || variable == null) {
            return;
        }
        String base = Character.toLowerCase(className.charAt(0)) + className.substring(1);
        String varName = NameUtil.generateTypeName(base, context.getAllVisibleSymbolNames());
        AiUtils.addPropertyFromTemplate(this, Property.VARIABLE_KEY, variable, varName, variable.hidden());
    }
}
