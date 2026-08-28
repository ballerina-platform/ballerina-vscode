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

package io.ballerina.flowmodelgenerator.core.copilot.util;

import io.ballerina.compiler.api.symbols.Annotatable;
import io.ballerina.compiler.api.symbols.AnnotationAttachmentSymbol;
import io.ballerina.compiler.api.symbols.AnnotationSymbol;
import io.ballerina.compiler.api.symbols.ModuleSymbol;
import io.ballerina.compiler.api.values.ConstantValue;
import io.ballerina.compiler.syntax.tree.AnnotationNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NonTerminalNode;
import io.ballerina.flowmodelgenerator.core.copilot.model.AnnotationAttachment;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.projects.Document;
import io.ballerina.projects.Package;
import io.ballerina.tools.diagnostics.Location;
import io.ballerina.tools.text.TextRange;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.StringJoiner;
import java.util.regex.Pattern;

/**
 * Extracts concrete annotation attachments (with their supplied values) from any
 * {@link Annotatable} compiler symbol (functions, type definitions, record fields,
 * parameters, classes, constants, etc.) for delivery to Copilot.
 *
 * <p>Compiler-internal {@code ballerina/lang.annotations} annotations (e.g. {@code @deprecated},
 * {@code @strand}, {@code @typeParam}) are skipped as noise &mdash; {@code @deprecated} is already
 * surfaced separately via the {@code isDeprecated} flags. User-facing annotations from that module,
 * notably {@code @display}, are retained.</p>
 *
 * @since 1.7.0
 */
public final class AnnotationAttachmentExtractor {

    private static final Pattern COLLAPSE_WHITESPACE = Pattern.compile("\\s+");
    private static final String BALLERINA_ORG = "ballerina";
    private static final String LANG_MODULE_PREFIX = "lang.";
    // Compiler-internal annotations from ballerina/lang.* that are noise for code generation.
    // Note: {@code display} is intentionally NOT here - it is a meaningful design-time annotation.
    private static final Set<String> INTERNAL_LANG_ANNOTATIONS = Set.of(
            "deprecated", "strand", "typeParam", "builtinSubtype", "isolatedParam",
            "tainted", "untainted", "DefaultableArgs", "IntrospectionDocConfig");

    private AnnotationAttachmentExtractor() {
        // Prevent instantiation
    }

    /**
     * Extracts the annotation attachments present on the given symbol.
     *
     * @param annotatable    the annotatable symbol (may be {@code null})
     * @param currentOrg     the organization of the library being processed
     * @param currentPackage the package name of the library being processed
     * @param pkg            the resolved package, used to recover a value the Semantic Model does
     *                       not model as a constant (may be {@code null})
     * @return the list of attachments (never {@code null}; empty when none apply)
     */
    public static List<AnnotationAttachment> extract(Annotatable annotatable, String currentOrg,
                                                     String currentPackage, Package pkg) {
        List<AnnotationAttachment> attachments = new ArrayList<>();
        if (annotatable == null) {
            return attachments;
        }

        for (AnnotationAttachmentSymbol attachmentSymbol : annotatable.annotAttachments()) {
            AnnotationSymbol annotationSymbol = attachmentSymbol.typeDescriptor();
            Optional<String> optName = annotationSymbol.getName();
            if (optName.isEmpty()) {
                continue;
            }
            if (isInternalAnnotation(annotationSymbol, optName.get())) {
                continue;
            }

            AnnotationAttachment attachment = new AnnotationAttachment();
            attachment.setName(optName.get());
            attachment.setModule(resolveModule(annotationSymbol, currentOrg, currentPackage));
            // AnnotationAttachmentSymbol#attachmentValue() is implemented as Optional.of(field) with
            // no null guard, so it throws whenever no ConstantValue was materialised;
            // isConstAnnotation() is the only safe way to know one is present.
            if (attachmentSymbol.isConstAnnotation()) {
                attachmentSymbol.attachmentValue()
                        .map(ConstantValue::value)
                        .map(AnnotationAttachmentExtractor::renderValue)
                        .ifPresent(attachment::setValue);
            } else {
                // The compiler materialises a ConstantValue only when the attachment is written as
                // literals. `@protobuf:Descriptor {value: REFLECTION_DESC}` references a constant and
                // `@constraint:String {pattern: {value: urlRegExpr}}` a variable, so neither has one --
                // yet both carry a value that is mandatory for the annotation to compile. It survives
                // only as source text, so it is read back from the syntax tree.
                declaredValue(attachmentSymbol, pkg).ifPresent(attachment::setValue);
            }
            attachments.add(attachment);
        }
        return attachments;
    }

    /**
     * Recovers an attachment's value from the package's syntax tree, for the attachments the
     * Semantic Model reports no constant for.
     *
     * <p>The attachment symbol's location spans the whole annotation — {@code @protobuf:Descriptor
     * {value: REFLECTION_DESC}} — so the node at that range is the {@code AnnotationNode} and its
     * {@code annotValue()} is exactly the mapping constructor. Whitespace is collapsed because a
     * value may span many source lines and the prompt renders one annotation per line.
     *
     * <p>Any failure yields an empty result: a missing value costs the annotation its argument,
     * never the library.
     */
    private static Optional<String> declaredValue(AnnotationAttachmentSymbol attachmentSymbol, Package pkg) {
        if (pkg == null) {
            return Optional.empty();
        }
        try {
            Optional<Location> location = attachmentSymbol.getLocation();
            if (location.isEmpty()) {
                return Optional.empty();
            }
            Document document = CommonUtils.findDocument(pkg, location.get().lineRange().fileName());
            if (document == null) {
                return Optional.empty();
            }
            int startOffset = location.get().textRange().startOffset();
            ModulePartNode rootNode = document.syntaxTree().rootNode();
            // findNode returns the smallest node *containing* the range, which for an annotation is
            // the enclosing MetadataNode (doc comments plus every annotation on the symbol), never
            // the AnnotationNode itself. The one wanted is the descendant starting at this offset.
            AnnotationNode annotation = findAnnotationNode(
                    rootNode.findNode(TextRange.from(startOffset, location.get().textRange().length())),
                    startOffset);
            if (annotation == null) {
                return Optional.empty();
            }
            return annotation.annotValue()
                    .map(value -> COLLAPSE_WHITESPACE.matcher(value.toSourceCode().strip()).replaceAll(" "))
                    .filter(value -> !value.isEmpty());
        } catch (RuntimeException e) {
            return Optional.empty();
        }
    }

    /**
     * Finds the {@link AnnotationNode} beginning at {@code startOffset}, descending from the node
     * the range lookup produced. Matching on the start offset picks the right annotation when a
     * symbol carries several.
     */
    private static AnnotationNode findAnnotationNode(Node node, int startOffset) {
        if (node == null) {
            return null;
        }
        if (node instanceof AnnotationNode annotation && node.textRange().startOffset() == startOffset) {
            return annotation;
        }
        if (!(node instanceof NonTerminalNode nonTerminal)) {
            return null;
        }
        for (Node child : nonTerminal.children()) {
            if (child == null) {
                continue;
            }
            TextRange range = child.textRange();
            if (startOffset < range.startOffset() || startOffset >= range.endOffset()) {
                continue;
            }
            AnnotationNode found = findAnnotationNode(child, startOffset);
            if (found != null) {
                return found;
            }
        }
        return null;
    }

    /**
     * Returns the {@code org/module} identifier of the annotation, or {@code null} when it belongs
     * to the library currently being processed (so it renders without a module prefix).
     */
    private static String resolveModule(AnnotationSymbol annotationSymbol, String currentOrg,
                                        String currentPackage) {
        Optional<ModuleSymbol> optModule = annotationSymbol.getModule();
        if (optModule.isEmpty()) {
            return null;
        }
        String org = optModule.get().id().orgName();
        String moduleName = optModule.get().id().moduleName();
        // Same-library annotations render bare (no prefix).
        if (org != null && org.equals(currentOrg) && moduleName != null && moduleName.equals(currentPackage)) {
            return null;
        }
        // Langlib annotations (e.g. @display) are auto-imported and written without a module prefix.
        if (BALLERINA_ORG.equals(org) && moduleName != null && moduleName.startsWith(LANG_MODULE_PREFIX)) {
            return null;
        }
        return org + "/" + moduleName;
    }

    private static boolean isInternalAnnotation(AnnotationSymbol annotationSymbol, String name) {
        Optional<ModuleSymbol> optModule = annotationSymbol.getModule();
        if (optModule.isEmpty()) {
            return false;
        }
        String org = optModule.get().id().orgName();
        String moduleName = optModule.get().id().moduleName();
        boolean isLangModule = BALLERINA_ORG.equals(org) && moduleName != null
                && moduleName.startsWith(LANG_MODULE_PREFIX);
        return isLangModule && INTERNAL_LANG_ANNOTATIONS.contains(name);
    }

    /**
     * Renders an annotation attachment value into a compact Ballerina-like snippet.
     * Handles scalars, strings, record/mapping values, and arrays; recurses through nested
     * {@link ConstantValue} wrappers.
     */
    private static String renderValue(Object value) {
        if (value == null) {
            return "()";
        }
        if (value instanceof ConstantValue constantValue) {
            return renderValue(constantValue.value());
        }
        if (value instanceof Map<?, ?> map) {
            StringJoiner joiner = new StringJoiner(", ", "{", "}");
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                joiner.add(entry.getKey() + ": " + renderValue(entry.getValue()));
            }
            return joiner.toString();
        }
        if (value instanceof List<?> list) {
            StringJoiner joiner = new StringJoiner(", ", "[", "]");
            for (Object element : list) {
                joiner.add(renderValue(element));
            }
            return joiner.toString();
        }
        if (value instanceof String str) {
            return "\"" + str + "\"";
        }
        return value.toString();
    }
}
