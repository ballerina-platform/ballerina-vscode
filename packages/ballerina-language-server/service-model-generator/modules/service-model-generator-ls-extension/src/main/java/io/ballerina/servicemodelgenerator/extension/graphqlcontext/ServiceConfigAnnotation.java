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

package io.ballerina.servicemodelgenerator.extension.graphqlcontext;

import io.ballerina.compiler.syntax.tree.AnnotationNode;
import io.ballerina.compiler.syntax.tree.ExpressionNode;
import io.ballerina.compiler.syntax.tree.MappingConstructorExpressionNode;
import io.ballerina.compiler.syntax.tree.MappingFieldNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.NodeFactory;
import io.ballerina.compiler.syntax.tree.NodeList;
import io.ballerina.compiler.syntax.tree.QualifiedNameReferenceNode;
import io.ballerina.compiler.syntax.tree.SeparatedNodeList;
import io.ballerina.compiler.syntax.tree.ServiceDeclarationNode;
import io.ballerina.compiler.syntax.tree.SpecificFieldNode;
import io.ballerina.compiler.syntax.tree.Token;
import io.ballerina.modelgenerator.commons.ImportPrefixReader;
import io.ballerina.servicemodelgenerator.extension.util.Utils;
import io.ballerina.tools.text.LinePosition;
import org.eclipse.lsp4j.Range;
import org.eclipse.lsp4j.TextEdit;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static io.ballerina.servicemodelgenerator.extension.util.Utils.toPosition;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.toRange;

/**
 * A service's config annotation, such as {@code @graphql:ServiceConfig}, and the edits that change one of its fields.
 *
 * <p>
 * Every edit touches only the field it names. The other fields, their comments and their layout stay exactly as
 * written, so a value someone typed by hand is never rewritten as a side effect of a change made in the designer.
 * The annotation is created with its first field and removed with its last.
 * </p>
 */
final class ServiceConfigAnnotation {

    private static final String INDENT = "    ";
    private static final String NEW_LINE = "\n";

    private final ServiceDeclarationNode serviceNode;
    private final ModulePartNode rootNode;
    private final String org;
    private final String module;
    private final String annotationName;
    private final AnnotationNode annotation;

    private ServiceConfigAnnotation(ServiceDeclarationNode serviceNode, ModulePartNode rootNode, String org,
                                    String module, String annotationName, AnnotationNode annotation) {
        this.serviceNode = serviceNode;
        this.rootNode = rootNode;
        this.org = org;
        this.module = module;
        this.annotationName = annotationName;
        this.annotation = annotation;
    }

    /**
     * Finds the {@code @<module>:<annotationName>} attachment on the service, resolving the source prefix through the
     * file's imports so an aliased import ({@code import ballerina/graphql as gql;}) is still recognised.
     */
    static ServiceConfigAnnotation of(ServiceDeclarationNode serviceNode, String org, String module,
                                      String annotationName) {
        ModulePartNode rootNode = serviceNode.syntaxTree().rootNode() instanceof ModulePartNode root ? root : null;
        AnnotationNode found = null;
        if (serviceNode.metadata().isPresent()) {
            for (AnnotationNode candidate : serviceNode.metadata().get().annotations()) {
                if (!(candidate.annotReference() instanceof QualifiedNameReferenceNode reference)
                        || !annotationName.equals(reference.identifier().text())) {
                    continue;
                }
                String prefix = reference.modulePrefix().text();
                String referencedModule = rootNode == null ? prefix
                        : ImportPrefixReader.moduleNameForPrefix(rootNode, prefix).orElse(prefix);
                if (module.equals(referencedModule)) {
                    found = candidate;
                    break;
                }
            }
        }
        return new ServiceConfigAnnotation(serviceNode, rootNode, org, module, annotationName, found);
    }

    /**
     * The field's value as written; empty when the field is absent. A shorthand field ({@code {contextInit}})
     * reads as its own name, which is the variable it refers to.
     */
    Optional<String> fieldSource(String field) {
        return findField(field).map(found -> found.valueExpr()
                .map(value -> value.toSourceCode().strip())
                .orElse(field));
    }

    /**
     * The value expression of the given field, empty when the field is absent or written in shorthand.
     */
    Optional<ExpressionNode> valueOf(String field) {
        return findField(field).flatMap(SpecificFieldNode::valueExpr);
    }

    /**
     * Sets the field to the given Ballerina expression, adding the field (and the annotation) when absent.
     */
    List<TextEdit> setField(String field, String value) {
        if (annotation == null) {
            return newAnnotation(field, value);
        }
        Optional<MappingConstructorExpressionNode> mapping = annotation.annotValue();
        String baseIndent = indentOf(annotation.lineRange().startLine());
        if (mapping.isEmpty()) {
            // `@graphql:ServiceConfig` written without a body.
            return List.of(new TextEdit(toRange(annotation.lineRange().endLine()),
                    " " + body(field, value, baseIndent)));
        }

        Optional<SpecificFieldNode> existing = findField(field);
        if (existing.isPresent()) {
            SpecificFieldNode specificField = existing.get();
            if (specificField.valueExpr().isPresent()) {
                return List.of(new TextEdit(toRange(specificField.valueExpr().get().lineRange()), value));
            }
            return List.of(new TextEdit(toRange(specificField.fieldName().lineRange().endLine()), ": " + value));
        }

        SeparatedNodeList<MappingFieldNode> fields = mapping.get().fields();
        if (fields.isEmpty()) {
            return List.of(new TextEdit(toRange(mapping.get().lineRange()), body(field, value, baseIndent)));
        }
        MappingFieldNode last = fields.get(fields.size() - 1);
        LinePosition lastStart = last.lineRange().startLine();
        boolean inline = lastStart.line() == mapping.get().openBrace().lineRange().startLine().line();
        String separator = inline ? ", " : "," + NEW_LINE + indentOf(lastStart);
        return List.of(new TextEdit(toRange(last.lineRange().endLine()), separator + field + ": " + value));
    }

    /**
     * Removes the field, and the whole annotation when it was the last one. Nothing changes when the field is absent.
     */
    List<TextEdit> removeField(String field) {
        if (annotation == null || annotation.annotValue().isEmpty()) {
            return List.of();
        }
        SeparatedNodeList<MappingFieldNode> fields = annotation.annotValue().get().fields();
        int index = -1;
        for (int i = 0; i < fields.size(); i++) {
            if (fields.get(i) instanceof SpecificFieldNode specificField && field.equals(fieldName(specificField))) {
                index = i;
                break;
            }
        }
        if (index < 0) {
            return List.of();
        }
        if (fields.size() == 1) {
            return removeAnnotation();
        }
        LinePosition start;
        LinePosition end;
        if (index < fields.size() - 1) {
            // From this field to the next one, taking the separator and the line break with it.
            start = fields.get(index).lineRange().startLine();
            end = fields.get(index + 1).lineRange().startLine();
        } else {
            // The last field: from the end of the previous one, taking the separator before it.
            start = fields.get(index - 1).lineRange().endLine();
            end = fields.get(index).lineRange().endLine();
        }
        return List.of(new TextEdit(new Range(toPosition(start), toPosition(end)), ""));
    }

    private List<TextEdit> removeAnnotation() {
        // Up to the start of whatever follows, so the next line keeps the annotation's indentation.
        NodeList<AnnotationNode> annotations = serviceNode.metadata().orElseThrow().annotations();
        LinePosition end = null;
        for (int i = 0; i < annotations.size(); i++) {
            if (annotations.get(i).equals(annotation)) {
                if (i + 1 < annotations.size()) {
                    end = annotations.get(i + 1).lineRange().startLine();
                }
                break;
            }
        }
        if (end == null) {
            end = firstServiceToken().lineRange().startLine();
        }
        return List.of(new TextEdit(new Range(toPosition(annotation.lineRange().startLine()), toPosition(end)), ""));
    }

    private List<TextEdit> newAnnotation(String field, String value) {
        List<TextEdit> edits = new ArrayList<>();
        String prefix = ImportPrefixReader.resolve(rootNode, org, module, null);
        if (rootNode != null && ImportPrefixReader.existingImportPrefix(rootNode, org, module).isEmpty()) {
            // The listener can be declared in another file, so the service's own file need not import the module.
            edits.add(new TextEdit(toRange(rootNode.lineRange().startLine()), importStatement(org, module, prefix)));
        }
        LinePosition insertAt = firstServiceToken().lineRange().startLine();
        String baseIndent = indentOf(insertAt);
        String text = "@" + prefix + ":" + annotationName + " " + body(field, value, baseIndent) + NEW_LINE
                + baseIndent;
        edits.add(new TextEdit(toRange(insertAt), text));
        return edits;
    }

    private Token firstServiceToken() {
        return serviceNode.qualifiers().isEmpty() ? serviceNode.serviceKeyword() : serviceNode.qualifiers().get(0);
    }

    private SeparatedNodeList<MappingFieldNode> fields() {
        if (annotation == null || annotation.annotValue().isEmpty()) {
            return NodeFactory.createSeparatedNodeList();
        }
        return annotation.annotValue().get().fields();
    }

    private Optional<SpecificFieldNode> findField(String field) {
        for (MappingFieldNode candidate : fields()) {
            if (candidate instanceof SpecificFieldNode specificField && field.equals(fieldName(specificField))) {
                return Optional.of(specificField);
            }
        }
        return Optional.empty();
    }

    /**
     * The import statement for the module under the prefix, on a line of its own.
     */
    static String importStatement(String org, String module, String prefix) {
        return Utils.getImportStmt(org, module, prefix).strip() + NEW_LINE;
    }

    private static String fieldName(SpecificFieldNode field) {
        String name = field.fieldName().toSourceCode().strip();
        if (name.startsWith("'")) {
            return name.substring(1);
        }
        if (name.length() >= 2 && name.startsWith("\"") && name.endsWith("\"")) {
            return name.substring(1, name.length() - 1);
        }
        return name;
    }

    private static String body(String field, String value, String baseIndent) {
        return "{" + NEW_LINE + baseIndent + INDENT + field + ": " + value + NEW_LINE + baseIndent + "}";
    }

    private static String indentOf(LinePosition position) {
        return " ".repeat(Math.max(0, position.offset()));
    }
}
