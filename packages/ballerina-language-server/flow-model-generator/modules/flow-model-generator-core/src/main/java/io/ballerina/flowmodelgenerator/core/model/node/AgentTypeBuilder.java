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
        try {
            Project project = PackageUtil.loadProject(resolvedContext.workspaceManager(),
                    resolvedContext.filePath());
            AiUtils.markClientConnectionParams(this, resolvedContext.codedata(), project);
            AiUtils.markAgentParams(this, resolvedContext.codedata(), project);
        } catch (Throwable ignored) {
        }
    }

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
        } catch (Throwable ignored) {
        }
        return context;
    }

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
