/*
 *  Copyright (c) 2025, WSO2 LLC. (http://www.wso2.com)
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
import io.ballerina.compiler.syntax.tree.Token;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.FormBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Represents the properties of a function definition node.
 *
 * @since 1.0.0
 */
public class FunctionDefinitionBuilder extends NodeBuilder {

    public static final String LABEL = "Function Definition";
    public static final String DESCRIPTION = "Define a function";

    public static final String FUNCTION_NAME_LABEL = "Name";
    public static final String ANNOTATIONS_LABEL = "Annotations";
    public static final String FUNCTION_NAME_DOC = "Name of the function";
    public static final String ANNOTATION_DOC = "Annotations of the function";

    public static final String PARAMETERS_LABEL = "Parameters";
    public static final String PARAMETERS_DOC = "Function parameters";

    public static final String METADATA_RETURN_KEY = "return";
    public static final String METADATA_PARAMETERS_KEY = "parameters";

    private static final Gson gson = new Gson();
    private static final Pattern ERROR_MEMBER_PATTERN = Pattern.compile("error(\\s*<.*>)?");

    public static Property getParameterSchema() {
        return ParameterSchemaHolder.PARAMETER_SCHEMA;
    }

    @Override
    public void setConcreteConstData() {
        metadata().label(LABEL).description(DESCRIPTION);
        codedata().node(NodeKind.FUNCTION_DEFINITION);
    }

    @Override
    public void setConcreteTemplateData(TemplateContext context) {
        properties().functionNameTemplate("function", context.getAllVisibleSymbolNames());
        setMandatoryProperties(this, null, "", "");
        setOptionalProperties(this);
    }

    public static void setMandatoryProperties(NodeBuilder nodeBuilder, String returnType, String description,
                                              String returnDescription) {
        nodeBuilder.properties()
                .functionDescription(description)
                .returnType(returnType, null, true)
                .returnDescription(returnDescription)
                .isPublic(false, false, true, false)
                .nestedProperty();
    }

    public static void setProperty(FormBuilder<?> formBuilder, String type, String name, String description,
                                   Token token) {
        formBuilder.parameterWithDescription(type, name, token, Property.ValueType.TYPE, description);
    }

    public static void setOptionalProperties(NodeBuilder nodeBuilder) {
        nodeBuilder.properties()
                .endNestedProperty(Property.ValueType.REPEATABLE_PROPERTY, Property.PARAMETERS_KEY, PARAMETERS_LABEL,
                        PARAMETERS_DOC, getParameterSchema(), true, false);
    }

    @Override
    public Map<Path, List<TextEdit>> toSource(SourceBuilder sourceBuilder) {
        Optional<Property> optDescription = sourceBuilder.getProperty(Property.FUNCTION_NAME_DESCRIPTION_KEY);
        String description = "";
        if (optDescription.isPresent()) {
            description = optDescription.get().value().toString();
        }

        Optional<Property> parameters = sourceBuilder.getProperty(Property.PARAMETERS_KEY);
        String params = "";
        Map<String, String> paramsDesc = new HashMap<>();
        if (parameters.isPresent() && parameters.get().value() instanceof Map<?, ?> paramMap) {
            List<String> paramList = new ArrayList<>();
            for (Object obj : paramMap.values()) {
                Property paramProperty = gson.fromJson(gson.toJsonTree(obj), Property.class);
                if (!(paramProperty.value() instanceof Map<?, ?> paramData)) {
                    continue;
                }
                Map<String, Property> paramProperties = gson.fromJson(gson.toJsonTree(paramData),
                        FormBuilder.NODE_PROPERTIES_TYPE);

                String paramType = paramProperties.get(Property.TYPE_KEY).value().toString();
                String paramName = paramProperties.get(Property.VARIABLE_KEY).value().toString();
                paramList.add(paramType + " " + paramName);
                if (optDescription.isPresent()) {
                    Property property = paramProperties.get(Property.PARAMETER_DESCRIPTION_KEY);
                    if (property != null) {
                        String paramDescription = property.value().toString();
                        if (!paramDescription.isEmpty()) {
                            paramsDesc.put(paramName, paramDescription);
                        }
                    }
                }
            }
            params = String.join(", ", paramList);
        }

        Optional<Property> optReturnDescription = sourceBuilder.getProperty(Property.RETURN_DESCRIPTION_KEY);
        String returnDescription = "";
        if (optReturnDescription.isPresent()) {
            returnDescription = optReturnDescription.get().value().toString();
        }

        Optional<Property> funcNameProperty = sourceBuilder.getProperty(Property.FUNCTION_NAME_KEY);
        if (funcNameProperty.isEmpty()) {
            throw new IllegalStateException("Function name is not present");
        }
        String funcName = funcNameProperty.get().value().toString();

        if (!description.isEmpty()) {
            sourceBuilder.token().descriptionDoc(description);
        }
        if (!paramsDesc.isEmpty() || !returnDescription.isEmpty()) {
            if (description.isEmpty()) {
                sourceBuilder.token().descriptionDoc(funcName + " description");
            }
            paramsDesc.forEach((paramName, paramDescription) -> {
                sourceBuilder.token().parameterDoc(paramName, paramDescription);
            });
            if (!returnDescription.isEmpty()) {
                sourceBuilder.token().returnDoc(returnDescription);
            }
        }

        Optional<Property> annotationsProperty = sourceBuilder.getProperty(Property.ANNOTATIONS_KEY);
        if (annotationsProperty.isPresent()) {
            sourceBuilder.token().name(annotationsProperty.get().toSourceCode()).newLine();
        }

        Optional<Property> visibilityProperty = sourceBuilder.getProperty(Property.IS_PUBLIC_KEY);
        if (visibilityProperty.isPresent() && Boolean.parseBoolean(visibilityProperty.get().value().toString())) {
            sourceBuilder.token().keyword(SyntaxKind.PUBLIC_KEYWORD);
        }

        Optional<Property> isolatedProperty = sourceBuilder.getProperty(Property.IS_ISOLATED_KEY);
        if (isolatedProperty.isPresent()) {
            sourceBuilder.token().keyword(SyntaxKind.ISOLATED_KEYWORD);
        }

        sourceBuilder.token().keyword(SyntaxKind.FUNCTION_KEYWORD);

        // Write the function name
        sourceBuilder.token()
                .name(funcName)
                .keyword(SyntaxKind.OPEN_PAREN_TOKEN);

        // WRite the function parameters
        if (!params.isEmpty()) {
            sourceBuilder.token().name(params);
        }
        sourceBuilder.token().keyword(SyntaxKind.CLOSE_PAREN_TOKEN);

        // Write the return type
        Codedata codedata = sourceBuilder.flowNode.codedata();
        boolean isNewDefinition = codedata.lineRange() == null || Boolean.TRUE.equals(codedata.isNew());
        Optional<Property> returnType = sourceBuilder.getProperty(Property.TYPE_KEY);
        String returnTypeText = returnType.map(property -> property.value().toString().trim()).orElse("");
        boolean isActivity = codedata.node() == NodeKind.ACTIVITY || codedata.node() == NodeKind.ACTIVITY_CREATION;
        if (isNewDefinition && isActivity) {
            returnTypeText = withErrorReturn(returnTypeText);
        }
        if (!returnTypeText.isEmpty()) {
            sourceBuilder.token()
                    .keyword(SyntaxKind.RETURNS_KEYWORD)
                    .name(returnTypeText);
        }

        // Generate text edits based on the line range. If a line range exists, update the signature of the existing
        // function. Otherwise, create a new function definition in "functions.bal".
        if (isNewDefinition) {
            sourceBuilder
                    .token()
                        .openBrace()
                        .closeBrace()
                        .stepOut()
                    .textEdit(SourceBuilder.SourceKind.DECLARATION)
                    .acceptImport();
        } else {
            sourceBuilder
                    .token().skipFormatting().stepOut()
                    .textEdit();
        }
        return sourceBuilder.build();
    }

    private static class ParameterSchemaHolder {

        private static final Property PARAMETER_SCHEMA = initParameterSchema();

        private static Property initParameterSchema() {
            FormBuilder<?> formBuilder = new FormBuilder<>(null, null, null, null);
            setProperty(formBuilder, "", "", "", null);
            Map<String, Property> nodeProperties = formBuilder.build();
            return nodeProperties.get("");
        }
    }

    // A new activity can error: connection actions added to its body use `check`, as ActivityGenerator assumes.
    private static String withErrorReturn(String returnType) {
        if (returnType.isEmpty()) {
            return "error?";
        }
        return admitsError(returnType) ? returnType : returnType + "|error";
    }

    // Whether the type can hold an error itself: a top-level union member is `error` (`error[]` holds only arrays).
    private static boolean admitsError(String type) {
        int depth = 0;
        int start = 0;
        for (int i = 0; i <= type.length(); i++) {
            char c = i < type.length() ? type.charAt(i) : '|';
            if (c == '(' || c == '<' || c == '[' || c == '{') {
                depth++;
            } else if (c == ')' || c == '>' || c == ']' || c == '}') {
                depth--;
            } else if (c == '|' && depth == 0) {
                String member = type.substring(start, i).trim();
                if (member.endsWith("?")) {
                    member = member.substring(0, member.length() - 1).trim();
                }
                if (member.startsWith("(") && member.endsWith(")")
                        ? admitsError(member.substring(1, member.length() - 1))
                        : ERROR_MEMBER_PATTERN.matcher(member).matches()) {
                    return true;
                }
                start = i + 1;
            }
        }
        return false;
    }
}
