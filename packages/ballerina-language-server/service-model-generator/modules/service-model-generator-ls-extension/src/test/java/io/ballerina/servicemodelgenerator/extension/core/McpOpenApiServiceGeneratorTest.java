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

import io.ballerina.mcp.core.generator.McpGenerationException;
import io.ballerina.mcp.core.model.EndpointInfo;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.List;

/**
 * Verifies the tool-selection and base-path-patching logic in {@link McpOpenApiServiceGenerator},
 * which fails loudly (rather than silently) when a selection or mcp-core's output no longer matches
 * what the generator expects.
 */
public class McpOpenApiServiceGeneratorTest {

    @Test
    public void testSelectedEndpointsReturnsAllWhenSelectionIsEmpty() throws McpGenerationException {
        List<EndpointInfo> endpoints = List.of(endpoint("getPets"), endpoint("addPet"));
        Assert.assertEquals(McpOpenApiServiceGenerator.selectedEndpoints(endpoints, null), endpoints);
        Assert.assertEquals(McpOpenApiServiceGenerator.selectedEndpoints(endpoints, List.of()), endpoints);
    }

    @Test
    public void testSelectedEndpointsFiltersToTheRequestedNames() throws McpGenerationException {
        EndpointInfo getPets = endpoint("getPets");
        EndpointInfo addPet = endpoint("addPet");
        List<EndpointInfo> selected = McpOpenApiServiceGenerator.selectedEndpoints(
                List.of(getPets, addPet), List.of("addPet"));

        Assert.assertEquals(selected, List.of(addPet));
    }

    @Test
    public void testSelectedEndpointsThrowsWhenANameDoesNotResolve() {
        List<EndpointInfo> endpoints = List.of(endpoint("getPets"));
        McpGenerationException error = Assert.expectThrows(McpGenerationException.class,
                () -> McpOpenApiServiceGenerator.selectedEndpoints(endpoints, List.of("getPets", "deletePet")));

        Assert.assertTrue(error.getMessage().contains("deletePet"), "message should name the unresolved tool");
    }

    @Test
    public void testSelectedEndpointsThrowsWhenTwoEndpointsShareAToolName() {
        List<EndpointInfo> endpoints = List.of(endpoint("getPets"), endpoint("getPets"));
        McpGenerationException error = Assert.expectThrows(McpGenerationException.class,
                () -> McpOpenApiServiceGenerator.selectedEndpoints(endpoints, List.of("getPets")));

        Assert.assertTrue(error.getMessage().contains("getPets"), "message should name the colliding tool");
    }

    @Test
    public void testSelectedEndpointsIgnoresDuplicateRequestedNames() throws McpGenerationException {
        EndpointInfo getPets = endpoint("getPets");
        List<EndpointInfo> selected = McpOpenApiServiceGenerator.selectedEndpoints(
                List.of(getPets), List.of("getPets", "getPets"));

        Assert.assertEquals(selected, List.of(getPets));
    }

    @Test
    public void testApplyBasePathRewritesTheServiceDeclaration() throws McpGenerationException {
        String source = "service mcp:StreamableHttpService /petstore on mcpListener {\n}\n";
        String result = McpOpenApiServiceGenerator.applyBasePath(source, "store");

        Assert.assertEquals(result, "service mcp:StreamableHttpService /store on mcpListener {\n}\n");
    }

    @Test
    public void testApplyBasePathLeavesSourceUntouchedWhenBlank() throws McpGenerationException {
        String source = "service mcp:StreamableHttpService /petstore on mcpListener {\n}\n";
        Assert.assertEquals(McpOpenApiServiceGenerator.applyBasePath(source, null), source);
        Assert.assertEquals(McpOpenApiServiceGenerator.applyBasePath(source, " "), source);
    }

    @Test
    public void testApplyBasePathThrowsWhenTheServiceDeclarationIsNotFound() {
        McpGenerationException error = Assert.expectThrows(McpGenerationException.class,
                () -> McpOpenApiServiceGenerator.applyBasePath("not a generated service", "store"));

        Assert.assertTrue(error.getMessage().contains("base path"));
    }

    private static EndpointInfo endpoint(String toolName) {
        return new EndpointInfo("/pets", "/pets", "get", toolName, "description",
                List.of(), List.of(), null, "http:Response|error");
    }
}
