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

package io.ballerina.servicemodelgenerator.extension.builder.function;

import com.google.gson.Gson;
import com.google.gson.stream.JsonReader;
import io.ballerina.compiler.syntax.tree.AnnotationNode;
import io.ballerina.compiler.syntax.tree.BasicLiteralNode;
import io.ballerina.compiler.syntax.tree.ExpressionNode;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.MappingConstructorExpressionNode;
import io.ballerina.compiler.syntax.tree.MappingFieldNode;
import io.ballerina.compiler.syntax.tree.MetadataNode;
import io.ballerina.compiler.syntax.tree.SpecificFieldNode;
import io.ballerina.servicemodelgenerator.extension.model.Function;
import io.ballerina.servicemodelgenerator.extension.model.Parameter;
import io.ballerina.servicemodelgenerator.extension.model.PropertyType;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import io.ballerina.servicemodelgenerator.extension.model.context.AddModelContext;
import io.ballerina.servicemodelgenerator.extension.model.context.GetModelContext;
import io.ballerina.servicemodelgenerator.extension.model.context.ModelFromSourceContext;
import io.ballerina.servicemodelgenerator.extension.model.context.UpdateModelContext;
import io.ballerina.servicemodelgenerator.extension.util.Utils;
import org.eclipse.lsp4j.TextEdit;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static io.ballerina.servicemodelgenerator.extension.util.Constants.KIND_REMOTE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.MCP;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.NEW_LINE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.REMOTE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.SPACE;
import static java.util.regex.Matcher.quoteReplacement;
import static java.util.regex.Pattern.quote;

public class McpFunctionBuilder extends AbstractFunctionBuilder {

    private static final String MCP_FUNCTION_MODEL_LOCATION = "functions/mcp_tool.json";
    private static final String TOOL_DESCRIPTION_PROPERTY = "toolDescription";

    // mcp:Tool annotation handling
    private static final String TOOL_ANNOTATION_REF = MCP + ":Tool";
    private static final String TOOL_ANNOTATION_PROPERTY = "annotTool";
    private static final String DESCRIPTION_FIELD_NAME = "description";

    // Documentation format constants
    private static final String DOC_COMMENT_PREFIX = "# ";
    private static final String DOC_COMMENT_SEPARATOR = "    #";
    private static final String DOC_RETURN_PREFIX = "    # + return - ";
    private static final String PARAM_DOC_PATTERN_STR = "# + ";
    private static final String DOC_INDENT = "    ";

    // Regex pattern for parameter documentation
    private static final Pattern PARAM_PATTERN = Pattern.compile("^\\s*#\\s*\\+\\s+(\\w+)\\s*-\\s*(.*)$");

    /**
     * Updates a TextEdit containing existing documentation.
     *
     * @param edit            The TextEdit to update
     * @param originalText    The original text content
     * @param toolDescription The tool description to add
     * @param returnType      The return type description
     */
    private static void updateDocumentationEdit(TextEdit edit, String originalText,
                                                String toolDescription, String returnType) {
        int firstHashIndex = originalText.indexOf('#');
        String leading = originalText.substring(0, firstHashIndex);
        String docContent = originalText.substring(firstHashIndex);

        StringBuilder newDoc = new StringBuilder(leading);
        String toolDescSection = buildToolDescriptionSection(toolDescription);
        if (!toolDescSection.isEmpty()) {
            newDoc.append(toolDescSection);
            newDoc.append("    ");
        }
        newDoc.append(docContent);

        // Add return type if not present
        if (!newDoc.toString().contains(DOC_RETURN_PREFIX)) {
            newDoc.append(NEW_LINE).append("    ").append(buildReturnTypeSection(returnType));
        }

        edit.setNewText(newDoc.toString());
    }

    /**
     * Loads the MCP function model template from resources.
     *
     * @return Optional containing the function model template, or empty if loading fails
     */
    private static Optional<Function> getMcpFunctionModel() {
        InputStream resourceStream = Utils.class.getClassLoader()
                .getResourceAsStream(MCP_FUNCTION_MODEL_LOCATION);
        if (resourceStream == null) {
            // Resource file not found - this indicates a packaging issue
            return Optional.empty();
        }

        try (JsonReader reader = new JsonReader(new InputStreamReader(resourceStream, StandardCharsets.UTF_8))) {
            Function function = new Gson().fromJson(reader, Function.class);
            if (function == null) {
                // JSON parsing resulted in null - invalid template format
                return Optional.empty();
            }
            return Optional.of(function);
        } catch (IOException e) {
            // Failed to read or parse the template file
            return Optional.empty();
        }
    }

    private static Map<String, List<TextEdit>> addFunctionDocumentation(Map<String, List<TextEdit>> textEdits,
                                                                        AddModelContext context,
                                                                        String toolDescription) {
        String returnType = getReturnTypeDescription(context.function());
        String functionName = context.function().getName().getValue();
        String remoteFunctionPattern = REMOTE + SPACE + "function" + SPACE + functionName;

        Optional<TextEdit> remoteFunctionEdit = findRemoteFunctionEdit(textEdits, functionName);
        if (remoteFunctionEdit.isEmpty()) {
            return textEdits;
        }

        TextEdit edit = remoteFunctionEdit.get();
        String originalText = edit.getNewText();

        // Check if there are parameter docs
        if (originalText.contains(PARAM_DOC_PATTERN_STR)) {
            // Has parameters - insert tool description before first parameter
            String result = insertToolDescriptionBeforeParams(originalText, toolDescription, returnType,
                    remoteFunctionPattern);
            edit.setNewText(result);
        } else {
            // No parameters - create complete documentation
            String docString = buildCompleteDocumentation(toolDescription, "", returnType);
            String result = originalText.replaceFirst(quote(remoteFunctionPattern),
                    quoteReplacement(docString + "    " + remoteFunctionPattern));
            edit.setNewText(result);
        }

        return textEdits;
    }

    /**
     * Inserts tool description before parameter documentation.
     *
     * @param originalText          The original text content
     * @param toolDescription       The tool description to add
     * @param returnType            The return type description
     * @param remoteFunctionPattern The pattern to find the function signature
     * @return Updated text with documentation
     */
    private static String insertToolDescriptionBeforeParams(String originalText, String toolDescription,
                                                            String returnType, String remoteFunctionPattern) {
        String result = originalText;

        // Add tool description before first parameter if present
        if (toolDescription != null && !toolDescription.trim().isEmpty()) {
            String toolDescSection = buildToolDescriptionSection(toolDescription);
            // Need to escape special regex characters in PARAM_DOC_PATTERN_STR for replaceFirst
            String escapedPattern = quote(PARAM_DOC_PATTERN_STR);
            result = result.replaceFirst(escapedPattern,
                    quoteReplacement(toolDescSection + "    " + PARAM_DOC_PATTERN_STR));
        }

        // Add return documentation before function signature if not present
        if (!result.contains(DOC_RETURN_PREFIX)) {
            String returnDoc = "    " + buildReturnTypeSection(returnType) + "    ";
            result = result.replaceFirst(quote(remoteFunctionPattern),
                    quoteReplacement(returnDoc + remoteFunctionPattern));
        }

        return result;
    }

    /**
     * Extracts the tool description from the function properties.
     *
     * @param function The function model
     * @return The tool description or null if not present
     */
    private static String extractToolDescription(Function function) {
        return function.getProperties().containsKey(TOOL_DESCRIPTION_PROPERTY)
                ? function.getProperties().get(TOOL_DESCRIPTION_PROPERTY).getValue()
                : null;
    }

    /**
     * Gets the return type description from the function.
     *
     * @param function The function model
     * @return The return type or empty string if not present
     */
    private static String getReturnTypeDescription(Function function) {
        return function.getReturnType() != null
                ? function.getReturnType().getValue()
                : "";
    }

    /**
     * Builds the tool description section of the documentation.
     *
     * @param toolDescription The tool description text
     * @return The formatted tool description section
     */
    private static String buildToolDescriptionSection(String toolDescription) {
        if (toolDescription == null || toolDescription.trim().isEmpty()) {
            return "";
        }
        return DOC_COMMENT_PREFIX + toolDescription + NEW_LINE +
                DOC_COMMENT_SEPARATOR + NEW_LINE;
    }

    /**
     * Builds the return type documentation line.
     *
     * @param returnType The return type description
     * @return The formatted return type documentation
     */
    private static String buildReturnTypeSection(String returnType) {
        return DOC_RETURN_PREFIX + returnType + NEW_LINE;
    }

    /**
     * Builds complete documentation with tool description, parameters, and return type.
     *
     * @param toolDescription The tool description (can be null)
     * @param parameterDocs   Existing parameter documentation (can be empty)
     * @param returnType      The return type description
     * @return Complete formatted documentation
     */
    private static String buildCompleteDocumentation(String toolDescription, String parameterDocs, String returnType) {
        StringBuilder doc = new StringBuilder();

        String toolDescSection = buildToolDescriptionSection(toolDescription);
        if (!toolDescSection.isEmpty()) {
            doc.append(toolDescSection);
        }

        if (parameterDocs != null && !parameterDocs.isEmpty()) {
            doc.append("    ").append(parameterDocs);
            if (!doc.toString().contains(DOC_RETURN_PREFIX)) {
                doc.append(NEW_LINE);
            }
        }

        if (!doc.toString().contains(DOC_RETURN_PREFIX)) {
            doc.append("    ").append(buildReturnTypeSection(returnType));
        }

        return doc.toString();
    }

    /**
     * Finds the TextEdit containing the remote function pattern.
     *
     * @param textEdits    Map of text edits
     * @param functionName The function name to search for
     * @return Optional containing the matching TextEdit
     */
    private static Optional<TextEdit> findRemoteFunctionEdit(Map<String, List<TextEdit>> textEdits,
                                                             String functionName) {
        String remoteFunctionPattern = REMOTE + SPACE + "function" + SPACE + functionName;
        return textEdits.values().stream()
                .flatMap(List::stream)
                .filter(edit -> edit.getNewText() != null && edit.getNewText().contains(remoteFunctionPattern))
                .findFirst();
    }

    /**
     * Parses the markdown documentation string and populates the function model.
     *
     * @param function      The function model to populate
     * @param documentation The markdown documentation string
     */
    public static void parseDocumentation(Function function, String documentation) {
        if (documentation == null || documentation.trim().isEmpty()) {
            return;
        }

        String[] lines = documentation.split("\\r?\\n");
        String toolDescription = null;
        Map<String, String> paramDocs = new HashMap<>();

        for (String line : lines) {
            String trimmedLine = line.trim();

            // Extract tool description (first line starting with # but not # + pattern)
            if (toolDescription == null && trimmedLine.startsWith("#") && !trimmedLine.matches("^#\\s*\\+.*")) {
                toolDescription = trimmedLine.replaceFirst("^#\\s*", "").trim();
                continue;
            }

            // Extract parameter documentation using the static pattern
            Matcher paramMatcher = PARAM_PATTERN.matcher(trimmedLine);
            if (paramMatcher.matches()) {
                String paramName = paramMatcher.group(1);
                String paramDoc = paramMatcher.group(2);
                if (!paramName.equals("return")) {
                    paramDocs.put(paramName, paramDoc);
                }
            }
        }

        // Set tool description in function properties
        if (toolDescription != null && !toolDescription.isEmpty()) {
            function.getProperties().put(TOOL_DESCRIPTION_PROPERTY, buildToolDescriptionValue(toolDescription));
        }

        // Set parameter documentation
        if (function.getParameters() != null) {
            for (Parameter param : function.getParameters()) {
                String paramName = param.getName().getValue();
                if (paramDocs.containsKey(paramName)) {
                    if (param.getDocumentation() == null) {
                        Value paramDocValue =
                                new Value.ValueBuilder()
                                        .value(paramDocs.get(paramName))
                                        .build();
                        param.setDocumentation(paramDocValue);
                    } else {
                        param.getDocumentation().setValue(paramDocs.get(paramName));
                    }
                }
            }
        }
    }

    @Override
    public Optional<Function> getModelTemplate(GetModelContext context) {
        return getMcpFunctionModel();
    }

    @Override
    public Map<String, List<TextEdit>> addModel(AddModelContext context) throws Exception {
        Map<String, List<TextEdit>> textEdits = super.addModel(context);
        String toolDescription = extractToolDescription(context.function());
        return addFunctionDocumentation(textEdits, context, toolDescription);
    }

    @Override
    public Map<String, List<TextEdit>> updateModel(UpdateModelContext context) {
        Map<String, List<TextEdit>> result = super.updateModel(context);

        String toolDescription = extractToolDescription(context.function());
        String returnType = getReturnTypeDescription(context.function());

        Optional<TextEdit> docEdit = findDocCommentEdit(result);
        if (docEdit.isPresent()) {
            TextEdit edit = docEdit.get();
            String originalText = edit.getNewText();
            String stripped = originalText == null ? "" : originalText.stripLeading();
            if (stripped.startsWith("#")) {
                updateDocumentationEdit(edit, originalText, toolDescription, returnType);
            } else if (stripped.isEmpty()) {
                edit.setNewText(buildCompleteDocumentation(toolDescription, "", returnType));
            }
        } else if (toolDescription != null && !toolDescription.trim().isEmpty()) {
            // Annotation-form source had no doc comment; insert one at the metadata anchor.
            insertNewDocEdit(result, context, toolDescription, returnType);
        }

        return result;
    }

    // The doc-comment edit (leading '#' or empty); absent when the source had no doc string and no param docs.
    private static Optional<TextEdit> findDocCommentEdit(Map<String, List<TextEdit>> textEdits) {
        return textEdits.values().stream()
                .flatMap(List::stream)
                .filter(edit -> {
                    String text = edit.getNewText();
                    if (text == null) {
                        return false;
                    }
                    String stripped = text.stripLeading();
                    return stripped.startsWith("#") || stripped.isEmpty();
                })
                .findFirst();
    }

    // Inserts a fresh doc-comment block at the metadata anchor when the source had no doc string.
    private static void insertNewDocEdit(Map<String, List<TextEdit>> result, UpdateModelContext context,
                                         String toolDescription, String returnType) {
        Optional<MetadataNode> metadata = context.functionNode().metadata();
        if (metadata.isEmpty()) {
            return;
        }
        String filePath = result.keySet().stream().findFirst().orElse(null);
        if (filePath == null) {
            return;
        }
        String docBlock = DOC_INDENT + buildCompleteDocumentation(toolDescription, "", returnType);
        TextEdit insertEdit = new TextEdit(Utils.toRange(metadata.get().lineRange().startLine()), docBlock);
        result.get(filePath).addFirst(insertEdit);
    }

    @Override
    public Function getModelFromSource(ModelFromSourceContext context) {
        Function function = super.getModelFromSource(context);
        // Mark as REMOTE so updateFunction routes saves here instead of DefaultFunctionBuilder.
        function.setKind(KIND_REMOTE);

        FunctionDefinitionNode functionNode = (FunctionDefinitionNode) context.node();
        if (functionNode.metadata().isPresent()) {
            MetadataNode metadata = functionNode.metadata().get();
            if (metadata.documentationString().isPresent()) {
                String documentation = metadata.documentationString().get().toString();
                parseDocumentation(function, documentation);
            }
            processToolAnnotation(function, metadata);
        }

        return function;
    }

    /**
     * Hoists a string-literal {@code description} from the {@code @mcp:Tool} annotation into the
     * {@code toolDescription} property and strips it from the annotation, preserving any other fields.
     */
    private static void processToolAnnotation(Function function, MetadataNode metadata) {
        Value annotProperty = function.getProperties().get(TOOL_ANNOTATION_PROPERTY);
        if (annotProperty == null) {
            return;
        }
        // The parent leaves annotation-attachment properties without a types list; populate it so it is well-formed.
        if (annotProperty.getTypes() == null || annotProperty.getTypes().isEmpty()) {
            annotProperty.setTypes(new ArrayList<>(List.of(PropertyType.types(Value.FieldType.TEXT, "string"))));
        }

        AnnotationNode toolAnnotation = findToolAnnotation(metadata);
        if (toolAnnotation == null || toolAnnotation.annotValue().isEmpty()) {
            return;
        }

        MappingConstructorExpressionNode mapping = toolAnnotation.annotValue().get();
        SpecificFieldNode descriptionField = null;
        // Keep source snippets so non-description fields (schema, spread fields) round-trip verbatim.
        List<String> keptFieldSources = new ArrayList<>();
        for (MappingFieldNode field : mapping.fields()) {
            if (field instanceof SpecificFieldNode specific
                    && DESCRIPTION_FIELD_NAME.equals(specific.fieldName().toString().trim())) {
                descriptionField = specific;
            } else {
                keptFieldSources.add(field.toSourceCode().trim());
            }
        }

        if (descriptionField == null) {
            return;
        }

        String literal = extractStringLiteral(descriptionField.valueExpr().orElse(null));
        if (literal == null) {
            // Non-literal description (template / variable / expression). Leave the annotation untouched.
            return;
        }

        // Only hoist if parseDocumentation didn't already set it from a doc comment.
        if (!function.getProperties().containsKey(TOOL_DESCRIPTION_PROPERTY)) {
            function.getProperties().put(TOOL_DESCRIPTION_PROPERTY, buildToolDescriptionValue(literal));
        }

        if (keptFieldSources.isEmpty()) {
            // Annotation only contained the description we just hoisted; suppress emission on save.
            annotProperty.setEnabled(false);
            annotProperty.setEditable(true);
        } else {
            annotProperty.setValue(buildAnnotationValue(keptFieldSources));
        }
    }

    private static AnnotationNode findToolAnnotation(MetadataNode metadata) {
        for (AnnotationNode annotation : metadata.annotations()) {
            if (TOOL_ANNOTATION_REF.equals(annotation.annotReference().toString().trim())) {
                return annotation;
            }
        }
        return null;
    }

    // Contents of a double-quoted string literal, or null if expr is not one.
    private static String extractStringLiteral(ExpressionNode expr) {
        if (!(expr instanceof BasicLiteralNode literal)) {
            return null;
        }
        String text = literal.literalToken().text();
        if (text.length() < 2 || !text.startsWith("\"") || !text.endsWith("\"")) {
            return null;
        }
        return text.substring(1, text.length() - 1);
    }

    private static Value buildToolDescriptionValue(String description) {
        return new Value.ValueBuilder()
                .metadata("Tool Description", "Description of what this MCP tool does")
                .setPlaceholder("Describe what this tool does...")
                .types(List.of(PropertyType.types(Value.FieldType.TEXT, "string")))
                .value(description)
                .enabled(true)
                .editable(true)
                .optional(true)
                .setAdvanced(false)
                .build();
    }

    // Rebuilds the annotation mapping body from the kept field source snippets.
    private static String buildAnnotationValue(List<String> keptFieldSources) {
        StringBuilder sb = new StringBuilder(" {");
        boolean first = true;
        for (String fieldSource : keptFieldSources) {
            if (!first) {
                sb.append(",");
            }
            sb.append(NEW_LINE).append(DOC_INDENT).append(fieldSource);
            first = false;
        }
        sb.append(NEW_LINE).append("}");
        return sb.toString();
    }

    @Override
    public String kind() {
        return MCP;
    }
}
