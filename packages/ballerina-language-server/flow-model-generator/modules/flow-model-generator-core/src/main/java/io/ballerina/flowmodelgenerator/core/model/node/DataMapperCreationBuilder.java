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
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.flowmodelgenerator.core.model.FormBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.FileSystemUtils;
import io.ballerina.projects.Document;
import org.ballerinalang.langserver.common.utils.NameUtil;
import org.ballerinalang.model.types.TypeKind;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Represents the properties of data mapper creation node.
 *
 * @since 2.0.0
 */
public class DataMapperCreationBuilder extends NodeBuilder {

    public static final String LABEL = "Data Mapper Creation";
    public static final String DESCRIPTION = "Define a data mapper and assign its result";

    public static final String DATA_MAPPER_NAME_LABEL = "Data Mapper Name";
    public static final String DATA_MAPPER_NAME_DOC = "Name of the data mapper";

    public static final String PARAMETERS_LABEL = "Inputs";
    public static final String PARAMETERS_DOC = "Arguments passed to the data mapper";

    public static final String OUTPUT_LABEL = "Output";
    public static final String OUTPUT_DOC = "Output type of the data mapper";

    private static final String FUNCTION_NAME = "transform";

    private static final Gson gson = new Gson();

    public static final String RETURN_TYPE = TypeKind.ANYDATA.typeName();
    public static final String PARAMETER_TYPE = TypeKind.ANYDATA.typeName();

    private static final String DATA_MAPPER_DEFINITION_FILE = "data_mappings.bal";

    protected String getNameLabel() {
        return DATA_MAPPER_NAME_LABEL;
    }

    protected String getNameDoc() {
        return DATA_MAPPER_NAME_DOC;
    }

    protected String getOutputDoc() {
        return OUTPUT_DOC;
    }

    protected String getParametersDoc() {
        return PARAMETERS_DOC;
    }

    protected String getNodeDefinitionFile() {
        return DATA_MAPPER_DEFINITION_FILE;
    }

    protected String getFunctionName() {
        return FUNCTION_NAME;
    }

    protected boolean isOutputOptional() {
        return false;
    }

    protected boolean isInputsOptional() {
        return false;
    }

    @Override
    public void setConcreteConstData() {
        metadata().label(LABEL).description(DESCRIPTION);
        codedata().node(NodeKind.DATA_MAPPER_CREATION);
    }

    public static Property getParameterSchema() {
        return ParameterSchemaHolder.PARAMETER_SCHEMA;
    }

    @Override
    public void setConcreteTemplateData(TemplateContext context) {
        properties().functionNameTemplate(getFunctionName(), context.getAllVisibleSymbolNames(),
                getNameLabel(), getNameDoc());

        properties().nestedProperty();
        setOptionalProperties(this);

        properties().custom()
                .metadata()
                    .label(OUTPUT_LABEL)
                    .description(getOutputDoc())
                .stepOut()
                .value("")
                .type(Property.ValueType.TYPE, RETURN_TYPE)
                .editable()
                .optional(isOutputOptional())
                .stepOut()
                .addProperty(Property.TYPE_KEY);

        properties().data(Property.RESULT_NAME, Property.RESULT_DOC,
                NameUtil.generateTypeName("var", context.getAllVisibleSymbolNames()), isOutputOptional());
    }

    public static void setProperty(FormBuilder<?> formBuilder, String type, String name) {
        formBuilder.dataMapperParameter(type, name, Property.ValueType.TYPE, PARAMETER_TYPE);
    }

    public void setOptionalProperties(NodeBuilder nodeBuilder) {
        nodeBuilder.properties()
                .endNestedProperty(Property.ValueType.REPEATABLE_PROPERTY, Property.PARAMETERS_KEY, PARAMETERS_LABEL,
                        getParametersDoc(), getParameterSchema(), isInputsOptional(), false);
    }

    @Override
    public Map<Path, List<TextEdit>> toSource(SourceBuilder sourceBuilder) {
        return combineTextEdits(createInvocation(sourceBuilder), createDefinition(sourceBuilder));
    }

    private Map<Path, List<TextEdit>> createDefinition(SourceBuilder sourceBuilder) {
        Path rootPath = sourceBuilder.workspaceManager.projectRoot(sourceBuilder.filePath);
        Path nodeDefinitionPath = rootPath.resolve(getNodeDefinitionFile());
        SourceBuilder definitionBuilder =
                new SourceBuilder(sourceBuilder.flowNode, sourceBuilder.workspaceManager, nodeDefinitionPath);
        definitionBuilder.token().keyword(SyntaxKind.FUNCTION_KEYWORD);

        Optional<Property> property = definitionBuilder.getProperty(Property.FUNCTION_NAME_KEY);
        if (property.isEmpty()) {
            throw new IllegalStateException("Data mapper name is not present");
        }
        definitionBuilder.token()
                .name(property.get().value().toString())
                .keyword(SyntaxKind.OPEN_PAREN_TOKEN);

        Optional<Property> parameters = definitionBuilder.getProperty(Property.PARAMETERS_KEY);
        if (parameters.isPresent() && parameters.get().value() instanceof Map<?, ?> paramMap) {
            List<String> paramList = new ArrayList<>();
            for (Map.Entry<?, ?> entry : paramMap.entrySet()) {
                Object obj = entry.getValue();
                Property paramProperty = gson.fromJson(gson.toJsonTree(obj), Property.class);
                if (!(paramProperty.value() instanceof Map<?, ?> paramData)) {
                    continue;
                }
                Map<String, Property> paramProperties = gson.fromJson(gson.toJsonTree(paramData),
                        FormBuilder.NODE_PROPERTIES_TYPE);
                paramList.add(paramProperties.get(Property.TYPE_KEY).value().toString() + " " + entry.getKey());
            }
            definitionBuilder.token().name(String.join(", ", paramList));
        }
        definitionBuilder.token().keyword(SyntaxKind.CLOSE_PAREN_TOKEN);
        endSourceGeneration(definitionBuilder);

        Document document = FileSystemUtils.getDocument(definitionBuilder.workspaceManager, nodeDefinitionPath);
        return definitionBuilder
                .textEdit(SourceBuilder.SourceKind.DECLARATION, nodeDefinitionPath,
                        CommonUtils.toRange(document.syntaxTree().rootNode().lineRange().endLine()))
                .build();
    }

    protected void endSourceGeneration(SourceBuilder sourceBuilder) {
        // Write the return type
        Optional<Property> returnType = sourceBuilder.getProperty(Property.TYPE_KEY);
        if (returnType.isEmpty() || returnType.get().value().toString().isEmpty()) {
            throw new IllegalStateException("The return type should be defined");
        }
        String returnTypeString = returnType.get().value().toString();
        sourceBuilder.token()
                .keyword(SyntaxKind.RETURNS_KEYWORD)
                .name(returnTypeString);

        Optional<String> returnBody =
                sourceBuilder.getExpressionBodyText(returnTypeString, returnType.get().imports());
        if (returnBody.isEmpty()) {
            throw new IllegalStateException("Failed to produce the function body");
        }

        sourceBuilder
                .token()
                .keyword(SyntaxKind.RIGHT_DOUBLE_ARROW_TOKEN)
                .name(returnBody.get())
                .endOfStatement();
    }

    private Map<Path, List<TextEdit>> createInvocation(SourceBuilder sourceBuilder) {
        Optional<Property> returnType = sourceBuilder.getProperty(Property.TYPE_KEY);
        if (returnType.isPresent() && !returnType.get().value().toString().isEmpty()) {
            sourceBuilder.newVariableWithInferredType();
        }

        Optional<Property> property = sourceBuilder.getProperty(Property.FUNCTION_NAME_KEY);
        if (property.isEmpty()) {
            throw new IllegalStateException("Name is not present");
        }
        sourceBuilder.token()
                .name(property.get().value().toString())
                .keyword(SyntaxKind.OPEN_PAREN_TOKEN);

        Optional<Property> parameters = sourceBuilder.flowNode.getProperty(Property.PARAMETERS_KEY);
        if (parameters.isPresent() && parameters.get().value() instanceof Map<?, ?> paramMap) {
            List<String> argsList = new ArrayList<>();
            for (Object obj : paramMap.values()) {
                Property paramProperty = gson.fromJson(gson.toJsonTree(obj), Property.class);
                if (!(paramProperty.value() instanceof Map<?, ?> paramData)) {
                    continue;
                }
                Map<String, Property> paramProperties = gson.fromJson(gson.toJsonTree(paramData),
                        FormBuilder.NODE_PROPERTIES_TYPE);
                String paramName = paramProperties.get(Property.VARIABLE_KEY).value().toString();
                argsList.add(paramName);
            }
            sourceBuilder.token().name(String.join(", ", argsList));
        }
        sourceBuilder.token().keyword(SyntaxKind.CLOSE_PAREN_TOKEN);
        sourceBuilder.token().endOfStatement();

        return sourceBuilder
                .textEdit(SourceBuilder.SourceKind.STATEMENT)
                .acceptImportWithVariableType()
                .build();
    }

    private Map<Path, List<TextEdit>> combineTextEdits(Map<Path, List<TextEdit>> source,
                                                       Map<Path, List<TextEdit>> target) {
        for (Map.Entry<Path, List<TextEdit>> sourceEntry : source.entrySet()) {
            Path path = sourceEntry.getKey();
            List<TextEdit> targetTextEdits = target.get(path);
            if (targetTextEdits == null) {
                target.put(path, sourceEntry.getValue());
            } else {
                targetTextEdits.addAll(sourceEntry.getValue());
            }
        }

        return target;
    }

    private static class ParameterSchemaHolder {

        private static final Property PARAMETER_SCHEMA = initParameterSchema();

        private static Property initParameterSchema() {
            FormBuilder<?> formBuilder = new FormBuilder<>(null, null, null, null);
            setProperty(formBuilder, "", "");
            Map<String, Property> nodeProperties = formBuilder.build();
            return nodeProperties.get("");
        }
    }
}
