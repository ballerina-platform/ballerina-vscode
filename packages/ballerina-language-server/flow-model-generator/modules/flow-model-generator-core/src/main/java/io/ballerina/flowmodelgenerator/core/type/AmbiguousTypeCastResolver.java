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

package io.ballerina.flowmodelgenerator.core.type;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.syntax.tree.NonTerminalNode;
import io.ballerina.compiler.syntax.tree.SpecificFieldNode;
import io.ballerina.compiler.syntax.tree.SyntaxTree;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.projects.Document;
import io.ballerina.projects.ModuleDescriptor;
import io.ballerina.projects.Project;
import io.ballerina.tools.diagnostics.Diagnostic;
import io.ballerina.tools.diagnostics.DiagnosticSeverity;
import io.ballerina.tools.text.TextDocument;
import org.ballerinalang.langserver.common.utils.NameUtil;
import org.ballerinalang.util.diagnostic.DiagnosticErrorCode;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Resolves the explicit type casts required for an ambiguous record value and sets them on the type model that
 * {@link RecordValueGenerator} consumes.
 *
 * <p>A bare mapping literal can be ambiguous between two members of a union (e.g.
 * {@code jco:DestinationConfig | jco:AdvancedConfig}, or a nested {@code Person | Man} field). Rather than
 * guessing, this compile-probes the generated value in memory and adds an {@code explicitTypeCast} only on the
 * exact node the compiler reports an {@code AMBIGUOUS_TYPES} error for — the top-level value or the selected
 * member of a nested union. {@link RecordValueGenerator} then emits the cast syntax {@code <Type>{...}}.
 *
 * @since 1.7.0
 */
public final class AmbiguousTypeCastResolver {

    private AmbiguousTypeCastResolver() {
    }

    /**
     * Compile-probes the generated value and, if the compiler reports an ambiguous-type error, sets
     * {@code explicitTypeCast} on the exact JSON node the error points at — the top-level value (when
     * {@code typeConstraint} is itself the union) or the selected member of a nested union field.
     * {@code typeJson} is mutated in place (the caller regenerates the value afterwards).
     *
     * <p>Two probes run: the value is assigned to the declared {@code typeConstraint} (surfacing a top-level
     * union ambiguity) and to the concrete selected record (surfacing a nested ambiguity the union assignment
     * can mask — the compiler resolves a union whose other member cannot match a mapping without descending
     * into a nested union field). Each probe handles a single ambiguous site; multiple coexisting sibling
     * ambiguities are out of scope.
     *
     * <p>The probe statement {@code <type> <name> = <value>;} is appended in memory and reverted afterwards, so
     * the user's project is left untouched.
     *
     * @param project        the loaded project for the file
     * @param document       the document the value belongs to (also the instance reverted afterwards)
     * @param semanticModel  the current semantic model (used to derive a collision-free probe variable name)
     * @param typeConstraint the type the value is assigned to
     * @param codedata       the node codedata supplying the target type's {@code org}/{@code module} import
     * @param typeJson       the type model whose node receives the {@code explicitTypeCast} property
     */
    public static void applyAmbiguityCasts(Project project, Document document, SemanticModel semanticModel,
                                           String typeConstraint, Codedata codedata, JsonObject typeJson) {
        TextDocument textDocument = document.textDocument();
        String originalContent = String.join(System.lineSeparator(), textDocument.textLines());
        String separator = System.lineSeparator();
        try {
            Set<String> visibleNames = new HashSet<>();
            for (Symbol symbol : semanticModel.moduleSymbols()) {
                symbol.getName().ifPresent(visibleNames::add);
            }
            String importStmt = resolveImportStatement(document, codedata);

            // Probe 1 (only when a type constraint is given) assigns the value to the declared type constraint —
            // this surfaces a top-level union ambiguity. Probe 2 assigns it to the concrete type derived from the
            // type model + codedata — this surfaces a nested ambiguity (and is the only probe when there is no
            // type constraint, since without a union there is nothing to probe at the top level).
            List<String> probeTypes = new ArrayList<>();
            if (typeConstraint != null && !typeConstraint.isBlank()) {
                probeTypes.add(typeConstraint);
            }
            String concreteType = resolveCastType(typeConstraint, typeJson, codedata, document);
            if (!concreteType.isBlank() && !concreteType.equals(typeConstraint)) {
                probeTypes.add(concreteType);
            }
            if (probeTypes.isEmpty()) {
                return;
            }

            for (String probeType : probeTypes) {
                probeAndCast(project, document, importStmt, originalContent, separator, visibleNames,
                        probeType, typeConstraint, codedata, typeJson);
            }
        } finally {
            try {
                document.modify().withContent(originalContent).apply();
            } catch (Throwable ignored) {
                // best-effort revert
            }
        }
    }

    /**
     * Runs a single compile probe: assigns the generated value to {@code probeType} in memory, recompiles, and
     * casts the JSON node any ambiguous-type error on the appended value points at. {@code typeJson} is mutated
     * in place (later probes regenerate from the already-cast tree). The document content is not reverted here —
     * the caller reverts once after all probes.
     */
    private static void probeAndCast(Project project, Document document, String importStmt, String originalContent,
                                     String separator, Set<String> visibleNames, String probeType,
                                     String typeConstraint, Codedata codedata, JsonObject typeJson) {
        String varName = NameUtil.generateVariableName(probeType, visibleNames);
        // Everything before the value
        String lhs = importStmt + originalContent + separator + probeType + " " + varName + " = ";
        int valueStartOffset = lhs.length();

        String value = RecordValueGenerator.generate(typeJson);
        String newContent = lhs + value + ";" + separator;
        Document updated = document.modify().withContent(newContent).apply();
        SemanticModel compiled = project.currentPackage().getCompilation()
                .getSemanticModel(updated.module().moduleId());
        SyntaxTree syntaxTree = updated.syntaxTree();

        // Only an ambiguous-type error on the appended value matters
        compiled.diagnostics().stream()
                .filter(d -> d.diagnosticInfo().severity() == DiagnosticSeverity.ERROR)
                .filter(d -> DiagnosticErrorCode.AMBIGUOUS_TYPES.diagnosticId()
                        .equals(d.diagnosticInfo().code()))
                .filter(d -> d.location().textRange().startOffset() >= valueStartOffset)
                .findFirst()
                .ifPresent(d -> applyCastForDiagnostic(syntaxTree, d, typeJson, typeConstraint, codedata, document));
    }

    /**
     * Locates the ambiguous mapping for {@code diagnostic} and sets {@code explicitTypeCast} on the
     * corresponding JSON node: the top-level value when the mapping is the variable initializer, or the
     * selected member of the nested union the field path resolves to.
     */
    private static void applyCastForDiagnostic(SyntaxTree syntaxTree, Diagnostic diagnostic, JsonObject typeJson,
                                               String typeConstraint, Codedata codedata, Document document) {
        NonTerminalNode node = CommonUtils.getNode(syntaxTree, diagnostic.location().textRange());
        if (node == null) {
            return;
        }

        // Build the field path from the ambiguous expression up to the variable initializer.
        List<String> path = new ArrayList<>();
        NonTerminalNode cur = node.parent();
        while (cur != null) {
            if (cur instanceof SpecificFieldNode specificField) {
                path.addFirst(specificField.fieldName().toSourceCode().trim());
            }
            cur = cur.parent();
        }

        if (path.isEmpty()) {
            // The top-level value is ambiguous (typeConstraint is itself the union).
            String cast = resolveCastType(typeConstraint, typeJson, codedata, document);
            applyCast(typeJson, cast);
            return;
        }

        JsonObject target = navigateToNode(typeJson, path);
        if (target == null || !target.has("typeName") || !"union".equals(target.get("typeName").getAsString())) {
            return;
        }
        JsonObject member = selectedMember(target);
        if (member == null) {
            return;
        }
        applyCast(member, castFromTypeInfo(member, document));
    }

    /**
     * Navigates the type model along a field path, stepping through the selected member of any union node
     * encountered, and returns the node the last field name resolves to (or {@code null} if not found).
     */
    private static JsonObject navigateToNode(JsonObject root, List<String> path) {
        JsonObject node = root;
        for (String fieldName : path) {
            if (node.has("typeName") && "union".equals(node.get("typeName").getAsString())) {
                node = selectedMember(node);
                if (node == null) {
                    return null;
                }
            }
            JsonObject field = findField(node, fieldName);
            if (field == null) {
                return null;
            }
            node = field;
        }
        return node;
    }

    private static JsonObject findField(JsonObject recordNode, String fieldName) {
        if (!recordNode.has("fields") || !recordNode.get("fields").isJsonArray()) {
            return null;
        }
        for (JsonElement field : recordNode.getAsJsonArray("fields")) {
            JsonObject fieldObj = field.getAsJsonObject();
            if (fieldObj.has("name") && fieldName.equals(fieldObj.get("name").getAsString())) {
                return fieldObj;
            }
        }
        return null;
    }

    private static JsonObject selectedMember(JsonObject unionNode) {
        if (!unionNode.has("members") || !unionNode.get("members").isJsonArray()) {
            return null;
        }
        for (JsonElement member : unionNode.getAsJsonArray("members")) {
            JsonObject memberObj = member.getAsJsonObject();
            if (memberObj.has("selected") && memberObj.get("selected").getAsBoolean()) {
                return memberObj;
            }
        }
        return null;
    }

    /**
     * Sets {@code explicitTypeCast} on the node. Returns void if the cast is empty or already set to
     * the same value (so the caller can detect "nothing changed").
     */
    private static void applyCast(JsonObject node, String cast) {
        if (cast == null || cast.isEmpty()) {
            return;
        }
        if (node.has("explicitTypeCast") && cast.equals(node.get("explicitTypeCast").getAsString())) {
            return;
        }
        node.addProperty("explicitTypeCast", cast);
    }

    /**
     * Derives a cast type for a nested union member from its {@code typeInfo}: {@code <prefix>:<name>} where
     * the prefix is the last segment of the module name. The prefix is dropped only when the member lives in
     * the file's own module — a member from another module (e.g. {@code mongodb:GssApiCredential}) keeps its
     * prefix, since the file receiving the value is not in that module.
     */
    private static String castFromTypeInfo(JsonObject member, Document document) {
        String name = member.has("name") && !member.get("name").isJsonNull()
                ? member.get("name").getAsString() : null;
        if (member.has("typeInfo") && member.get("typeInfo").isJsonObject()) {
            JsonObject typeInfo = member.getAsJsonObject("typeInfo");
            String typeName = typeInfo.has("name") && !typeInfo.get("name").isJsonNull()
                    ? typeInfo.get("name").getAsString() : name;
            String moduleName = typeInfo.has("moduleName") && !typeInfo.get("moduleName").isJsonNull()
                    ? typeInfo.get("moduleName").getAsString() : null;
            String orgName = typeInfo.has("orgName") && !typeInfo.get("orgName").isJsonNull()
                    ? typeInfo.get("orgName").getAsString() : null;
            if (typeName != null && moduleName != null && !moduleName.isEmpty()) {
                if (isInOwnModule(document, orgName, moduleName)) {
                    return typeName;
                }
                return CommonUtils.getDefaultModulePrefix(moduleName) + ":" + typeName;
            }
            return typeName == null ? "" : typeName;
        }
        return name == null ? "" : name;
    }

    /**
     * Builds the {@code import org/module;} statement required for the probe to resolve the target type's
     * module, using the node codedata as the {@code getSourceCode} flow does ({@code SourceBuilder.acceptImport}).
     * Returns an empty string when the module info is unavailable, the type lives in the file's own package, the
     * module is a predefined lang lib, or the import already exists.
     *
     * @param document the document being probed
     * @param codedata the node codedata carrying {@code org}/{@code module}
     * @return the import statement (terminated with a line separator) or an empty string
     */
    private static String resolveImportStatement(Document document, Codedata codedata) {
        if (codedata == null) {
            return "";
        }
        String org = codedata.org();
        String module = codedata.module();
        if (org == null || org.isEmpty() || module == null || module.isEmpty()) {
            return "";
        }
        // Skip when the type lives in the file's own package or is a predefined lang lib
        if (isInOwnModule(document, org, module) || CommonUtils.isPredefinedLangLib(org, module)) {
            return "";
        }
        if (CommonUtils.importExists(document.syntaxTree().rootNode(), org, module)) {
            return "";
        }
        return "import " + CommonUtils.getImportStatement(org, module, module) + ";" + System.lineSeparator();
    }

    /**
     * Resolves the concrete type of the selected record — used both as a compile probe (the LHS the value is
     * assigned to) and as the top-level cast. When a {@code typeConstraint} is given, it prefers the union member
     * whose simple name matches, preserving the module prefix as written. Otherwise (or when no member matches) it
     * derives the prefix from {@code codedata}: bare when the record is in the file's own module, else
     * {@code <prefix>:<name>}. Falls back to the bare record name when no module info is available.
     *
     * @param typeConstraint the union type the value is assigned to (may be {@code null}/blank)
     * @param typeJson       the selected record type
     * @param codedata       the node codedata supplying the module prefix
     * @param document       the document being probed (to decide the file's own module)
     * @return the qualified type (e.g. {@code jco:DestinationConfig}) or bare record name
     */
    private static String resolveCastType(String typeConstraint, JsonObject typeJson, Codedata codedata,
                                          Document document) {
        String recordName = typeJson.has("name") ? typeJson.get("name").getAsString() : null;
        if (recordName == null || recordName.isEmpty()) {
            return recordName == null ? "" : recordName;
        }
        if (typeConstraint != null && !typeConstraint.isBlank()) {
            for (String member : typeConstraint.split("\\|")) {
                String trimmed = member.trim();
                String simpleName = trimmed.contains(":")
                        ? trimmed.substring(trimmed.lastIndexOf(':') + 1) : trimmed;
                if (simpleName.equals(recordName)) {
                    return trimmed;
                }
            }
        }
        if (codedata != null && codedata.module() != null && !codedata.module().isEmpty()) {
            return isInOwnModule(document, codedata.org(), codedata.module())
                    ? recordName : CommonUtils.getClassType(codedata.module(), recordName);
        }
        return recordName;
    }

    /**
     * Returns whether the given {@code org}/{@code moduleName} pair resolves to the document's own package
     * (including its submodules). A {@code null} {@code org} is treated as matching (the member carries no org
     * information).
     */
    private static boolean isInOwnModule(Document document, String org, String moduleName) {
        ModuleDescriptor ownDescriptor = document.module().descriptor();
        String ownOrg = ownDescriptor.org().value();
        String ownPackage = ownDescriptor.packageName().value();
        return (org == null || org.equals(ownOrg))
                && (moduleName.equals(ownPackage) || moduleName.startsWith(ownPackage + "."));
    }
}
