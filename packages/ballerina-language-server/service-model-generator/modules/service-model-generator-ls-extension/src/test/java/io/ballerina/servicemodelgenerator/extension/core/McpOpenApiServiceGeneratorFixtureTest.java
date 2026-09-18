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
 *  KIND, either express or implied. See the License for the
 *  specific language governing permissions and limitations
 *  under the License.
 */

package io.ballerina.servicemodelgenerator.extension.core;

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.mcp.core.generator.McpGenerationException;
import io.ballerina.projects.BuildOptions;
import io.ballerina.projects.Document;
import io.ballerina.projects.Module;
import io.ballerina.projects.Project;
import io.ballerina.projects.directory.BuildProject;
import io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import org.eclipse.lsp4j.TextEdit;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * L1 fixture test for {@link McpOpenApiServiceGenerator#generateService}: generates a real MCP
 * service from a checked-in OpenAPI spec into a project that already has a prior MCP-from-OpenAPI
 * import, and asserts on the actual generated source. This pins the word-boundary identifier
 * replacement, the port substitution, and the leading-import dedup against a future mcp-core bump.
 */
public class McpOpenApiServiceGeneratorFixtureTest {

    @Test
    public void testGenerateServiceUniquifiesNamesAndDedupesImports() throws Exception {
        Path projectPath = Paths.get(getClass().getClassLoader()
                .getResource("mcp_openapi_generator/source/sample1").toURI());
        Path specPath = Paths.get(getClass().getClassLoader()
                .getResource("mcp_openapi_generator/openapi.yaml").toURI());

        Project project = BuildProject.load(projectPath, BuildOptions.builder().setOffline(true).build());
        Module module = project.currentPackage().getDefaultModule();
        Document mainDocument = module.document(module.documentIds().stream().findFirst().orElseThrow());
        SemanticModel semanticModel = project.currentPackage().getCompilation()
                .getSemanticModel(module.moduleId());

        ServiceInitModel model = new ServiceInitModel.Builder().build();
        model.addProperty("serviceName", new Value.ValueBuilder().value("Petstore").build());
        model.addProperty("version", new Value.ValueBuilder().value("1.0.0").build());
        model.addProperty("listenTo", new Value.ValueBuilder().value("9090").build());
        model.addProperty("listenerVarName", new Value.ValueBuilder().value("mcpListener").build());
        model.addProperty("basePath", new Value.ValueBuilder().value("/petstore").build());
        model.setSelectedTools(List.of("getPets"));

        McpOpenApiServiceGenerator generator = new McpOpenApiServiceGenerator(specPath, projectPath);
        Map<String, List<TextEdit>> edits = generator.generateService(model, mainDocument, null, semanticModel);

        String mainBalPath = projectPath.resolve("main.bal").toAbsolutePath().toString();
        Assert.assertTrue(edits.containsKey(mainBalPath), edits.keySet().toString());
        String generated = edits.get(mainBalPath).stream()
                .map(TextEdit::getNewText)
                .collect(Collectors.joining());

        // Uniquified against the apiClient/mcpListener the fixture's main.bal already declares.
        Assert.assertTrue(generated.contains("http:Client apiClient1 = check new"), generated);
        Assert.assertTrue(generated.contains("listener mcp:StreamableHttpListener mcpListener1 = check new (9090)"),
                generated);
        Assert.assertTrue(generated.contains("/petstore on mcpListener1"), generated);

        // Only the selected tool is generated.
        Assert.assertTrue(generated.contains("remote function getPets"), generated);
        Assert.assertFalse(generated.contains("deletePet"), generated);

        // ballerina/http and ballerina/mcp are already imported in main.bal and must not be
        // re-imported; ballerina/log is missing and must be added exactly once.
        long httpImports = countOccurrences(generated, "import ballerina/http;");
        long logImports = countOccurrences(generated, "import ballerina/log;");
        long mcpImports = countOccurrences(generated, "import ballerina/mcp;");
        Assert.assertEquals(httpImports, 0, generated);
        Assert.assertEquals(logImports, 1, generated);
        Assert.assertEquals(mcpImports, 0, generated);
    }

    @Test
    public void testGenerateServiceThrowsWhenGeneratedTypeAlreadyExists() throws Exception {
        Path projectPath = Paths.get(getClass().getClassLoader()
                .getResource("mcp_openapi_generator/source/sample2").toURI());
        Path specPath = Paths.get(getClass().getClassLoader()
                .getResource("mcp_openapi_generator/openapi_with_schema.yaml").toURI());

        Project project = BuildProject.load(projectPath, BuildOptions.builder().setOffline(true).build());
        Module module = project.currentPackage().getDefaultModule();
        Document mainDocument = module.document(module.documentIds().stream().findFirst().orElseThrow());
        SemanticModel semanticModel = project.currentPackage().getCompilation()
                .getSemanticModel(module.moduleId());

        ServiceInitModel model = new ServiceInitModel.Builder().build();
        model.addProperty("serviceName", new Value.ValueBuilder().value("Petstore").build());

        McpOpenApiServiceGenerator generator = new McpOpenApiServiceGenerator(specPath, projectPath);
        McpGenerationException error = Assert.expectThrows(McpGenerationException.class,
                () -> generator.generateService(model, mainDocument, null, semanticModel));

        Assert.assertTrue(error.getMessage().contains("Product"), error.getMessage());
    }

    private static long countOccurrences(String text, String needle) {
        return text.lines().filter(line -> line.trim().equals(needle)).count();
    }
}
