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

package io.ballerina.servicemodelgenerator.extension.util;

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.AnnotationSymbol;
import io.ballerina.compiler.api.symbols.ModuleSymbol;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.syntax.tree.AssignmentStatementNode;
import io.ballerina.compiler.syntax.tree.ClassDefinitionNode;
import io.ballerina.compiler.syntax.tree.DefaultableParameterNode;
import io.ballerina.compiler.syntax.tree.FunctionBodyBlockNode;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.FunctionSignatureNode;
import io.ballerina.compiler.syntax.tree.ImportDeclarationNode;
import io.ballerina.compiler.syntax.tree.IncludedRecordParameterNode;
import io.ballerina.compiler.syntax.tree.MarkdownDocumentationLineNode;
import io.ballerina.compiler.syntax.tree.MarkdownDocumentationNode;
import io.ballerina.compiler.syntax.tree.MetadataNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NodeList;
import io.ballerina.compiler.syntax.tree.ObjectFieldNode;
import io.ballerina.compiler.syntax.tree.ParameterNode;
import io.ballerina.compiler.syntax.tree.RequiredParameterNode;
import io.ballerina.compiler.syntax.tree.ReturnTypeDescriptorNode;
import io.ballerina.compiler.syntax.tree.SeparatedNodeList;
import io.ballerina.compiler.syntax.tree.StatementNode;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.compiler.syntax.tree.Token;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.servicemodelgenerator.extension.builder.function.GraphqlFunctionBuilder;
import io.ballerina.servicemodelgenerator.extension.model.Codedata;
import io.ballerina.servicemodelgenerator.extension.model.Field;
import io.ballerina.servicemodelgenerator.extension.model.Function;
import io.ballerina.servicemodelgenerator.extension.model.FunctionReturnType;
import io.ballerina.servicemodelgenerator.extension.model.MetaData;
import io.ballerina.servicemodelgenerator.extension.model.Parameter;
import io.ballerina.servicemodelgenerator.extension.model.PropertyType;
import io.ballerina.servicemodelgenerator.extension.model.PropertyTypeMemberInfo;
import io.ballerina.servicemodelgenerator.extension.model.ServiceClass;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import io.ballerina.servicemodelgenerator.extension.model.context.ModelFromSourceContext;
import io.ballerina.tools.text.LinePosition;
import io.ballerina.tools.text.LineRange;
import io.ballerina.tools.text.TextDocument;
import org.eclipse.lsp4j.TextEdit;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import static io.ballerina.servicemodelgenerator.extension.builder.function.GraphqlFunctionBuilder.getGraphqlParameterModel;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.ANNOT_PREFIX;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.COLON;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.FUNCTION_NAME_METADATA;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.FUNCTION_RETURN_TYPE_METADATA;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.GRAPHQL;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.GRAPHQL_CLASS_NAME_METADATA;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.NEW_LINE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.RESOURCE_CONFIG;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.SERCVICE_CLASS_NAME_METADATA;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.TAB;
import static io.ballerina.servicemodelgenerator.extension.util.ServiceModelUtils.getServiceDocumentation;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.getDocumentationEdits;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.updateFunctionDocs;

/**
 * Util class for service class related operations.
 *
 * @since 1.0.0
 */
public class ServiceClassUtil {

    public static String buildObjectFiledString(Field field) {
        StringBuilder builder = new StringBuilder();
        if (field.isPrivate()) {
            builder.append("private ");
        }
        if (field.isFinal()) {
            builder.append("final ");
        }
        builder.append(field.getType().getValue()).append(" ").append(field.getName().getValue());
        if (Objects.nonNull(field.getDefaultValue().getValue()) && !field.getDefaultValue().getValue().isEmpty()) {
            builder.append(" = ").append(field.getDefaultValue().getValue());
        }
        builder.append(";");
        return builder.toString();
    }

    public static List<TextEdit> buildAddInitParameterEdits(ClassDefinitionNode classDef, Field field,
                                                            TextDocument textDocument,
                                                            ModulePartNode modulePartNode) {
        List<TextEdit> edits = new ArrayList<>(buildTypeImportEdits(modulePartNode, field));
        String memberIndent = detectMemberIndent(classDef, textDocument);
        String name = field.getName().getValue();
        String paramStr = buildParameterString(field);
        String assignment = "self." + name + " = " + name + ";";
        Optional<FunctionDefinitionNode> initFn = findInitFunction(classDef);

        StringBuilder header = new StringBuilder(NEW_LINE).append(memberIndent).append(buildInjectedFieldString(field));
        if (initFn.isEmpty()) {
            header.append(NEW_LINE).append(NEW_LINE).append(memberIndent)
                    .append("public function init(").append(paramStr).append(") returns error? {")
                    .append(NEW_LINE).append(memberIndent).append(memberIndent).append(assignment)
                    .append(NEW_LINE).append(memberIndent).append("}");
        }
        edits.add(new TextEdit(Utils.toRange(classDef.openBrace().lineRange().endLine()), header.toString()));

        if (initFn.isPresent()) {
            FunctionDefinitionNode init = initFn.get();
            edits.add(buildAddParameterEdit(init.functionSignature(), paramStr, hasDefaultValue(field)));
            if (init.functionBody() instanceof FunctionBodyBlockNode body) {
                edits.add(new TextEdit(Utils.toRange(body.openBraceToken().lineRange().endLine()),
                        NEW_LINE + memberIndent + memberIndent + assignment));
            }
        }
        return edits;
    }

    private static List<TextEdit> buildTypeImportEdits(ModulePartNode modulePartNode, Field field) {
        Map<String, String> imports = field.getType() == null ? null : field.getType().getImports();
        if (imports == null || imports.isEmpty()) {
            return List.of();
        }
        List<ImportDeclarationNode> existing = modulePartNode.imports().stream().toList();
        Map<String, String> moduleToPrefix = new HashMap<>();
        Set<String> usedPrefixes = new HashSet<>();
        for (ImportDeclarationNode imp : existing) {
            String prefix = importPrefix(imp);
            moduleToPrefix.put(importModuleId(imp), prefix);
            usedPrefixes.add(prefix);
        }

        List<TextEdit> importEdits = new ArrayList<>();
        String typeValue = field.getType().getValue();
        for (Map.Entry<String, String> entry : imports.entrySet()) {
            String requestedPrefix = entry.getKey();
            String moduleId = entry.getValue();
            String naturalPrefix = defaultPrefix(moduleId);
            String effectivePrefix;
            if (moduleToPrefix.containsKey(moduleId)) {
                effectivePrefix = moduleToPrefix.get(moduleId);
            } else {
                effectivePrefix = naturalPrefix;
                for (int n = 2; usedPrefixes.contains(effectivePrefix); n++) {
                    effectivePrefix = naturalPrefix + n;
                }
                usedPrefixes.add(effectivePrefix);
                String stmt = "import " + moduleId
                        + (effectivePrefix.equals(naturalPrefix) ? "" : " as " + effectivePrefix) + ";";
                importEdits.add(importTextEdit(modulePartNode, existing, stmt));
            }
            if (!effectivePrefix.equals(requestedPrefix) && typeValue.startsWith(requestedPrefix + COLON)) {
                typeValue = effectivePrefix + typeValue.substring(requestedPrefix.length());
            }
        }
        field.getType().setValue(typeValue);
        return importEdits;
    }

    private static TextEdit importTextEdit(ModulePartNode modulePartNode, List<ImportDeclarationNode> existing,
                                           String stmt) {
        if (existing.isEmpty()) {
            return new TextEdit(Utils.toRange(modulePartNode.lineRange().startLine()), stmt + NEW_LINE);
        }
        return new TextEdit(Utils.toRange(existing.getLast().lineRange().endLine()), NEW_LINE + stmt);
    }

    private static String importModuleId(ImportDeclarationNode imp) {
        String org = imp.orgName().map(o -> o.orgName().text().trim()).orElse("");
        String module = imp.moduleName().stream().map(t -> t.text().trim()).collect(Collectors.joining("."));
        return org.isEmpty() ? module : org + "/" + module;
    }

    private static String importPrefix(ImportDeclarationNode imp) {
        if (imp.prefix().isPresent()) {
            return imp.prefix().get().prefix().text().trim();
        }
        List<String> segments = imp.moduleName().stream().map(t -> t.text().trim()).toList();
        return segments.get(segments.size() - 1);
    }

    private static String defaultPrefix(String moduleId) {
        String module = moduleId.contains("/") ? moduleId.substring(moduleId.indexOf('/') + 1) : moduleId;
        return module.contains(".") ? module.substring(module.lastIndexOf('.') + 1) : module;
    }

    public static List<TextEdit> buildUpdateInitParameterEdits(ObjectFieldNode fieldNode, Field field) {
        List<TextEdit> edits = new ArrayList<>();
        String oldName = fieldNode.fieldName().text().trim();
        String newName = field.getName().getValue();
        edits.add(new TextEdit(Utils.toRange(fieldNode.lineRange()), buildInjectedFieldString(field)));

        if (!(fieldNode.parent() instanceof ClassDefinitionNode classDef)) {
            return edits;
        }
        Optional<FunctionDefinitionNode> initFn = findInitFunction(classDef);
        if (initFn.isEmpty()) {
            return edits;
        }
        FunctionDefinitionNode init = initFn.get();
        for (ParameterNode param : init.functionSignature().parameters()) {
            if (oldName.equals(getParameterName(param))) {
                edits.add(new TextEdit(Utils.toRange(param.lineRange()), buildParameterString(field)));
                break;
            }
        }
        if (init.functionBody() instanceof FunctionBodyBlockNode body) {
            for (StatementNode stmt : body.statements()) {
                if (stmt instanceof AssignmentStatementNode asn
                        && asn.varRef().toSourceCode().trim().equals("self." + oldName)
                        && asn.expression().toSourceCode().trim().equals(oldName)) {
                    edits.add(new TextEdit(Utils.toRange(stmt.lineRange()),
                            "self." + newName + " = " + newName + ";"));
                    break;
                }
            }
        }
        return edits;
    }

    public static List<TextEdit> buildRemoveInitParameterEdits(ObjectFieldNode fieldNode, TextDocument textDocument) {
        List<TextEdit> edits = new ArrayList<>();
        String name = fieldNode.fieldName().text().trim();
        edits.add(removeLineEdit(fieldNode.lineRange(), textDocument));

        if (!(fieldNode.parent() instanceof ClassDefinitionNode classDef)) {
            return edits;
        }
        Optional<FunctionDefinitionNode> initFn = findInitFunction(classDef);
        if (initFn.isEmpty()) {
            return edits;
        }
        FunctionDefinitionNode init = initFn.get();
        buildRemoveParameterEdit(init.functionSignature(), name).ifPresent(edits::add);
        if (init.functionBody() instanceof FunctionBodyBlockNode body) {
            for (StatementNode stmt : body.statements()) {
                if (stmt instanceof AssignmentStatementNode asn
                        && asn.varRef().toSourceCode().trim().equals("self." + name)) {
                    edits.add(removeLineEdit(stmt.lineRange(), textDocument));
                    break;
                }
            }
        }
        return edits;
    }

    private static Optional<FunctionDefinitionNode> findInitFunction(ClassDefinitionNode classDef) {
        for (Node member : classDef.members()) {
            if (member instanceof FunctionDefinitionNode fn && fn.functionName().text().trim().equals("init")) {
                return Optional.of(fn);
            }
        }
        return Optional.empty();
    }

    private static String buildInjectedFieldString(Field field) {
        return "private final " + field.getType().getValue() + " " + field.getName().getValue() + ";";
    }

    private static boolean hasDefaultValue(Field field) {
        Value defaultValue = field.getDefaultValue();
        return Objects.nonNull(defaultValue) && Objects.nonNull(defaultValue.getValue())
                && !defaultValue.getValue().isEmpty();
    }

    private static String buildParameterString(Field field) {
        String base = field.getType().getValue() + " " + field.getName().getValue();
        if (hasDefaultValue(field)) {
            return base + " = " + field.getDefaultValue().getValue();
        }
        return base;
    }

    private static TextEdit buildAddParameterEdit(FunctionSignatureNode signature, String paramStr,
                                                  boolean hasDefault) {
        SeparatedNodeList<ParameterNode> params = signature.parameters();
        if (params.isEmpty()) {
            return new TextEdit(Utils.toRange(signature.openParenToken().lineRange().endLine()), paramStr);
        }
        int insertIndex = IntStream.range(0, params.size())
                .filter(i -> mustFollowNewParam(params.get(i).kind(), hasDefault))
                .findFirst()
                .orElse(params.size());
        if (insertIndex == params.size()) {
            ParameterNode last = params.get(params.size() - 1);
            return new TextEdit(Utils.toRange(last.lineRange().endLine()), ", " + paramStr);
        }
        LinePosition before = params.get(insertIndex).lineRange().startLine();
        return new TextEdit(Utils.toRange(before), paramStr + ", ");
    }

    private static boolean mustFollowNewParam(SyntaxKind existingKind, boolean newHasDefault) {
        return existingKind == SyntaxKind.REST_PARAM
                || (!newHasDefault && existingKind == SyntaxKind.DEFAULTABLE_PARAM);
    }

    private static Optional<TextEdit> buildRemoveParameterEdit(FunctionSignatureNode signature, String name) {
        SeparatedNodeList<ParameterNode> params = signature.parameters();
        for (int i = 0; i < params.size(); i++) {
            if (!name.equals(getParameterName(params.get(i)))) {
                continue;
            }
            LinePosition start;
            LinePosition end;
            if (params.size() == 1) {
                start = params.get(i).lineRange().startLine();
                end = params.get(i).lineRange().endLine();
            } else if (i == 0) {
                start = params.get(0).lineRange().startLine();
                end = params.getSeparator(0).lineRange().endLine();
            } else {
                start = params.getSeparator(i - 1).lineRange().startLine();
                end = params.get(i).lineRange().endLine();
            }
            LineRange range = LineRange.from(signature.lineRange().fileName(), start, end);
            return Optional.of(new TextEdit(Utils.toRange(range), ""));
        }
        return Optional.empty();
    }

    private static String getParameterName(ParameterNode param) {
        return switch (param.kind()) {
            case REQUIRED_PARAM -> ((RequiredParameterNode) param).paramName().map(t -> t.text().trim()).orElse("");
            case DEFAULTABLE_PARAM ->
                    ((DefaultableParameterNode) param).paramName().map(t -> t.text().trim()).orElse("");
            case INCLUDED_RECORD_PARAM ->
                    ((IncludedRecordParameterNode) param).paramName().map(t -> t.text().trim()).orElse("");
            default -> "";
        };
    }

    private static TextEdit removeLineEdit(LineRange range, TextDocument textDocument) {
        LinePosition start = LinePosition.from(range.startLine().line(), 0);
        LinePosition end = LinePosition.from(range.endLine().line() + 1, 0);
        return new TextEdit(Utils.toRange(LineRange.from(range.fileName(), start, end)), "");
    }

    private static String detectMemberIndent(ClassDefinitionNode classDef, TextDocument textDocument) {
        NodeList<Node> members = classDef.members();
        if (!members.isEmpty()) {
            String line = textDocument.line(members.get(0).lineRange().startLine().line()).text();
            int i = 0;
            while (i < line.length() && (line.charAt(i) == ' ' || line.charAt(i) == '\t')) {
                i++;
            }
            if (i > 0) {
                return line.substring(0, i);
            }
        }
        return TAB;
    }

    public static ServiceClass getServiceClass(SemanticModel semanticModel, ClassDefinitionNode classDef,
                                               ServiceClassContext context) {
        ServiceClass.ServiceClassBuilder builder = new ServiceClass.ServiceClassBuilder();

        List<Function> functions = new ArrayList<>();
        List<Field> fields = new ArrayList<>();
        populateFunctionsAndFields(semanticModel, classDef, functions, fields, context);

        builder.name(classDef.className().text().trim())
                .type(getClassType(classDef))
                .documentation(addServiceClassDoc(classDef, context))
                .properties(Map.of("name", buildClassNameProperty(classDef.className().text().trim(),
                        classDef.className().lineRange(), context)))
                .codedata(new Codedata(classDef.lineRange()))
                .functions(functions)
                .fields(fields);

        return builder.build();
    }

    private static String getClassType(ClassDefinitionNode classDef) {
        if (classDef.classTypeQualifiers().isEmpty()) {
            return Constants.CLASS_TYPE_DEFAULT;
        }
        return classDef.classTypeQualifiers().get(0).text().trim();
    }

    private static Value buildClassNameProperty(String className, LineRange lineRange, ServiceClassContext context) {
        MetaData metaData = context == ServiceClassContext.TYPE_DIAGRAM ? SERCVICE_CLASS_NAME_METADATA
                : GRAPHQL_CLASS_NAME_METADATA;

        return new Value.ValueBuilder()
                .metadata(metaData.label(), metaData.description())
                .types(List.of(PropertyType.types(Value.FieldType.IDENTIFIER)))
                .value(className)
                .enabled(true)
                .setCodedata(new Codedata(lineRange))
                .setImports(new HashMap<>())
                .build();
    }

    private static void populateFunctionsAndFields(SemanticModel semanticModel, ClassDefinitionNode classDef,
                                                   List<Function> functions,
                                                   List<Field> fields, ServiceClassContext context) {
        classDef.members().forEach(member -> {
            if (member instanceof FunctionDefinitionNode functionDefinitionNode) {
                FunctionKind functionKind = getFunctionKind(functionDefinitionNode);
                if (context.equals(ServiceClassContext.GRAPHQL_DIAGRAM)) {
                    if (!functionKind.equals(FunctionKind.RESOURCE)) {
                        return;
                    }
                    GraphqlFunctionBuilder gqlFunctionBuilder = new GraphqlFunctionBuilder();
                    ModelFromSourceContext gqlContext = new ModelFromSourceContext(functionDefinitionNode,
                            null, semanticModel, null, "", Constants.GRAPHQL,
                            null, null, GRAPHQL, null);
                    functions.add(gqlFunctionBuilder.getModelFromSource(gqlContext));
                } else {
                    functions.add(buildMemberFunction(semanticModel, functionDefinitionNode, functionKind, context));
                }
            } else if (context == ServiceClassContext.TYPE_DIAGRAM
                    && member instanceof ObjectFieldNode objectFieldNode) {
                fields.add(buildClassField(objectFieldNode));
            }
        });
    }

    private static Function buildMemberFunction(SemanticModel semanticModel, FunctionDefinitionNode functionDef,
                                                FunctionKind kind, ServiceClassContext context) {
        Function functionModel = Function.getNewFunctionModel(context);
        updateMetadata(functionModel, kind);
        functionModel.setKind(kind.name());
        buildAnnotation(semanticModel, functionDef, functionModel);
        if (kind == FunctionKind.INIT) {
            functionModel.getName().setMetadata(FUNCTION_NAME_METADATA);
            functionModel.getReturnType().setMetadata(FUNCTION_RETURN_TYPE_METADATA);
        }

        if (kind.equals(FunctionKind.RESOURCE)) {
            functionModel.getAccessor().setValue(functionDef.functionName().text().trim());
            setFunctionNameAndLineRange(functionModel.getName(), Utils.getPath(functionDef.relativeResourcePath()),
                    functionDef.functionName().lineRange());
        } else {
            setFunctionNameAndLineRange(functionModel.getName(), functionDef.functionName().text().trim(),
                    functionDef.functionName().lineRange());
        }

        FunctionSignatureNode functionSignatureNode = functionDef.functionSignature();
        Optional<ReturnTypeDescriptorNode> returnTypeDesc = functionSignatureNode.returnTypeDesc();
        if (returnTypeDesc.isPresent()) {
            FunctionReturnType returnType = functionModel.getReturnType();
            if (Objects.nonNull(returnType)) {
                returnType.setValue(returnTypeDesc.get().type().toString().trim());
                returnType.setTypes(List.of(PropertyType.types(Value.FieldType.TYPE)));
                returnType.setEnabled(true);
                returnType.setEditable(true);
                returnType.setOptional(true);
            }
        }
        SeparatedNodeList<ParameterNode> parameters = functionSignatureNode.parameters();
        List<Parameter> parameterModels = new ArrayList<>();
        parameters.forEach(parameterNode -> {
            Optional<Parameter> parameterModel = context == ServiceClassContext.GRAPHQL_DIAGRAM ?
                    getGraphqlParameterModel(parameterNode, semanticModel) :
                    Utils.getParameterModel(parameterNode);
            parameterModel.ifPresent(parameterModels::add);
        });
        functionModel.setParameters(parameterModels);
        functionModel.setEditable(true);
        functionModel.setCodedata(new Codedata(functionDef.lineRange()));
        updateFunctionDocs(functionDef, functionModel);
        return functionModel;
    }

    private static Field buildClassField(ObjectFieldNode objectField) {
        Parameter parameterModel = Parameter.getNewField();
        Value type = parameterModel.getType();
        type.setValue(objectField.typeName().toSourceCode().trim());
        type.setTypes(List.of(PropertyType.types(Value.FieldType.TYPE)));
        type.setEnabled(true);
        Value name = parameterModel.getName();
        name.setValue(objectField.fieldName().text().trim());
        name.setTypes(List.of(PropertyType.types(Value.FieldType.IDENTIFIER)));
        name.setEnabled(true);
        name.setEditable(false);
        name.setCodedata(new Codedata(objectField.fieldName().lineRange()));
        parameterModel.setEnabled(true);
        if (objectField.expression().isPresent()) {
            Value defaultValue = parameterModel.getDefaultValue();
            defaultValue.setValue(objectField.expression().get().toString().trim());
            defaultValue.setTypes(List.of(PropertyType.types(Value.FieldType.EXPRESSION)));
            defaultValue.setEnabled(true);
        }

        boolean isPrivate = objectField.visibilityQualifier().isPresent()
                && objectField.visibilityQualifier().get().text().trim().equals("private");
        boolean isFinal = objectField.qualifierList().stream()
                .anyMatch(qualifier -> qualifier.text().trim().equals("final"));

        return new Field(parameterModel, isPrivate, isFinal, new Codedata(objectField.lineRange()));
    }

    private static FunctionKind getFunctionKind(FunctionDefinitionNode functionDefinitionNode) {
        for (Token qualifier : functionDefinitionNode.qualifierList()) {
            if (qualifier.text().trim().matches(Constants.REMOTE)) {
                return FunctionKind.REMOTE;
            } else if (qualifier.text().trim().matches(Constants.RESOURCE)) {
                return FunctionKind.RESOURCE;
            }
        }
        if (functionDefinitionNode.functionName().text().trim().equals(Constants.INIT)) {
            return FunctionKind.INIT;
        }
        return FunctionKind.DEFAULT;
    }

    private static void setFunctionNameAndLineRange(Value value, String functionName, LineRange lineRange) {
        value.setValue(functionName);
        value.setCodedata(new Codedata(lineRange));
    }

    private static void updateMetadata(Function function, FunctionKind kind) {
        switch (kind) {
            case INIT -> function.setMetadata(new MetaData("Init Method", "Init Method"));
            case REMOTE -> function.setMetadata(new MetaData("Remote Method", "Remote Method"));
            case RESOURCE -> function.setMetadata(new MetaData("Resource Method", "Resource Method"));
            case DEFAULT -> function.setMetadata(new MetaData("Object Method", "Object Method"));
        }
    }

    private static void buildAnnotation(SemanticModel semanticModel, FunctionDefinitionNode functionDef,
                                        Function function) {
        Optional<MetadataNode> metadata = functionDef.metadata();
        if (metadata.isEmpty()) {
            return;
        }

        metadata.get().annotations().forEach(annotationNode -> {
            if (annotationNode.annotValue().isEmpty()) {
                return;
            }

            String annotName = annotationNode.annotReference().toString().trim();
            String[] split = annotName.split(COLON);
            annotName = split[split.length - 1];
            String propertyName = ANNOT_PREFIX + annotName;
            if (function.getProperties().containsKey(propertyName)) {
                Value property = function.getProperties().get(propertyName);
                Optional<Symbol> symbol = semanticModel.symbol(annotationNode);
                if (symbol.orElse(null) instanceof AnnotationSymbol annotSymbol) {
                    Optional<ModuleSymbol> module = annotSymbol.getModule();
                    if (module.isPresent() && annotSymbol.typeDescriptor().isPresent()) {
                        String moduleName = module.get().id().moduleName();
                        String moduleOrg = module.get().id().orgName();
                        String packageName = module.get().id().packageName();
                        property.getCodedata().setModuleName(moduleName);
                        property.getCodedata().setOrgName(moduleOrg);
                        String type = annotSymbol.typeDescriptor().get().getName().orElse(RESOURCE_CONFIG);
                        property.getTypes().getFirst().typeMembers().add(new PropertyTypeMemberInfo(type,
                                String.join(COLON, moduleOrg, moduleName, module.get().id().version()),
                                packageName, "RECORD_TYPE", false));
                    }
                }
                property.setValue(annotationNode.annotValue().get().toSourceCode().trim());
                property.setEnabled(true);
            }
        });
    }

    public static String getTcpConnectionServiceTemplate() {
        return "%n" +
                "service class %s {%n" +
                "    *tcp:ConnectionService;%n" +
                "%n" +
                "    remote function onBytes(tcp:Caller caller, readonly & byte[] data) returns tcp:Error? {%n" +
                "        do {%n" +
                "%n" +
                "        } on fail error err {%n" +
                "            // handle error%n" +
                "            return error(\"unhandled error\", err);%n" +
                "        }%n" +
                "    }%n" +
                "%n" +
                "    remote function onError(tcp:Error tcpError) returns tcp:Error? {%n" +
                "        do {%n" +
                "%n" +
                "        } on fail error err {%n" +
                "            // handle error%n" +
                "            return error(\"unhandled error\", err);%n" +
                "        }%n" +
                "    }%n" +
                "%n" +
                "    remote function onClose() returns tcp:Error? {%n" +
                "        do {%n" +
                "%n" +
                "        } on fail error err {%n" +
                "            // handle error%n" +
                "            return error(\"unhandled error\", err);%n" +
                "        }%n" +
                "    }%n" +
                "}%n%n";
    }

    public static void addServiceClassDocTextEdits(ServiceClass serviceClass, ClassDefinitionNode classDef,
                                                   List<TextEdit> edits) {
        String docEdit = getDocumentationEdits(serviceClass);
        Optional<MetadataNode> metadata = classDef.metadata();
        if (metadata.isEmpty()) { // metadata is empty and the service has documentation
            if (!docEdit.isEmpty()) {
                docEdit += NEW_LINE;
                edits.add(new TextEdit(Utils.toRange(classDef.lineRange().startLine()), docEdit));
            }
            return;
        }

        Optional<Node> documentationString = metadata.get().documentationString();
        if (documentationString.isEmpty()) { // metadata is present but no documentation
            if (!docEdit.isEmpty()) {
                docEdit += NEW_LINE;
                edits.add(new TextEdit(Utils.toRange(metadata.get().lineRange()), docEdit));
            }
            return;
        }

        LinePosition docStartLinePos = documentationString.get().lineRange().startLine();
        LinePosition docEndLinePos = documentationString.get().lineRange().endLine();
        LineRange range = LineRange.from(classDef.lineRange().fileName(), docStartLinePos, docEndLinePos);
        edits.add(new TextEdit(Utils.toRange(range), docEdit));
    }

    public static Value addServiceClassDoc(ClassDefinitionNode classDef, ServiceClassContext context) {
        Value serviceClassDoc = getServiceDocumentation(context);
        Optional<MetadataNode> metadata = classDef.metadata();
        if (metadata.isEmpty()) {
            return serviceClassDoc;
        }
        Optional<Node> docString = metadata.get().documentationString();
        if (docString.isEmpty() || docString.get().kind() != SyntaxKind.MARKDOWN_DOCUMENTATION) {
            return serviceClassDoc;
        }
        MarkdownDocumentationNode docNode = (MarkdownDocumentationNode) docString.get();
        StringBuilder serviceDoc = new StringBuilder();
        for (Node documentationLine : docNode.documentationLines()) {
            if (CommonUtils.isMarkdownDocumentationLine(documentationLine)) {
                NodeList<Node> nodes = ((MarkdownDocumentationLineNode) documentationLine).documentElements();
                nodes.stream().forEach(node -> serviceDoc.append(node.toSourceCode()));
            }
        }
        serviceClassDoc.setValue(serviceDoc.toString().stripTrailing());
        return serviceClassDoc;
    }

    public enum FunctionKind {
        INIT,
        REMOTE,
        RESOURCE,
        DEFAULT
    }

    public enum ServiceClassContext {
        TYPE_DIAGRAM,
        GRAPHQL_DIAGRAM,
        SERVICE_DIAGRAM,
        HTTP_DIAGRAM,
        CLASS
    }
}
