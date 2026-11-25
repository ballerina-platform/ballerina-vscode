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

package io.ballerina.flowmodelgenerator.extension.toolkitmanager;

import com.google.gson.JsonObject;
import io.ballerina.flowmodelgenerator.extension.chunkermanager.GetNodeTemplateTest;
import io.ballerina.flowmodelgenerator.extension.request.FlowModelNodeTemplateRequest;
import io.ballerina.modelgenerator.commons.AbstractLSTest;
import io.ballerina.tools.text.LinePosition;
import org.testng.Assert;
import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;

import java.io.IOException;
import java.nio.file.Path;

/**
 * Test for getting the A2A toolkit node template, which is built from the init method of {@code ai:A2aToolKit}.
 *
 * @since 1.4.0
 */
public class A2aToolKitGetTemplateTest extends AbstractLSTest {

    @BeforeClass
    public void requireAiWithA2aToolKit() {
        A2aAiPackage.requireAvailable();
    }

    @Override
    @Test(enabled = false)
    public void test(Path config) throws IOException {
    }

    @Test
    public void testTemplateHasTheInitParameters() throws IOException {
        JsonObject codedata = new JsonObject();
        codedata.addProperty("node", "A2A_TOOL_KIT");
        String filePath = sourceDir.resolve("a2a_ai_local/main.bal").toAbsolutePath().toString();
        JsonObject response = getResponse(new FlowModelNodeTemplateRequest(filePath,
                LinePosition.from(1, 1), codedata));

        Assert.assertTrue(response.has("flowNode"), response.toString());
        JsonObject flowNode = response.getAsJsonObject("flowNode");
        JsonObject properties = flowNode.getAsJsonObject("properties");
        System.out.println("A2A_TEMPLATE " + flowNode);
        for (String name : new String[]{"agent", "$name", "secret", "clientConfig", "headers", "requiresApproval",
                "variable"}) {
            Assert.assertTrue(properties.has(name), "missing " + name + ": " + properties.keySet());
        }
        Assert.assertEquals(properties.getAsJsonObject("agent").getAsJsonObject("metadata").get("label")
                .getAsString(), "Agent URL");
        Assert.assertEquals(flowNode.getAsJsonObject("codedata").get("object").getAsString(), "A2aToolKit");
    }

    @Override
    protected String getResourceDir() {
        return "toolkit_manager";
    }

    @Override
    protected Class<? extends AbstractLSTest> clazz() {
        return GetNodeTemplateTest.class;
    }

    @Override
    protected String getApiName() {
        return "getNodeTemplate";
    }
}
