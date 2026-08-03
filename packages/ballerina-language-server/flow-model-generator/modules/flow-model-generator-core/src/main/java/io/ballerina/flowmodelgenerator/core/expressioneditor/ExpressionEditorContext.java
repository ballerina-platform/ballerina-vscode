/*
 *  Copyright (c) 2024, WSO2 LLC. (http://www.wso2.com)
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

package io.ballerina.flowmodelgenerator.core.expressioneditor;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.reflect.TypeToken;
import io.ballerina.compiler.syntax.tree.ImportDeclarationNode;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.PropertyType;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.projects.Document;
import io.ballerina.projects.Module;
import io.ballerina.projects.ModuleDescriptor;
import io.ballerina.tools.text.LinePosition;
import io.ballerina.tools.text.LineRange;
import io.ballerina.tools.text.TextDocument;
import io.ballerina.tools.text.TextDocumentChange;
import io.ballerina.tools.text.TextEdit;
import io.ballerina.tools.text.TextRange;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManagerProxy;
import org.eclipse.lsp4j.Position;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Represents the context for the expression editor.
 *
 * @since 1.0.0
 */
public class ExpressionEditorContext {

    private final Info info;
    private final DocumentContext documentContext;
    private final Property property;

    // State variables
    private int expressionOffset;
    private LineRange statementLineRange;
    private LinePosition startLine;
    private int numberOfLines;

    public ExpressionEditorContext(WorkspaceManagerProxy workspaceManagerProxy, String fileUri, Info info,
                                   Path filePath) {
        this.info = info;
        this.numberOfLines = info.expression().split(System.lineSeparator()).length - 1;
        this.documentContext = new DocumentContext(workspaceManagerProxy, fileUri, filePath);
        this.property = new Property(info.property(), info.codedata());
    }

    public ExpressionEditorContext(WorkspaceManagerProxy workspaceManagerProxy, String fileUri, Path filePath,
                                   Document document) {
        this.info = null;
        this.documentContext = new DocumentContext(workspaceManagerProxy, fileUri, filePath, document);
        this.property = new Property(null, null);
    }

    public boolean isNodeKind(List<NodeKind> nodeKinds) {
        NodeKind nodeKind = property.nodeKind();
        return nodeKind != null && nodeKinds.contains(nodeKind);
    }

    public LinePosition getStartLine() {
        List<ImportDeclarationNode> imports = documentContext.imports();
        if (imports.isEmpty()) {
            return info.startLine();
        }

        // Obtain the line position of the latest import statement
        LinePosition importEndLine = imports.getLast().lineRange().endLine();

        if (CommonUtils.isLinePositionAfter(info.startLine(), importEndLine)) {
            return info.startLine();
        }
        return importEndLine;
    }

    public Info info() {
        return info;
    }

    public LinePosition startLine() {
        if (startLine == null) {
            startLine = CommonUtils.getPosition(info.startLine(), documentContext.document());
        }
        return startLine;
    }

    // TODO: Check how we can use SourceBuilder in place of this method
    private Optional<TextEdit> getImport() {
        String org = property.org();
        String module = property.module();

        if (org == null || module == null || CommonUtils.isPredefinedLangLib(org, module)) {
            return Optional.empty();
        }
        return getImport(CommonUtils.getImportStatement(org, module, module));
    }

    public Optional<TextEdit> getImport(String importStatement) {
        // Check if the import statement represents the current module
        documentContext.project();
        Optional<Module> currentModule = documentContext.module();
        if (currentModule.isPresent()) {
            ModuleDescriptor descriptor = currentModule.get().descriptor();
            if (CommonUtils.getImportStatement(descriptor.org().toString(), descriptor.packageName().value(),
                    descriptor.name().toString()).equals(importStatement)) {
                return Optional.empty();
            }
        }

        // Check if the import statement already exists
        boolean importExists = documentContext.imports().stream().anyMatch(importDeclarationNode -> {
            String importText = importDeclarationNode.toSourceCode().trim();
            return importText.startsWith("import " + importStatement) && importText.endsWith(";");
        });

        // Generate the import statement if not exists
        if (!importExists) {
            String stmt = new SourceBuilder.TokenBuilder(null)
                    .keyword(SyntaxKind.IMPORT_KEYWORD)
                    .name(importStatement)
                    .endOfStatement()
                    .build(SourceBuilder.SourceKind.IMPORT);
            TextEdit textEdit = TextEdit.from(TextRange.from(0, 0), stmt + System.lineSeparator());
            return Optional.of(textEdit);
        }
        return Optional.empty();
    }

    /**
     * Generates a Ballerina statement based on the availability of the type, and applies it to the document. Based on
     * the availability of the type, the statement will be in the format: `<type>? _ = <expr>;`.
     *
     * @return the line range of the generated statement.
     */
    public LineRange generateStatement(String stmtStart, String stmtEnd) {
        String prefix = stmtStart;
        List<TextEdit> textEdits = new ArrayList<>();
        int lineOffset = 0;

        if (property != null) {
            // Append the type if exists
            String ballerinaType = property.propertyType().ballerinaType();
            if (ballerinaType != null) {
                prefix = String.format("%s __reserved__ = ", ballerinaType);
            }

            // Add the import statements of the dependent types
            Map<String, String> imports = property.importStatements();
            if (imports != null && !imports.isEmpty()) {
                for (String importStmt : imports.values()) {
                    Optional<TextEdit> textEdit = getImport(importStmt.split(":")[0]);
                    if (textEdit.isPresent()) {
                        textEdits.add(textEdit.get());
                        lineOffset++;
                    }
                }
            }
        }

        // Add the import statement for the node type
        if (isNodeKind(List.of(NodeKind.NEW_CONNECTION, NodeKind.FUNCTION_CALL, NodeKind.REMOTE_ACTION_CALL,
                NodeKind.RESOURCE_ACTION_CALL))) {
            Optional<TextEdit> textEdit = getImport();
            if (textEdit.isPresent()) {
                textEdits.add(textEdit.get());
                lineOffset++;
            }
        }

        // Get the text position of the start line
        TextDocument textDocument = documentContext.document().textDocument();
        LinePosition cursorStartLine = startLine();
        int textPosition = textDocument.textPositionFrom(cursorStartLine);

        // Generate the statement and apply the text edits
        String statement = String.format("%s%s%s", prefix, info.expression(), stmtEnd);
        this.expressionOffset = prefix.length();
        textEdits.add(TextEdit.from(TextRange.from(textPosition, 0), statement));
        applyTextEdits(textEdits);

        // Return the line range of the generated statement
        LinePosition startLine = LinePosition.from(cursorStartLine.line() + lineOffset, cursorStartLine.offset());
        LinePosition endLineRange =
                LinePosition.from(startLine.line() + numberOfLines, startLine.offset() + statement.length());
        this.statementLineRange = LineRange.from(getFileName(documentContext.filePath()), startLine, endLineRange);
        return statementLineRange;
    }

    /**
     * Generates a Ballerina function definition with the provided signature, containing the statement generated by
     * {@link #generateStatement(String, String)} as the function body.
     *
     * <p>
     * TODO: This is a temporary workaround to provide completions for the data mapper, and should be removed once
     * the API extension is complete.
     *
     * @param functionSignature the function signature (e.g., "(Person person, Admission admission) returns Employee")
     * @return the line range of the generated function definition
     */
    public LineRange generateFunctionDefinition(String functionSignature) {
        // Get the text position of the start line
        TextDocument textDocument = documentContext.document().textDocument();
        LinePosition cursorStartLine = startLine();
        int textPosition = textDocument.textPositionFrom(cursorStartLine);

        // Build function header with opening brace and indentation
        String functionHeader = String.format("function %s {%n    ", functionSignature);

        // Apply the function header
        List<TextEdit> textEdits = new ArrayList<>();
        textEdits.add(TextEdit.from(TextRange.from(textPosition, 0), functionHeader));
        applyTextEdits(textEdits);

        // Calculate the number of lines added by the function header
        int functionHeaderLines = functionHeader.split(System.lineSeparator()).length - 1;

        // Update the start line to account for the function header
        // Store original start line for later calculation
        this.startLine = LinePosition.from(
                cursorStartLine.line() + functionHeaderLines,
                4  // Indentation of 4 spaces
        );

        // Generate the statement inside the function body
        return generateStatement("any|error __reserved__ = ", ";%s".formatted(System.lineSeparator()));
    }

    public LineRange getExpressionLineRange() {
        LinePosition startLine = info().startLine();
        LinePosition endLine =
                LinePosition.from(startLine.line() + numberOfLines, startLine.offset() + info().expression().length());
        return LineRange.from(getFileName(documentContext.filePath()), startLine, endLine);
    }

    private String getFileName(Path filePath) {
        Path fileName = filePath.getFileName();
        return fileName == null ? filePath.toString() : fileName.toString();
    }

    /**
     * Gets the cursor position within the generated statement.
     *
     * @return the cursor position as a Position object
     */
    public Position getCursorPosition() {
        if (statementLineRange == null || info == null) {
            throw new IllegalStateException("Statement line range not initialized. Call generateStatement() first.");
        }

        int lineOffset = info.lineOffset();
        // Add the offset of the type binding pattern if this is the first line
        int offsetChange = lineOffset > 0 ? 0 : expressionOffset + statementLineRange.startLine().offset();
        return new Position(statementLineRange.startLine().line() + lineOffset,
                info.offset() + offsetChange);
    }

    /**
     * Applies a list of text edits to the current document and updates the content.
     *
     * @param textEdits the list of text edits to be applied
     */
    public void applyTextEdits(List<TextEdit> textEdits) {
        TextDocument newTextDocument = documentContext.document().textDocument()
                .apply(TextDocumentChange.from(textEdits.toArray(new TextEdit[0])));
        applyContent(newTextDocument);
    }

    /**
     * Applies the content of the given TextDocument to the current document.
     *
     * @param textDocument The TextDocument containing the new content
     */
    public void applyContent(TextDocument textDocument) {
        documentContext.document().modify()
                .withContent(String.join(System.lineSeparator(), textDocument.textLines()))
                .apply();
        documentContext.clear();
    }

    public String fileUri() {
        return documentContext.fileUri();
    }

    public TextDocument textDocument() {
        return documentContext.document().textDocument();
    }

    public Path filePath() {
        return documentContext.filePath();
    }

    public WorkspaceManager workspaceManager() {
        return documentContext.workspaceManager();
    }

    public DocumentContext documentContext() {
        return documentContext;
    }

    public Property getProperty() {
        return property;
    }

    /**
     * Represents a property with associated code data in the expression editor context.
     *
     * <p>
     * This is a temporary abstraction of the {@link io.ballerina.flowmodelgenerator.core.model.Property} and
     * {@link io.ballerina.flowmodelgenerator.core.model.Codedata} until the source code is properly refactored to use
     * these structures. The class provides the minimum public methods required to build the context and follows the CoR
     * pattern to support fallback mechanisms for property derivation.
     * </p>
     * <p>
     * The property encapsulates various attributes such as value, value type, type constraints, import statements,
     * organization, module, and node kind. These values are lazily initialized when first accessed through the getter
     * methods.
     * </p>
     *
     * @since 1.0.0
     */
    public static class Property {

        private final JsonObject property;
        private final JsonObject codedata;
        private boolean initialized;

        // Property values
        private String value;
        private PropertyType propertyType;
        private Map<String, String> imports;

        // Codedata values
        private String org;
        private String module;
        private NodeKind nodeKind;

        private static final String VALUE_KEY = "value";
        private static final String IMPORTS_KEY = "imports";
        private static final String TYPES_KEY = "types";
        private static final String ORG_KEY = "org";
        private static final String MODULE_KEY = "module";
        private static final String NODE_KEY = "node";
        private static final String PROPERTY_CODEDATA_KEY = "codedata";
        private static final String LINE_RANGE_KEY = "lineRange";

        public Property(JsonObject property, JsonObject codedata) {
            this.property = property;
            this.codedata = codedata;
            this.initialized = false;
        }

        private void initialize() {
            if (initialized) {
                return;
            }
            if (property == null) {
                value = "";
            } else {
                value = property.has(VALUE_KEY) ? property.get(VALUE_KEY).getAsString() : "";

                // Determine the property type
                List<PropertyType> types = null;
                if (property.has(TYPES_KEY) && property.get(TYPES_KEY).isJsonArray()) {
                    types = new Gson().fromJson(property.get(TYPES_KEY),
                            new TypeToken<List<PropertyType>>() { }.getType());
                }

                // The type array cannot be null or empty
                if (types == null || types.isEmpty()) {
                    throw new IllegalArgumentException("The 'types' should be a non-empty array");
                }

                // Select the property type based on the selection flag or default to the first type
                if (types.size() == 1) {
                    propertyType = types.getFirst();
                } else {
                    propertyType = types.stream()
                            .filter(PropertyType::selected)
                            .findFirst()
                            .orElse(types.getFirst());
                }

                if (property.has(IMPORTS_KEY) && property.get(IMPORTS_KEY).isJsonObject()) {
                    JsonObject imports = property.getAsJsonObject(IMPORTS_KEY);
                    this.imports = new java.util.HashMap<>();
                    for (String key : imports.keySet()) {
                        if (imports.get(key).isJsonPrimitive()) {
                            this.imports.put(key, imports.get(key).getAsString());
                        }
                    }
                } else {
                    imports = null;
                }
            }

            if (codedata == null) {
                org = "";
                module = "";
                nodeKind = null;
            } else {
                org = codedata.has(ORG_KEY) ? codedata.get(ORG_KEY).getAsString() : "";
                module = codedata.has(MODULE_KEY) ? codedata.get(MODULE_KEY).getAsString() : "";
                nodeKind = codedata.has(NODE_KEY) ? NodeKind.valueOf(codedata.get(NODE_KEY).getAsString()) : null;
            }
            initialized = true;
        }

        public String value() {
            initialize();
            return value;
        }

        public PropertyType propertyType() {
            initialize();
            return propertyType;
        }

        public Map<String, String> importStatements() {
            initialize();
            return imports;
        }

        public String org() {
            initialize();
            return org;
        }

        public String module() {
            initialize();
            return module;
        }

        public NodeKind nodeKind() {
            initialize();
            return nodeKind;
        }

        /**
         * Returns {@code true} when the property carries a codedata line range, i.e., it is bound
         * to an existing declaration in the source (edit/rename flow) rather than a new-node
         * template whose declaration has not been written yet.
         *
         * @return whether the property is backed by an existing source declaration
         */
        public boolean hasExistingDeclaration() {
            return property != null
                    && property.has(PROPERTY_CODEDATA_KEY)
                    && property.get(PROPERTY_CODEDATA_KEY).isJsonObject()
                    && property.getAsJsonObject(PROPERTY_CODEDATA_KEY).has(LINE_RANGE_KEY);
        }
    }

    /**
     * Represents the json format of the expression editor context.
     *
     * @param expression The modified expression
     * @param startLine  The start line of the node
     * @param offset     The offset of cursor compared to the start of the expression
     * @param lineOffset The line offset of the cursor compared to the start of the expression
     * @param codedata   The codedata of the expression
     * @param property   The property of the expression
     */
    public record Info(String expression, LinePosition startLine, int offset, int lineOffset, JsonObject codedata,
                       JsonObject property) {
    }
}
