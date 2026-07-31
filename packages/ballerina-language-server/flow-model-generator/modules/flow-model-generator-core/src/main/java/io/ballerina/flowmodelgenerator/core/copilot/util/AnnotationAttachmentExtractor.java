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
import io.ballerina.flowmodelgenerator.core.copilot.model.AnnotationAttachment;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.StringJoiner;

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
     * @return the list of attachments (never {@code null}; empty when none apply)
     */
    public static List<AnnotationAttachment> extract(Annotatable annotatable, String currentOrg,
                                                     String currentPackage) {
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
            attachmentSymbol.attachmentValue()
                    .map(ConstantValue::value)
                    .map(AnnotationAttachmentExtractor::renderValue)
                    .ifPresent(attachment::setValue);
            attachments.add(attachment);
        }
        return attachments;
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
