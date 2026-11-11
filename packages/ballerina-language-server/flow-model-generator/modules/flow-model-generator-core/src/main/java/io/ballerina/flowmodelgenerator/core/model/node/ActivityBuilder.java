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

import io.ballerina.flowmodelgenerator.core.model.FormBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.utils.WorkflowUtil;

import java.util.Map;

import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_MODULE;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_ORG;

/**
 * Represents a workflow activity function.
 *
 * @since 1.8.0
 */
public class ActivityBuilder extends FunctionDefinitionBuilder {

    public static final String LABEL = "Workflow Activity";
    public static final String DESCRIPTION = "Define a workflow activity function";
    public static final String ANYDATA_TYPE = "anydata";
    public static final String ACTIVITY_LABEL = "Activity Name";
    public static final String ACTIVITY_DESCRIPTION = "Name of the activity function";
    public static final String ACTIVITY_ANNOTATION = "@workflow:Activity";
    public static final String ACTIVITY_NAME = "activity";

    public static Property getActivityParamSchema() {
        return ParameterSchemaHolder.PARAMETER_SCHEMA;
    }

    public Property getParamSchema() {
        return getActivityParamSchema();
    }

    @Override
    public void setConcreteConstData() {
        metadata().label(LABEL).description(DESCRIPTION);
        codedata().
                node(NodeKind.ACTIVITY)
                .org(WORKFLOW_ORG)
                .module(WORKFLOW_MODULE);
    }

    @Override
    public void setConcreteTemplateData(TemplateContext context) {
        WorkflowUtil.pullWorkflowModuleIfMissing(context);
        properties().functionNameTemplate(ACTIVITY_NAME, context.getAllVisibleSymbolNames(),
                ACTIVITY_LABEL,
                ACTIVITY_DESCRIPTION);
        setOptionalProperties(this, null, "", "");
        properties()
                .endNestedProperty(Property.ValueType.REPEATABLE_PROPERTY, Property.PARAMETERS_KEY, PARAMETERS_LABEL,
                        PARAMETERS_DOC, getParamSchema(), true, false);
    }

    public static void setOptionalProperties(NodeBuilder nodeBuilder, String returnType, String description,
                                             String returnDescription) {
        nodeBuilder.properties()
                .annotations(ACTIVITY_ANNOTATION)
                .functionDescription(description)
                .returnType(returnType, ANYDATA_TYPE, true)
                .returnDescription(returnDescription)
                .nestedProperty();
    }

    private static class ParameterSchemaHolder {

        private static final Property PARAMETER_SCHEMA = initParameterSchema();

        private static Property initParameterSchema() {
            FormBuilder<?> formBuilder = new FormBuilder<>(null, null, null, null);
            formBuilder.parameter("", "", null, Property.ValueType.TYPE, ANYDATA_TYPE);
            Map<String, Property> nodeProperties = formBuilder.build();
            return nodeProperties.get("");
        }
    }
}
