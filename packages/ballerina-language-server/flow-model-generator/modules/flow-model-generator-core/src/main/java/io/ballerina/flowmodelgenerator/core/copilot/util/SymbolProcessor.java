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

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.AnnotationAttachPoint;
import io.ballerina.compiler.api.symbols.AnnotationSymbol;
import io.ballerina.compiler.api.symbols.ClassSymbol;
import io.ballerina.compiler.api.symbols.ConstantSymbol;
import io.ballerina.compiler.api.symbols.Documentation;
import io.ballerina.compiler.api.symbols.FunctionSymbol;
import io.ballerina.compiler.api.symbols.FunctionTypeSymbol;
import io.ballerina.compiler.api.symbols.MethodSymbol;
import io.ballerina.compiler.api.symbols.ObjectTypeSymbol;
import io.ballerina.compiler.api.symbols.ParameterSymbol;
import io.ballerina.compiler.api.symbols.Qualifier;
import io.ballerina.compiler.api.symbols.RecordFieldSymbol;
import io.ballerina.compiler.api.symbols.RecordTypeSymbol;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.SymbolKind;
import io.ballerina.compiler.api.symbols.TypeDefinitionSymbol;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.api.values.ConstantValue;
import io.ballerina.flowmodelgenerator.core.copilot.builder.TypeDefDataBuilder;
import io.ballerina.flowmodelgenerator.core.copilot.model.Annotation;
import io.ballerina.flowmodelgenerator.core.copilot.model.AnnotationAttachment;
import io.ballerina.flowmodelgenerator.core.copilot.model.Client;
import io.ballerina.flowmodelgenerator.core.copilot.model.Field;
import io.ballerina.flowmodelgenerator.core.copilot.model.LibraryFunction;
import io.ballerina.flowmodelgenerator.core.copilot.model.Parameter;
import io.ballerina.flowmodelgenerator.core.copilot.model.Type;
import io.ballerina.flowmodelgenerator.core.copilot.model.TypeDef;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.FunctionData;
import io.ballerina.modelgenerator.commons.FunctionDataBuilder;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.TypeDefData;
import io.ballerina.projects.Package;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static io.ballerina.flowmodelgenerator.core.copilot.util.LibraryModelConverter.functionDataToModel;
import static io.ballerina.flowmodelgenerator.core.copilot.util.LibraryModelConverter.initMethodToModel;
import static io.ballerina.flowmodelgenerator.core.copilot.util.LibraryModelConverter.typeDefDataToModel;
import static io.ballerina.flowmodelgenerator.core.copilot.util.LibraryModelConverter.typeSymbolToModel;

/**
 * Processes module symbols and extracts structured data (clients, functions, typedefs).
 *
 * @since 1.7.0
 */
public class SymbolProcessor {

    private SymbolProcessor() {
        // Prevent instantiation
    }

    /**
     * Result class to hold processed symbols.
     */
    public static class SymbolProcessingResult {
        private final List<Client> clients;
        private final List<LibraryFunction> functions;
        private final List<TypeDef> typeDefs;
        private final List<Annotation> annotations;

        public SymbolProcessingResult() {
            this.clients = new ArrayList<>();
            this.functions = new ArrayList<>();
            this.typeDefs = new ArrayList<>();
            this.annotations = new ArrayList<>();
        }

        public List<Client> getClients() {
            return clients;
        }

        public List<LibraryFunction> getFunctions() {
            return functions;
        }

        public List<TypeDef> getTypeDefs() {
            return typeDefs;
        }

        public List<Annotation> getAnnotations() {
            return annotations;
        }
    }

    /**
     * Processes module symbols and returns structured result with extracted data.
     *
     * @param semanticModel the semantic model containing the symbols
     * @param moduleInfo    the module information
     * @param org           the organization name
     * @param packageName   the package name
     * @return SymbolProcessingResult containing clients, functions, and typedefs
     */
    public static SymbolProcessingResult processModuleSymbols(SemanticModel semanticModel,
                                                              ModuleInfo moduleInfo,
                                                              String org,
                                                              String packageName,
                                                              Package pkg) {
        SymbolProcessingResult result = new SymbolProcessingResult();

        for (Symbol symbol : semanticModel.moduleSymbols()) {
            if (symbol instanceof ClassSymbol classSymbol) {
                processClassSymbol(classSymbol, semanticModel, moduleInfo, org, packageName, pkg, result);
            } else if (symbol instanceof FunctionSymbol functionSymbol) {
                processFunctionSymbol(functionSymbol, semanticModel, moduleInfo, org, packageName, pkg, result);
            } else if (symbol instanceof TypeDefinitionSymbol typeDefSymbol) {
                processTypeDefSymbol(typeDefSymbol, semanticModel, moduleInfo, org, packageName, pkg, result);
            } else if (symbol instanceof ConstantSymbol constantSymbol) {
                processConstantSymbol(constantSymbol, org, packageName, pkg, result);
            } else if (symbol instanceof AnnotationSymbol annotationSymbol) {
                processAnnotationSymbol(annotationSymbol, org, packageName, result);
            }
        }
        return result;
    }

    /**
     * Processes a CLASS symbol (client or regular class).
     */
    private static void processClassSymbol(ClassSymbol classSymbol,
                                           SemanticModel semanticModel,
                                           ModuleInfo moduleInfo,
                                           String org,
                                           String packageName,
                                           Package pkg,
                                           SymbolProcessingResult result) {
        // Process only PUBLIC classes: CLIENT classes (connectors) and normal classes
        if (!classSymbol.qualifiers().contains(Qualifier.PUBLIC)) {
            return;
        }

        boolean isClient = classSymbol.qualifiers().contains(Qualifier.CLIENT);
        String className = classSymbol.getName().orElse(isClient ? "Client" : "Class");

        FunctionData.Kind classKind = isClient ? FunctionData.Kind.CONNECTOR : FunctionData.Kind.CLASS_INIT;

        FunctionData classData = new FunctionDataBuilder()
                .semanticModel(semanticModel)
                .moduleInfo(moduleInfo)
                .name(className)
                .parentSymbol(classSymbol)
                .functionResultKind(classKind)
                .build();

        List<LibraryFunction> functions = new ArrayList<>();

        // Add the constructor/init function first
        LibraryFunction constructor = functionDataToModel(classData, org, packageName);
        classSymbol.initMethod().ifPresent(
                initMethod -> applyFunctionAnnotations(initMethod, constructor, org, packageName, pkg));
        initMethodToModel(classSymbol, constructor, org, packageName).ifPresent(functions::add);

        // Then add all other methods (remote functions, resource functions, etc.)
        List<FunctionData> classMethods = new FunctionDataBuilder()
                .semanticModel(semanticModel)
                .moduleInfo(moduleInfo)
                .parentSymbolType(className)
                .parentSymbol(classSymbol)
                .buildChildNodes();

        var methodSymbols = classSymbol.methods();

        for (FunctionData method : classMethods) {
            LibraryFunction methodFunc = functionDataToModel(method, org, packageName);

            MethodSymbol methodSymbol = methodSymbols.get(method.name());
            if (methodSymbol != null) {
                methodSymbol.documentation().ifPresent(doc -> {
                    String returnDesc = doc.returnDescription().orElse("");
                    if (!returnDesc.isEmpty() && methodFunc.getReturnInfo() != null) {
                        methodFunc.getReturnInfo().setDescription(returnDesc);
                    }
                });
                if (methodSymbol.deprecated()) {
                    methodFunc.setDeprecated(true);
                }
                applyFunctionAnnotations(methodSymbol, methodFunc, org, packageName, pkg);
            }

            functions.add(methodFunc);
        }

        boolean classDeprecated = classSymbol.deprecated();
        List<AnnotationAttachment> classAnnotations =
                AnnotationAttachmentExtractor.extract(classSymbol, org, packageName, pkg);
        if (isClient) {
            Client client = new Client(className, classData.description());
            client.setFunctions(functions);
            if (classDeprecated) {
                client.setDeprecated(true);
            }
            if (!classAnnotations.isEmpty()) {
                client.setAnnotations(classAnnotations);
            }
            result.getClients().add(client);
        } else {
            TypeDef typeDef = new TypeDef();
            typeDef.setName(className);
            // Without a category the renderer cannot dispatch and drops the definition entirely,
            // taking its already-extracted methods with it.
            typeDef.setType(TypeDefData.TypeCategory.CLASS.getValue());
            typeDef.setDescription(classData.description());
            typeDef.setFunctions(functions);
            if (classDeprecated) {
                typeDef.setDeprecated(true);
            }
            if (!classAnnotations.isEmpty()) {
                typeDef.setAnnotations(classAnnotations);
            }
            result.getTypeDefs().add(typeDef);
        }
    }

    /**
     * Processes a FUNCTION symbol (module-level function).
     */
    private static void processFunctionSymbol(FunctionSymbol functionSymbol,
                                              SemanticModel semanticModel,
                                              ModuleInfo moduleInfo,
                                              String org,
                                              String packageName,
                                              Package pkg,
                                              SymbolProcessingResult result) {
        if (!functionSymbol.qualifiers().contains(Qualifier.PUBLIC)) {
            return;
        }

        FunctionData functionData = new FunctionDataBuilder()
                .semanticModel(semanticModel)
                .moduleInfo(moduleInfo)
                .functionSymbol(functionSymbol)
                .build();

        LibraryFunction function = functionDataToModel(functionData, org, packageName);

        // Add return description from function symbol's documentation
        functionSymbol.documentation()
                .flatMap(Documentation::returnDescription)
                .ifPresent(returnDesc -> {
                    if (function.getReturnInfo() != null) {
                        function.getReturnInfo().setDescription(returnDesc);
                    }
                });

        if (functionSymbol.deprecated()) {
            function.setDeprecated(true);
        }

        applyFunctionAnnotations(functionSymbol, function, org, packageName, pkg);

        result.getFunctions().add(function);
    }

    /**
     * Processes a TYPE_DEFINITION symbol.
     */
    private static void processTypeDefSymbol(TypeDefinitionSymbol typeDefSymbol,
                                             SemanticModel semanticModel,
                                             ModuleInfo moduleInfo,
                                             String org,
                                             String packageName,
                                             Package pkg,
                                             SymbolProcessingResult result) {
        if (!typeDefSymbol.qualifiers().contains(Qualifier.PUBLIC)) {
            return;
        }

        TypeDefData typeDefData = TypeDefDataBuilder.buildFromTypeDefinition(typeDefSymbol);
        TypeDef typeDef = typeDefDataToModel(typeDefData, org, packageName);
        if (typeDefSymbol.deprecated()) {
            typeDef.setDeprecated(true);
        }
        markDeprecatedFields(typeDefSymbol, typeDef);
        applyObjectTypeMembers(typeDefSymbol, typeDef, semanticModel, moduleInfo, org, packageName, pkg);

        List<AnnotationAttachment> typeAnnotations =
                AnnotationAttachmentExtractor.extract(typeDefSymbol, org, packageName, pkg);
        if (!typeAnnotations.isEmpty()) {
            typeDef.setAnnotations(typeAnnotations);
        }
        applyFieldAnnotations(typeDefSymbol, typeDef, org, packageName, pkg);

        result.getTypeDefs().add(typeDef);
    }

    /**
     * Populates an object type definition's methods, and flags the {@code client} qualifier.
     *
     * <p>{@code TypeDefDataBuilder} categorises an object type as {@code CLASS} but only ever
     * extracts record fields, so an object type ({@code public type Client isolated client object
     * { ... }}) would otherwise reach the renderer with no members at all. A class declaration
     * ({@code public class Client { ... }}) is unaffected: it is a {@link ClassSymbol} and is
     * handled by {@link #processClassSymbol}.
     *
     * <p>Each method is built individually rather than through {@code buildChildNodes()}: that path
     * requires a {@code SymbolKind.CLASS} parent and rejects a plain object type. {@code build()}
     * defaults the function kind to {@code FUNCTION}, so the remote/resource kind is resolved here
     * and passed in explicitly — otherwise a remote method would render without its qualifier.
     * Visibility filtering mirrors {@code buildChildNodes()}: private methods are skipped, and a
     * plain method must be public.
     */
    private static void applyObjectTypeMembers(TypeDefinitionSymbol typeDefSymbol,
                                               TypeDef typeDef,
                                               SemanticModel semanticModel,
                                               ModuleInfo moduleInfo,
                                               String org,
                                               String packageName,
                                               Package pkg) {
        TypeSymbol rawType = CommonUtils.getRawType(typeDefSymbol.typeDescriptor());
        if (!(rawType instanceof ObjectTypeSymbol objectType)) {
            return;
        }
        if (objectType.qualifiers().contains(Qualifier.CLIENT)) {
            typeDef.setClient(true);
        }

        List<LibraryFunction> functions = new ArrayList<>();
        for (MethodSymbol methodSymbol : objectType.methods().values()) {
            List<Qualifier> qualifiers = methodSymbol.qualifiers();
            if (qualifiers.contains(Qualifier.PRIVATE)) {
                continue;
            }
            FunctionData.Kind kind = resolveMethodKind(methodSymbol);
            if (kind == FunctionData.Kind.FUNCTION && !qualifiers.contains(Qualifier.PUBLIC)) {
                continue;
            }
            FunctionData methodData;
            try {
                methodData = new FunctionDataBuilder()
                        .semanticModel(semanticModel)
                        .moduleInfo(moduleInfo)
                        .functionSymbol(methodSymbol)
                        .functionResultKind(kind)
                        .build();
            } catch (RuntimeException e) {
                // A member that cannot be modelled must not cost the whole type definition.
                continue;
            }
            LibraryFunction methodFunc = functionDataToModel(methodData, org, packageName);
            methodSymbol.documentation().ifPresent(doc -> {
                String returnDesc = doc.returnDescription().orElse("");
                if (!returnDesc.isEmpty() && methodFunc.getReturnInfo() != null) {
                    methodFunc.getReturnInfo().setDescription(returnDesc);
                }
            });
            if (methodSymbol.deprecated()) {
                methodFunc.setDeprecated(true);
            }
            applyFunctionAnnotations(methodSymbol, methodFunc, org, packageName, pkg);
            functions.add(methodFunc);
        }

        if (!functions.isEmpty()) {
            typeDef.setFunctions(functions);
        }
    }

    /**
     * The kind {@code FunctionDataBuilder.build()} would otherwise default to {@code FUNCTION},
     * mirroring the builder's own (private) classification.
     */
    private static FunctionData.Kind resolveMethodKind(MethodSymbol methodSymbol) {
        if (methodSymbol.kind() == SymbolKind.RESOURCE_METHOD) {
            return FunctionData.Kind.RESOURCE;
        }
        List<Qualifier> qualifiers = methodSymbol.qualifiers();
        if (qualifiers.contains(Qualifier.REMOTE)) {
            return FunctionData.Kind.REMOTE;
        }
        if (qualifiers.contains(Qualifier.RESOURCE)) {
            return FunctionData.Kind.RESOURCE;
        }
        return FunctionData.Kind.FUNCTION;
    }

    /**
     * Marks record fields on the given {@link TypeDef} as deprecated when the
     * underlying {@link RecordFieldSymbol} carries the {@code @deprecated} annotation.
     * The {@code TypeDef#getFields} list is only populated for record types.
     */
    private static void markDeprecatedFields(TypeDefinitionSymbol typeDefSymbol, TypeDef typeDef) {
        List<Field> fields = typeDef.getFields();
        if (fields == null || fields.isEmpty()) {
            return;
        }

        TypeSymbol rawType = CommonUtils.getRawType(typeDefSymbol.typeDescriptor());
        if (!(rawType instanceof RecordTypeSymbol recordType)) {
            return;
        }

        Set<String> deprecatedNames = new HashSet<>();
        for (Map.Entry<String, RecordFieldSymbol> entry : recordType.fieldDescriptors().entrySet()) {
            RecordFieldSymbol fieldSymbol = entry.getValue();
            if (fieldSymbol.deprecated()) {
                deprecatedNames.add(fieldSymbol.getName().orElse(entry.getKey()));
            }
        }

        if (deprecatedNames.isEmpty()) {
            return;
        }
        for (Field field : fields) {
            if (deprecatedNames.contains(field.getName())) {
                field.setDeprecated(true);
            }
        }
    }

    /**
     * Processes a CONSTANT symbol.
     */
    private static void processConstantSymbol(ConstantSymbol constantSymbol,
                                              String org,
                                              String packageName,
                                              Package pkg,
                                              SymbolProcessingResult result) {
        if (!constantSymbol.qualifiers().contains(Qualifier.PUBLIC)) {
            return;
        }

        TypeDefData constantData = TypeDefDataBuilder.buildFromConstant(constantSymbol);
        TypeDef typeDef = typeDefDataToModel(constantData, org, packageName);

        // Add varType using ConstantValue
        String varTypeName = "";
        Object constValue = constantSymbol.constValue();
        if (constValue instanceof ConstantValue constantValue) {
            varTypeName = constantValue.valueType().typeKind().getName();
        }

        // Fallback to type descriptor if constValue is null or not ConstantValue
        if (varTypeName.isEmpty()) {
            TypeSymbol typeSymbol = constantSymbol.typeDescriptor();
            if (typeSymbol != null && !typeSymbol.signature().isEmpty()) {
                varTypeName = typeSymbol.signature();
            }
        }

        Type varType = new Type(varTypeName);
        typeDef.setVarType(varType);

        List<AnnotationAttachment> constAnnotations =
                AnnotationAttachmentExtractor.extract(constantSymbol, org, packageName, pkg);
        if (!constAnnotations.isEmpty()) {
            typeDef.setAnnotations(constAnnotations);
        }

        result.getTypeDefs().add(typeDef);
    }

    /**
     * Processes an ANNOTATION declaration symbol into the definition catalog.
     * Emits one {@link Annotation} entry per declared attachment point.
     */
    private static void processAnnotationSymbol(AnnotationSymbol annotationSymbol,
                                                String org,
                                                String packageName,
                                                SymbolProcessingResult result) {
        if (!annotationSymbol.qualifiers().contains(Qualifier.PUBLIC)) {
            return;
        }

        Optional<String> optName = annotationSymbol.getName();
        if (optName.isEmpty()) {
            return;
        }
        String name = optName.get();

        Type constraintType = annotationSymbol.typeDescriptor()
                .map(typeSymbol -> typeSymbolToModel(typeSymbol, org, packageName))
                .orElse(null);
        String description = annotationSymbol.documentation()
                .flatMap(Documentation::description)
                .orElse(null);

        for (AnnotationAttachPoint attachPoint : annotationSymbol.attachPoints()) {
            Annotation annotation = new Annotation();
            annotation.setName(name);
            annotation.setAttachmentPoint(attachPoint.name());
            annotation.setDescription(description);
            annotation.setTypeConstraint(constraintType);
            result.getAnnotations().add(annotation);
        }
    }

    /**
     * Applies the annotation attachments present on a function/method symbol to its model,
     * including per-parameter attachments (matched by name).
     */
    private static void applyFunctionAnnotations(FunctionSymbol functionSymbol,
                                                 LibraryFunction function,
                                                 String org,
                                                 String packageName,
                                                 Package pkg) {
        List<AnnotationAttachment> fnAnnotations =
                AnnotationAttachmentExtractor.extract(functionSymbol, org, packageName, pkg);
        if (!fnAnnotations.isEmpty()) {
            function.setAnnotations(fnAnnotations);
        }

        List<Parameter> parameters = function.getParameters();
        if (parameters == null || parameters.isEmpty()) {
            return;
        }

        FunctionTypeSymbol functionTypeSymbol = functionSymbol.typeDescriptor();
        Optional<List<ParameterSymbol>> optParams = functionTypeSymbol.params();
        if (optParams.isEmpty()) {
            return;
        }

        Map<String, ParameterSymbol> paramsByName = new HashMap<>();
        for (ParameterSymbol paramSymbol : optParams.get()) {
            paramSymbol.getName().ifPresent(paramName -> paramsByName.put(paramName, paramSymbol));
        }
        functionTypeSymbol.restParam()
                .ifPresent(restParam -> restParam.getName().ifPresent(n -> paramsByName.put(n, restParam)));

        for (Parameter parameter : parameters) {
            ParameterSymbol paramSymbol = paramsByName.get(parameter.getName());
            if (paramSymbol == null) {
                continue;
            }
            List<AnnotationAttachment> paramAnnotations =
                    AnnotationAttachmentExtractor.extract(paramSymbol, org, packageName, pkg);
            if (!paramAnnotations.isEmpty()) {
                parameter.setAnnotations(paramAnnotations);
            }
        }
    }

    /**
     * Applies record-field annotation attachments to the {@link TypeDef} fields (matched by name).
     * The {@code TypeDef#getFields} list is only populated for record types.
     */
    private static void applyFieldAnnotations(TypeDefinitionSymbol typeDefSymbol,
                                              TypeDef typeDef,
                                              String org,
                                              String packageName,
                                              Package pkg) {
        List<Field> fields = typeDef.getFields();
        if (fields == null || fields.isEmpty()) {
            return;
        }

        TypeSymbol rawType = CommonUtils.getRawType(typeDefSymbol.typeDescriptor());
        if (!(rawType instanceof RecordTypeSymbol recordType)) {
            return;
        }

        Map<String, RecordFieldSymbol> fieldSymbolsByName = new HashMap<>();
        for (Map.Entry<String, RecordFieldSymbol> entry : recordType.fieldDescriptors().entrySet()) {
            RecordFieldSymbol fieldSymbol = entry.getValue();
            fieldSymbolsByName.put(fieldSymbol.getName().orElse(entry.getKey()), fieldSymbol);
        }

        for (Field field : fields) {
            RecordFieldSymbol fieldSymbol = fieldSymbolsByName.get(field.getName());
            if (fieldSymbol == null) {
                continue;
            }
            List<AnnotationAttachment> fieldAnnotations =
                    AnnotationAttachmentExtractor.extract(fieldSymbol, org, packageName, pkg);
            if (!fieldAnnotations.isEmpty()) {
                field.setAnnotations(fieldAnnotations);
            }
        }
    }
}
