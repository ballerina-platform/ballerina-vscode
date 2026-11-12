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

package io.ballerina.artifactsgenerator;

import io.ballerina.compiler.syntax.tree.NodeParser;
import io.ballerina.compiler.syntax.tree.ServiceDeclarationNode;
import io.ballerina.designmodelgenerator.core.CommonUtils;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.Optional;

/**
 * Test the attach-point naming branch and its quote handling.
 *
 * @since 1.0.0
 */
public class ArtifactNamingTest {

    @Test(description = "Name Azure Files and SMB services from the attach point, and no other module")
    public void testUsesAttachPointAsName() {
        Assert.assertTrue(Artifact.usesAttachPointAsName("azure.storage.files"));
        // SMB's @smb:ServiceConfig path wins when present, so this is only its fallback.
        Assert.assertTrue(Artifact.usesAttachPointAsName("smb"));
        Assert.assertFalse(Artifact.usesAttachPointAsName("ftp"));
        Assert.assertFalse(Artifact.usesAttachPointAsName("http"));
        Assert.assertFalse(Artifact.usesAttachPointAsName(null));
        Assert.assertFalse(Artifact.usesAttachPointAsName("not.a.module"));
    }

    @Test(description = "Strip the quotes a string-literal attach point arrives with")
    public void testUnquote() {
        Assert.assertEquals(Artifact.unquote("\"/invoices\""), "/invoices");
        // The identifier form `service /invoices on lsn` reaches the builder already unquoted.
        Assert.assertEquals(Artifact.unquote("/invoices"), "/invoices");
        Assert.assertEquals(Artifact.unquote("\"\""), "");
        Assert.assertEquals(Artifact.unquote("\""), "\"");
        Assert.assertEquals(Artifact.unquote(""), "");
        Assert.assertNull(Artifact.unquote(null));
    }

    @Test(description = "Treat an identifier that only repeats the display label as no identifier")
    public void testRepeatsLabel() {
        Assert.assertTrue(Artifact.repeatsLabel("MCP Service", "MCP Service"));
        Assert.assertTrue(Artifact.repeatsLabel(" mcp service ", "MCP Service"));
        Assert.assertFalse(Artifact.repeatsLabel("Greeter Tools", "MCP Service"));
        Assert.assertFalse(Artifact.repeatsLabel("MCP Service v2", "MCP Service"));
        Assert.assertFalse(Artifact.repeatsLabel(null, "MCP Service"));
        Assert.assertFalse(Artifact.repeatsLabel("MCP Service", null));
    }

    @Test(description = "Read an artifact name from a top-level or a dotted, nested service annotation field")
    public void testExtractServiceAnnotationField() {
        ServiceDeclarationNode mcp = service("""
                @mcpv2:StreamableHttpServiceConfig {
                    info: {name: "Greeter Tools", version: "1.0.0"},
                    protocolMode: "auto"
                }
                service mcpv2:StreamableHttpService /mcp on mcpListener {
                }
                """);
        Assert.assertEquals(CommonUtils.extractServiceAnnotationField(mcp, "info.name"), Optional.of("Greeter Tools"));
        Assert.assertEquals(CommonUtils.extractServiceAnnotationField(mcp, "protocolMode"), Optional.of("auto"));
        Assert.assertEquals(CommonUtils.extractServiceAnnotationField(mcp, "info.title"), Optional.empty());
        // A path through a non-mapping value, or past a leaf, finds nothing.
        Assert.assertEquals(CommonUtils.extractServiceAnnotationField(mcp, "protocolMode.name"), Optional.empty());
        Assert.assertEquals(CommonUtils.extractServiceAnnotationField(mcp, "info.name.first"), Optional.empty());

        ServiceDeclarationNode rabbit = service("""
                @rabbitmq:ServiceConfig {queueName: "orders"}
                service rabbitmq:Service on orderListener {
                }
                """);
        Assert.assertEquals(CommonUtils.extractServiceAnnotationField(rabbit, "queueName"), Optional.of("orders"));

        ServiceDeclarationNode unnamed = service("""
                @mcpv2:StreamableHttpServiceConfig {info: {name: "", version: "1.0.0"}}
                service mcpv2:StreamableHttpService /mcp on mcpListener {
                }
                """);
        Assert.assertEquals(CommonUtils.extractServiceAnnotationField(unnamed, "info.name"), Optional.empty(),
                "an empty name must not produce a trailing separator");
    }

    private static ServiceDeclarationNode service(String source) {
        return (ServiceDeclarationNode) NodeParser.parseModuleMemberDeclaration(source);
    }
}
