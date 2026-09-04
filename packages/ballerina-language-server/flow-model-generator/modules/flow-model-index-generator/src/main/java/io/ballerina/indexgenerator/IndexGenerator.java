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

package io.ballerina.indexgenerator;

import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.ClassSymbol;
import io.ballerina.compiler.api.symbols.Documentable;
import io.ballerina.compiler.api.symbols.FunctionSymbol;
import io.ballerina.compiler.api.symbols.MethodSymbol;
import io.ballerina.compiler.api.symbols.Qualifier;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.SymbolKind;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.modelgenerator.commons.FunctionData;
import io.ballerina.modelgenerator.commons.FunctionDataBuilder;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.modelgenerator.commons.ParameterData;
import io.ballerina.modelgenerator.commons.ParameterMemberTypeData;
import io.ballerina.projects.Module;
import io.ballerina.projects.ModuleDescriptor;
import io.ballerina.projects.Package;

import java.io.FileReader;
import java.io.IOException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.ForkJoinPool;
import java.util.logging.Logger;

/**
 * Index generator to cache functions and connectors.
 *
 * @since 1.0.0
 */
class IndexGenerator {

    private static final java.lang.reflect.Type typeToken =
            new TypeToken<Map<String, List<PackageListGenerator.PackageMetadataInfo>>>() {
            }.getType();
    private static final Logger LOGGER = Logger.getLogger(IndexGenerator.class.getName());

    public static void main(String[] args) {
        DatabaseManager.createDatabase();

        Gson gson = new Gson();
        URL resource = IndexGenerator.class.getClassLoader().getResource(PackageListGenerator.PACKAGE_JSON_FILE);
        try (FileReader reader = new FileReader(Objects.requireNonNull(resource).getFile(), StandardCharsets.UTF_8)) {
            Map<String, List<PackageListGenerator.PackageMetadataInfo>> packagesMap = gson.fromJson(reader,
                    typeToken);
            ForkJoinPool forkJoinPool = new ForkJoinPool(Runtime.getRuntime().availableProcessors());
            forkJoinPool.submit(() -> packagesMap.forEach((key, value) -> value.forEach(
                    packageMetadataInfo -> resolvePackage(key, packageMetadataInfo)))).join();
        } catch (IOException e) {
            LOGGER.severe("Error reading packages JSON file: " + e.getMessage());
        }

        // TODO: Remove this once thw raw parameter property type is introduced
        DatabaseManager.executeQuery(
                "UPDATE Parameter SET default_value = '``', placeholder='``' WHERE type = 'sql:ParameterizedQuery'");
//
        // TODO: Remove this once the package index is introduced
        DatabaseManager.executeQuery(
                "UPDATE Parameter SET type= 'anydata', default_value= 'anydata', placeholder= 'anydata' \n" +
                        "WHERE parameter_id IN (\n" +
                        "    SELECT p.parameter_id\n" +
                        "    FROM Parameter p\n" +
                        "    INNER JOIN Function f ON f.function_id = p.function_id\n" +
                        "    INNER JOIN Package pack ON pack.package_id = f.package_id\n" +
                        "    WHERE pack.package_name = 'http' AND p.name = 'targetType'\n" +
                        ");");

        // TODO: Need to improve how we handle lang lib functions
        DatabaseManager.updateTypeParameter("lang.array", "array:Type1", "(any|error)");
        DatabaseManager.updateTypeParameter("lang.array", "array:Type", "(any|error)");
        DatabaseManager.updateTypeParameter("lang.array", "array:AnydataType", "(anydata|error)");
        DatabaseManager.updateTypeParameter("lang.error", "error:DetailType", "error:Detail");
        DatabaseManager.updateTypeParameter("lang.map", "map:Type1", "map<any|error>");
        DatabaseManager.updateTypeParameter("lang.map", "map:Type", "map<any|error>");
        DatabaseManager.updateTypeParameter("lang.stream", "stream:Type1", "(any|error)");
        DatabaseManager.updateTypeParameter("lang.stream", "stream:Type", "(any|error)");
        DatabaseManager.updateTypeParameter("lang.stream", "stream:ErrorType", "error");
        DatabaseManager.updateTypeParameter("lang.stream", "stream:CompletionType", "error");
        DatabaseManager.updateTypeParameter("lang.xml", "xml:XmlType", "xml");
        DatabaseManager.updateTypeParameter("lang.xml", "xml:ItemType",
                "(xml:Element|xml:Comment|xml:ProcessingInstruction|xml:Text)");
        DatabaseManager.updateTypeParameter("lang.table", "table:MapType1", "map<any|error>");
        DatabaseManager.updateTypeParameter("lang.table", "table:MapType", "map<any|error>");
        DatabaseManager.updateTypeParameter("lang.table", "table:KeyType", "anydata");
        DatabaseManager.updateTypeParameter("lang.table", "table:Type", "(any|error)");
        DatabaseManager.updateTypeParameter("lang.value", "value:AnydataType", "anydata");
        DatabaseManager.updateTypeParameter("lang.value", "value:Type", "(any|error)");
    }

    private static void resolvePackage(String org,
                                       PackageListGenerator.PackageMetadataInfo packageMetadataInfo) {
        Package resolvedPackage;
        try {
            resolvedPackage = Objects.requireNonNull(PackageUtil.resolveModulePackage(org,
                    packageMetadataInfo.name(), packageMetadataInfo.version())).orElseThrow();
        } catch (Throwable e) {
            LOGGER.severe("Error resolving package: " + packageMetadataInfo.name() + e.getMessage());
            return;
        }

        // A bal tool package carries a CLI command rather than an importable API, so it has nothing to
        // contribute to the index and only pollutes library and connector search results. The published
        // bala declares itself a tool via bal-tool.json, so no list of tool names has to be maintained.
        if (resolvedPackage.manifest().balToolDescriptor().isPresent()) {
            LOGGER.info("Skipping the bal tool package: " + packageMetadataInfo.name());
            return;
        }

        List<String> exportedModules = resolvedPackage.manifest().exportedModules();
        for (Module module : resolvedPackage.modules()) {
            if (exportedModules.contains(module.descriptor().name().toString())) {
                processModule(resolvedPackage, module);
            }
        }
    }

    private static void processModule(Package resolvedPackage, Module module) {
        ModuleDescriptor descriptor = module.descriptor();
        String moduleName = descriptor.name().toString();
        LOGGER.info("Processing package: " + moduleName);
        int packageId = DatabaseManager.insertPackage(descriptor.org().value(),
                module.packageInstance().packageName().value(), moduleName,
                descriptor.version().value().toString(), resolvedPackage.manifest().keywords());
        if (packageId == -1) {
            LOGGER.severe("Error inserting package to database: " + moduleName);
            return;
        }

        SemanticModel semanticModel;
        try {
            semanticModel = PackageUtil.getCompilation(resolvedPackage)
                    .getSemanticModel(module.moduleId());
        } catch (Exception e) {
            LOGGER.severe("Error reading semantic model: " + e.getMessage());
            return;
        }

        TypeSymbol errorTypeSymbol = semanticModel.types().ERROR;

        for (Symbol symbol : semanticModel.moduleSymbols()) {
            if (symbol.kind() == SymbolKind.FUNCTION) {
                FunctionSymbol functionSymbol = (FunctionSymbol) symbol;
                if (!functionSymbol.qualifiers().contains(Qualifier.PUBLIC)) {
                    continue;
                }

                processFunctionSymbol(semanticModel, functionSymbol, functionSymbol, packageId, FunctionType.FUNCTION,
                        moduleName, errorTypeSymbol, module);
                continue;
            }
            if (symbol.kind() == SymbolKind.CLASS) {
                ClassSymbol classSymbol = (ClassSymbol) symbol;
                if (hasAllQualifiers(classSymbol.qualifiers(), List.of(Qualifier.PUBLIC, Qualifier.CLIENT))) {
                    continue;
                }

                Optional<MethodSymbol> initMethodSymbol = classSymbol.initMethod();
                if (initMethodSymbol.isEmpty()) {
                    continue;
                }
                if (!classSymbol.nameEquals("Client")) {
                    continue;
                }
                int connectorId = processFunctionSymbol(semanticModel, initMethodSymbol.get(), classSymbol, packageId,
                        FunctionType.CONNECTOR,
                        moduleName, errorTypeSymbol, module);
                if (connectorId == -1) {
                    continue;
                }

                // Process the actions of the client
                Map<String, MethodSymbol> methods = classSymbol.methods();
                for (Map.Entry<String, MethodSymbol> entry : methods.entrySet()) {
                    MethodSymbol methodSymbol = entry.getValue();

                    List<Qualifier> qualifiers = methodSymbol.qualifiers();
                    FunctionType functionType;
                    if (qualifiers.contains(Qualifier.REMOTE)) {
                        functionType = FunctionType.REMOTE;
                    } else if (qualifiers.contains(Qualifier.RESOURCE)) {
                        functionType = FunctionType.RESOURCE;
                    } else if (qualifiers.contains(Qualifier.PUBLIC)) {
                        functionType = FunctionType.FUNCTION;
                    } else {
                        continue;
                    }
                    int functionId = processFunctionSymbol(semanticModel, methodSymbol, methodSymbol, packageId,
                            functionType, moduleName, errorTypeSymbol, module);
                    if (functionId == -1) {
                        continue;
                    }
                    DatabaseManager.mapConnectorAction(functionId, connectorId);
                }
            }
        }
    }

    private static boolean hasAllQualifiers(List<Qualifier> actualQualifiers, List<Qualifier> expectedQualifiers) {
        return !new HashSet<>(actualQualifiers).containsAll(expectedQualifiers);
    }

    private static int processFunctionSymbol(SemanticModel semanticModel, FunctionSymbol functionSymbol,
                                             Documentable documentable, int packageId,
                                             FunctionType functionType, String packageName,
                                             TypeSymbol errorTypeSymbol, Module module) {
        // Capture the name of the function
        Optional<String> name = functionSymbol.getName();
        if (name.isEmpty()) {
            return packageId;
        }

        // Create ModuleInfo for the function
        ModuleInfo moduleInfo = ModuleInfo.from(module.descriptor());

        // Create and set the resolved package for the function
        Optional<Package> resolvedPackage = PackageUtil.resolveModulePackage(
                moduleInfo.org(), moduleInfo.packageName(), moduleInfo.version());

        // Determine function kind based on function type
        FunctionData.Kind functionKind = mapFunctionTypeToKind(functionType);

        // Use FunctionDataBuilder to create FunctionData
        FunctionDataBuilder functionDataBuilder = new FunctionDataBuilder()
                .enableIndex()
                .semanticModel(semanticModel)
                .functionSymbol(functionSymbol)
                .moduleInfo(moduleInfo)
                .resolvedPackage(resolvedPackage.orElse(null))
                .functionResultKind(functionKind);

        // Handle special cases for connectors and class symbols
        if (documentable instanceof ClassSymbol classSymbol) {
            functionDataBuilder.parentSymbol(classSymbol);
            if (name.get().equals("init")) {
                functionDataBuilder.name("Client");
            } else {
                functionDataBuilder.name(name.get());
            }
        } else {
            functionDataBuilder.name(name.get());
        }

        // Build the function data
        FunctionData functionData = functionDataBuilder.build();

        // Insert function into database
        String resourcePath = functionData.resourcePath() != null ? functionData.resourcePath() : "";
        int functionId = DatabaseManager.insertFunction(packageId, functionData.name(),
                functionData.description(), functionData.returnType(),
                functionData.kind().name(), resourcePath,
                functionData.returnError() ? 1 : 0, functionData.inferredReturnType(),
                functionData.importStatements());

        // Insert parameters into database
        for (Map.Entry<String, ParameterData> entry : functionData.parameters().entrySet()) {
            ParameterData parameterData = entry.getValue();
            int paramId = DatabaseManager.insertFunctionParameter(functionId, parameterData.name(),
                    parameterData.description(), parameterData.type(), parameterData.placeholder(),
                    parameterData.defaultValue(),
                    FunctionParameterKind.fromString(parameterData.kind().name()),
                    parameterData.optional() ? 1 : 0, parameterData.importStatements(), parameterData.label());

            // Insert parameter member types
            insertParameterMemberTypesFromParameterData(paramId, parameterData);
        }

        return functionId;
    }

    private static FunctionData.Kind mapFunctionTypeToKind(FunctionType functionType) {
        return switch (functionType) {
            case FUNCTION -> FunctionData.Kind.FUNCTION;
            case REMOTE -> FunctionData.Kind.REMOTE;
            case CONNECTOR -> FunctionData.Kind.CONNECTOR;
            case RESOURCE -> FunctionData.Kind.RESOURCE;
        };
    }

    private static void insertParameterMemberTypesFromParameterData(int parameterId, ParameterData parameterData) {
        for (ParameterMemberTypeData memberType : parameterData.typeMembers()) {
            DatabaseManager.insertParameterMemberType(parameterId, memberType.type(), memberType.kind(),
                    memberType.packageInfo(), memberType.packageName());
        }
    }

    enum FunctionType {
        FUNCTION,
        REMOTE,
        CONNECTOR,
        RESOURCE
    }

    enum FunctionParameterKind {
        REQUIRED,
        DEFAULTABLE,
        INCLUDED_RECORD,
        REST_PARAMETER,
        INCLUDED_FIELD,
        PARAM_FOR_TYPE_INFER,
        INCLUDED_RECORD_REST,
        PATH_PARAM,
        PATH_REST_PARAM;

        // need to have a fromString logic here
        public static FunctionParameterKind fromString(String value) {
            if (value.equals("REST")) {
                return REST_PARAMETER;
            }
            return FunctionParameterKind.valueOf(value);
        }
    }
}
