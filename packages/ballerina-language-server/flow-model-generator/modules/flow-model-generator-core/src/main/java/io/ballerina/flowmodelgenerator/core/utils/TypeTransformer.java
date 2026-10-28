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

import io.ballerina.compiler.api.ModuleID;
import io.ballerina.compiler.api.symbols.AbsResourcePathAttachPoint;
import io.ballerina.compiler.api.symbols.AnnotationAttachmentSymbol;
import io.ballerina.compiler.api.symbols.AnnotationSymbol;
import io.ballerina.compiler.api.symbols.ArrayTypeSymbol;
import io.ballerina.compiler.api.symbols.ClassSymbol;
import io.ballerina.compiler.api.symbols.Documentable;
import io.ballerina.compiler.api.symbols.EnumSymbol;
import io.ballerina.compiler.api.symbols.ErrorTypeSymbol;
import io.ballerina.compiler.api.symbols.FunctionSymbol;
import io.ballerina.compiler.api.symbols.FunctionTypeSymbol;
import io.ballerina.compiler.api.symbols.FutureTypeSymbol;
import io.ballerina.compiler.api.symbols.IntersectionTypeSymbol;
import io.ballerina.compiler.api.symbols.LiteralAttachPoint;
import io.ballerina.compiler.api.symbols.MapTypeSymbol;
import io.ballerina.compiler.api.symbols.MethodSymbol;
import io.ballerina.compiler.api.symbols.ModuleSymbol;
import io.ballerina.compiler.api.symbols.ObjectFieldSymbol;
import io.ballerina.compiler.api.symbols.ObjectTypeSymbol;
import io.ballerina.compiler.api.symbols.ParameterSymbol;
import io.ballerina.compiler.api.symbols.Qualifier;
import io.ballerina.compiler.api.symbols.RecordTypeSymbol;
import io.ballerina.compiler.api.symbols.ResourceMethodSymbol;
import io.ballerina.compiler.api.symbols.ServiceAttachPoint;
import io.ballerina.compiler.api.symbols.ServiceDeclarationSymbol;
import io.ballerina.compiler.api.symbols.StreamTypeSymbol;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.SymbolKind;
import io.ballerina.compiler.api.symbols.TableTypeSymbol;
import io.ballerina.compiler.api.symbols.TupleTypeSymbol;
import io.ballerina.compiler.api.symbols.TypeDefinitionSymbol;
import io.ballerina.compiler.api.symbols.TypeDescKind;
import io.ballerina.compiler.api.symbols.TypeDescTypeSymbol;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.api.symbols.UnionTypeSymbol;
import io.ballerina.compiler.api.values.ConstantValue;
import io.ballerina.compiler.syntax.tree.DefaultableParameterNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.NonTerminalNode;
import io.ballerina.compiler.syntax.tree.RecordFieldWithDefaultValueNode;
import io.ballerina.compiler.syntax.tree.RecordTypeDescriptorNode;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.compiler.syntax.tree.SyntaxTree;
import io.ballerina.flowmodelgenerator.core.model.AbstractBuilder;
import io.ballerina.flowmodelgenerator.core.model.AnnotationAttachment;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.Function;
import io.ballerina.flowmodelgenerator.core.model.Member;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.TypeData;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.GraphqlTypeMapper;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.projects.Document;
import io.ballerina.projects.DocumentId;
import io.ballerina.projects.Module;
import io.ballerina.tools.text.LineRange;
import org.ballerinalang.langserver.common.utils.CommonUtil;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static io.ballerina.modelgenerator.commons.CommonUtils.getTypeSignature;

/**
 * Transformer to transform Ballerina type symbols to type data.
 * @since 1.0.0
 */
public class TypeTransformer {
    private final Module module;
    private final ModuleInfo moduleInfo;
    private final boolean graphqlTypes;
    private Map<String, RecordTypeDescriptorNode> recordTypeDescNodes;

    public static final String BUILT_IN_ERROR = "error";
    public static final String BUILT_IN_ANYDATA = "anydata";
    private static final String SUBSCRIBE_ACCESSOR = "subscribe";

    public TypeTransformer(Module module) {
        this(module, false);
    }

    /**
     * Creates a transformer that can also attach GraphQL types.
     *
     * @param module       the module the types belong to
     * @param graphqlTypes whether to also attach each field's GraphQL type, for the GraphQL diagram
     */
    public TypeTransformer(Module module, boolean graphqlTypes) {
        this.module = module;
        this.moduleInfo = ModuleInfo.from(module.descriptor());
        this.graphqlTypes = graphqlTypes;
    }

    public Object transform(ServiceDeclarationSymbol serviceDeclarationSymbol) {
        TypeData.TypeDataBuilder typeDataBuilder = new TypeData.TypeDataBuilder();
        String attachPoint = serviceDeclarationSymbol.attachPoint().map(this::getAttachPoint).orElse("");
        List<String> qualifiers = serviceDeclarationSymbol.qualifiers().stream().map(Qualifier::getValue).toList();
        typeDataBuilder
                .name(attachPoint)
                .metadata()
                    .label(attachPoint)
                    .description(getDocumentString(serviceDeclarationSymbol))
                    .stepOut()
                .codedata()
                    .node(NodeKind.SERVICE_DECLARATION)
                    .lineRange(serviceDeclarationSymbol.getLocation().get().lineRange())
                    .stepOut()
                .properties()
                    .name(attachPoint, false, false, false)
                    .qualifiers(qualifiers, true, true, true)
                    .isReadOnly(qualifiers.contains(Qualifier.READONLY.getValue()), true, true, false)
                    .isArray("false", true, true, true)
                    .arraySize("", false, false, false);

        if (CommonUtils.isWithinPackage(serviceDeclarationSymbol, moduleInfo)) {
            typeDataBuilder.editable();
        }

        // class fields
        List<Member> fieldMembers = new ArrayList<>();
        serviceDeclarationSymbol.fieldDescriptors().forEach((name, symbol) -> {
            fieldMembers.add(transformObjectFieldAsMember(name, symbol));
        });
        typeDataBuilder.members(fieldMembers);

        // methods
        List<Function> methods = transformMethodSymbols(serviceDeclarationSymbol.methods());
        typeDataBuilder.functions(methods);

        return typeDataBuilder.build();
    }

    public Object transform(ClassSymbol classSymbol) {
        TypeData.TypeDataBuilder typeDataBuilder = new TypeData.TypeDataBuilder();
        String typeName = getTypeName(classSymbol);
        List<Qualifier> qualifiers = classSymbol.qualifiers();
        String networkQualifier = getNetworkQualifier(qualifiers);
        typeDataBuilder
                .name(typeName)
                .metadata()
                    .label(typeName)
                    .description(getDocumentString(classSymbol))
                    .stepOut()
                .codedata()
                    .node(NodeKind.CLASS)
                    .lineRange(classSymbol.getLocation().get().lineRange())
                    .stepOut()
                .properties()
                    .name(typeName, false, false, false)
                    .qualifiers(qualifiers.stream().map(Qualifier::getValue).toList(), true, true, true)
                    .isArray("false", true, true, true)
                    .arraySize("", false, false, false)
                    .isPublic(qualifiers.contains(Qualifier.PUBLIC), true, true, false)
                    .isDistinct(qualifiers.contains(Qualifier.DISTINCT), true, true, false)
                    .isIsolated(qualifiers.contains(Qualifier.ISOLATED), true, true, false)
                    .isReadOnly(qualifiers.contains(Qualifier.READONLY), true, true, false)
                    .networkQualifier(networkQualifier, true, true, false);

        if (CommonUtils.isWithinPackage(classSymbol, moduleInfo)) {
            typeDataBuilder.editable();
        }

        // inclusions
        List<String> includes = new ArrayList<>();
        classSymbol.typeInclusions().forEach(typeInclusion -> {
            includes.add(getTypeSignature(typeInclusion, this.moduleInfo));
        });
        typeDataBuilder.includes(includes);

        // class fields
        List<Member> fieldMembers = new ArrayList<>();
        classSymbol.fieldDescriptors().forEach((name, symbol) -> {
            fieldMembers.add(transformObjectFieldAsMember(name, symbol));
        });
        typeDataBuilder.members(fieldMembers);

        // methods
        List<Function> methods = transformMethodSymbols(classSymbol.methods());
        typeDataBuilder.functions(methods);

        return typeDataBuilder.build();
    }

    public Object transform(ObjectTypeSymbol objectTypeSymbol, TypeData.TypeDataBuilder typeDataBuilder) {
        typeDataBuilder.codedata().node(NodeKind.OBJECT);

        List<Qualifier> qualifiers = objectTypeSymbol.qualifiers();
        String networkQualifier = getNetworkQualifier(qualifiers);
        typeDataBuilder.properties()
                .isIsolated(qualifiers.contains(Qualifier.ISOLATED), true, true, false)
                .networkQualifier(networkQualifier, true, true, false);

        // inclusions
        List<String> includes = new ArrayList<>();
        objectTypeSymbol.typeInclusions().forEach(typeInclusion -> {
            includes.add(getTypeSignature(typeInclusion, this.moduleInfo));
        });
        typeDataBuilder.includes(includes);

        // object fields
        List<Member> fieldMembers = new ArrayList<>();
        objectTypeSymbol.fieldDescriptors().forEach((name, symbol) -> {
            fieldMembers.add(transformObjectFieldAsMember(name, symbol));
        });
        typeDataBuilder.members(fieldMembers);

        // methods
        List<Function> functions = transformMethodSymbols(objectTypeSymbol.methods());
        typeDataBuilder.functions(functions);

        return typeDataBuilder.build();
    }

    public Object transform(TypeDefinitionSymbol typeDef) {
        TypeData.TypeDataBuilder typeDataBuilder = new TypeData.TypeDataBuilder();
        String typeName = getTypeName(typeDef);
        typeDataBuilder
                .name(typeName)
                .metadata()
                    .label(typeName)
                    .stepOut()
                .codedata()
                    .lineRange(typeDef.getLocation().get().lineRange())
                    .stepOut()
                .properties()
                    .name(typeName, false, false, false)
                    .isPublic(typeDef.qualifiers().contains(Qualifier.PUBLIC), true, true, false);

        if (typeDef.documentation().isPresent()) {
            String doc = getDocumentString(typeDef);
            typeDataBuilder
                    .metadata().description(doc).stepOut()
                    .properties().description(doc, false, true, false);
        }

        analyzeAnnotAttachments(typeDef.annotAttachments(), typeDataBuilder);

        if (CommonUtils.isWithinPackage(typeDef, moduleInfo)) {
            typeDataBuilder.editable();
        }

        // Special case for intersection types to get readonly types
        if (typeDef.typeDescriptor().typeKind() == TypeDescKind.INTERSECTION) {
            return handleAsFirstClassNonIntersectionType((IntersectionTypeSymbol) typeDef.typeDescriptor(),
                    typeDataBuilder);
        }

        return transform(typeDef.typeDescriptor(), typeDataBuilder);
    }

    public Object transform(EnumSymbol enumSymbol) {
        TypeData.TypeDataBuilder typeDataBuilder = new TypeData.TypeDataBuilder();
        String typeName = getTypeName(enumSymbol);
        typeDataBuilder
                .name(typeName)
                .editable()
                .metadata()
                    .label(typeName)
                    .stepOut()
                .codedata()
                    .node(NodeKind.ENUM)
                    .lineRange(enumSymbol.getLocation().get().lineRange())
                    .stepOut()
                .properties()
                    .name(typeName, false, false, false)
                    .isArray("false", true, true, true)
                    .arraySize("", false, false, false);

        if (enumSymbol.documentation().isPresent()) {
            String doc = getDocumentString(enumSymbol);
            typeDataBuilder
                    .metadata().description(doc).stepOut()
                    .properties().description(doc, false, true, false);
        }

        List<Member> members = new ArrayList<>();
        Member.MemberBuilder memberBuilder = new Member.MemberBuilder();
        enumSymbol.members().reversed().forEach(enumMember -> { // reverse to maintain the order
            String name = enumMember.getName().get();
            ConstantValue constValue = (ConstantValue) enumMember.constValue();
            String constValueAsString = "\"" + constValue.value() + "\"";
            memberBuilder
                    .name(name)
                    .kind(Member.MemberKind.NAME)
                    .type(constValueAsString)
                    .refs(List.of());
            if (!constValue.value().equals(name)) {
                memberBuilder.defaultValue(constValueAsString);
            }
            Member member = memberBuilder.build();
            members.add(member);
        });
        typeDataBuilder.members(members);

        return typeDataBuilder.build();
    }

    public Object transform(RecordTypeSymbol recordTypeSymbol, TypeData.TypeDataBuilder typeDataBuilder) {
        typeDataBuilder
                .codedata()
                    .node(NodeKind.RECORD)
                    .stepOut()
                .properties()
                    .isArray("false", true, true, true)
                    .arraySize("", true, true, true);

        // includes
        List<String> includes = new ArrayList<>();
        recordTypeSymbol.typeInclusions().forEach(typeInclusion -> {
            includes.add(getTypeSignature(typeInclusion, this.moduleInfo));
        });
        typeDataBuilder.includes(includes);

        Member.MemberBuilder memberBuilder = new Member.MemberBuilder();

        // rest member
        Optional<TypeSymbol> restTypeSymbol = recordTypeSymbol.restTypeDescriptor();
        if (restTypeSymbol.isPresent()) {
            TypeData.TypeDataBuilder restTypeDataBuilder = new TypeData.TypeDataBuilder();
            Object transformedRestType = transform(restTypeSymbol.get(), restTypeDataBuilder);
            if (transformedRestType.equals(BUILT_IN_ANYDATA)) {
                typeDataBuilder.allowAdditionalFields(true);
            } else {
                addRequiredImports(restTypeSymbol.get(), memberBuilder);
                Member restMember = memberBuilder
                        .kind(Member.MemberKind.FIELD)
                        .type(transformedRestType)
                        .typeName(getTypeSignature(restTypeSymbol.get(), this.moduleInfo))
                        .refs(getTypeRefs(transformedRestType, restTypeSymbol.get()))
                        .build();
                typeDataBuilder.restMember(restMember);
            }
        }

        // members
        List<Member> fieldMembers = new ArrayList<>();
        recordTypeSymbol.fieldDescriptors().forEach((fieldName, fieldSymbol) -> {
            TypeData.TypeDataBuilder memberTypeDataBuilder = new TypeData.TypeDataBuilder();
            Object transformedFieldType = transform(fieldSymbol.typeDescriptor(), memberTypeDataBuilder);

            boolean isGraphqlId = false;
            List<AnnotationAttachmentSymbol> annotAttachments = fieldSymbol.annotAttachments();
            for (AnnotationAttachmentSymbol annotAttachment : annotAttachments) {
                if (TypeUtils.isGraphqlIdAnnotation(annotAttachment)) {
                    isGraphqlId = true;
                    insertGraphqlImport(memberBuilder);
                    break;
                }
            }

            analyzeAnnotAttachments(fieldSymbol.annotAttachments(), memberBuilder);
            addRequiredImports(fieldSymbol.typeDescriptor(), memberBuilder);

            Member member = memberBuilder
                    .name(fieldSymbol.getName().orElse(fieldName))
                    .kind(Member.MemberKind.FIELD)
                    .type(transformedFieldType)
                    .typeName(getTypeSignature(fieldSymbol.typeDescriptor(), this.moduleInfo))
                    .optional(fieldSymbol.isOptional())
                    .readonly(fieldSymbol.qualifiers().contains(Qualifier.READONLY))
                    .isGraphqlId(isGraphqlId)
                    .graphqlType(graphqlTypes ? GraphqlTypeMapper.toFieldSdl(fieldSymbol.typeDescriptor(),
                            isGraphqlId, fieldSymbol.isOptional()) : null)
                    .refs(getTypeRefs(transformedFieldType, fieldSymbol.typeDescriptor()))
                    .docs(getDocumentString(fieldSymbol))
                    .defaultValue(getDefaultValueOfField(typeDataBuilder.name(), fieldName).orElse(null))
                    .build();
            fieldMembers.add(member);
        });
        typeDataBuilder.members(fieldMembers);

        return typeDataBuilder.build();
    }

    private static void insertGraphqlImport(Member.MemberBuilder memberBuilder) {
        // TODO: Annotations from other imported modules are not supported yet
        memberBuilder.addImport(
                TypeUtils.GRAPHQL_DEFAULT_MODULE_PREFIX,
                TypeUtils.BALLERINA_ORG + "/" + TypeUtils.GRAPHQL_DEFAULT_MODULE_PREFIX
        );
    }

    public Object transform(UnionTypeSymbol unionTypeSymbol, TypeData.TypeDataBuilder typeDataBuilder) {
        typeDataBuilder
                .codedata()
                    .node(NodeKind.UNION)
                    .stepOut()
                .properties()
                    .isArray("false", true, true, true)
                    .arraySize("", false, false, false);

        Member.MemberBuilder memberBuilder = new Member.MemberBuilder();
        List<Member> memberTypes = new ArrayList<>();
        unionTypeSymbol.userSpecifiedMemberTypes().forEach(memberTypeSymbol -> {
            String name = getTypeSignature(memberTypeSymbol, this.moduleInfo);
            Member member = transformTypeAsMember(name, memberTypeSymbol, memberBuilder);
            memberTypes.add(member);
        });
        typeDataBuilder.members(memberTypes);

        return typeDataBuilder.build();
    }

    public Object transform(IntersectionTypeSymbol intersectionTypeSymbol, TypeData.TypeDataBuilder typeDataBuilder) {
        typeDataBuilder
                .codedata()
                    .node(NodeKind.INTERSECTION)
                    .stepOut()
                .properties()
                    .isArray("false", true, true, true)
                    .arraySize("", false, false, false);

        Member.MemberBuilder memberBuilder = new Member.MemberBuilder();
        List<Member> memberTypes = new ArrayList<>();
        intersectionTypeSymbol.memberTypeDescriptors().forEach(memberTypeSymbol -> {
            String name = getTypeSignature(memberTypeSymbol, this.moduleInfo);
            Member member = transformTypeAsMember(name, memberTypeSymbol, memberBuilder);
            memberTypes.add(member);
        });
        typeDataBuilder.members(memberTypes);

        return typeDataBuilder.build();
    }

    public Object transform(TableTypeSymbol tableTypeSymbol, TypeData.TypeDataBuilder typeDataBuilder) {
        typeDataBuilder
                .codedata()
                    .node(NodeKind.TABLE)
                    .stepOut()
                .properties()
                    .isArray("false", true, true, true)
                    .arraySize("", false, false, false);

        Member.MemberBuilder memberBuilder = new Member.MemberBuilder();

        List<Member> memberTypes = new ArrayList<>();

        // row type
        TypeSymbol rowTypeSymbol = tableTypeSymbol.rowTypeParameter();
        Object transformedRowType = transform(rowTypeSymbol, new TypeData.TypeDataBuilder());
        Member rowTypeMember = memberBuilder
                .name("rowType")
                .kind(Member.MemberKind.TYPE)
                .type(transformedRowType)
                .typeName(rowTypeSymbol.signature())
                .refs(getTypeRefs(transformedRowType, rowTypeSymbol))
                .build();
        memberTypes.add(rowTypeMember);

        // key constraint type
        tableTypeSymbol.keyConstraintTypeParameter().ifPresent(typeSymbol -> {
            Object transformedKeyConstraintType = transform(typeSymbol, new TypeData.TypeDataBuilder());
            Member keyConstraintTypeMember = memberBuilder
                    .name("keyConstraintType")
                    .kind(Member.MemberKind.TYPE)
                    .type(transformedKeyConstraintType)
                    .typeName(getTypeSignature(typeSymbol, this.moduleInfo))
                    .refs(getTypeRefs(transformedRowType, typeSymbol))
                    .build();
            memberTypes.add(keyConstraintTypeMember);
        });
        typeDataBuilder.members(memberTypes);

        return typeDataBuilder.build();
    }

    public Object transform(ArrayTypeSymbol arrayTypeSymbol, TypeData.TypeDataBuilder typeDataBuilder) {
        typeDataBuilder.properties()
                .isArray("true", true, true, true)
                .arraySize(arrayTypeSymbol.size().isPresent() ? arrayTypeSymbol.size().get().toString() : "",
                        true, true, true);
        return transformTypesWithConstraintType(arrayTypeSymbol, NodeKind.ARRAY, typeDataBuilder);
    }

    public Object transform(MapTypeSymbol mapTypeSymbol, TypeData.TypeDataBuilder typeDataBuilder) {
        return transformTypesWithConstraintType(mapTypeSymbol, NodeKind.MAP, typeDataBuilder);
    }

    public Object transform(StreamTypeSymbol streamTypeSymbol, TypeData.TypeDataBuilder typeDataBuilder) {
        return transformTypesWithConstraintType(streamTypeSymbol, NodeKind.STREAM, typeDataBuilder);
    }

    public Object transform(FutureTypeSymbol futureTypeSymbol, TypeData.TypeDataBuilder typeDataBuilder) {
        return transformTypesWithConstraintType(futureTypeSymbol, NodeKind.FUTURE, typeDataBuilder);
    }

    public Object transform(TypeDescTypeSymbol typeDescTypeSymbol, TypeData.TypeDataBuilder typeDataBuilder) {
        return transformTypesWithConstraintType(typeDescTypeSymbol, NodeKind.TYPEDESC, typeDataBuilder);
    }

    public Object transform(ErrorTypeSymbol errorTypeSymbol, TypeData.TypeDataBuilder typeDataBuilder) {
        if (errorTypeSymbol.signature().equals(BUILT_IN_ERROR)) {
            return BUILT_IN_ERROR;
        }
        return transformTypesWithConstraintType(errorTypeSymbol, NodeKind.ERROR, typeDataBuilder);
    }

    public Object transform(TupleTypeSymbol tupleTypeSymbol, TypeData.TypeDataBuilder typeBuilder) {
        typeBuilder
                .codedata()
                    .node(NodeKind.TUPLE)
                    .stepOut()
                .properties()
                    .isArray("false", true, true, true)
                    .arraySize("", false, false, false);

        Member.MemberBuilder memberBuilder = new Member.MemberBuilder();
        List<Member> memberTypes = new ArrayList<>();
        tupleTypeSymbol.memberTypeDescriptors().forEach(memberTypeSymbol -> {
            String name = getTypeSignature(memberTypeSymbol, this.moduleInfo);
            Member member = transformTypeAsMember(name, memberTypeSymbol, memberBuilder);
            memberTypes.add(member);
        });
        typeBuilder.members(memberTypes);

        return typeBuilder.build();
    }

    public Object transform(TypeSymbol typeSymbol, TypeData.TypeDataBuilder typeDataBuilder) {
        return switch (typeSymbol.typeKind()) {
            case RECORD -> transform((RecordTypeSymbol) typeSymbol, typeDataBuilder);
            case ARRAY -> transform((ArrayTypeSymbol) typeSymbol, typeDataBuilder);
            case MAP -> transform((MapTypeSymbol) typeSymbol, typeDataBuilder);
            case STREAM -> transform((StreamTypeSymbol) typeSymbol, typeDataBuilder);
            case FUTURE -> transform((FutureTypeSymbol) typeSymbol, typeDataBuilder);
            case TYPEDESC -> transform((TypeDescTypeSymbol) typeSymbol, typeDataBuilder);
            case ERROR -> transform((ErrorTypeSymbol) typeSymbol, typeDataBuilder);
            case UNION -> transform((UnionTypeSymbol) typeSymbol, typeDataBuilder);
            case INTERSECTION -> transform((IntersectionTypeSymbol) typeSymbol, typeDataBuilder);
            case OBJECT -> transform((ObjectTypeSymbol) typeSymbol, typeDataBuilder);
            case TABLE -> transform((TableTypeSymbol) typeSymbol, typeDataBuilder);
            case TUPLE -> transform((TupleTypeSymbol) typeSymbol, typeDataBuilder);
            default -> CommonUtils.isWithinPackageModule(typeSymbol, moduleInfo) && typeSymbol.getName().isPresent()
                    ? typeSymbol.getName().get()
                    : getTypeSignature(typeSymbol, this.moduleInfo);
        };
    }

    // Utils
    /**
     * Returns the default value of a parameter as written in its signature. The semantic model does not carry
     * default expressions, so the parameter is located in the module's syntax tree.
     */
    private String getParameterDefaultValue(ParameterSymbol param) {
        if (param.getLocation().isEmpty()) {
            return null;
        }
        LineRange lineRange = param.getLocation().get().lineRange();
        for (DocumentId documentId : this.module.documentIds()) {
            Document document = this.module.document(documentId);
            if (!document.name().equals(lineRange.fileName())) {
                continue;
            }
            NonTerminalNode node = CommonUtil.findNode(CommonUtils.toRange(lineRange), document.syntaxTree());
            while (node != null && node.kind() != SyntaxKind.DEFAULTABLE_PARAM
                    && node.kind() != SyntaxKind.FUNCTION_SIGNATURE) {
                node = node.parent();
            }
            return node instanceof DefaultableParameterNode defaultable
                    ? GraphqlTypeMapper.getDefaultValue(defaultable) : null;
        }
        return null;
    }

    private Map<String, RecordTypeDescriptorNode> getRecordTypeDescNodes() {
        if (this.recordTypeDescNodes != null) {
            return this.recordTypeDescNodes;
        }
        TypeDefinitionNodeVisitor typeDefNodeVisitor = new TypeDefinitionNodeVisitor();
        this.module.documentIds().forEach(documentId -> {
            Document document = this.module.document(documentId);
            SyntaxTree syntaxTree = document.syntaxTree();
            syntaxTree.rootNode().accept(typeDefNodeVisitor);
        });
        this.recordTypeDescNodes = typeDefNodeVisitor.getRecordTypeDescNodes();
        return this.recordTypeDescNodes;
    }

    private Optional<String> getDefaultValueOfField(String typeName, String fieldName) {
        RecordTypeDescriptorNode recordTypeDescriptorNode = getRecordTypeDescNodes().get(typeName);
        if (recordTypeDescriptorNode == null) {
            return Optional.empty();
        }
        return recordTypeDescriptorNode.fields().stream()
                .filter(field ->
                        field.kind() == SyntaxKind.RECORD_FIELD_WITH_DEFAULT_VALUE &&
                                ((RecordFieldWithDefaultValueNode) field).fieldName().text().equals(fieldName))
                .findFirst()
                .map(node -> ((RecordFieldWithDefaultValueNode) node).expression().toString());
    }

    private String getDocumentString(Documentable documentable) {
        if (documentable.documentation().isPresent()) {
            return documentable.documentation().get().description().orElse("");
        }
        return null;
    }

    private Object transformTypesWithConstraintType(TypeSymbol typeSymbol,
                                                    NodeKind nodeKind,
                                                    TypeData.TypeDataBuilder typeDataBuilder) {
        typeDataBuilder.codedata().node(nodeKind);

        if (nodeKind != NodeKind.ARRAY) {
            typeDataBuilder
                    .properties()
                    .isArray("false", true, true, true)
                    .arraySize("", false, false, false);
        }

        Member.MemberBuilder memberBuilder = new Member.MemberBuilder();
        TypeSymbol memberTypeDesc = switch (typeSymbol.typeKind()) {
            case ARRAY -> ((ArrayTypeSymbol) typeSymbol).memberTypeDescriptor();
            case MAP -> ((MapTypeSymbol) typeSymbol).typeParam();
            case FUTURE -> ((FutureTypeSymbol) typeSymbol).typeParameter().orElse(null);
            case STREAM -> ((StreamTypeSymbol) typeSymbol).typeParameter();
            case TYPEDESC -> ((TypeDescTypeSymbol) typeSymbol).typeParameter().orElse(null);
            case ERROR -> ((ErrorTypeSymbol) typeSymbol).detailTypeDescriptor();
            default -> null;
        };

        if (memberTypeDesc == null) {
            return typeDataBuilder.build();
        }

        String memberTypeName = getTypeSignature(memberTypeDesc, moduleInfo);
        Member memberType = transformTypeAsMember(memberTypeName, memberTypeDesc, memberBuilder);
        typeDataBuilder.members(List.of(memberType));

        return typeDataBuilder.build();
    }

    private List<Function> transformMethodSymbols(Map<String, ? extends MethodSymbol> methods) {
        return methods.values().stream().map(this::transformFunction).toList();
    }

    private Function transformFunction(FunctionSymbol functionSymbol) {
        Function.FunctionBuilder functionBuilder = new Function.FunctionBuilder();
        Member.MemberBuilder memberBuilder = new Member.MemberBuilder();

        List<Qualifier> functionQuals = functionSymbol.qualifiers();

        functionBuilder.kind(Function.FunctionKind.FUNCTION);

        // qualifiers
        List<String> qualifiers = new ArrayList<>();
        functionQuals.forEach(q -> {
            qualifiers.add(q.name());
            if (q.equals(Qualifier.REMOTE)) {
                functionBuilder.kind(Function.FunctionKind.REMOTE);
            } else if (q.equals(Qualifier.RESOURCE)) {
                functionBuilder.kind(Function.FunctionKind.RESOURCE);
            }
        });
        functionBuilder.qualifiers(qualifiers);

        functionBuilder
                .docs(getDocumentString(functionSymbol))
                .name(functionSymbol.getName().orElse(""))
                .properties()
                    .isPrivate(functionQuals.contains(Qualifier.PRIVATE), true, true, false)
                    .isPublic(functionQuals.contains(Qualifier.PUBLIC), true, true, false)
                    .isIsolated(functionQuals.contains(Qualifier.ISOLATED), true, true, false);

        FunctionTypeSymbol functionTypeSymbol = functionSymbol.typeDescriptor();

        // return type annotation
        functionTypeSymbol.returnTypeAnnotations().ifPresent(returnTypeAnnots -> {
            for (AnnotationAttachmentSymbol annotAttachment : returnTypeAnnots.annotAttachments()) {
                if (TypeUtils.isGraphqlIdAnnotation(annotAttachment)) {
                    // TODO: Annotations from other imported modules are not supported yet
                    functionBuilder.imports(
                            Map.of(
                                    TypeUtils.GRAPHQL_DEFAULT_MODULE_PREFIX,
                                    TypeUtils.BALLERINA_ORG + "/" + TypeUtils.GRAPHQL_DEFAULT_MODULE_PREFIX
                            )
                    );
                    functionBuilder.isGraphqlId(true);
                    break;
                }
            }
        });

        // return type
        boolean isSubscription = functionSymbol.kind() == SymbolKind.RESOURCE_METHOD
                && SUBSCRIBE_ACCESSOR.equals(functionSymbol.getName().orElse(""));
        boolean isGraphqlIdReturn = functionTypeSymbol.returnTypeAnnotations()
                .map(GraphqlTypeMapper::hasIdAnnotation).orElse(false);
        functionTypeSymbol.returnTypeDescriptor().ifPresent(returnType -> {
            Object transformed = transform(returnType, new TypeData.TypeDataBuilder());
            functionBuilder
                    .returnType(transformed)
                    .refs(getTypeRefs(transformed, returnType));
            if (graphqlTypes) {
                functionBuilder.graphqlType(GraphqlTypeMapper.toSdl(
                        isSubscription ? GraphqlTypeMapper.unwrapStream(returnType) : returnType, isGraphqlIdReturn));
            }
        });

        // params
        functionTypeSymbol.params().ifPresent(params -> {
            List<Member> parameters = params.stream().map(param -> {
                Object transformedParamType = transform(param.typeDescriptor(), new TypeData.TypeDataBuilder());

                boolean isGraphqlId = false;
                List<AnnotationAttachmentSymbol> annotAttachments = param.annotAttachments();
                for (AnnotationAttachmentSymbol annotAttachment : annotAttachments) {
                    if (TypeUtils.isGraphqlIdAnnotation(annotAttachment)) {
                        isGraphqlId = true;
                        // TODO: Annotations from other imported modules are not supported yet
                        insertGraphqlImport(memberBuilder);
                        break;
                    }
                }

                addRequiredImports(param.typeDescriptor(), memberBuilder);
                return memberBuilder
                        .name(param.getName().orElse(null))
                        .kind(Member.MemberKind.FIELD)
                        .type(transformedParamType)
                        .typeName(getTypeSignature(param.typeDescriptor(), this.moduleInfo))
                        .isGraphqlId(isGraphqlId)
                        // Runtime-injected parameters (graphql:Context, graphql:Field) are not schema arguments.
                        .graphqlType(graphqlTypes && !GraphqlTypeMapper.isInjectedParam(param.typeDescriptor())
                                ? GraphqlTypeMapper.toSdl(param.typeDescriptor(), isGraphqlId) : null)
                        .defaultValue(graphqlTypes ? getParameterDefaultValue(param) : null)
                        .refs(getTypeRefs(transformedParamType, param.typeDescriptor()))
                        .build();
            }).toList();
            functionBuilder.parameters(parameters);
        });

        // rest param
        functionTypeSymbol.restParam().ifPresent(restParam -> {
            Object transformedRestParamType = transform(restParam.typeDescriptor(), new TypeData.TypeDataBuilder());
            addRequiredImports(restParam.typeDescriptor(), memberBuilder);
            Member restParameter = memberBuilder
                    .name(restParam.getName().get())
                    .kind(Member.MemberKind.FIELD)
                    .type(transformedRestParamType)
                    .typeName(getTypeSignature(restParam.typeDescriptor(), this.moduleInfo))
                    .refs(getTypeRefs(transformedRestParamType, restParam.typeDescriptor()))
                    .build();
            functionBuilder.restParameter(restParameter);
        });

        // resource path
        // TODO: Need a structured schema for resourcePath
        if (functionSymbol.kind().equals(SymbolKind.RESOURCE_METHOD)) {
            functionBuilder
                    .name(((ResourceMethodSymbol) functionSymbol).resourcePath().signature())
                    .accessor(functionSymbol.getName().orElse(""));
        }

        return functionBuilder.build();
    }

    private Member transformObjectFieldAsMember(String fieldName, ObjectFieldSymbol fieldSymbol) {
        TypeData.TypeDataBuilder attributeTypeDataBuilder = new TypeData.TypeDataBuilder();
        Object transformedAttributeType = transform(fieldSymbol.typeDescriptor(), attributeTypeDataBuilder);
        Member.MemberBuilder memberBuilder = new Member.MemberBuilder();
        addRequiredImports(fieldSymbol.typeDescriptor(), memberBuilder);
        return memberBuilder
                .name(fieldName)
                .kind(Member.MemberKind.FIELD)
                .type(transformedAttributeType)
                .typeName(getTypeSignature(fieldSymbol.typeDescriptor(), this.moduleInfo))
                .refs(getTypeRefs(transformedAttributeType, fieldSymbol.typeDescriptor()))
                .docs(getDocumentString(fieldSymbol))
                .build();
    }

    private Member transformTypeAsMember(String typeName, TypeSymbol memberTypeDesc,
                                         Member.MemberBuilder memberBuilder) {
        TypeData.TypeDataBuilder memberTypeDataBuilder = new TypeData.TypeDataBuilder();
        Object transformedMemberType = transform(memberTypeDesc, memberTypeDataBuilder);
        addRequiredImports(memberTypeDesc, memberBuilder);
        return memberBuilder
                .name(typeName)
                .kind(Member.MemberKind.TYPE)
                .type(transformedMemberType)
                .typeName(getTypeSignature(memberTypeDesc, this.moduleInfo))
                .refs(getTypeRefs(transformedMemberType, memberTypeDesc))
                .build();
    }


    private void analyzeAnnotAttachments(List<AnnotationAttachmentSymbol> annotAttachments, AbstractBuilder builder) {
        List<AnnotationAttachment> annotationAttachments = new ArrayList<>();
        annotAttachments.stream()
                .map(a -> transform(a, builder))
                .forEach(annotationAttachments::add);
        builder.annotationAttachments(annotationAttachments);
        //TODO: Solve how imports of annotations will be handled
    }

    // TODO: 1. Analyze service declaration, classes, objects, function return types and parameters for annotations
    // TODO: Handle different configuration views for types related to annotations -
    //  Fix https://github.com/wso2-enterprise/integration-product-management/issues/471
    private AnnotationAttachment transform(AnnotationAttachmentSymbol annotAttachmentSymbol, AbstractBuilder builder) {
        AnnotationSymbol annotDefSymbol = annotAttachmentSymbol.typeDescriptor();
        ModuleID moduleId = annotDefSymbol.getModule().get().id();

        String modulePrefix = "";
        if (!CommonUtils.isWithinPackage(annotDefSymbol, moduleInfo)) {
            modulePrefix = moduleId.modulePrefix();
            builder.addImport(modulePrefix, moduleId.orgName() + "/" + moduleId.moduleName());
        }
        String name = annotDefSymbol.getName().get();

        Codedata codedata = new Codedata.Builder<AbstractBuilder>(builder)
                .node(NodeKind.ANNOTATION_ATTACHMENT)
                .lineRange(annotAttachmentSymbol.getLocation().get().lineRange())
                .module(moduleId.moduleName())
                .org(moduleId.orgName())
                .version(moduleId.version())
                .build();

        if (!annotAttachmentSymbol.isConstAnnotation() || annotAttachmentSymbol.attachmentValue().isEmpty()) {
            return new AnnotationAttachment(
                    modulePrefix,
                    name,
                    codedata,
                    Map.of()
            );
        }

        ConstantValue constantValue = annotAttachmentSymbol.attachmentValue().get();
        HashMap<String, Property> properties = transformAnnotConstant(constantValue);

        return new AnnotationAttachment(modulePrefix, name, codedata, properties);
    }

    private Property createLeafAnnotConstValue(TypeDescKind typeDescKind, Object value) {
        Property.Builder<Object> propertyBuilder = new Property.Builder<>(null);
        switch (typeDescKind) {
            case STRING -> {
                propertyBuilder
                        .type(Property.ValueType.EXPRESSION)
                        .value("\"" + value.toString() + "\"");
            }
            case BOOLEAN -> {
                propertyBuilder
                        .type(Property.ValueType.FLAG)
                        .value(value.toString());
            }
            default -> {
                propertyBuilder
                        .type(Property.ValueType.EXPRESSION)
                        .value(value.toString());
            }
        }
        return propertyBuilder
                .type(Property.ValueType.EXPRESSION, typeDescKind.getName())
                .build();
    }

    private HashMap<String, Property> transformAnnotConstant(ConstantValue constantValue) {
        HashMap<String, Property> properties = new LinkedHashMap<>();
        if (constantValue.value() instanceof HashMap<?, ?> mapValue) {
            mapValue.forEach((key, value) -> {
                String keyStr = key.toString();
                ConstantValue entryConstValue = (ConstantValue) value;
                TypeDescKind valueTypeKind = entryConstValue.valueType().typeKind();
                if (valueTypeKind != TypeDescKind.RECORD && valueTypeKind != TypeDescKind.MAP) {
                    Property property = createLeafAnnotConstValue(valueTypeKind, entryConstValue.value());
                    properties.put(keyStr, property);
                } else if (entryConstValue.value() instanceof LinkedHashMap<?, ?>) {
                    Property property = new Property.Builder<>(null)
                            .type(Property.ValueType.EXPRESSION_SET)
                            .value(transformAnnotConstant(entryConstValue))
                            .build();
                    properties.put(keyStr, property);
                }
            });

        }
        return properties;
    }

    private String getAttachPoint(ServiceAttachPoint attachPoint) {
        return switch (attachPoint.kind()) {
            case ABSOLUTE_RESOURCE_PATH -> "/" +
                    String.join("/", ((AbsResourcePathAttachPoint) attachPoint).segments());
            case STRING_LITERAL -> ((LiteralAttachPoint) attachPoint).literal();
        };
    }

    private String getTypeName(Symbol symbol) {
        Optional<ModuleSymbol> moduleSymbol = symbol.getModule();
        String symbolName = symbol.getName().orElse(symbol instanceof TypeSymbol ?
                ((TypeSymbol) symbol).signature() : symbol.toString());
        if (moduleSymbol.isEmpty()) {
            // No module context — return the simple name, falling back to the full signature
            // for anonymous or module-less symbols where getName() is absent.
            return symbolName;
        }

        ModuleID moduleId = moduleSymbol.get().id();
        if (CommonUtils.isWithinPackage(symbol, moduleInfo)) {
            String moduleName = moduleId.moduleName();
            if (moduleName.equals(moduleInfo.moduleName())) {
                return symbolName;
            }
            return String.format("%s:%s", moduleId.modulePrefix(), symbolName);
        } else {
            return String.format("%s/%s:%s", moduleId.orgName(), moduleId.moduleName(), symbolName);
        }
    }

    private List<String> getTypeRefs(Object type, TypeSymbol typeDescriptor) {
        return type instanceof String ? TypeUtils.getTypeRefIds(typeDescriptor, moduleInfo) : List.of();
    }

    /**
     * Recursively resolves the import statements required to reference the given {@link TypeSymbol} in the
     * generated source and registers them on the provided {@link AbstractBuilder}.
     *
     * <p>For {@code TYPE_REFERENCE} kinds every encountered type is stored unconditionally using the
     * canonical format {@code orgName/moduleName:version} (e.g. {@code ballerina/http:2.10.0}).
     * {@link io.ballerina.flowmodelgenerator.core.TypesManager#addImportsToTextEdits(Map, ModulePartNode,
     * List, Module)} is responsible
     * for filtering out same-package references and validating the format before emitting actual
     * {@code import} declarations.
     *
     * <p>Composite types ({@code ARRAY}, {@code MAP}, {@code STREAM}, {@code FUTURE}, {@code UNION},
     * {@code INTERSECTION}, {@code TABLE}, {@code TUPLE}, {@code ERROR}, {@code TYPEDESC}) are handled
     * by recursing into their constituent type parameters.
     *
     * @param typeSymbol the type symbol to inspect
     * @param builder    the builder on which to register discovered import statements
     */
    private void addRequiredImports(TypeSymbol typeSymbol, AbstractBuilder builder) {
        switch (typeSymbol.typeKind()) {
            case TYPE_REFERENCE -> {
                Optional<ModuleSymbol> moduleSymbol = typeSymbol.getModule();
                if (typeSymbol.getName().isEmpty() || moduleSymbol.isEmpty()) {
                    return;  // anonymous type
                }
                ModuleID moduleId = moduleSymbol.get().id();
                builder.addImport(moduleId.modulePrefix(),
                        String.format("%s/%s:%s", moduleId.orgName(), moduleId.moduleName(), moduleId.version()));
            }
            case ARRAY -> addRequiredImports(((ArrayTypeSymbol) typeSymbol).memberTypeDescriptor(), builder);
            case MAP -> addRequiredImports(((MapTypeSymbol) typeSymbol).typeParam(), builder);
            case STREAM -> addRequiredImports(((StreamTypeSymbol) typeSymbol).typeParameter(), builder);
            case FUTURE -> ((FutureTypeSymbol) typeSymbol).typeParameter()
                    .ifPresent(t -> addRequiredImports(t, builder));
            case UNION -> ((UnionTypeSymbol) typeSymbol).userSpecifiedMemberTypes()
                    .forEach(t -> addRequiredImports(t, builder));
            case INTERSECTION -> ((IntersectionTypeSymbol) typeSymbol).memberTypeDescriptors()
                    .forEach(t -> addRequiredImports(t, builder));
            case TABLE -> {
                addRequiredImports(((TableTypeSymbol) typeSymbol).rowTypeParameter(), builder);
                ((TableTypeSymbol) typeSymbol).keyConstraintTypeParameter()
                        .ifPresent(t -> addRequiredImports(t, builder));
            }
            case TUPLE -> {
                ((TupleTypeSymbol) typeSymbol).memberTypeDescriptors()
                        .forEach(t -> addRequiredImports(t, builder));
                ((TupleTypeSymbol) typeSymbol).restTypeDescriptor()
                        .ifPresent(t -> addRequiredImports(t, builder));
            }
            case ERROR -> {
                TypeSymbol detailType = ((ErrorTypeSymbol) typeSymbol).detailTypeDescriptor();
                if (detailType != null) {
                    addRequiredImports(detailType, builder);
                }
            }
            case TYPEDESC -> ((TypeDescTypeSymbol) typeSymbol).typeParameter()
                    .ifPresent(t -> addRequiredImports(t, builder));
            default -> { }
        }
    }

    private Object handleAsFirstClassNonIntersectionType(IntersectionTypeSymbol intersectionTypeSymbol,
                                                         TypeData.TypeDataBuilder typeDataBuilder) {
        TypeSymbol nonReadonlyTypeSymbol = null;
        List<TypeSymbol> intersectionMemberTypes = intersectionTypeSymbol.memberTypeDescriptors();

        // Check for non-readonly type members to treat the type as a first-class non-intersection type
        for (TypeSymbol typeSymbol : intersectionMemberTypes) {
            if (typeSymbol.typeKind() == TypeDescKind.READONLY) {
                continue;
            }

            if (typeSymbol.typeKind() == TypeDescKind.INTERSECTION) {
                // If a member type is an intersection type, we don't handle it as a first-class non-intersection type
                return transform(intersectionTypeSymbol, typeDataBuilder);
            }

            if (nonReadonlyTypeSymbol == null) {
                nonReadonlyTypeSymbol = typeSymbol;
            } else {
                // If there are multiple non-readonly types,
                // we handle the intersection type as a first-class intersection type
                return transform(intersectionTypeSymbol, typeDataBuilder);
            }
        }

        if (nonReadonlyTypeSymbol == null || nonReadonlyTypeSymbol.typeKind() == TypeDescKind.TYPE_REFERENCE) {
            // If no non-readonly type is found or the found non-readonly type is a type-reference type,
            // we treat it as a first-class intersection type
            return transform(intersectionTypeSymbol, typeDataBuilder);
        }

        // If a non-readonly type is found, we treat it as a first-class non-intersection type with readonly flag on
        typeDataBuilder.properties().isReadOnly(true, true, true, false);
        return transform(nonReadonlyTypeSymbol, typeDataBuilder);
    }

    private String getNetworkQualifier(List<Qualifier> qualifiers) {
        return qualifiers.contains(Qualifier.SERVICE)
                ? Qualifier.SERVICE.getValue()
                : (qualifiers.contains(Qualifier.CLIENT) ? Qualifier.CLIENT.getValue() : "");
    }
}
