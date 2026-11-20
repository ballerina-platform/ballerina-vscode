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

package io.ballerina.flowmodelgenerator.core.utils;

import io.ballerina.compiler.syntax.tree.MetadataNode;
import io.ballerina.compiler.syntax.tree.ModuleVariableDeclarationNode;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.compiler.syntax.tree.TypedBindingPatternNode;
import io.ballerina.flowmodelgenerator.core.Constants;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.FlowNode;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.projects.Document;
import io.ballerina.projects.DocumentId;
import io.ballerina.projects.Module;
import io.ballerina.projects.Project;
import io.ballerina.projects.ProjectKind;
import io.ballerina.tools.text.LineRange;

import java.nio.file.Path;
import java.util.Arrays;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Utilities for configurable variables, shared by the configurable editor and the flow node diagnostics.
 *
 * @since 1.8.0
 */
public final class ConfigVariableUtil {

    private static final String LS = System.lineSeparator();
    private static final String HASH_COMMENT_PREFIX = "# ";
    private static final String REQUIRED_VALUE = "?";
    private static final String VAR = "var";

    private ConfigVariableUtil() {
    }

    /**
     * Builds the source of a configurable variable declaration, with its documentation as {@code #} comments above
     * it. An empty default value makes the configurable required ({@code ?}).
     *
     * @param type          the type of the variable; {@code var} when empty
     * @param name          the name of the variable
     * @param defaultValue  the default value, or empty when the value must come from Config.toml
     * @param documentation the documentation in Markdown, or empty
     * @return the declaration source
     */
    public static String constructConfigStatement(String type, String name, String defaultValue,
                                                  String documentation) {
        StringBuilder statement = new StringBuilder();
        // UI sends \n on every OS
        if (!documentation.isBlank()) {
            Arrays.stream(documentation.strip().split("\\R")).forEach(docLine -> statement
                    .append(docLine.isBlank() ? HASH_COMMENT_PREFIX.strip() : HASH_COMMENT_PREFIX + docLine)
                    .append(LS));
        }
        statement.append(SyntaxKind.CONFIGURABLE_KEYWORD.stringValue()).append(" ")
                .append(type.isBlank() ? VAR : type).append(" ")
                .append(name).append(" ")
                .append(SyntaxKind.EQUAL_TOKEN.stringValue()).append(" ")
                .append(defaultValue.isBlank() ? REQUIRED_VALUE : defaultValue)
                .append(SyntaxKind.SEMICOLON_TOKEN.stringValue());
        return statement.toString();
    }

    /**
     * Resolves the source file a configurable is written to: an explicit {@code filePath} in its codedata, the
     * context file for a new configurable, or else the file its line range names.
     *
     * @param configVariable  the configurable flow node
     * @param contextFilePath the file a new configurable is written to
     * @param project         the project the configurable belongs to
     * @return the file path, or {@code null} when it cannot be resolved
     */
    public static Path resolveFilePath(FlowNode configVariable, Path contextFilePath, Project project) {
        Codedata codedata = configVariable.codedata();
        if (codedata != null && codedata.data() != null && codedata.data().containsKey(Constants.FILE_PATH_KEY)) {
            return Path.of(codedata.data().get(Constants.FILE_PATH_KEY).toString());
        }
        if (isNew(configVariable)) {
            return contextFilePath;
        }
        if (codedata == null || codedata.lineRange() == null) {
            return null;
        }
        if (project.kind() == ProjectKind.SINGLE_FILE_PROJECT) {
            return project.sourceRoot();
        }
        String variableFileName = codedata.lineRange().fileName();
        for (Module module : project.currentPackage().modules()) {
            Path path = findDocumentPath(module, module.documentIds(), variableFileName, project);
            if (path == null) {
                path = findDocumentPath(module, module.testDocumentIds(), variableFileName, project);
            }
            if (path != null) {
                return path;
            }
        }
        return null;
    }

    private static Path findDocumentPath(Module module, Collection<DocumentId> documentIds, String fileName,
                                         Project project) {
        for (DocumentId documentId : documentIds) {
            Document document = module.document(documentId);
            if (document.name().equals(fileName)) {
                return project.sourceRoot().resolve(document.syntaxTree().filePath());
            }
        }
        return null;
    }

    /**
     * Checks whether the configurable does not exist in source yet.
     */
    public static boolean isNew(FlowNode configVariable) {
        return configVariable.codedata() != null && Boolean.TRUE.equals(configVariable.codedata().isNew());
    }

    /**
     * Maps each configurable form field to the line range of its part of the declaration.
     */
    public static Map<String, LineRange> propertyRanges(ModuleVariableDeclarationNode declaration) {
        TypedBindingPatternNode typedBindingPattern = declaration.typedBindingPattern();
        Map<String, LineRange> ranges = new LinkedHashMap<>();
        declaration.metadata().flatMap(MetadataNode::documentationString)
                .ifPresent(docs -> ranges.put(Property.CONFIG_VAR_DOC_KEY, docs.lineRange()));
        ranges.put(Property.VARIABLE_KEY, typedBindingPattern.bindingPattern().lineRange());
        ranges.put(Property.TYPE_KEY, typedBindingPattern.typeDescriptor().lineRange());
        declaration.initializer().ifPresent(initializer ->
                ranges.put(Property.DEFAULT_VALUE_KEY, initializer.lineRange()));
        return ranges;
    }
}
