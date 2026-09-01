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

import com.google.gson.Gson;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.flowmodelgenerator.core.model.FormBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.flowmodelgenerator.core.utils.WorkflowUtil;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.FileSystemUtils;
import io.ballerina.modelgenerator.commons.FunctionData;
import io.ballerina.tools.text.LineRange;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.DEFAULT_CTX_PARAM_NAME;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_MODULE;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_ORG;
import static io.ballerina.flowmodelgenerator.core.model.node.ActivityBuilder.ACTIVITY_ANNOTATION;
import static io.ballerina.flowmodelgenerator.core.model.node.ActivityBuilder.ACTIVITY_DESCRIPTION;
import static io.ballerina.flowmodelgenerator.core.model.node.ActivityBuilder.ACTIVITY_LABEL;
import static io.ballerina.flowmodelgenerator.core.model.node.ActivityBuilder.ACTIVITY_NAME;
import static io.ballerina.flowmodelgenerator.core.model.node.ActivityBuilder.ANYDATA_TYPE;
import static io.ballerina.flowmodelgenerator.core.model.node.ActivityCallBuilder.CALL_ACTIVITY_METHOD;
import static io.ballerina.flowmodelgenerator.core.model.node.ActivityCallBuilder.DEFAULT_RETURN_TYPE;
import static io.ballerina.flowmodelgenerator.core.model.node.ActivityCallBuilder.addContextParameterToFunction;
import static io.ballerina.flowmodelgenerator.core.model.node.ActivityCallBuilder.getContextParamName;
import static io.ballerina.flowmodelgenerator.core.model.node.ActivityCallBuilder.populateAdvancedArgs;
import static io.ballerina.flowmodelgenerator.core.model.node.FunctionCreationBuilder.PARAMETERS_DOC;
import static io.ballerina.flowmodelgenerator.core.model.node.FunctionCreationBuilder.PARAMETERS_LABEL;
import static io.ballerina.flowmodelgenerator.core.model.node.FunctionCreationBuilder.getParameterSchema;

/**
 * Represents the properties of activity creation node. This is to handle activity creation and activity call in one.
 *
 * @since 1.8.0
 */
public class ActivityCreationBuilder extends CallBuilder {
    public static final String LABEL = "Workflow Activity";
    public static final String DESCRIPTION = "Define and call a workflow activity";
    private static final Gson gson = new Gson();
    private static final String ACTIVITY_RESULT = "activityResult";

    @Override
    protected NodeKind getFunctionNodeKind() {
        return NodeKind.ACTIVITY_CREATION;
    }

    @Override
    protected FunctionData.Kind getFunctionResultKind() {
        return FunctionData.Kind.ACTIVITY;
    }

    @Override
    public void setConcreteConstData() {
        metadata().label(LABEL).description(DESCRIPTION);
        codedata().node(NodeKind.ACTIVITY_CREATION)
                .org(WORKFLOW_ORG)
                .module(WORKFLOW_MODULE);
    }

    @Override
    public void setConcreteTemplateData(TemplateContext context) {
        properties()
                .functionNameTemplate(ACTIVITY_NAME, context.getAllVisibleSymbolNames(), ACTIVITY_LABEL,
                        ACTIVITY_DESCRIPTION)
                .annotations(ACTIVITY_ANNOTATION)
                .functionDescription("")
                .returnType(ANYDATA_TYPE, ANYDATA_TYPE, false)
                .returnDescription("")
                .nestedProperty()
                .endNestedProperty(Property.ValueType.REPEATABLE_PROPERTY, Property.PARAMETERS_KEY, PARAMETERS_LABEL,
                        PARAMETERS_DOC, getParameterSchema(), false, false)
                .data(ACTIVITY_RESULT, context.getAllVisibleSymbolNames(), Property.RESULT_NAME, Property.RESULT_DOC,
                        false);
        ActivityCallBuilder.addAdvancedParameters(context, moduleInfo, this);
    }

    @Override
    public Map<Path, List<TextEdit>> toSource(SourceBuilder sourceBuilder) {
        new ActivityBuilder().toSource(sourceBuilder); // Build activity and update the sourceBuilder.textEditsMap

        Optional<Property> typeProp = sourceBuilder.getProperty(Property.TYPE_KEY);
        Optional<Property> variableProp = sourceBuilder.getProperty(Property.VARIABLE_KEY);
        Optional<Property> funcNameProp = sourceBuilder.getProperty(Property.FUNCTION_NAME_KEY);

        String resultType = typeProp
                .map(p -> p.value().toString())
                .orElse(DEFAULT_RETURN_TYPE);
        String variableName = variableProp
                .map(p -> p.value().toString())
                .orElseThrow(() -> new IllegalStateException("Variable name property is required"));
        String activityName = funcNameProp
                .map(p -> p.value().toString())
                .orElseThrow(() -> new IllegalStateException("Activity name property is required"));
        LineRange lineRange = sourceBuilder.flowNode.codedata().lineRange();
        if (lineRange == null) {
            throw new IllegalStateException("Line range is not available for the activity creation node");
        }

        try {
            sourceBuilder.workspaceManager.loadProject(sourceBuilder.filePath);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to load the project for file: " + sourceBuilder.filePath, e);
        }
        SemanticModel semanticModel = FileSystemUtils.getSemanticModel(sourceBuilder.workspaceManager,
                sourceBuilder.filePath);

        // Get the context param name from the enclosing workflow function parameters
        FunctionDefinitionNode functionNode = WorkflowUtil.findEnclosingWorkflowFunction(sourceBuilder);
        if (functionNode == null) {
            throw new IllegalStateException("Activity call must be inside a workflow process function");
        }

        Optional<String> optCtxParamName = getContextParamName(functionNode, semanticModel);
        String ctxParamName;
        if (optCtxParamName.isPresent()) {
            ctxParamName = optCtxParamName.get();
        } else {
            addContextParameterToFunction(sourceBuilder, functionNode);
            ctxParamName = DEFAULT_CTX_PARAM_NAME;
        }

        // Generate: int result = check ctx->callActivity(myActivity, input);
        sourceBuilder.token()
                .name(resultType)
                .whiteSpace()
                .name(variableName)
                .whiteSpace()
                .keyword(SyntaxKind.EQUAL_TOKEN)
                .keyword(SyntaxKind.CHECK_KEYWORD)
                .name(ctxParamName)
                .keyword(SyntaxKind.RIGHT_ARROW_TOKEN)
                .name(CALL_ACTIVITY_METHOD)
                .keyword(SyntaxKind.OPEN_PAREN_TOKEN)
                .name(activityName)
                .keyword(SyntaxKind.COMMA_TOKEN);

        // Build activity call arguments from the parameters property
        sourceBuilder.token().keyword(SyntaxKind.OPEN_BRACE_TOKEN);
        Optional<Property> parameters = sourceBuilder.flowNode.getProperty(Property.PARAMETERS_KEY);
        if (parameters.isPresent() && parameters.get().value() instanceof Map<?, ?> paramMap) {
            boolean isFirstArg = true;
            for (Object obj : paramMap.values()) {
                Property paramProperty = gson.fromJson(gson.toJsonTree(obj), Property.class);
                if (!(paramProperty.value() instanceof Map<?, ?> paramData)) {
                    continue;
                }
                Map<String, Property> paramProperties = gson.fromJson(gson.toJsonTree(paramData),
                        FormBuilder.NODE_PROPERTIES_TYPE);
                String paramName = paramProperties.get(Property.VARIABLE_KEY).value().toString();
                if (!isFirstArg) {
                    sourceBuilder.token()
                            .keyword(SyntaxKind.COMMA_TOKEN);
                } else {
                    isFirstArg = false;
                }
                sourceBuilder.token()
                        .whiteSpace()
                        .name(paramName)
                        .keyword(SyntaxKind.COLON_TOKEN)
                        .name(paramName);
            }
        }
        sourceBuilder.token().keyword(SyntaxKind.CLOSE_BRACE_TOKEN);
        populateAdvancedArgs(sourceBuilder, sourceBuilder.flowNode.properties());

        sourceBuilder.token()
                .keyword(SyntaxKind.CLOSE_PAREN_TOKEN)
                .endOfStatement();

        return sourceBuilder.textEdit(SourceBuilder.SourceKind.STATEMENT,
                sourceBuilder.filePath, CommonUtils.toRange(lineRange)).build();
    }
}
