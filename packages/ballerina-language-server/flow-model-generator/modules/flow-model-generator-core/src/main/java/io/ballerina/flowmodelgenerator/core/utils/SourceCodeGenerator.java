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

package io.ballerina.flowmodelgenerator.core.utils;

import com.google.gson.Gson;
import io.ballerina.flowmodelgenerator.core.model.AnnotationAttachment;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.Function;
import io.ballerina.flowmodelgenerator.core.model.Member;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.TypeData;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.ModulePrefixContext;
import org.ballerinalang.langserver.common.utils.CommonUtil;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.StringJoiner;
import java.util.stream.Collectors;

import static io.ballerina.flowmodelgenerator.core.converters.utils.DataMappingModelConverterUtils.escapeIdentifier;

/**
 * Code snippet generator.
 *
 * <p>
 * Module qualifiers in the generated text are resolved against {@link ModulePrefixContext}, which decides one
 * prefix per module for the file the snippet is destined for. The resolution happens where a member's own
 * imports map is still in scope, because that map is the only place the qualifier's module identity survives:
 * merging several members' maps under their natural prefixes is what loses it.
 * </p>
 *
 * @since 1.0.0
 */
public class SourceCodeGenerator {

    private final Gson gson = new Gson();
    private final ModulePrefixContext prefixes;
    /**
     * The imports in scope at the current point of the walk, innermost last. Each frame overlays its member's
     * map on its parent, so a nested member shadows an outer entry on the same qualifier and inherits the rest
     * when it carries no map of its own.
     */
    private final Deque<Map<String, String>> importScopes = new ArrayDeque<>();

    private static final String LS = System.lineSeparator();

    /** Resolves every module qualifier against the file the generated edits are for. */
    public SourceCodeGenerator(ModulePrefixContext prefixes) {
        this.prefixes = prefixes;
        this.importScopes.push(Map.of());
    }

    /** No file knowledge: every module keeps its natural prefix. */
    public SourceCodeGenerator() {
        this(ModulePrefixContext.from(null));
    }

    /**
     * Enters a member's import scope. The caller must {@link #popScope()} in a finally block, so a throw from
     * an unsupported type descriptor cannot leave the stack skewed.
     */
    private void pushScope(Map<String, String> memberImports) {
        if (memberImports == null || memberImports.isEmpty()) {
            importScopes.push(importScopes.peek());
            return;
        }
        Map<String, String> scope = new LinkedHashMap<>(importScopes.peek());
        scope.putAll(memberImports);
        importScopes.push(scope);
    }

    private void popScope() {
        importScopes.pop();
    }

    public String generateCodeSnippetForType(TypeData typeData) {
        NodeKind nodeKind = typeData.codedata().node();
        return switch (nodeKind) {
            case SERVICE_DECLARATION, CLASS -> "";  // TODO: Implement this
            case ENUM -> generateEnumCodeSnippet(typeData);
            default -> generateTypeDefCodeSnippet(typeData);
        };
    }

    public String generateGraphqlClassType(TypeData typeData) {
        NodeKind nodeKind = typeData.codedata().node();
        if (nodeKind != NodeKind.CLASS) {
            return "";
        }

        StringBuilder fieldBuilder = new StringBuilder();
        for (Member member: typeData.members()) {
            fieldBuilder
                    .append(generateDocs(member.docs(), "\t"))
                    .append(generateMember(member, true))
                    .append(";");
        }

        // Build the resource functions.
        StringBuilder resourceFunctions = new StringBuilder();
        if (typeData.functions() != null) {
            for (Function function : typeData.functions()) {
                resourceFunctions.append(generateResourceFunction(function));
            }
        }

        // `distinct` is always emitted: ballerina/graphql only accepts distinct service classes as union
        // members and as interface implementations, and the class is created before it is known whether it
        // will be used in either. A distinct service class with no inclusions is still a plain object type,
        // so this is a superset of the non-distinct form.
        String template = "%n%sdistinct service class %s {%s%n\tfunction init() {%n\t}%s%n}";

        return template.formatted(
                isReadonlyFlagOn(typeData.properties()) ? "readonly " : "",
                typeData.name(),
                fieldBuilder.toString(),
                resourceFunctions.toString()
        );
    }

    /**
     * The imports still to be written for everything generated so far, in registration order, each carrying its
     * {@code as} clause where the prefix is a rename. Modules the target file already imports are absent.
     */
    public List<String> getImportStatements() {
        return this.prefixes.pendingImportStatements();
    }

    /**
     * Enum members are emitted verbatim and contribute no imports; a qualified default value there is not
     * resolved. Pre-existing, and out of scope for the qualifier work.
     */
    private String generateEnumCodeSnippet(TypeData typeData) {
        String docs = generateDocs(typeData.metadata().description(), "");

        // Build the enum values.
        StringBuilder enumValues = new StringBuilder();
        for (int i = 0; i < typeData.members().size(); i++) {
            Member member = typeData.members().get(i);
            enumValues.append(LS).append("\t").append(member.name());
            if (member.defaultValue() != null && !member.defaultValue().isEmpty()) {
                enumValues.append(" = ").append(member.defaultValue());
            }
            if (i < typeData.members().size() - 1) {
                enumValues.append(",");
            }
        }

        // Check for public property to add `public` qualifier to the enum
        String publicQualifier = isPublicFlagOn(typeData.properties()) ? "public " : "";

        String template = "%s%senum %s {%s%n}%n";

        return template.formatted(docs, publicQualifier, typeData.name(), enumValues.toString());
    }

    private String generateTypeDefCodeSnippet(TypeData typeData) {
        String docs = "";
        if (typeData.metadata() != null && typeData.metadata().description() != null) {
            docs = generateDocs(typeData.metadata().description(), "");
        }
        String annots = "";
        List<AnnotationAttachment> annotationAttachments = typeData.annotationAttachments();
        if (annotationAttachments != null && !annotationAttachments.isEmpty()) {
            annots = annotationAttachments.stream()
                    .map(annot -> annotationSource(annot) + LS)
                    .collect(Collectors.joining());
        }
        String typeDescriptor = generateTypeDescriptor(typeData);

        // Check for readonly property to generate `readonly & <type-desc>` type
        if (isReadonlyFlagOn(typeData.properties())) {
            if (typeData.codedata().node() == NodeKind.UNION) {
                typeDescriptor = "readonly & (" + typeDescriptor + ")";
            } else {
                typeDescriptor = "readonly & " + typeDescriptor;
            }
        }

        // Check for public property to add `public` qualifier to the type definition
        String publicQualifier = "";
        if (isPublicFlagOn(typeData.properties())) {
            publicQualifier = "public ";
        }

        String template = "%s%s%stype %s %s;";

        return template.formatted(docs, annots, publicQualifier, typeData.name(), typeDescriptor);
    }

    private String generateAnnotatedTypeDescriptor(Object typeData,
                                                   List<AnnotationAttachment> annotAttachments) {
        StringBuilder annotationsBuilder = new StringBuilder();
        for (AnnotationAttachment annot : annotAttachments) {
            annotationsBuilder.append(annotationSource(annot)).append(" ");
        }

        return annotationsBuilder + generateTypeDescriptor(typeData);
    }

    private String generateTypeDescriptor(Object typeDescriptor) {
        if (typeDescriptor instanceof String text) { // Type reference or in-line type as string
            // The one place an authored `prefix:Type` reaches the output, so the one place it has to be
            // resolved. Every structural branch below either recurses here or joins children already resolved,
            // which is what keeps each qualifier rewritten exactly once.
            return prefixes.requalifyAuthored(text, importScopes.peek());
        }

        TypeData typeData = toTypeData(typeDescriptor);

        return switch (typeData.codedata().node()) {
            case RECORD -> generateRecordTypeDescriptor(typeData);
            case ARRAY -> generateArrayTypeDescriptor(typeData);
            case MAP -> generateMapTypeDescriptor(typeData);
            case STREAM -> generateStreamTypeDescriptor(typeData);
            case FUTURE -> generateFutureTypeDescriptor(typeData);
            case TYPEDESC -> generateTypedescTypeDescriptor(typeData);
            case ERROR -> generateErrorTypeDescriptor(typeData);
            case UNION -> generateUnionTypeDescriptor(typeData);
            case INTERSECTION -> generateIntersectionTypeDescriptor(typeData);
            case OBJECT -> generateObjectTypeDescriptor(typeData);
            case TABLE -> generateTableTypeDescriptor(typeData);
            case TUPLE -> generateTupleTypeDescriptor(typeData);
            default -> throw new UnsupportedOperationException("Unsupported type descriptor: " + typeDescriptor);
        };
    }

    private String generateObjectTypeDescriptor(TypeData typeData) {
        StringBuilder fieldsBuilder = new StringBuilder();
        for (Member member : typeData.members()) {
            fieldsBuilder.append(generateFieldMember(member, false));
        }

        // TODO: Generate functions if needed.

        String objectTemplate = "object {%s%n}";

        return objectTemplate.formatted(fieldsBuilder.toString());
    }

    private String generateRecordTypeDescriptor(TypeData typeData) {
        // Build the inclusions.
        StringBuilder inclusionsBuilder = new StringBuilder();
        if (typeData.includes() != null && !typeData.includes().isEmpty()) {
            typeData.includes().forEach(include -> inclusionsBuilder
                    .append(LS)
                    .append("\t*")
                    .append(include)
                    .append(";"));
        }

        // Build the fields.
        StringBuilder fieldsBuilder = new StringBuilder();
        for (Member member : typeData.members()) {
            fieldsBuilder.append(generateAnnotatedFieldMember(member, true));
        }

        boolean isOpenRecord = typeData.allowAdditionalFields();

        // Build the rest field (if present).
        String restField = "";
        if (typeData.restMember() != null) {
            String typeDescriptor = generateTypeDescriptor(typeData.restMember().type());
            if (TypeTransformer.BUILT_IN_ANYDATA.equals(typeDescriptor)) {
                isOpenRecord = true; // If the rest field is of type anydata, we treat it as an open record.
            } else if (!isOpenRecord) {
                restField = LS + "\t" + typeDescriptor + " ...;";
            }
        }

        // The template assumes that the dynamic parts already include their needed newlines and indentation.
        String template = "record {|%s%s%s%n|}";
        if (isOpenRecord) {
            template = "record {%s%s%s%n}";
        }

        return template.formatted(
                inclusionsBuilder.toString(),
                fieldsBuilder.toString(),
                restField
        );
    }

    private String generateFieldMember(Member member, boolean withDefaultValue) {
        // generateMember enters this same scope again; overlaying a map on itself is a no-op.
        pushScope(member.imports());
        try {
            StringBuilder stringBuilder = new StringBuilder();
            String docs = generateDocs(member.docs(), "\t");
            stringBuilder
                    .append(docs)
                    .append("\t")
                    .append(generateMember(member, withDefaultValue))
                    .append(";");
            return stringBuilder.toString();
        } finally {
            popScope();
        }
    }

    private String generateAnnotatedFieldMember(Member member, boolean withDefaultValue) {
        pushScope(member.imports());
        try {
            // Docs
            String docs = generateDocs(member.docs(), "\t");

            // Annotation
            StringBuilder annotationsBuilder = new StringBuilder();
            for (AnnotationAttachment annot : getAnnotationAttachments(member)) {
                annotationsBuilder.append("\t").append(annotationSource(annot)).append(LS);
            }

            return docs +
                    annotationsBuilder +
                    "\t" + generateMember(member, withDefaultValue) + ";";
        } finally {
            popScope();
        }
    }

    private String generateTableTypeDescriptor(TypeData typeData) {
        if (typeData.members().isEmpty()) {
            return "table";
        }

        // Build the base table type descriptor.
        String rowType = generateTypeFromMember(typeData.members().getFirst());

        // Build the key type constraint if available.
        String keyInformation = "";
        if (typeData.members().size() > 1) {
            keyInformation = " key<" + generateTypeDescriptor(typeData.members().get(1).type()) + ">";
        }

        // TODO: key specifier is not yet supported

        String template = "table<%s>%s";
        return template.formatted(rowType, keyInformation);
    }

    private String generateIntersectionTypeDescriptor(TypeData typeData) {
        StringBuilder stringBuilder = new StringBuilder();
        if (typeData.members().size() <= 1) {
            return "";
        }
        for (int i = 0; i < typeData.members().size(); i++) {
            Member member = typeData.members().get(i);
            if (member.type() instanceof TypeData) {
                if (((TypeData) member.type()).codedata().node() == NodeKind.INTERSECTION) {
                    stringBuilder
                            .append("(")
                            .append(generateTypeFromMember(member))
                            .append(")");
                } else {
                    stringBuilder.append(generateTypeFromMember(member));
                }
            } else {
                stringBuilder.append(generateTypeFromMember(member));
            }
            if (i < typeData.members().size() - 1) {
                stringBuilder.append(" & ");
            }
        }
        return stringBuilder.toString();
    }

    private String generateTupleTypeDescriptor(TypeData typeData) {
        StringBuilder stringBuilder = new StringBuilder();
        // If there are no members, output an empty tuple.
        if (typeData.members().isEmpty()) {
            stringBuilder.append("[]");
            return "";
        }

        // Build the dynamic list of tuple elements.
        StringJoiner joiner = new StringJoiner(", ");
        for (Member member : typeData.members()) {
            joiner.add(generateTypeFromMember(member));
        }

        String template = "[%s]";
        stringBuilder.append(template.formatted(joiner.toString()));
        return stringBuilder.toString();
    }

    private String generateUnionTypeDescriptor(TypeData typeData) {
        StringBuilder stringBuilder = new StringBuilder();
        if (typeData.members().size() <= 1) {
            return "";
        }
        for (int i = 0; i < typeData.members().size(); i++) {
            Member member = typeData.members().get(i);
            if (member.type() instanceof TypeData) {
                if (((TypeData) member.type()).codedata().node() == NodeKind.UNION) {
                    stringBuilder
                            .append("(")
                            .append(generateTypeFromMember(member))
                            .append(")");
                } else {
                    stringBuilder.append(generateTypeFromMember(member));
                }
            } else {
                stringBuilder.append(generateTypeFromMember(member));
            }
            if (i < typeData.members().size() - 1) {
                stringBuilder.append("|");
            }
        }
        return stringBuilder.toString();
    }

    private String generateErrorTypeDescriptor(TypeData typeData) {
        if (typeData.members().size() == 1) {
            return "error<" + generateTypeFromMember(typeData.members().getFirst()) + ">";
        }
        return "error";
    }

    private String generateTypedescTypeDescriptor(TypeData typeData) {
        if (typeData.members().size() == 1) {
            return "typedesc<" + generateTypeFromMember(typeData.members().getFirst()) + ">";
        }
        return "typedesc<>";
    }

    private String generateFutureTypeDescriptor(TypeData typeData) {
        if (typeData.members().size() == 1) {
            return "future<" + generateTypeFromMember(typeData.members().getFirst()) + ">";
        }
        return "future<>";
    }

    private String generateStreamTypeDescriptor(TypeData typeData) {
        if (typeData.members().size() == 1) {
            return "stream<" + generateTypeFromMember(typeData.members().getFirst()) + ">";
        }
        return "stream<>";
    }

    private String generateMapTypeDescriptor(TypeData typeData) {
        if (typeData.members().size() == 1) {
            return "map<" + generateTypeFromMember(typeData.members().getFirst()) + ">";
        }
        return "map<>";
    }

    private String generateArrayTypeDescriptor(TypeData typeData) {
        Property arraySizeProperty = typeData.properties().get(Property.ARRAY_SIZE);
        String arraySize = "";
        if (arraySizeProperty != null) {
            arraySize =  arraySizeProperty.value().toString();
        }

        if (typeData.members().size() != 1) {
            return "[" + arraySize + "]";
        }

        Member typeMember = typeData.members().getFirst();
        Object type = typeMember.type();
        String transformed = generateTypeFromMember(typeMember);

        if (!(type instanceof String)) {
            NodeKind nodeKind = toTypeData(type).codedata().node();
            // Add parenthesis to union and intersection types
            if (nodeKind == NodeKind.UNION || nodeKind == NodeKind.INTERSECTION) {
                transformed = "(" + transformed + ")";
            }
        }

        return transformed + "[" + arraySize + "]";
    }

    private String generateTypeFromMember(Member member) {
        pushScope(member.imports());
        try {
            return generateTypeDescriptor(member.type());
        } finally {
            popScope();
        }
    }

    private String generateDocs(String docs, String indent) {
        return (docs != null && !docs.isEmpty())
                ? LS + indent + CommonUtils.convertToBalDocs(docs)
                : LS;
    }

    private String generateFunctionParameter(Member member, boolean withDefaultValue) {
        pushScope(member.imports());
        try {
            // Annotation and type descriptor
            List<AnnotationAttachment> copyOfAnnotAttachments = getAnnotationAttachments(member);
            String annotatedTypeDesc = generateAnnotatedTypeDescriptor(member.type(), copyOfAnnotAttachments);

            // Param name
            String paramName = CommonUtil.escapeReservedKeyword(member.name());
            if (member.optional()) {
                paramName = paramName + "?";
            }

            // Default value
            String defaultValue =
                    (withDefaultValue && member.defaultValue() != null && !member.defaultValue().isEmpty())
                            ? " = " + member.defaultValue() : "";

            String template = "%s %s%s"; // <type descriptor> <identifier>[ = <default value>]
            return template.formatted(annotatedTypeDesc, paramName, defaultValue);
        } finally {
            popScope();
        }
    }

    private static List<AnnotationAttachment> getAnnotationAttachments(Member member) {
        List<AnnotationAttachment> copyOfAnnotAttachments;
        if (Objects.nonNull(member.annotationAttachments())) {
            copyOfAnnotAttachments = new ArrayList<>(member.annotationAttachments());
        } else {
            copyOfAnnotAttachments = new ArrayList<>();
        }

        if (member.isGraphqlId()) {
            copyOfAnnotAttachments.add(new AnnotationAttachment(
                    TypeUtils.GRAPHQL_DEFAULT_MODULE_PREFIX,
                    TypeUtils.GRAPHQL_ID_ANNOTATION_NAME,
                    new Codedata.Builder<>(null)
                            .node(NodeKind.ANNOTATION_ATTACHMENT)
                            .org(TypeUtils.BALLERINA_ORG)
                            .module(TypeUtils.GRAPHQL_DEFAULT_MODULE_PREFIX)
                            .build(),
                    null
            ));
        }
        return copyOfAnnotAttachments;
    }

    private String generateMember(Member member, boolean withDefaultValue) {
        String typeDescriptor = generateTypeFromMember(member);
        if (member.readonly()) {
            // Readonly record fields
            typeDescriptor = "readonly " + typeDescriptor;
        }

        String template = "%s %s%s"; // <type descriptor> <identifier> [= <default value>]

        String rawName = member.name();
        String fieldName;

        if (rawName == null) {
            fieldName = null;
        } else if (rawName.startsWith("'") || rawName.startsWith("\\")) {
            fieldName = rawName;
        } else {
            fieldName = escapeIdentifier(rawName);
        }

        if (member.optional() && fieldName != null) {
            fieldName = fieldName + "?";
        }

        return template.formatted(
                typeDescriptor,
                fieldName,
                (withDefaultValue && member.defaultValue() != null && !member.defaultValue().isEmpty())
                        ? " = " + member.defaultValue()
                        : ""
        );
    }

    private String generateResourceFunction(Function function) {
        pushScope(function.imports());
        try {
            return generateResourceFunctionSource(function);
        } finally {
            popScope();
        }
    }

    private String generateResourceFunctionSource(Function function) {
        String docs = generateDocs(function.description(), "\t");

        StringJoiner paramJoiner = new StringJoiner(", ");
        for (Member param : function.parameters()) {
            String genParam = generateFunctionParameter(param, true);
            paramJoiner.add(genParam);
        }

        List<AnnotationAttachment> returnTypeAnnotAttachments = new ArrayList<>();
        if (function.isGraphqlId()) {
            returnTypeAnnotAttachments.add(new AnnotationAttachment(
                    TypeUtils.GRAPHQL_DEFAULT_MODULE_PREFIX,
                    TypeUtils.GRAPHQL_ID_ANNOTATION_NAME,
                    new Codedata.Builder<>(null)
                            .node(NodeKind.ANNOTATION_ATTACHMENT)
                            .org(TypeUtils.BALLERINA_ORG)
                            .module(TypeUtils.GRAPHQL_DEFAULT_MODULE_PREFIX)
                            .build(),
                    null
            ));
        }
        String returnTypeDesc = generateAnnotatedTypeDescriptor(function.returnType(), returnTypeAnnotAttachments);

        String template = "%s\tresource function %s %s(%s) returns %s {" +
                "%n\t\tdo {" +
                "%n\t\t\tpanic error(\"Unimplemented function\");" +
                "%n\t\t} on fail error err {" +
                "%n\t\t\t//handle error" +
                "%n\t\t\tpanic error(\"Unhandled error\");" +
                "%n\t\t}" +
                "%n\t}";

        return template.formatted(
                docs,
                function.accessor(),
                function.name(),
                paramJoiner.toString(),
                returnTypeDesc,
                function.name()
        );
    }

    private TypeData toTypeData(Object typeDescAsObject) {
        TypeData typeData;
        if (typeDescAsObject instanceof Map) {
            String json = gson.toJson(typeDescAsObject);
            typeData = gson.fromJson(json, TypeData.class);
        } else {
            typeData = (TypeData) typeDescAsObject;
        }
        return typeData;
    }

    private boolean isReadonlyFlagOn(Map<String, Property> properties) {
        Property readonlyProperty = properties.get(Property.IS_READ_ONLY_KEY);
        return readonlyProperty != null && readonlyProperty.value().equals("true");
    }

    private boolean isPublicFlagOn(Map<String, Property> properties) {
        Property publicProperty = properties.get(Property.IS_PUBLIC_KEY);
        return publicProperty != null &&
                (publicProperty.value().equals("true") || publicProperty.value().equals(true));
    }

    /**
     * The source of an annotation attachment, rendered under the prefix its module resolves to in the target
     * file, and registering that module for import. A local annotation (no module prefix) is emitted as-is.
     *
     * <p>
     * The annotation's <em>property values</em> are emitted verbatim, so a qualified constant reference inside
     * one is not resolved. Pre-existing, and out of scope here.
     * </p>
     *
     * @param annot the attachment to render
     * @return its source text
     */
    private String annotationSource(AnnotationAttachment annot) {
        if (annot == null) {
            return "";
        }
        if (annot.modulePrefix() == null || annot.modulePrefix().isEmpty()) {
            return annot.toString();
        }
        Codedata codedata = annot.codedata();
        if (codedata == null || codedata.org() == null || codedata.module() == null) {
            return annot.toString();
        }
        // An empty prefix is the answer for an annotation of the file's own module, which needs no qualifier.
        // Falling back to the model's stored prefix there would emit `@pkg:Ann` for a module nothing imports.
        return annot.toSourceCode(prefixes.prefixFor(codedata.org(), codedata.module()));
    }
}
