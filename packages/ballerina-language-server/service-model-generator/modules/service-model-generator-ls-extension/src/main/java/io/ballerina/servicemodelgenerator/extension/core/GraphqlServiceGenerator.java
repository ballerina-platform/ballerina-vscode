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

import graphql.schema.GraphQLSchema;
import graphql.schema.idl.RuntimeWiring;
import graphql.schema.idl.SchemaGenerator;
import graphql.schema.idl.SchemaParser;
import graphql.schema.idl.TypeDefinitionRegistry;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.MethodSymbol;
import io.ballerina.compiler.api.symbols.ObjectTypeSymbol;
import io.ballerina.compiler.api.symbols.Qualifier;
import io.ballerina.compiler.api.symbols.ResourceMethodSymbol;
import io.ballerina.compiler.api.symbols.TypeDefinitionSymbol;
import io.ballerina.compiler.api.symbols.TypeDescKind;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.SyntaxTree;
import io.ballerina.graphql.generator.service.GraphqlServiceProject;
import io.ballerina.graphql.generator.service.generator.ServiceCodeGenerator;
import io.ballerina.graphql.generator.utils.SrcFilePojo;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.projects.Document;
import io.ballerina.projects.DocumentConfig;
import io.ballerina.projects.DocumentId;
import io.ballerina.projects.Module;
import io.ballerina.projects.ModuleId;
import io.ballerina.projects.ModuleName;
import io.ballerina.projects.Package;
import io.ballerina.projects.Project;
import io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel;
import io.ballerina.servicemodelgenerator.extension.util.ServiceClassModifier;
import io.ballerina.servicemodelgenerator.extension.util.Utils;
import io.ballerina.tools.text.LinePosition;
import io.ballerina.tools.text.TextDocuments;
import org.apache.commons.io.FilenameUtils;
import org.ballerinalang.langserver.commons.eventsync.exceptions.EventSyncException;
import org.ballerinalang.langserver.commons.workspace.WorkspaceDocumentException;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;
import org.eclipse.lsp4j.TextEdit;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static io.ballerina.graphql.generator.CodeGeneratorConstants.ROOT_PROJECT_NAME;
import static io.ballerina.servicemodelgenerator.extension.core.OpenApiServiceGenerator.BALLERINA_LANG;
import static io.ballerina.servicemodelgenerator.extension.core.OpenApiServiceGenerator.CLOSE_BRACE;
import static io.ballerina.servicemodelgenerator.extension.core.OpenApiServiceGenerator.COLON;
import static io.ballerina.servicemodelgenerator.extension.core.OpenApiServiceGenerator.LS;
import static io.ballerina.servicemodelgenerator.extension.core.OpenApiServiceGenerator.SERVICE_DECLARATION;
import static io.ballerina.servicemodelgenerator.extension.core.OpenApiServiceGenerator.getParentModuleName;
import static io.ballerina.servicemodelgenerator.extension.core.OpenApiServiceGenerator.getServiceTypeSymbol;
import static io.ballerina.servicemodelgenerator.extension.core.OpenApiServiceGenerator.sanitizePackageNames;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.BALLERINA;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.GRAPHQL;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.NEW_LINE;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.importExists;

/**
 * Generates service from the GraphQL schema.
 *
 * @since 1.4.0
 */
public class GraphqlServiceGenerator {

    private final Path projectPath;
    private final WorkspaceManager workspaceManager;

    public static final String MAIN_BAL = "main.bal";
    public static final String GRAPHQL_ID_ANNOT = "@graphql:ID";

    public GraphqlServiceGenerator(Path projectPath, WorkspaceManager workspaceManager) {
        this.projectPath = projectPath;
        this.workspaceManager = workspaceManager;
    }

    public Map<String, List<TextEdit>> generateService(ServiceInitModel serviceInitModel, String path, String listeners,
                                                       String listenerDeclaration)
            throws IOException, WorkspaceDocumentException, EventSyncException {

        SchemaParser schemaParser = new SchemaParser();
        SchemaGenerator schemaGenerator = new SchemaGenerator();
        String schema = serviceInitModel.getGraphqlSchema().getValue();
        File schemaFile = new File(schema);
        String sdlInput = extractSchemaContent(schemaFile);
        TypeDefinitionRegistry typeRegistry = schemaParser.parse(sdlInput);
        GraphQLSchema graphqlSchema = schemaGenerator.makeExecutableSchema(typeRegistry, RuntimeWiring.MOCKED_WIRING);

        List<SrcFilePojo> srcFiles;
        GraphqlServiceProject graphqlProject = new GraphqlServiceProject(ROOT_PROJECT_NAME, schema, "");
        graphqlProject.setGraphQLSchema(graphqlSchema);
        ServiceCodeGenerator svcCodeGenerator = new ServiceCodeGenerator();
        try {
            // TODO: Use the below line once GraphQL tool has been released V0.14.0 with the required changes
//            SrcFilePojo srcFiles2 = svcCodeGenerator.generateServiceTypes(ROOT_PROJECT_NAME, "schema", graphqlSchema);
            srcFiles = svcCodeGenerator.generateBalSources(graphqlProject);
        } catch (Throwable e) {
            throw new IOException("Failed to generate GraphQL types: " + e.getMessage(), e);
        }
        String svcTypeName = FilenameUtils.removeExtension(schemaFile.getName());
        return generateServiceTextEdits(srcFiles.getFirst(), path, listeners, listenerDeclaration, svcTypeName);
    }

    private Map<String, List<TextEdit>> generateServiceTextEdits(SrcFilePojo srcFile, String path, String listeners,
                                                        String listenerDeclaration, String svcTypeName)
            throws WorkspaceDocumentException, EventSyncException, IOException {

        String updatedSrc = updateGeneratedContent(srcFile.getContent());
        Path mainFile = projectPath.resolve(MAIN_BAL);
        Map<String, List<TextEdit>> textEditsMap = new LinkedHashMap<>();
        Project project = this.workspaceManager.loadProject(mainFile);
        Optional<Document> document = this.workspaceManager.document(mainFile);
        Optional<SemanticModel> semanticModel = this.workspaceManager.semanticModel(mainFile);

        if (document.isPresent() && semanticModel.isPresent()) {
            List<TextEdit> textEdits = new ArrayList<>();
            ModulePartNode modulePartNode = document.get().syntaxTree().rootNode();
            if (!importExists(modulePartNode, BALLERINA, GRAPHQL)) {
                String importText = Utils.getImportStmt(BALLERINA, GRAPHQL);
                textEdits.add(new TextEdit(Utils.toRange(modulePartNode.lineRange().startLine()), importText));
            }
            ModuleId moduleId = createServiceTypeFile(project, mainFile.toString(), updatedSrc, srcFile.getFileName());
            String svcImplContent = genServiceImplementation(project, moduleId, path, listeners, svcTypeName);
            StringBuilder builder = new StringBuilder(NEW_LINE);
            if (Objects.nonNull(listenerDeclaration)) {
                builder.append(listenerDeclaration).append(NEW_LINE);
            }
            builder.append(svcImplContent);
            textEdits.add(new TextEdit(Utils.toRange(modulePartNode.lineRange().endLine()), builder.toString()));
            textEditsMap.put(mainFile.toAbsolutePath().toString(), textEdits);
        }

        updatedSrc = removeServiceTypeDefinition(updatedSrc, svcTypeName);
        textEditsMap.put(projectPath.resolve(srcFile.getFileName()).toAbsolutePath().toString(),
                List.of(new TextEdit(Utils.toRange(LinePosition.from(0, 0)), updatedSrc)));
        return textEditsMap;
    }

    private String genServiceImplementation(Project project, ModuleId moduleId, String path, String listeners,
                                            String svcTypeName) throws IOException {
        SemanticModel semanticModel = PackageUtil.getCompilation(project).getSemanticModel(moduleId);
        TypeDefinitionSymbol symbol = getServiceTypeSymbol(semanticModel.moduleSymbols(), svcTypeName);
        if (symbol == null) {
            throw new IOException("Cannot find service type definition");
        }
        TypeSymbol typeSymbol = symbol.typeDescriptor();
        if (typeSymbol.typeKind() != TypeDescKind.OBJECT) {
            throw new IOException("Cannot find service type definition");
        }
        Map<String, MethodSymbol> methodSymbolMap = ((ObjectTypeSymbol) typeSymbol).methods();
        StringBuilder serviceImpl = new StringBuilder();
        serviceImpl.append(String.format(SERVICE_DECLARATION, path, listeners));
        serviceImpl.append(LS);
        for (Map.Entry<String, MethodSymbol> entry : methodSymbolMap.entrySet()) {
            MethodSymbol methodSymbol = entry.getValue();
            if (methodSymbol instanceof ResourceMethodSymbol || methodSymbol.qualifiers().contains(Qualifier.REMOTE)) {
                serviceImpl.append(getResourceFunction(methodSymbol, getParentModuleName(symbol)));
            }
        }
        serviceImpl.append(CLOSE_BRACE).append(LS);
        return serviceImpl.toString();
    }

    private String getResourceFunction(MethodSymbol methodSymbol, String parentModuleName) {
        String documentation = getFunctionDocumentation(methodSymbol);
        String signature = methodSymbol.signature();
        String resourceSignature = documentation.isEmpty() ? signature : documentation + LS + signature;
        if (Objects.nonNull(parentModuleName)) {
            resourceSignature = resourceSignature.replace(parentModuleName + COLON, "");
        }
        if (resourceSignature.contains(BALLERINA_LANG)) {
            resourceSignature = resourceSignature.replace(BALLERINA_LANG + ".", "");
            resourceSignature = resourceSignature.replaceAll("\\d+\\.\\d+\\.\\d+:", "");
        }
        return genResourceFunctionBody(resourceSignature);
    }

    private String getFunctionDocumentation(MethodSymbol methodSymbol) {
        return methodSymbol.documentation()
                .map(doc -> {
                    String description = doc.description().orElse("");
                    // Join parameter docs
                    String paramDocs = doc.parameterMap().entrySet().stream()
                            .filter(param -> !param.getValue().isEmpty())
                            .map(param -> "+ " + param.getKey() + " - " + param.getValue())
                            .collect(Collectors.joining(NEW_LINE));

                    String combined = Stream.of(description, paramDocs)
                            .filter(s -> !s.isEmpty())
                            .collect(Collectors.joining(NEW_LINE));

                    return Arrays.stream(combined.split("\\R"))
                            .map(line -> "# " + line)
                            .collect(Collectors.joining(LS));
                }).orElse("");
    }

    private ModuleId createServiceTypeFile(Project project, String mainFile, String content, String fileName) {
        Package currentPackage = project.currentPackage();
        Module module = currentPackage.module(ModuleName.from(currentPackage.packageName()));
        ModuleId moduleId = module.moduleId();
        DocumentId serviceObjDocId = DocumentId.create(mainFile, moduleId);
        DocumentConfig documentConfig = DocumentConfig.from(serviceObjDocId, content, fileName);
        module.modify().addDocument(documentConfig).apply();
        return moduleId;
    }

    private String updateGeneratedContent(String content) {
        SyntaxTree syntaxTree = SyntaxTree.from(TextDocuments.from(content));
        ModulePartNode oldRoot = syntaxTree.rootNode();
        ServiceClassModifier svcClassModifier = new ServiceClassModifier();
        ModulePartNode newRoot = svcClassModifier.transform(oldRoot);
        return newRoot.toString();
    }

    private String genResourceFunctionBody(String resourceSignature) {
        return LS + "\t" + sanitizePackageNames(resourceSignature) + " {" + LS + "\t" +
                "return error(\"Not Implemented\");" + LS + "\t}" + LS;
    }

    private static String extractSchemaContent(File schemaFile) throws IOException {
        Path schemaPath = Paths.get(schemaFile.getCanonicalPath());
        return String.join(NEW_LINE, Files.readAllLines(schemaPath));
    }

    private String removeServiceTypeDefinition(String content, String svcTypeName) {
        String regex = "(?s)type\\s+" + Pattern.quote(svcTypeName)
                + "\\s+service\\s+object\\s*\\{.*?\\*graphql:Service;.*?\\};";
        String cleaned = content.replaceAll(regex, "").trim();

        // Remove import if ID type is not used
        if (!cleaned.contains(GRAPHQL_ID_ANNOT)) {
            regex = "(?m)^\\s*import\\s+ballerina/graphql;\\s*(\\r?\\n)?";
            cleaned = cleaned.replaceAll(regex, "").trim();
        }
        return cleaned;
    }
}
