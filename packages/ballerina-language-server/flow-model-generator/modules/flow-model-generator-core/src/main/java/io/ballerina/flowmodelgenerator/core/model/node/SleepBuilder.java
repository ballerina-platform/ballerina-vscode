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
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.modelgenerator.commons.FunctionData;
import io.ballerina.modelgenerator.commons.FunctionDataBuilder;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.modelgenerator.commons.ParameterData;
import io.ballerina.projects.Module;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.CONTEXT_CLASS_NAME;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.SLEEP_DESCRIPTION;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.SLEEP_LABEL;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.SLEEP_METHOD_NAME;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_MODULE;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_ORG;

/**
 * Represents a workflow sleep node. Generates a {@code check ctx.sleep(duration)} call
 * that pauses the workflow execution for the specified duration.
 *
 * <p>Generated source example:
 * <pre>{@code
 * check ctx.sleep({seconds: 5});
 * }</pre>
 *
 * @since 1.9.0
 */
public class SleepBuilder extends CallBuilder {

    public static final String LABEL = SLEEP_LABEL;
    public static final String DESCRIPTION = SLEEP_DESCRIPTION;
    public static final String DURATION_KEY = "duration";
    public static final String DURATION_DEFAULT = "{seconds: 5}";

    @Override
    protected NodeKind getFunctionNodeKind() {
        return NodeKind.SLEEP;
    }

    @Override
    protected FunctionData.Kind getFunctionResultKind() {
        return FunctionData.Kind.FUNCTION;
    }

    @Override
    public void setConcreteConstData() {
        metadata().label(LABEL).description(DESCRIPTION);
        codedata()
                .node(NodeKind.SLEEP)
                .org(WORKFLOW_ORG)
                .module(WORKFLOW_MODULE)
                .object(CONTEXT_CLASS_NAME)
                .symbol(SLEEP_METHOD_NAME);
    }

    @Override
    public void setConcreteTemplateData(TemplateContext context) {
        metadata().label(LABEL).description(DESCRIPTION);
        codedata()
                .node(NodeKind.SLEEP)
                .org(WORKFLOW_ORG)
                .module(WORKFLOW_MODULE)
                .object(CONTEXT_CLASS_NAME)
                .symbol(SLEEP_METHOD_NAME);

        try {
            ModuleInfo workflowModuleInfo = new ModuleInfo(WORKFLOW_ORG, WORKFLOW_MODULE, WORKFLOW_MODULE, null);
            FunctionData functionData = new FunctionDataBuilder()
                    .name(SLEEP_METHOD_NAME)
                    .moduleInfo(workflowModuleInfo)
                    .parentSymbolType(CONTEXT_CLASS_NAME)
                    .functionResultKind(getFunctionResultKind())
                    .project(PackageUtil.loadProject(context.workspaceManager(), context.filePath()))
                    .userModuleInfo(moduleInfo)
                    .workspaceManager(context.workspaceManager())
                    .filePath(context.filePath())
                    .build();

            Module module = context.workspaceManager().module(context.filePath()).orElse(null);
            setParameterProperties(functionData, module);

            if (functionData.returnError()) {
                properties().checkError(true);
            }
        } catch (RuntimeException e) {
            // sleep may not be resolvable yet, or project/dependency loading may fail. Use a stable,
            // static form so opening/editing SLEEP nodes still works.
            setFallbackSleepProperties();
        }
    }

    private void setFallbackSleepProperties() {
        properties().custom()
                .metadata()
                    .label("Duration")
                    .description("Duration to pause the workflow (e.g. {seconds: 5})")
                    .stepOut()
                .type().fieldType(Property.ValueType.EXPRESSION).ballerinaType("time:Duration").selected(true).stepOut()
                .codedata().kind(ParameterData.Kind.REQUIRED.name()).originalName(DURATION_KEY).stepOut()
                .placeholder(DURATION_DEFAULT)
                .editable(true)
                .stepOut()
                .addProperty(DURATION_KEY);
        properties().checkError(true);
    }

    @Override
    public Map<Path, List<TextEdit>> toSource(SourceBuilder sourceBuilder) {
        String ctxParamName = ActivityCallBuilder.resolveContextParamName(sourceBuilder);

        Optional<Property> checkErrorProp = sourceBuilder.getProperty(Property.CHECK_ERROR_KEY);
        boolean useCheck = checkErrorProp
                .map(p -> p.value() == null || !"false".equals(p.value().toString()))
                .orElse(true);

        Optional<Property> durationProp = sourceBuilder.getProperty(DURATION_KEY);
        String duration = durationProp
                .map(p -> p.value() != null && !p.value().toString().isBlank() ? p.value().toString()
                        : DURATION_DEFAULT)
                .orElse(DURATION_DEFAULT);

        if (useCheck) {
            sourceBuilder.token().keyword(SyntaxKind.CHECK_KEYWORD);
        }

        sourceBuilder.token()
                .name(ctxParamName)
                .keyword(SyntaxKind.DOT_TOKEN)
                .name(SLEEP_METHOD_NAME)
                .keyword(SyntaxKind.OPEN_PAREN_TOKEN)
                .name(duration)
                .keyword(SyntaxKind.CLOSE_PAREN_TOKEN)
                .endOfStatement();

        return sourceBuilder
                .textEdit()
                .acceptImport(WORKFLOW_ORG, WORKFLOW_MODULE)
                .build();
    }
}
