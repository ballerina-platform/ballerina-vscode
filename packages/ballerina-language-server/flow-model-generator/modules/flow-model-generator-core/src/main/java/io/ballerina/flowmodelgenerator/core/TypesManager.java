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

package io.ballerina.flowmodelgenerator.core;

import com.google.gson.Gson;
import com.google.gson.JsonElement;
import io.ballerina.compiler.api.ModuleID;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.ArrayTypeSymbol;
import io.ballerina.compiler.api.symbols.ClassSymbol;
import io.ballerina.compiler.api.symbols.EnumSymbol;
import io.ballerina.compiler.api.symbols.ErrorTypeSymbol;
import io.ballerina.compiler.api.symbols.FutureTypeSymbol;
import io.ballerina.compiler.api.symbols.IntersectionTypeSymbol;
import io.ballerina.compiler.api.symbols.MapTypeSymbol;
import io.ballerina.compiler.api.symbols.ObjectTypeSymbol;
import io.ballerina.compiler.api.symbols.RecordFieldSymbol;
import io.ballerina.compiler.api.symbols.RecordTypeSymbol;
import io.ballerina.compiler.api.symbols.ServiceDeclarationSymbol;
import io.ballerina.compiler.api.symbols.StreamTypeSymbol;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.SymbolKind;
import io.ballerina.compiler.api.symbols.TableTypeSymbol;
import io.ballerina.compiler.api.symbols.TypeDefinitionSymbol;
import io.ballerina.compiler.api.symbols.TypeDescKind;
import io.ballerina.compiler.api.symbols.TypeReferenceTypeSymbol;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.api.symbols.UnionTypeSymbol;
import io.ballerina.compiler.syntax.tree.MetadataNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.NonTerminalNode;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.compiler.syntax.tree.SyntaxTree;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.Member;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.RecordSelectorType;
import io.ballerina.flowmodelgenerator.core.model.TypeData;
import io.ballerina.flowmodelgenerator.core.utils.SourceCodeGenerator;
import io.ballerina.flowmodelgenerator.core.utils.TypeTransformer;
import io.ballerina.flowmodelgenerator.core.utils.TypeUtils;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.projects.Document;
import io.ballerina.projects.Module;
import io.ballerina.projects.Project;
import io.ballerina.tools.text.LinePosition;
import io.ballerina.tools.text.LineRange;
import io.ballerina.tools.text.TextDocument;
import io.ballerina.tools.text.TextDocumentChange;
import io.ballerina.tools.text.TextRange;
import org.ballerinalang.langserver.common.utils.CommonUtil;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import static io.ballerina.flowmodelgenerator.core.utils.TypeTransformer.BUILT_IN_ERROR;
import static org.apache.commons.lang3.StringUtils.capitalize;

/**
 * Manage creation, retrieving and updating operations related to types.
 *
 * @since 1.0.0
 */
public class TypesManager {

    private static final Gson gson = new Gson();
    public static final String ANY_ERROR_VARIABLE = "any|error __reserved__ = ";
    private final Module module;
    private final Document typeDocument;
    private static final List<SymbolKind> supportedSymbolKinds = List.of(SymbolKind.TYPE_DEFINITION, SymbolKind.ENUM,
            SymbolKind.CLASS, SymbolKind.TYPE);
    private static final List<SymbolKind> supportedGraphqlSymbolKinds = List.of(SymbolKind.TYPE_DEFINITION,
            SymbolKind.ENUM, SymbolKind.SERVICE_DECLARATION, SymbolKind.CLASS, SymbolKind.TYPE);
    /** Matches the canonical import value format produced by {@code TypeTransformer.addRequiredImports}.
     * The version suffix ({@code :version}) is optional to accommodate imports registered without a version
     * (e.g. annotation-derived imports added via {@code moduleId.orgName() + "/" + moduleId.packageName()}). */
    private static final Pattern IMPORT_PATTERN = Pattern.compile("^([^/]+)/([^:]+)(?::.+)?$");

    public TypesManager(Document typeDocument) {
        this.typeDocument = typeDocument;
        this.module = typeDocument.module();
    }

    public JsonElement getAllTypes(SemanticModel semanticModel) {
        Map<String, Symbol> symbolMap = semanticModel.moduleSymbols().stream()
                .filter(s -> supportedSymbolKinds.contains(s.kind()))
                .collect(Collectors.toMap(symbol -> symbol.getName().orElse(""), symbol -> symbol));

        // Now we have all the defined types in the module scope
        // Now we need to get foreign types that we have defined members of the types
        // e.g: ballerina\time:UTC in Person record as a type of field `dateOfBirth`
        new HashMap<>(symbolMap).forEach((key, element) -> {
            if (element.kind() != SymbolKind.TYPE_DEFINITION) {
                return;
            }
            TypeSymbol typeSymbol = ((TypeDefinitionSymbol) element).typeDescriptor();
            addMemberTypes(typeSymbol, symbolMap);
        });

        List<Object> allTypes = symbolMap.values().stream().map(this::getTypeData).toList();

        return gson.toJsonTree(allTypes);
    }

    public JsonElement getGraphqlType(SemanticModel semanticModel, Document document, LinePosition linePosition) {
        NonTerminalNode node = CommonUtil.findNode(CommonUtils.toRange(linePosition), document.syntaxTree());

        Optional<Symbol> optSymbol = Optional.empty();
        // TODO: This needs to be applied for other type definitions when adding annotation support
        if (SyntaxKind.ANNOTATION == node.kind() && node.parent().kind() == SyntaxKind.METADATA) {
            MetadataNode metadata = (MetadataNode) node.parent();
            NonTerminalNode parentNode = metadata.parent();
            if (SyntaxKind.SERVICE_DECLARATION == parentNode.kind()) {
                optSymbol = semanticModel.symbol(parentNode);
            }
        } else if (SyntaxKind.MARKDOWN_DOCUMENTATION_LINE == node.kind()) {
            NonTerminalNode docNode = node.parent();
            if (docNode.kind() == SyntaxKind.MARKDOWN_DOCUMENTATION &&
                    docNode.parent().kind() == SyntaxKind.METADATA) {
                MetadataNode metadata = (MetadataNode) docNode.parent();
                NonTerminalNode parentNode = metadata.parent();
                if (SyntaxKind.SERVICE_DECLARATION == parentNode.kind()) {
                    optSymbol = semanticModel.symbol(parentNode);
                }
            }
        } else {
            optSymbol = semanticModel.symbol(document, linePosition);
        }

        if (optSymbol.isEmpty() || !supportedGraphqlSymbolKinds.contains(optSymbol.get().kind())) {
            return null;
        }

        Object type = getTypeData(optSymbol.get());

        Map<String, Object> refs = new HashMap<>();
        if (optSymbol.get().kind() == SymbolKind.SERVICE_DECLARATION) {
            addDependencyTypes((ServiceDeclarationSymbol) optSymbol.get(), refs, true);
        } else {
            TypeSymbol typeDescriptor = getTypeDescriptor(optSymbol.get());
            if (typeDescriptor != null) {
                addDependencyTypes(typeDescriptor, refs, true);
            }
        }

        return gson.toJsonTree(new TypeDataWithRefs(type, refs.values().stream().toList()));

    }

    public JsonElement getType(SemanticModel semanticModel, Document document, LinePosition linePosition) {
        Optional<Symbol> symbol = semanticModel.symbol(document, linePosition);
        if (symbol.isEmpty() || !supportedGraphqlSymbolKinds.contains(symbol.get().kind())) {
            return null;
        }

        Object type = getTypeData(symbol.get());

        Map<String, Object> refs = new HashMap<>();
        if (symbol.get().kind() == SymbolKind.SERVICE_DECLARATION) {
            addDependencyTypes((ServiceDeclarationSymbol) symbol.get(), refs, false);
        } else {
            TypeSymbol typeDescriptor = getTypeDescriptor(symbol.get());
            if (typeDescriptor != null) {
                addDependencyTypes(typeDescriptor, refs, false);
            }
        }

        return gson.toJsonTree(new TypeDataWithRefs(type, refs.values().stream().toList()));
    }

    public JsonElement getTypeOfExpression(Project project, String fileName, Document document, LinePosition position,
                                           String expression) {
        String statement = String.format(ANY_ERROR_VARIABLE + "%s;", expression);
        TextDocument textDocument = document.textDocument();
        int startTextPosition = textDocument.textPositionFrom(position);

        io.ballerina.tools.text.TextEdit te = io.ballerina.tools.text.TextEdit.from(TextRange.from(startTextPosition,
                0), statement);
        TextDocument apply = textDocument
                .apply(TextDocumentChange.from(List.of(te).toArray(new io.ballerina.tools.text.TextEdit[0])));

        Project proj = project.duplicate();
        Document modifiedDoc = proj.currentPackage().module(document.module().moduleId())
                        .document(document.documentId()).modify().withContent(String.join(System.lineSeparator(),
                                apply.textLines())).apply();
        int line = position.line();
        int offset = position.offset() + ANY_ERROR_VARIABLE.length();
        LinePosition exprStart = LinePosition.from(line, offset);
        LinePosition exprEnd = LinePosition.from(line, offset + expression.length());
        SemanticModel semanticModel =
                proj.currentPackage().getCompilation().getSemanticModel(modifiedDoc.module().moduleId());
        Optional<TypeSymbol> optTypeSymbol = semanticModel.typeOf(LineRange.from(fileName, exprStart, exprEnd));
        if (optTypeSymbol.isEmpty()) {
            return null;
        }

        TypeSymbol typeSymbol = optTypeSymbol.get();
        ModuleInfo defaultModuleInfo = ModuleInfo.from(proj.currentPackage().getDefaultModule().descriptor());
        String importStatements = CommonUtils.getImportStatements(typeSymbol, defaultModuleInfo).orElse("");
        String typeName = CommonUtils.getTypeSignature(typeSymbol, defaultModuleInfo);
        return gson.toJsonTree(new TypeImports(typeName, getImports(importStatements)));
    }

    public TypeDataWithRefs getTypeDataWithRefs(TypeDefinitionSymbol typeDefSymbol) {
        Object type = getTypeData(typeDefSymbol);
        Map<String, Object> refs = new HashMap<>();
        TypeSymbol typeDescriptor = getTypeDescriptor(typeDefSymbol);
        if (typeDescriptor != null) {
            addDependencyTypes(typeDescriptor, refs, false);
        }
        return genTypeDataRefWithoutPosition(type, refs.values().stream().toList());
    }

    /**
     * Get the record selector type for a given type symbol. This is used to populate the record selector
     * in the property view when the type of a property is a record
     *
     * @param typeSymbol the type symbol to get the record selector type for
     * @param module the module to resolve the type symbol in
     * @param isDependentType whether the type symbol is the parent type for the record selector
     *                 (i.e. the dependent record type)
     * @return the record selector type for the given type symbol, or null if the type
     * symbol is not a record or if the record selector type cannot be generated
     */
    public RecordSelectorType getRecordSelectorType(TypeSymbol typeSymbol, Module module, boolean isDependentType) {
        TypeTransformer typeTransformer = new TypeTransformer(module);
        TypeData.TypeDataBuilder typeDataBuilder = new TypeData.TypeDataBuilder();
        Object transformedType = typeTransformer.transform(typeSymbol, typeDataBuilder);

        if (transformedType instanceof String typeName) {
            Map<String, Object> refs = new HashMap<>();
            addDependencyTypes(typeSymbol, refs, false);
            if (refs.isEmpty() || !refs.containsKey(typeName)) {
                return null;
            }
            transformedType = refs.get(typeName);
            typeSymbol = CommonUtil.getRawType(typeSymbol);
        }

        if (!(transformedType instanceof TypeData typeData)) {
            return null;
        }

        typeData = typeData.toBuilder()
                .name(null)
                .build();

        // Collect referenced types
        Map<String, Object> refs = new HashMap<>();
        addDependencyTypes(typeSymbol, refs, false);

        List<TypeData> result = new ArrayList<>();
        // Add referenced types from the same package only (different modules are allowed).
        // TypeData.editable() is set to true by TypeTransformer only when the symbol is within
        // the same package (via CommonUtils.isWithinPackage), so it serves as the same-package predicate.
        for (Object ref : refs.values()) {
            if (ref instanceof TypeData refTypeData && refTypeData.editable()) {
                if (isDependentType) {
                    // If this is the dependent type (i.e. the record type being selected into), we want to ignore
                    // line range information
                    result.add(refTypeData.toBuilder()
                            .codedata()
                                .lineRange(null)
                            .stepOut()
                            .build());
                } else {
                    result.add(refTypeData);
                }
            }
        }

        return new RecordSelectorType(typeData, result);
    }

    /**
     * Internal holder that pairs a resolved type name with its associated {@link Codedata}, used during
     * record selector type merging when a member's type name differs between source and target.
     *
     * @param typeName the resolved type name from the source
     * @param codedata the codedata associated with the source type
     */
    record ReferenceTypeInfo(String typeName, Codedata codedata) {
    }

    /**
     * Merges a source {@link RecordSelectorType} (from the inferred parameter type) with a target
     * {@link RecordSelectorType} (from the target variable's type) to produce a combined selector
     * where fields that are already populated in the source are pre-selected in the target's type model.
     *
     * <p>The merge strategy:
     * <ol>
     *   <li>For each member in the target root type, if a matching member exists in the source root and is
     *       considered "selected" (required, has a default, or its nested record is selected), the target
     *       member is marked as selected.</li>
     *   <li>If the source member's type name differs from the target's (e.g. due to submodule vs external
     *       package naming), the target member is updated to use the source type name and codedata.</li>
     *   <li>Referenced (nested) types in the target are similarly updated and their members pre-selected.</li>
     * </ol>
     *
     * @param source the {@link RecordSelectorType} derived from the inferred parameter's type
     * @param target the {@link RecordSelectorType} derived from the target variable's type
     * @return a new {@link RecordSelectorType} with merged selection state
     */
    public static RecordSelectorType mergeWithTargetVarRecordSelectorType(RecordSelectorType source,
                                                                          RecordSelectorType target) {
        TypeData sourceRoot = source.rootType();
        TypeData targetRoot = target.rootType();

        // Normalise all four member/type lists to non-null views so every loop and stream
        // below is safe even when TypeData was built without explicitly setting these fields.
        List<Member> targetRootMembers = targetRoot.members() != null ? targetRoot.members() : List.of();
        List<Member> sourceRootMembers = sourceRoot.members() != null ? sourceRoot.members() : List.of();
        List<TypeData> sourceRefTypes = source.referencedTypes() != null ? source.referencedTypes() : List.of();
        List<TypeData> targetRefTypes = target.referencedTypes() != null ? target.referencedTypes() : List.of();

        List<Member> mergedMembers = new ArrayList<>();
        Map<String, ReferenceTypeInfo> updatedTypeNames = new HashMap<>();
        for (Member targetMember : targetRootMembers) {
            Optional<Member> sourceMember = sourceRootMembers.stream()
                    .filter(member -> member.name().equals(targetMember.name()))
                    .findFirst();
            if (sourceMember.isPresent() && isMemberSelected(sourceMember.get(), sourceRefTypes)) {
                Member.MemberBuilder memberBuilder = targetMember.toBuilder();
                memberBuilder.selected(!sourceMember.get().optional() ||
                        sourceMember.get().defaultValue() != null);
                String sourceMemberTypeName = typeNameFromMember(sourceMember.get());
                String targetMemberTypeName = typeNameFromMember(targetMember);
                if (sourceMemberTypeName != null && !sourceMemberTypeName.equals(targetMemberTypeName)) {
                    Codedata sourceMemberCodedata = sourceRefTypes.stream()
                            .filter(typeData -> typeData.name().equals(sourceMemberTypeName))
                            .findFirst()
                            .map(TypeData::codedata)
                            .orElse(null);
                    updatedTypeNames.put(targetMemberTypeName,
                            new ReferenceTypeInfo(sourceMemberTypeName, sourceMemberCodedata));
                    memberBuilder.typeName(sourceMember.get().typeName())
                            .refs(sourceMember.get().refs())
                            .type(sourceMember.get().type());
                }
                mergedMembers.add(memberBuilder
                        .build());
            } else {
                mergedMembers.add(targetMember);
            }
        }

        Codedata sourceCodedata = sourceRoot.codedata();

        TypeData mergedRoot = targetRoot.toBuilder()
                .members(mergedMembers)
                .codedata()
                    .from(sourceCodedata)
                .stepOut()
                .build();

        List<TypeData> referencedTypes = new ArrayList<>();
        for (TypeData targetRefType : targetRefTypes) {
            if (updatedTypeNames.containsKey(targetRefType.name())) {
                ReferenceTypeInfo referenceTypeInfo = updatedTypeNames.get(targetRefType.name());
                String typeName = referenceTypeInfo.typeName();
                Codedata codedata = referenceTypeInfo.codedata();
                TypeData.TypeDataBuilder typeDataBuilder = targetRefType.toBuilder()
                        .name(typeName)
                        .codedata()
                            .from(codedata)
                        .stepOut();
                Optional<TypeData> sourceRefType = sourceRefTypes.stream()
                        .filter(typeData -> typeData.name().equals(typeName))
                        .findFirst();
                if (sourceRefType.isPresent()) {
                    List<Member> sourceRefMembers = sourceRefType.get().members() != null
                            ? sourceRefType.get().members() : List.of();
                    List<Member> targetRefMembers = targetRefType.members() != null
                            ? targetRefType.members() : List.of();
                    List<Member> mergedRefMembers = new ArrayList<>();
                    for (Member targetMember : targetRefMembers) {
                        Optional<Member> sourceMember = sourceRefMembers.stream()
                                .filter(member -> member.name().equals(targetMember.name()))
                                .findFirst();
                        if (sourceMember.isPresent() &&
                                isMemberSelected(sourceMember.get(), sourceRefTypes)) {
                            mergedRefMembers.add(targetMember.toBuilder()
                                    .selected(!sourceMember.get().optional() ||
                                            sourceMember.get().defaultValue() != null)
                                    .build());
                        } else {
                            mergedRefMembers.add(targetMember);
                        }
                    }
                    typeDataBuilder.members(mergedRefMembers);
                }
                TypeData updatedReferencedType = typeDataBuilder.build();
                referencedTypes.add(updatedReferencedType);
            } else {
                referencedTypes.add(targetRefType);
            }
        }

        return new RecordSelectorType(mergedRoot, referencedTypes);
    }

    /**
     * Generates a list of {@link TextEdit}s that create or update Ballerina type definitions derived from
     * a {@link RecordSelectorType}. Only the fields that are "selected" (required, defaulted, or whose
     * nested record has a selected field) are included in the generated types.
     *
     * <p>If the root type has no selected fields, an empty list is returned and no edits are produced.
     * Referenced types that match the {@code ballerina/time} package are skipped because those records
     * cannot be extended into new types.
     *
     * @param recordSelectorType the record selector type describing the root and referenced type models
     * @param typePrefix         a string prefix prepended to generated type names (e.g. the variable name)
     * @param updateExisting     if {@code true}, existing type definitions in the types file are updated
     *                           in-place; if {@code false}, new type definitions are appended
     * @return an ordered list of {@link TextEdit}s to apply to the types document
     */
    public List<TextEdit> getTextEditsForRecordSelectorTypes(RecordSelectorType recordSelectorType,
                                                             String typePrefix, boolean updateExisting) {
        TypeData rootTypeData = recordSelectorType.rootType();
        List<TypeData> referencedTypes = recordSelectorType.referencedTypes();
        if (referencedTypes == null) {
            referencedTypes = List.of();
        }

        List<TypeData> finalReferencedTypes = referencedTypes.stream().toList();
        if (rootTypeData.members() == null ||
                rootTypeData.members()
                        .stream()
                        .noneMatch(member -> isMemberSelected(member, finalReferencedTypes))) {
            return List.of();
        }

        if (rootTypeData.name() == null) {
            rootTypeData = rootTypeData.toBuilder()
                    .name(typePrefix + "Type")
                    .build();
        }

        rootTypeData = updateWithSelectedFields(rootTypeData, finalReferencedTypes);

        List<TypeData> updatedReferencedTypes = new ArrayList<>();
        List<Member> updatedMembers = new ArrayList<>(rootTypeData.members());

        for (TypeData referencedType : referencedTypes) {
            String referencedTypeName = referencedType.name();
            if (referencedTypeName == null) {
                continue;
            }

            Optional<Member> field = rootTypeData.members().stream()
                    .filter(member -> matchingType(member, referencedTypeName) &&
                            isMemberSelected(member, finalReferencedTypes))
                    .findFirst();
            if (field.isPresent()) {
                if (referencedType.metadata() != null && referencedTypeName.equals(referencedType.metadata().label())) {
                    String fieldName = field.get().name();
                    String sanitizedFieldName = fieldName.startsWith("'") ? fieldName.substring(1) : fieldName;
                    String newTypeName = typePrefix + capitalize(getTypeName(sanitizedFieldName)) + "Type";
                    TypeData updatedRefType = referencedType.toBuilder()
                            .name(newTypeName)
                            .build();
                    updatedReferencedTypes.add(updatedRefType);
                    TypeData typeData = field.get().getTypeAsTypeData();
                    Member member;
                    if (typeData == null || typeData.members() == null || typeData.members().isEmpty()) {
                        member = field.get().toBuilder()
                                .type(newTypeName)
                                .build();
                    } else {
                        Member arrayMember = typeData.members().getFirst();
                        Member updatedArrayMember = arrayMember.toBuilder()
                                .type(newTypeName)
                                .build();
                        TypeData updatedTypeData = typeData.toBuilder()
                                .members(List.of(updatedArrayMember))
                                .build();
                        member = field.get().toBuilder()
                                .type(updatedTypeData)
                                .build();
                    }
                    updatedMembers.remove(field.get());
                    updatedMembers.add(member);
                } else {
                    updatedReferencedTypes.add(referencedType);
                }
            }
        }

        rootTypeData = rootTypeData.toBuilder()
                .members(updatedMembers)
                .build();

        referencedTypes = updatedReferencedTypes;

        referencedTypes = referencedTypes.stream()
                .map(typeData -> updateWithSelectedFields(typeData, finalReferencedTypes))
                .toList();

        List<TypeData> allTypes = new ArrayList<>();
        allTypes.add(rootTypeData);
        allTypes.addAll(referencedTypes);

        if (updateExisting) {
            List<TextEdit> textEdits = new ArrayList<>();
            for (TypeData typeData : allTypes) {
                textEdits.addAll(updateType(typeData));
            }
            return textEdits;
        }
        return createMultipleTypes(allTypes);
    }

    private String getTypeName(String typeName) {
        if (typeName.contains(":")) {
            return typeName.substring(typeName.lastIndexOf(":") + 1);
        }
        return typeName;
    }

    private static boolean isMemberSelected(Member member, List<TypeData> referencedTypes) {
        return isMemberSelected(member, referencedTypes, new HashSet<>());
    }

    private static boolean isMemberSelected(Member member, List<TypeData> referencedTypes,
                                            Set<String> visitedTypeNames) {
        if (member.selected() || !member.optional() || member.defaultValue() != null) {
            return true;
        }

        String memberTypeName = typeNameFromMember(member);
        if (memberTypeName == null) {
            return false;
        }

        // Short-circuit on a cycle: if this type name is already being visited in the current
        // traversal path, treat it as not selected to prevent infinite recursion.
        if (!visitedTypeNames.add(memberTypeName)) {
            return false;
        }

        Optional<TypeData> referencedType = referencedTypes.stream()
                .filter(typeData -> memberTypeName.equals(typeData.name()))
                .findFirst();
        return referencedType.isPresent() && referencedType.get().members() != null &&
                referencedType.get().members().stream()
                        .anyMatch(m -> isMemberSelected(m, referencedTypes, visitedTypeNames));
    }

    private static boolean matchingType(Member member, String typeName) {
        String memberTypeName = typeNameFromMember(member);
        return memberTypeName != null && memberTypeName.equals(typeName);
    }

    private static String typeNameFromMember(Member member) {
        Object type = member.type();
        if (type instanceof String) {
            return (String) type;
        }
        TypeData memberTypeData = member.getTypeAsTypeData();
        if (memberTypeData == null || memberTypeData.members() == null || memberTypeData.members().isEmpty()) {
            return null;
        }
        Property property = memberTypeData.properties().get(Property.IS_ARRAY_KEY);
        if (property == null || property.value() == null || !property.value().equals("true")) {
            return null;
        }
        Member arrayElement = memberTypeData.members().getFirst();
        return typeNameFromMember(arrayElement);
    }

    private TypeData updateWithSelectedFields(TypeData typeData, List<TypeData> referencedTypes) {
        List<Member> members = typeData.members();
        if (members == null || members.isEmpty()) {
            return typeData;
        }
        List<Member> updatedMembers = new ArrayList<>();
        for (Member member : members) {
            if (isMemberSelected(member, referencedTypes)) {
                updatedMembers.add(member.toBuilder()
                        .optional(false)
                        .build());
            }
        }
        return typeData.toBuilder()
                .members(updatedMembers)
                .includes(List.of())
                .build();
    }

    public JsonElement updateType(Path filePath, TypeData typeData) {
        Map<Path, List<TextEdit>> textEditsMap = new HashMap<>();
        textEditsMap.put(filePath, updateType(typeData));
        return gson.toJsonTree(textEditsMap);
    }

    private List<TextEdit> updateType(TypeData typeData) {
        List<TextEdit> textEdits = new ArrayList<>();
        // Regenerate code snippet for the type
        SourceCodeGenerator sourceCodeGenerator = new SourceCodeGenerator();
        String codeSnippet = sourceCodeGenerator.generateCodeSnippetForType(typeData);

        SyntaxTree syntaxTree = this.typeDocument.syntaxTree();
        ModulePartNode rootNode = syntaxTree.rootNode();
        LineRange lineRange = typeData.codedata().lineRange();
        if (lineRange == null) {
            textEdits.add(new TextEdit(CommonUtils.toRange(rootNode.lineRange().endLine()), codeSnippet));
        } else {
            NonTerminalNode node = CommonUtil.findNode(CommonUtils.toRange(lineRange), syntaxTree);
            textEdits.add(new TextEdit(CommonUtils.toRange(node.lineRange()), codeSnippet));
        }
        addImportsToTextEdits(sourceCodeGenerator.getImports(), rootNode, textEdits, this.module);
        return textEdits;
    }

    public JsonElement createMultipleTypes(Path filePath, List<TypeData> typeDataList) {
        List<TextEdit> textEdits = createMultipleTypes(typeDataList);
        Map<Path, List<TextEdit>> textEditsMap = new HashMap<>();
        textEditsMap.put(filePath, textEdits);
        return gson.toJsonTree(textEditsMap);
    }

    private List<TextEdit> createMultipleTypes(List<TypeData> typeDataList) {
        List<TextEdit> textEdits = new ArrayList<>();
        SyntaxTree syntaxTree = this.typeDocument.syntaxTree();
        ModulePartNode rootNode = syntaxTree.rootNode();

        List<String> codeSnippets = new ArrayList<>();
        SourceCodeGenerator sourceCodeGenerator = new SourceCodeGenerator();
        for (TypeData typeData : typeDataList) {
            String codeSnippet = sourceCodeGenerator.generateCodeSnippetForType(typeData);
            codeSnippets.add(codeSnippet);
        }
        addImportsToTextEdits(sourceCodeGenerator.getImports(), rootNode, textEdits, this.module);

        textEdits.add(new TextEdit(CommonUtils.toRange(rootNode.lineRange().endLine()),
                String.join(System.lineSeparator(), codeSnippets)));
        return textEdits;
    }

    public JsonElement createGraphqlClassType(Path filePath, TypeData typeData) {
        List<TextEdit> textEdits = new ArrayList<>();
        Map<Path, List<TextEdit>> textEditsMap = new HashMap<>();
        textEditsMap.put(filePath, textEdits);

        // Generate code snippet for the type
        SourceCodeGenerator sourceCodeGenerator = new SourceCodeGenerator();
        String codeSnippet = sourceCodeGenerator.generateGraphqlClassType(typeData);

        SyntaxTree syntaxTree = this.typeDocument.syntaxTree();
        ModulePartNode rootNode = syntaxTree.rootNode();
        textEdits.add(new TextEdit(CommonUtils.toRange(rootNode.lineRange().endLine()), codeSnippet));

        addImportsToTextEdits(sourceCodeGenerator.getImports(), rootNode, textEdits, this.module);

        return gson.toJsonTree(textEditsMap);
    }

    private void addMemberTypes(TypeSymbol typeSymbol, Map<String, Symbol> symbolMap) {
        // Record
        switch (typeSymbol.typeKind()) {
            case RECORD -> {
                RecordTypeSymbol recordTypeSymbol = (RecordTypeSymbol) typeSymbol;

                // Type inclusions
                List<TypeSymbol> inclusions = recordTypeSymbol.typeInclusions();
                inclusions.forEach(inc -> {
                    addToMapIfForeignAndNotAdded(symbolMap, inc);
                });

                // Rest field
                Optional<TypeSymbol> restTypeDescriptor = recordTypeSymbol.restTypeDescriptor();
                if (restTypeDescriptor.isPresent()) {
                    TypeSymbol restType = restTypeDescriptor.get();
                    addToMapIfForeignAndNotAdded(symbolMap, restType);
                }

                // Field members
                Map<String, RecordFieldSymbol> fieldSymbolMap = recordTypeSymbol.fieldDescriptors();
                fieldSymbolMap.forEach((key, field) -> {
                    TypeSymbol ts = field.typeDescriptor();
                    if (ts.typeKind() == TypeDescKind.ARRAY || ts.typeKind() == TypeDescKind.UNION) {
                        addMemberTypes(ts, symbolMap);
                    } else {
                        addToMapIfForeignAndNotAdded(symbolMap, ts);
                    }
                });
            }
            case UNION -> {
                UnionTypeSymbol unionTypeSymbol = (UnionTypeSymbol) typeSymbol;
                List<TypeSymbol> unionMembers = unionTypeSymbol.memberTypeDescriptors();
                unionMembers.forEach(member -> {
                    if (member.typeKind() == TypeDescKind.ARRAY) {
                        addMemberTypes(member, symbolMap);
                    } else {
                        addToMapIfForeignAndNotAdded(symbolMap, member);
                    }
                });
            }
            case ARRAY -> {
                ArrayTypeSymbol arrayTypeSymbol = (ArrayTypeSymbol) typeSymbol;
                TypeSymbol arrMemberTypeDesc = arrayTypeSymbol.memberTypeDescriptor();
                if (arrMemberTypeDesc.typeKind() == TypeDescKind.ARRAY
                        || arrMemberTypeDesc.typeKind() == TypeDescKind.UNION) {
                    addMemberTypes(arrMemberTypeDesc, symbolMap);
                } else {
                    addToMapIfForeignAndNotAdded(symbolMap, arrMemberTypeDesc);
                }
            }
            default -> {
            }
        }
    }

    private Object getTypeData(Symbol symbol) {
        TypeTransformer typeTransformer = new TypeTransformer(this.module);
        return switch (symbol.kind()) {
            case TYPE_DEFINITION -> typeTransformer.transform((TypeDefinitionSymbol) symbol);
            case CLASS -> typeTransformer.transform((ClassSymbol) symbol);
            case ENUM -> typeTransformer.transform((EnumSymbol) symbol);
            case SERVICE_DECLARATION -> typeTransformer.transform((ServiceDeclarationSymbol) symbol);
            case TYPE -> getTypeData(((TypeReferenceTypeSymbol) symbol).definition());
            default -> null;
        };
    }

    // Get type descriptor from the symbol
    private TypeSymbol getTypeDescriptor(Symbol symbol) {
        return switch (symbol.kind()) {
            case TYPE_DEFINITION -> ((TypeDefinitionSymbol) symbol).typeDescriptor();
            case CLASS -> ((ClassSymbol) symbol);
            default -> null;
        };
    }

    private void addToMapIfForeignAndNotAdded(Map<String, Symbol> foreignSymbols, TypeSymbol type) {
        if (type.typeKind() != TypeDescKind.TYPE_REFERENCE
                || type.getName().isEmpty()
                || type.getModule().isEmpty()) {
            return;
        }

        String name = type.getName().get();

        ModuleInfo moduleInfo = ModuleInfo.from(this.module.descriptor());
        ModuleID typeModuleId = type.getModule().get().id();
        if (CommonUtils.isWithinPackage(type, moduleInfo) ||
                CommonUtils.isPredefinedLangLib(typeModuleId.orgName(), typeModuleId.packageName())) {
            return;
        }

        String typeName = TypeUtils.generateReferencedTypeId(type, moduleInfo);
        if (!foreignSymbols.containsKey(name)) {
            foreignSymbols.put(typeName, type);
        }
    }

    private void addDependencyTypes(ServiceDeclarationSymbol serviceDeclarationSymbol,
                                    Map<String, Object> references,
                                    boolean skipParameters) {
        // attributes
        if (!skipParameters) {
            serviceDeclarationSymbol.fieldDescriptors().forEach((key, field) -> {
                addDependencyTypes(field.typeDescriptor(), references, skipParameters);
            });
        }

        // methods
        serviceDeclarationSymbol.methods().forEach((key, method) -> {
            // Skipping Parameters. e.g. GraphQL service class methods
            if (!skipParameters) {
                method.typeDescriptor().params().ifPresent(params -> params.forEach(param -> {
                    addDependencyTypes(param.typeDescriptor(), references, skipParameters);
                }));
            }

            // return type
            method.typeDescriptor().returnTypeDescriptor().ifPresent(returnType -> {
                addDependencyTypes(returnType, references, skipParameters);
            });

            // rest param
            method.typeDescriptor().restParam().ifPresent(restParam -> {
                addDependencyTypes(restParam.typeDescriptor(), references, skipParameters);
            });
        });
    }

    private void addDependencyTypes(TypeSymbol typeSymbol, Map<String, Object> references, boolean skipParameters) {
        switch (typeSymbol.typeKind()) {
            case RECORD -> {
                RecordTypeSymbol recordTypeSymbol = (RecordTypeSymbol) typeSymbol;

                // type inclusions
                recordTypeSymbol.typeInclusions().forEach(includedType -> {
                    addDependencyTypes(includedType, references, skipParameters);
                });

                // members
                recordTypeSymbol.fieldDescriptors().forEach((key, field) -> {
                    addDependencyTypes(field.typeDescriptor(), references, skipParameters);
                });

                // rest member
                if (recordTypeSymbol.restTypeDescriptor().isPresent()) {
                    addDependencyTypes(recordTypeSymbol.restTypeDescriptor().get(), references, skipParameters);
                }
            }
            case ARRAY -> addDependencyTypes(
                    ((ArrayTypeSymbol) typeSymbol).memberTypeDescriptor(),
                    references,
                    skipParameters
            );
            case UNION -> ((UnionTypeSymbol) typeSymbol).userSpecifiedMemberTypes().forEach(memberType -> {
                addDependencyTypes(memberType, references, skipParameters);
            });
            case ERROR -> {
                ErrorTypeSymbol errorTypeSymbol = (ErrorTypeSymbol) typeSymbol;
                if (errorTypeSymbol.signature().equals(BUILT_IN_ERROR)) {
                    return;
                }
                addDependencyTypes((errorTypeSymbol).detailTypeDescriptor(), references, skipParameters);
            }
            case FUTURE -> {
                Optional<TypeSymbol> typeParam = ((FutureTypeSymbol) typeSymbol).typeParameter();
                if (typeParam.isEmpty()) {
                    return;
                }
                addDependencyTypes(typeParam.get(), references, skipParameters);
            }
            case MAP -> {
                TypeSymbol typeParam = ((MapTypeSymbol) typeSymbol).typeParam();
                addDependencyTypes(typeParam, references, skipParameters);
            }
            case STREAM -> {
                TypeSymbol typeParam = ((StreamTypeSymbol) typeSymbol).typeParameter();
                addDependencyTypes(typeParam, references, skipParameters);
            }
            case INTERSECTION -> ((IntersectionTypeSymbol) typeSymbol).memberTypeDescriptors().forEach(memberTypes -> {
                addDependencyTypes(memberTypes, references, skipParameters);
            });
            case TABLE -> {
                TableTypeSymbol tableTypeSymbol = (TableTypeSymbol) typeSymbol;
                addDependencyTypes(tableTypeSymbol.rowTypeParameter(), references, skipParameters);
                if (tableTypeSymbol.keyConstraintTypeParameter().isPresent()) {
                    addDependencyTypes(tableTypeSymbol.keyConstraintTypeParameter().get(), references, skipParameters);
                }
            }
            case OBJECT -> {
                ObjectTypeSymbol objectTypeSymbol = (ObjectTypeSymbol) typeSymbol;

                // inclusions
                objectTypeSymbol.typeInclusions().forEach(includedType -> {
                    addDependencyTypes(includedType, references, skipParameters);
                });

                // attributes
                objectTypeSymbol.fieldDescriptors().forEach((key, field) -> {
                    addDependencyTypes(field.typeDescriptor(), references, skipParameters);
                });

                // methods
                objectTypeSymbol.methods().forEach((key, method) -> {
                    // params - skip for GraphQL
                    if (!skipParameters) {
                        method.typeDescriptor().params().ifPresent(params -> params.forEach(param -> {
                            addDependencyTypes(param.typeDescriptor(), references, skipParameters);
                        }));
                    }

                    // return type
                    method.typeDescriptor().returnTypeDescriptor().ifPresent(returnType -> {
                        addDependencyTypes(returnType, references, skipParameters);
                    });

                    // rest param
                    method.typeDescriptor().restParam().ifPresent(restParam -> {
                        addDependencyTypes(restParam.typeDescriptor(), references, skipParameters);
                    });
                });
            }
            case FUNCTION, TUPLE -> {
                // TODO: Implement
            }
            case TYPE_REFERENCE -> {
                Symbol definition = ((TypeReferenceTypeSymbol) typeSymbol).definition();
                ModuleInfo moduleInfo = ModuleInfo.from(this.module.descriptor());
                String typeName = TypeUtils.generateReferencedTypeId(typeSymbol, moduleInfo);
                if (references.containsKey(typeName)) {
                    return;
                }
                references.putIfAbsent(typeName, getTypeData(definition));
                if (CommonUtils.isWithinPackage(definition, moduleInfo)) {
                    addDependencyTypes(
                            ((TypeReferenceTypeSymbol) typeSymbol).typeDescriptor(),
                            references,
                            skipParameters
                    );
                }
            }
            default -> {
            }
        }
    }

    private TypeDataWithRefs genTypeDataRefWithoutPosition(Object type, List<Object> refs) {
        List<Object> newRefs = new ArrayList<>();
        for (Object ref : refs) {
            if (ref instanceof TypeData) {
                newRefs.add(getTypeDataWithoutPosition((TypeData) ref));
            } else {
                newRefs.add(ref);
            }
        }

        if (type instanceof TypeData) {
            return new TypeDataWithRefs(getTypeDataWithoutPosition((TypeData) type), newRefs);
        }
        return new TypeDataWithRefs(type, newRefs);
    }

    private TypeData getTypeDataWithoutPosition(TypeData typeData) {
        Codedata codedata = typeData.codedata();
        Codedata newCodedata = getCodedataWithoutPosition(codedata);
        return new TypeData(
                typeData.name(),
                typeData.editable(),
                typeData.metadata(),
                newCodedata,
                typeData.properties(),
                typeData.members(),
                typeData.restMember(),
                typeData.includes(),
                typeData.functions(),
                typeData.annotationAttachments(),
                typeData.allowAdditionalFields()
        );
    }

    private Codedata getCodedataWithoutPosition(Codedata codedata) {
        return new Codedata(
                codedata.node(),
                codedata.org(),
                codedata.module(),
                codedata.packageName(),
                codedata.object(),
                codedata.symbol(),
                codedata.version(),
                null,
                codedata.sourceCode(),
                codedata.parentSymbol(),
                codedata.resourcePath(),
                codedata.id(),
                codedata.isNew(),
                codedata.isGenerated(),
                codedata.inferredReturnType(),
                codedata.data()
        );
    }

    /**
     * Converts the collected import map entries into LSP {@link TextEdit}s that prepend missing
     * {@code import} declarations to the target document.
     *
     * <p>Each value in {@code imports} must conform to the canonical format produced by
     * {@code TypeTransformer.addRequiredImports}: {@code orgName/packageName:version} for root-module
     * types and {@code orgName/packageName.moduleName:version} for sub-module types. Values that do
     * not match this pattern are silently skipped.
     *
     * <p>Import resolution rules (evaluated in order):
     * <ol>
     *   <li>Same module (full dotted module path matches the current document's module) — no import.</li>
     *   <li>Same package, different module (same org + same root package name, different sub-module)
     *       — emit {@code import packageName.moduleName;} without an org prefix.</li>
     *   <li>External package — emit {@code import orgName/packageName[.moduleName];} with the org
     *       prefix.</li>
     * </ol>
     *
     * @param imports   map from import alias to import-value strings
     * @param rootNode  the root {@link ModulePartNode} of the document being modified
     * @param textEdits mutable list to which the generated {@link TextEdit}s are appended
     * @param module    the {@link Module} that owns the document, used to classify import origins
     */
    private static void addImportsToTextEdits(Map<String, String> imports, ModulePartNode rootNode,
                                              List<TextEdit> textEdits, Module module) {
        ModuleInfo currentModuleInfo = ModuleInfo.from(module.descriptor());
        String currentOrg = currentModuleInfo.org();
        // packageName() is the root-only name; moduleName() is the full dotted path (root or root.sub)
        String currentPackageName = currentModuleInfo.packageName();
        String currentModuleName = currentModuleInfo.moduleName();

        TreeSet<String> importStmts = new TreeSet<>();
        imports.values().forEach(importValue -> {
            Matcher matcher = IMPORT_PATTERN.matcher(importValue);
            if (!matcher.matches()) {
                // Not a valid orgName/packageName[.moduleName]:version string — skip
                return;
            }
            String orgName = matcher.group(1);
            String fullModulePart = matcher.group(2); // packageName or packageName.moduleName

            if (orgName.equals(currentOrg)) {
                // Same module — type is directly accessible, no import needed
                if (fullModulePart.equals(currentModuleName)) {
                    return;
                }
                // Same package, different module — import without org prefix
                String importRootPackage = fullModulePart.contains(".")
                        ? fullModulePart.substring(0, fullModulePart.indexOf('.'))
                        : fullModulePart;
                if (importRootPackage.equals(currentPackageName)) {
                    if (!CommonUtils.importExists(rootNode, fullModulePart)) {
                        importStmts.add(getImportStmt(fullModulePart));
                    }
                    return;
                }
            }
            // External package — import with org prefix
            if (!CommonUtils.importExists(rootNode, orgName, fullModulePart)) {
                importStmts.add(getImportStmt(orgName, fullModulePart));
            }
        });

        if (!importStmts.isEmpty()) {
            String importsStmts = String.join(System.lineSeparator(), importStmts);
            textEdits.addFirst(new TextEdit(CommonUtils.toRange(rootNode.lineRange().startLine()), importsStmts));
        }
    }

    private static String getImportStmt(String org, String module) {
        return String.format("%nimport %s/%s;%n", org, module);
    }

    private static String getImportStmt(String module) {
        return String.format("%nimport %s;%n", module);
    }

    private static Map<String, String> getImports(String importsStatements) {
        Map<String, String> imports = new HashMap<>();
        if (importsStatements == null || importsStatements.isBlank()) {
            return imports;
        }

        String[] importStmts = importsStatements.trim().split(",");
        for (String importStmt : importStmts) {
            Matcher matcher = IMPORT_PATTERN.matcher(importStmt.trim());
            if (matcher.matches()) {
                String orgName = matcher.group(1);
                String modulePart = matcher.group(2);
                String modulePrefix = modulePart;
                if (modulePart.contains(".")) {
                    String[] splits = modulePart.split("\\.");
                    modulePrefix = splits[splits.length - 1];
                }
                imports.put(modulePrefix, orgName + "/" + modulePart);
            }
        }
        return imports;
    }

    public record TypeDataWithRefs(Object type, List<Object> refs) {

    }

    public record TypeImports(String name, Map<String, String> imports) {

    }
}
