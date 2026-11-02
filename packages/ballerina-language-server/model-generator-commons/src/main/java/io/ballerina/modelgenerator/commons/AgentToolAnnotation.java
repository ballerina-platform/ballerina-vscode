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

package io.ballerina.modelgenerator.commons;

import com.google.gson.Gson;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import io.ballerina.compiler.syntax.tree.AnnotationNode;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.MappingConstructorExpressionNode;
import io.ballerina.compiler.syntax.tree.MappingFieldNode;
import io.ballerina.compiler.syntax.tree.Minutiae;
import io.ballerina.compiler.syntax.tree.MinutiaeList;
import io.ballerina.compiler.syntax.tree.ModuleMemberDeclarationNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NodeParser;
import io.ballerina.compiler.syntax.tree.NonTerminalNode;
import io.ballerina.compiler.syntax.tree.QualifiedNameReferenceNode;
import io.ballerina.compiler.syntax.tree.SeparatedNodeList;
import io.ballerina.compiler.syntax.tree.SpecificFieldNode;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.compiler.syntax.tree.Token;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Writes the {@code auth} and {@code requiresApproval} fields of an {@code @ai:AgentTool} annotation from the agent
 * tool form's data. Creating a tool and editing one render these fields the same way. An edit replaces the fields
 * in place and keeps the annotation's other fields and its comments.
 *
 * @since 2.0.0
 */
public final class AgentToolAnnotation {

    public static final String AUTH = "auth";
    public static final String REQUIRES_APPROVAL = "requiresApproval";
    private static final String NAME = "AgentTool";
    private static final String REFERENCE = "@ai:" + NAME;
    private static final String SCOPES = "scopes";
    private static final String INDENT = "    ";
    private static final String NEW_LINE = System.lineSeparator();
    // Annotation text from a form has no function after it; this gives the parser one to attach it to.
    private static final String PARSE_ANCHOR = "function __toolProbe() {}";
    private static final Gson GSON = new Gson();

    // One line group inside the annotation's braces: comments, then a field's source (null for comments only).
    private record Member(List<String> comments, String code) {
    }

    private AgentToolAnnotation() {
    }

    /**
     * Returns the annotation for a new tool, or a bare {@code @ai:AgentTool} when no field has a value.
     *
     * @param auth             the auth config as a JSON object of field sources
     * @param requiresApproval {@code true}, or the approval function name; empty or null for no gate
     * @return the annotation source
     */
    public static String create(Object auth, Object requiresApproval) {
        List<Member> members = new ArrayList<>();
        fields(auth, requiresApproval).values()
                .forEach(field -> members.add(new Member(List.of(), indent(field, INDENT))));
        return withReference(REFERENCE, body("", members));
    }

    /**
     * Whether the annotation is {@code @ai:AgentTool}.
     *
     * @param annotation the annotation
     * @return true for an agent tool annotation
     */
    public static boolean isAgentTool(AnnotationNode annotation) {
        return annotation.annotReference() instanceof QualifiedNameReferenceNode reference
                && NAME.equals(reference.identifier().text().trim());
    }

    /**
     * Returns annotation source, such as a function form's annotations property, with the {@code auth} and
     * {@code requiresApproval} fields of its {@code @ai:AgentTool} annotation set. Other annotations are kept.
     *
     * @param annotations      the annotations attached to the tool, one after another
     * @param auth             the auth config as a JSON object of field sources
     * @param requiresApproval {@code true}, or the approval function name; empty or null for no gate
     * @return the updated annotations
     */
    public static String update(String annotations, Object auth, Object requiresApproval) {
        ModuleMemberDeclarationNode member =
                NodeParser.parseModuleMemberDeclaration(annotations + NEW_LINE + PARSE_ANCHOR);
        if (!(member instanceof FunctionDefinitionNode function) || function.metadata().isEmpty()) {
            return annotations;
        }
        List<String> updated = new ArrayList<>();
        for (AnnotationNode annotation : function.metadata().get().annotations()) {
            String source = annotation.toSourceCode().strip();
            updated.add(isAgentTool(annotation)
                    ? source.replace(code(annotation), update(annotation, auth, requiresApproval))
                    : source);
        }
        return String.join(NEW_LINE, updated);
    }

    /**
     * Returns the annotation's value with its {@code auth} and {@code requiresApproval} fields set: a field with a
     * value replaces the existing one in place or is added at the end, and a field without one is removed. Comments
     * of a replaced or removed field stay on the lines above it.
     *
     * @param annotation       the {@code @ai:AgentTool} annotation
     * @param auth             the auth config as a JSON object of field sources
     * @param requiresApproval {@code true}, or the approval function name; empty or null for no gate
     * @return the mapping constructor, or empty when nothing is left in it
     */
    public static String value(AnnotationNode annotation, Object auth, Object requiresApproval) {
        String indent = " ".repeat(annotation.lineRange().startLine().offset());
        Map<String, String> fields = fields(auth, requiresApproval);
        List<Member> members = new ArrayList<>();
        List<String> closingComments = List.of();
        if (annotation.annotValue().isPresent()) {
            MappingConstructorExpressionNode mapping = annotation.annotValue().get();
            members.add(new Member(comments(mapping.openBrace()), null));
            SeparatedNodeList<MappingFieldNode> existing = mapping.fields();
            for (int i = 0; i < existing.size(); i++) {
                List<String> separatorComments = i < existing.separatorSize()
                        ? comments(existing.getSeparator(i)) : List.of();
                members.add(member(existing.get(i), separatorComments, fields, indent + INDENT));
            }
            closingComments = comments(mapping.closeBrace().leadingMinutiae());
        }
        fields.values().forEach(field -> members.add(new Member(List.of(), indent(field, indent + INDENT))));
        members.add(new Member(closingComments, null));
        return body(indent, members);
    }

    private static String update(AnnotationNode annotation, Object auth, Object requiresApproval) {
        return withReference("@" + code(annotation.annotReference()), value(annotation, auth, requiresApproval));
    }

    private static String withReference(String reference, String body) {
        return body.isEmpty() ? reference : reference + " " + body;
    }

    // A form-managed field takes its rendered value (removed from `fields`, so it isn't added again); others stay.
    private static Member member(MappingFieldNode field, List<String> separatorComments, Map<String, String> fields,
                                 String indent) {
        String name = field instanceof SpecificFieldNode specific ? code(specific.fieldName()) : "";
        List<String> comments = new ArrayList<>();
        if (!AUTH.equals(name) && !REQUIRES_APPROVAL.equals(name)) {
            comments.addAll(comments(field.leadingMinutiae()));
            comments.addAll(comments(field.trailingMinutiae()));
            comments.addAll(separatorComments);
            return new Member(comments, code(field));
        }
        comments.addAll(comments(field));
        comments.addAll(separatorComments);
        String rendered = fields.remove(name);
        return new Member(comments, rendered == null ? null : indent(rendered, indent));
    }

    private static Map<String, String> fields(Object auth, Object requiresApproval) {
        Map<String, String> fields = new LinkedHashMap<>();
        List<String> authEntries = authEntries(auth);
        if (!authEntries.isEmpty()) {
            fields.put(AUTH, AUTH + ": {" + NEW_LINE + String.join("," + NEW_LINE, authEntries) + NEW_LINE + "}");
        }
        String approval = requiresApproval == null ? "" : requiresApproval.toString().trim();
        if (!approval.isEmpty()) {
            fields.put(REQUIRES_APPROVAL, REQUIRES_APPROVAL + ": " + approval);
        }
        return fields;
    }

    private static List<String> authEntries(Object auth) {
        List<String> entries = new ArrayList<>();
        JsonObject config = auth == null ? null : GSON.fromJson(auth.toString(), JsonObject.class);
        if (config == null) {
            return entries;
        }
        for (Map.Entry<String, JsonElement> entry : config.entrySet()) {
            String value = authValue(entry.getKey(), entry.getValue());
            if (!value.isEmpty()) {
                entries.add(INDENT + entry.getKey() + ": " + value);
            }
        }
        return entries;
    }

    // The field's source, or empty when the form left it unset.
    private static String authValue(String key, JsonElement element) {
        String value = element.isJsonArray() ? element.toString() : element.getAsString();
        if (isUnset(value)) {
            return "";
        }
        boolean isArray = value.startsWith("[") && value.endsWith("]");
        return SCOPES.equals(key) && !isArray ? scopesArray(value) : value;
    }

    private static boolean isUnset(String value) {
        return value.isEmpty() || value.equals("()") || value.trim().matches("\\{\\s*}");
    }

    // Comma-separated scope expressions as an array, or empty when there are none.
    private static String scopesArray(String scopes) {
        List<String> items = new ArrayList<>();
        for (String part : scopes.split(",")) {
            if (!part.isBlank()) {
                items.add(part.trim());
            }
        }
        return items.isEmpty() ? "" : "[" + String.join(", ", items) + "]";
    }

    private static String body(String indent, List<Member> members) {
        List<Member> present = members.stream()
                .filter(member -> member.code() != null || !member.comments().isEmpty())
                .toList();
        if (present.isEmpty()) {
            return "";
        }
        int lastField = -1;
        for (int i = 0; i < present.size(); i++) {
            lastField = present.get(i).code() != null ? i : lastField;
        }
        if (lastField < 0) {
            // The ai compiler plugin rejects a mapping that holds only comments, so they follow an empty one.
            List<String> comments = present.stream().flatMap(member -> member.comments().stream()).toList();
            return "{} " + String.join(NEW_LINE + indent, comments);
        }
        String inner = indent + INDENT;
        StringBuilder source = new StringBuilder("{");
        for (int i = 0; i < present.size(); i++) {
            Member member = present.get(i);
            member.comments().forEach(comment -> source.append(NEW_LINE).append(inner).append(comment));
            if (member.code() != null) {
                source.append(NEW_LINE).append(inner).append(member.code()).append(i < lastField ? "," : "");
            }
        }
        return source.append(NEW_LINE).append(indent).append('}').toString();
    }

    private static String indent(String source, String indent) {
        return source.replace(NEW_LINE, NEW_LINE + indent);
    }

    // The node's source without the whitespace and comments before and after it.
    private static String code(Node node) {
        String source = node.toSourceCode();
        return source.substring(text(node.leadingMinutiae()).length(),
                source.length() - text(node.trailingMinutiae()).length());
    }

    private static String text(MinutiaeList minutiae) {
        StringBuilder text = new StringBuilder();
        minutiae.forEach(item -> text.append(item.text()));
        return text.toString();
    }

    private static List<String> comments(MinutiaeList minutiae) {
        List<String> comments = new ArrayList<>();
        for (Minutiae item : minutiae) {
            if (item.kind() == SyntaxKind.COMMENT_MINUTIAE) {
                comments.add(item.text().strip());
            }
        }
        return comments;
    }

    // Every comment in the node, including those between its tokens.
    private static List<String> comments(Node node) {
        List<String> comments = new ArrayList<>();
        if (node instanceof Token token) {
            comments.addAll(comments(token.leadingMinutiae()));
            comments.addAll(comments(token.trailingMinutiae()));
        } else if (node instanceof NonTerminalNode parent) {
            parent.children().forEach(child -> comments.addAll(comments(child)));
        }
        return comments;
    }
}
