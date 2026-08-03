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

import io.ballerina.compiler.api.symbols.FunctionSymbol;
import io.ballerina.compiler.api.symbols.SymbolKind;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Option;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.flowmodelgenerator.core.utils.WorkflowUtil;
import io.ballerina.modelgenerator.commons.FunctionData;
import io.ballerina.modelgenerator.commons.FunctionDataBuilder;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.modelgenerator.commons.ParameterData;
import io.ballerina.projects.Module;
import io.ballerina.projects.Package;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_MODULE;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_ORG;
import static io.ballerina.modelgenerator.commons.ParameterData.Kind.REQUIRED;

/**
 * Represents a workflow send data operation node (sendData).
 * This is a specialized function call for workflow data operations.
 *
 * @since 1.8.0
 */
public class SendDataBuilder extends FunctionCall {
    public static final String LABEL = "Send Data";
    public static final String DESCRIPTION = "Send data to an existing workflow instance";
    public static final String WORKFLOW_NAME_KEY = "workflow";
    public static final String WORKFLOW_NAME_LABEL = "Workflow Name";
    public static final String WORKFLOW_NAME_DOC = "The workflow function to send the data to";
    public static final String DATA_NAME_KEY = "dataName";
    public static final String DATA_NAME_LABEL = "Data Name";
    public static final String DATA_NAME_DOC = "The name of the data field to send";
    private static final String SEND_DATA_METHOD = "sendData";
    private static final String WORKFLOW_ID_KEY = "workflowId";
    private static final String DATA_KEY = "data";
    public static final String WORKFLOW_ID_LABEL = "Target Workflow Id";
    public static final String WORKFLOW_ID_DOC = "The unique workflow ID to send the data to (obtained from `run`)";
    private static final String STRING = "string";
    private static final Set<String> EXCLUDED_PARAMS = Set.of(WORKFLOW_NAME_KEY, WORKFLOW_ID_KEY, "dataName");

    @Override
    public void setConcreteConstData() {
        metadata().label(LABEL).description(DESCRIPTION);
        codedata()
                .node(NodeKind.SEND_DATA)
                .org(WORKFLOW_ORG)
                .module(WORKFLOW_MODULE);
    }

    @Override
    public void setConcreteTemplateData(TemplateContext context) {
        List<Option> workflowOptions = getAvailableWorkflowFunctions(context);

        properties().custom()
                .metadata()
                    .label(WORKFLOW_NAME_LABEL)
                    .description(WORKFLOW_NAME_DOC)
                    .stepOut()
                .type()
                    .fieldType(Property.ValueType.SINGLE_SELECT)
                    .options(workflowOptions)
                    .selected(true)
                    .stepOut()
                .codedata()
                    .kind(REQUIRED.name())
                .stepOut()
                .value("")
                .editable(true)
                .stepOut()
                .addProperty(WORKFLOW_NAME_KEY);

        properties().custom()
                .metadata()
                    .label(WORKFLOW_ID_LABEL)
                    .description(WORKFLOW_ID_DOC)
                .stepOut()
                .type(Property.ValueType.EXPRESSION, STRING)
                .codedata()
                    .kind(REQUIRED.name())
                .stepOut()
                .value("")
                .editable(true)
                .stepOut()
                .addProperty(WORKFLOW_ID_KEY);

        properties().custom()
                .metadata()
                    .label(DATA_NAME_LABEL)
                    .description(DATA_NAME_DOC)
                    .stepOut()
                .type()
                    .fieldType(Property.ValueType.SINGLE_SELECT)
                    .ballerinaType(STRING)
                    .options(List.of())
                    .selected(true)
                    .stepOut()
                .codedata()
                    .kind(REQUIRED.name())
                .stepOut()
                .value("")
                .editable(false)
                .stepOut()
                .addProperty(DATA_NAME_KEY);

        ModuleInfo workflowModuleInfo = new ModuleInfo(WORKFLOW_ORG, WORKFLOW_MODULE, WORKFLOW_MODULE, null);
        FunctionData callActivityData = new FunctionDataBuilder()
                .name(SEND_DATA_METHOD)
                .moduleInfo(workflowModuleInfo)
                .functionResultKind(FunctionData.Kind.FUNCTION)
                .project(PackageUtil.loadProject(context.workspaceManager(), context.filePath()))
                .userModuleInfo(moduleInfo)
                .workspaceManager(context.workspaceManager())
                .filePath(context.filePath())
                .build();

        LinkedHashMap<String, ParameterData> filteredParams = new LinkedHashMap<>(callActivityData.parameters());
        filteredParams.keySet().removeAll(EXCLUDED_PARAMS);
        callActivityData.setParameters(filteredParams);

        Module module = context.workspaceManager().module(context.filePath()).orElse(null);
        setParameterProperties(callActivityData, module);
    }

    @Override
    public Map<Path, List<TextEdit>> toSource(SourceBuilder sourceBuilder) {
        // Generate: check workflow:sendData(workflowFunction, workflowId, "dataName", data)
        sourceBuilder.token()
                .keyword(SyntaxKind.CHECK_KEYWORD)
                .name(WORKFLOW_MODULE)
                .keyword(SyntaxKind.COLON_TOKEN)
                .name(SEND_DATA_METHOD);

        Optional<Property> workflow = sourceBuilder.getProperty(WORKFLOW_NAME_KEY);
        Optional<Property> workflowId = sourceBuilder.getProperty(WORKFLOW_ID_KEY);
        Optional<Property> dataName = sourceBuilder.getProperty(DATA_NAME_KEY);
        Optional<Property> data = sourceBuilder.getProperty(DATA_KEY);
        if (workflow.isPresent() && workflowId.isPresent() && dataName.isPresent() && data.isPresent()) {
            // The data name correlates with an event declared by the workflow function, so it must
            // always be a string literal even when the form submits the bare event name
            sourceBuilder.token()
                    .keyword(SyntaxKind.OPEN_PAREN_TOKEN)
                    .name(workflow.get().toSourceCode())
                    .keyword(SyntaxKind.COMMA_TOKEN)
                    .name(workflowId.get().toSourceCode())
                    .keyword(SyntaxKind.COMMA_TOKEN)
                    .name(toStringLiteral(dataName.get().toSourceCode()))
                    .keyword(SyntaxKind.COMMA_TOKEN)
                    .name(data.get().toSourceCode())
                    .keyword(SyntaxKind.CLOSE_PAREN_TOKEN)
                    .endOfStatement();
        } else {
            sourceBuilder.functionParameters(sourceBuilder.flowNode, Set.of(Property.CHECK_ERROR_KEY));
        }

        return sourceBuilder
                .textEdit()
                .acceptImport(WORKFLOW_ORG, WORKFLOW_MODULE)
                .build();
    }

    private static String toStringLiteral(String value) {
        String trimmed = value == null ? "" : value.trim();
        // Already a string literal: needs a distinct pair of quotes (a lone quote does not qualify)
        if (trimmed.length() >= 2 && trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
            return trimmed;
        }
        return "\"" + trimmed.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }

    /**
     * Gets the available workflow functions from the current project.
     *
     * @param context The template context
     * @return List of options containing workflow function names
     */
    private List<Option> getAvailableWorkflowFunctions(TemplateContext context) {
        List<Option> options = new ArrayList<>();
        Package currentPackage = PackageUtil.loadProject(context.workspaceManager(), context.filePath())
                .currentPackage();
        PackageUtil.getCompilation(currentPackage);
        currentPackage.modules().forEach(module -> {
            module.getCompilation().getSemanticModel().moduleSymbols().stream()
                    .filter(symbol -> symbol.kind() == SymbolKind.FUNCTION)
                    .map(symbol -> (FunctionSymbol) symbol)
                    .filter(WorkflowUtil::isWorkflowFunction)
                    .forEach(funcSymbol -> {
                        String funcName = funcSymbol.getName().orElse("");
                        if (!funcName.isEmpty()) {
                            options.add(new Option(funcName, funcName));
                        }
                    });
        });
        return options;
    }
}
