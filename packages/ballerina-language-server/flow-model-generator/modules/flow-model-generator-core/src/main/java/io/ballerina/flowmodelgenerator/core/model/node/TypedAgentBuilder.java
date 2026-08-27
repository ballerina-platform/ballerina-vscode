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

import io.ballerina.compiler.api.symbols.ClassSymbol;
import io.ballerina.flowmodelgenerator.core.AiUtils;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.projects.DocumentId;
import io.ballerina.projects.Module;
import io.ballerina.projects.Package;
import io.ballerina.projects.Project;
import org.ballerinalang.langserver.common.utils.NameUtil;
import org.ballerinalang.langserver.commons.eventsync.exceptions.EventSyncException;
import org.ballerinalang.langserver.commons.workspace.WorkspaceDocumentException;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;

public class TypedAgentBuilder extends ClassInitBuilder {

    private static final String AGENT_LABEL = "Agent";

    @Override
    protected NodeKind getFunctionNodeKind() {
        return NodeKind.TYPED_AGENT;
    }

    @Override
    public void setConcreteConstData() {
        metadata().label(AGENT_LABEL);
        codedata().node(NodeKind.TYPED_AGENT).symbol("init");
    }

    @Override
    public void setConcreteTemplateData(TemplateContext context) {
        TemplateContext resolvedContext = resolveAgentClass(anchorToExistingFile(context));
        super.setConcreteTemplateData(resolvedContext);
        suggestResultVariableName(resolvedContext);
        try {
            Project project = PackageUtil.loadProject(resolvedContext.workspaceManager(),
                    resolvedContext.filePath());
            AiUtils.markClientConnectionParams(this, resolvedContext.codedata(), project);
            AiUtils.markAgentParams(this, resolvedContext.codedata(), project);
        } catch (RuntimeException ignored) {
        }
    }

    // Central search results carry no class name, so resolve it from the package before the init form is built.
    private TemplateContext resolveAgentClass(TemplateContext context) {
        if (context == null || !needsAgentClass(context.codedata())) {
            return context;
        }

        Codedata codedata = context.codedata();
        ModuleInfo moduleInfo = new ModuleInfo(codedata.org(), codedata.packageName(), codedata.module(),
                codedata.version());
        try {
            return PackageUtil.pullModuleAndNotify(context.lsClientLogger(), moduleInfo)
                    .flatMap(TypedAgentBuilder::findAgentClass)
                    .map(className -> withAgentClass(context, className))
                    .orElse(context);
        } catch (RuntimeException ignored) {
            return context;
        }
    }

    private static boolean needsAgentClass(Codedata codedata) {
        return codedata != null && (codedata.object() == null || codedata.object().isEmpty());
    }

    private static TemplateContext withAgentClass(TemplateContext context, String className) {
        Codedata resolved = new Codedata.Builder<>(null).from(context.codedata()).object(className).build();
        return new TemplateContext(context.workspaceManager(), context.filePath(), context.position(), resolved,
                context.lsClientLogger());
    }

    private static Optional<String> findAgentClass(Package agentPackage) {
        return AiUtils.findAgentClasses(agentPackage).stream().findFirst().flatMap(ClassSymbol::getName);
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
        } catch (WorkspaceDocumentException | EventSyncException | RuntimeException ignored) {
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
