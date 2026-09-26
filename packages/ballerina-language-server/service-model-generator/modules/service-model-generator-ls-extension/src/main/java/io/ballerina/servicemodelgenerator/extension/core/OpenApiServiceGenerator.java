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

package io.ballerina.servicemodelgenerator.extension.core;

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.MethodSymbol;
import io.ballerina.compiler.api.symbols.ModuleSymbol;
import io.ballerina.compiler.api.symbols.ObjectTypeSymbol;
import io.ballerina.compiler.api.symbols.ResourceMethodSymbol;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.SymbolKind;
import io.ballerina.compiler.api.symbols.TypeDefinitionSymbol;
import io.ballerina.compiler.api.symbols.TypeDescKind;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.SyntaxTree;
import io.ballerina.compiler.syntax.tree.TypeDefinitionNode;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.openapi.core.generators.common.GeneratorUtils;
import io.ballerina.openapi.core.generators.common.SingleFileGenerator;
import io.ballerina.openapi.core.generators.common.TypeHandler;
import io.ballerina.openapi.core.generators.common.exception.BallerinaOpenApiException;
import io.ballerina.openapi.core.generators.common.model.Filter;
import io.ballerina.openapi.core.generators.common.model.GenSrcFile;
import io.ballerina.openapi.core.generators.service.ServiceGenerationHandler;
import io.ballerina.openapi.core.generators.service.model.OASServiceMetadata;
import io.ballerina.projects.Document;
import io.ballerina.projects.DocumentConfig;
import io.ballerina.projects.DocumentId;
import io.ballerina.projects.Module;
import io.ballerina.projects.ModuleId;
import io.ballerina.projects.ModuleName;
import io.ballerina.projects.Package;
import io.ballerina.projects.Project;
import io.ballerina.servicemodelgenerator.extension.model.Service;
import io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel;
import io.ballerina.servicemodelgenerator.extension.util.ListenerUtil;
import io.ballerina.servicemodelgenerator.extension.util.ServiceModifier;
import io.ballerina.servicemodelgenerator.extension.util.Utils;
import io.ballerina.tools.diagnostics.Diagnostic;
import io.ballerina.tools.diagnostics.DiagnosticSeverity;
import io.ballerina.tools.text.LinePosition;
import io.ballerina.tools.text.TextDocuments;
import io.swagger.v3.oas.models.OpenAPI;
import org.ballerinalang.formatter.core.Formatter;
import org.ballerinalang.formatter.core.FormatterException;
import org.ballerinalang.langserver.commons.eventsync.exceptions.EventSyncException;
import org.ballerinalang.langserver.commons.workspace.WorkspaceDocumentException;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;
import org.eclipse.lsp4j.TextEdit;

import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static io.ballerina.openapi.core.generators.common.GeneratorConstants.DEFAULT_FILE_HEADER;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.NEW_LINE;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.importExists;

/**
 * Generates service from the OpenAPI contract.
 *
 * @since 1.0.0
 */
public class OpenApiServiceGenerator {

    public static final String MAIN_BAL = "main.bal";
    public static final String LS = System.lineSeparator();
    public static final String CLOSE_BRACE = "}";
    public static final String COLON = ":";
    public static final String BALLERINA_LANG = "ballerina/lang";
    public static final String SERVICE_DECLARATION = "service %s on %s {";
    private static final String RANGED_RESPONSE_ERROR_CODE = "OAS_SERVICE_201";
    private final WorkspaceManager workspaceManager;
    private final Path openAPIContractPath;
    private final Path projectPath;

    public OpenApiServiceGenerator(Path openAPIContractPath, Path projectPath, WorkspaceManager workspaceManager) {
        this.openAPIContractPath = openAPIContractPath;
        this.projectPath = projectPath;
        this.workspaceManager = workspaceManager;
    }

    public Map<String, List<TextEdit>> generateService(Service service, ListenerUtil.DefaultListener defaultListener)
            throws WorkspaceDocumentException, FormatterException, IOException, BallerinaOpenApiException,
            EventSyncException {
        String typeName = service.getServiceContractTypeName();
        String listeners = service.getListener().getValue();
        String listenerDeclaration = null;
        if (Objects.nonNull(defaultListener)) {
            listenerDeclaration = ListenerUtil.getDefaultListenerDeclarationStmt(defaultListener);
        }
        return generateService(typeName, listeners, listenerDeclaration);
    }

    public Map<String, List<TextEdit>> generateService(ServiceInitModel service, String listeners,
                                                       String listenerDeclaration) throws WorkspaceDocumentException,
            FormatterException, IOException, BallerinaOpenApiException, EventSyncException {
        String typeName = service.getServiceContractTypeName();
        return generateService(typeName, listeners, listenerDeclaration);
    }

    private Map<String, List<TextEdit>> generateService(String typeName, String listeners, String listenerDeclaration)
            throws IOException,
            BallerinaOpenApiException, FormatterException, WorkspaceDocumentException, EventSyncException {
        Filter filter = new Filter(new ArrayList<>(), new ArrayList<>());

        List<Diagnostic> diagnostics = new ArrayList<>();
        GenSrcFile serviceTypeFile = generateServiceType(openAPIContractPath, typeName, filter, diagnostics);
        rejectGeneratedTypeNameCollision(serviceTypeFile, typeName);
        List<String> errorMessages = new ArrayList<>();
        for (Diagnostic diagnostic : diagnostics) {
            DiagnosticSeverity severity = diagnostic.diagnosticInfo().severity();
            if (severity == DiagnosticSeverity.ERROR) {
                if (diagnostic.diagnosticInfo().code().equals(RANGED_RESPONSE_ERROR_CODE)) {
                    continue;
                }
                errorMessages.add(diagnostic.message());
            }
        }

        if (!errorMessages.isEmpty()) {
            StringBuilder sb = new StringBuilder();
            for (String errorMessage : errorMessages) {
                sb.append(DiagnosticSeverity.ERROR).append(": ").append(errorMessage).append(System.lineSeparator());
            }
            throw new BallerinaOpenApiException(sb.toString());
        }

        String updatedSyntaxTree = modifyContractMethodNamesWithErrorReturn(serviceTypeFile);

        Path mainFile = projectPath.resolve(MAIN_BAL);
        Map<String, List<TextEdit>> textEditsMap = new LinkedHashMap<>();
        Project project = this.workspaceManager.loadProject(mainFile);
        Optional<Document> document = this.workspaceManager.document(mainFile);
        Optional<SemanticModel> semanticModel = this.workspaceManager.semanticModel(mainFile);
        if (document.isPresent() && semanticModel.isPresent()) {
            List<TextEdit> textEdits = new ArrayList<>();
            ModulePartNode modulePartNode = document.get().syntaxTree().rootNode();

            if (!importExists(modulePartNode, "ballerina", "http")) {
                String importText = Utils.getImportStmt("ballerina", "http");
                textEdits.add(new TextEdit(Utils.toRange(modulePartNode.lineRange().startLine()), importText));
            }
            String serviceImplContent = genServiceImplementation(updatedSyntaxTree, serviceTypeFile.getFileName(),
                    typeName, listeners, project, mainFile);
            StringBuilder builder = new StringBuilder(NEW_LINE);
            if (Objects.nonNull(listenerDeclaration)) {
                builder.append(listenerDeclaration).append(NEW_LINE);
            }
            builder.append(serviceImplContent);
            textEdits.add(new TextEdit(Utils.toRange(modulePartNode.lineRange().endLine()), builder.toString()));
            textEditsMap.put(mainFile.toAbsolutePath().toString(), textEdits);
        }
        textEditsMap.put(projectPath.resolve(serviceTypeFile.getFileName()).toAbsolutePath().toString(),
                List.of(new TextEdit(Utils.toRange(LinePosition.from(0, 0)), updatedSyntaxTree)));
        return textEditsMap;
    }

    /**
     * Keep the generator safe for callers that do not go through the service-model validation gate.
     * The OpenAPI generator emits the service object and schema types into the same file, so a
     * duplicate declaration for the selected service type name would make references ambiguous.
     */
    private static void rejectGeneratedTypeNameCollision(GenSrcFile serviceTypeFile, String typeName)
            throws BallerinaOpenApiException {
        SyntaxTree syntaxTree = SyntaxTree.from(TextDocuments.from(serviceTypeFile.getContent()));
        ModulePartNode modulePartNode = (ModulePartNode) syntaxTree.rootNode();
        long matchingTypeCount = modulePartNode.members().stream()
                .filter(TypeDefinitionNode.class::isInstance)
                .map(TypeDefinitionNode.class::cast)
                .filter(typeDefinition -> typeName.equals(typeDefinition.typeName().text()))
                .count();
        if (matchingTypeCount > 1) {
            throw new BallerinaOpenApiException("Service type name '%s' conflicts with a type generated from the "
                    .formatted(typeName) + "OpenAPI specification");
        }
    }

    private static String modifyContractMethodNamesWithErrorReturn(GenSrcFile serviceTypeFile) {
        SyntaxTree syntaxTree = SyntaxTree.from(TextDocuments.from(serviceTypeFile.getContent()));
        ModulePartNode rootNode = syntaxTree.rootNode();
        return new ServiceModifier().transform(rootNode).toString();
    }

    public GenSrcFile generateServiceType(Path openAPI, String typeName, Filter filter, List<Diagnostic> diagnostics)
            throws IOException, FormatterException, BallerinaOpenApiException {
        OpenAPI openAPIDef = GeneratorUtils.normalizeOpenAPI(openAPI, false, false);
        if (openAPIDef.getInfo() == null) {
            throw new BallerinaOpenApiException("Info section of the definition file cannot be empty/null: " +
                    openAPI);
        }

        // Validate the service generation
        List<String> complexPaths = GeneratorUtils.getComplexPaths(openAPIDef);
        if (!complexPaths.isEmpty()) {
            StringBuilder sb = new StringBuilder();
            sb.append("service generation can not be done as the openapi definition contain following complex " +
                    "path(s) :").append(System.lineSeparator());
            for (String path : complexPaths) {
                sb.append(path).append(System.lineSeparator());
            }
            throw new BallerinaOpenApiException(sb.toString());
        }

        OASServiceMetadata oasServiceMetadata = new OASServiceMetadata.Builder()
                .withOpenAPI(openAPIDef)
                .withFilters(filter)
                .withNullable(true)
                .withGenerateServiceType(false)
                .withGenerateServiceContract(true)
                .withGenerateWithoutDataBinding(false)
                .withServiceObjectTypeName(typeName)
                .withSrcFile("service_contract_" + typeName + ".bal")
                .build();
        TypeHandler.createInstance(openAPIDef, true);
        ServiceGenerationHandler serviceGenerationHandler = new ServiceGenerationHandler();
        SyntaxTree syntaxTree = serviceGenerationHandler.generateSingleSyntaxTree(oasServiceMetadata);
        if (!oasServiceMetadata.generateWithoutDataBinding()) {
            syntaxTree = SingleFileGenerator.combineSyntaxTrees(syntaxTree,
                    TypeHandler.getInstance().generateTypeSyntaxTree());
        }
        GenSrcFile genSrcFile = new GenSrcFile(GenSrcFile.GenFileType.GEN_SRC, oasServiceMetadata.getSrcPackage(),
                oasServiceMetadata.getSrcFile(),
                (oasServiceMetadata.getLicenseHeader().isBlank() ? DEFAULT_FILE_HEADER :
                        oasServiceMetadata.getLicenseHeader()) + Formatter.format(syntaxTree).toSourceCode());

        diagnostics.addAll(serviceGenerationHandler.getDiagnostics());
        diagnostics.addAll(TypeHandler.getInstance().getDiagnostics());
        return genSrcFile;
    }

    private String genServiceImplementation(String serviceTypeContent, String fileName, String typeName,
                                            String listeners, Project project, Path mainFile)
            throws BallerinaOpenApiException {
        Package currentPackage = project.currentPackage();
        Module module = currentPackage.module(ModuleName.from(currentPackage.packageName()));
        ModuleId moduleId = module.moduleId();
        DocumentId serviceObjDocId = DocumentId.create(mainFile.toString(), moduleId);
        DocumentConfig documentConfig = DocumentConfig.from(serviceObjDocId, serviceTypeContent, fileName);
        module.modify().addDocument(documentConfig).apply();

        SemanticModel semanticModel = PackageUtil.getCompilation(project).getSemanticModel(moduleId);
        TypeDefinitionSymbol symbol = getServiceTypeSymbol(semanticModel.moduleSymbols(), typeName);
        if (symbol == null) {
            throw new BallerinaOpenApiException("Cannot find service type definition");
        }

        TypeSymbol typeSymbol = symbol.typeDescriptor();
        if (typeSymbol.typeKind() != TypeDescKind.OBJECT) {
            throw new BallerinaOpenApiException("Cannot find service object type definition");
        }

        Map<String, MethodSymbol> methodSymbolMap = ((ObjectTypeSymbol) typeSymbol).methods();
        StringBuilder serviceImpl = new StringBuilder();
        serviceImpl.append(String.format(SERVICE_DECLARATION, typeName, listeners));
        serviceImpl.append(LS);
        for (Map.Entry<String, MethodSymbol> entry : methodSymbolMap.entrySet()) {
            MethodSymbol methodSymbol = entry.getValue();
            if (methodSymbol instanceof ResourceMethodSymbol resourceMethodSymbol) {
                serviceImpl.append(getResourceFunction(resourceMethodSymbol, getParentModuleName(symbol)));
            }
        }
        serviceImpl.append(CLOSE_BRACE).append(LS);
        return serviceImpl.toString();
    }

    public static TypeDefinitionSymbol getServiceTypeSymbol(List<Symbol> symbols, String name) {
        for (Symbol symbol : symbols) {
            if (symbol.kind() == SymbolKind.TYPE_DEFINITION) {
                Optional<String> typeName = symbol.getName();
                if (typeName.isPresent() && typeName.get().equals(name)) {
                    return (TypeDefinitionSymbol) symbol;
                }
            }
        }
        return null;
    }

    public static String getParentModuleName(Symbol symbol) {
        Optional<ModuleSymbol> module = symbol.getModule();
        return module.map(moduleSymbol -> moduleSymbol.id().toString()).orElse(null);
    }

    private String getResourceFunction(ResourceMethodSymbol resourceMethodSymbol, String parentModuleName) {
        String resourceSignature = resourceMethodSymbol.signature();
        if (Objects.nonNull(parentModuleName)) {
            resourceSignature = resourceSignature.replace(parentModuleName + COLON, "");
        }
        if (resourceSignature.contains(BALLERINA_LANG)) {
            resourceSignature = resourceSignature.replace(BALLERINA_LANG + ".", "");
            resourceSignature = resourceSignature.replaceAll("\\d+\\.\\d+\\.\\d+:", "");
        }
        String f = "    " + sanitizePackageNames(resourceSignature) + "  {%n" +
                "        return error(\"Unimplemented resource\");%n" +
                "    }";
        return f.formatted();
    }

    public static String sanitizePackageNames(String input) {
        Pattern pattern = Pattern.compile("(\\w+)/(\\w+:)(\\d+\\.\\d+\\.\\d+):");
        Matcher matcher = pattern.matcher(input);
        return matcher.replaceAll("$2");
    }
}
