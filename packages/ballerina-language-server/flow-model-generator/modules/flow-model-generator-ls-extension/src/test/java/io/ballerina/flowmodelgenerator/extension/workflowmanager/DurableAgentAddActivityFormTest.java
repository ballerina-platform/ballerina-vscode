/*
 *  Copyright (c) 2026, WSO2 LLC. (http://www.wso2.org)
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

package io.ballerina.flowmodelgenerator.extension.workflowmanager;

import com.google.gson.JsonObject;
import io.ballerina.flowmodelgenerator.extension.request.FlowModelNodeTemplateRequest;
import io.ballerina.modelgenerator.commons.AbstractLSTest;
import io.ballerina.tools.text.LinePosition;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.io.IOException;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/**
 * Pins what the durable agent's Register Activity form shows. A golden cannot guard this: it is
 * regenerated with whatever the builder emits, which is how wso2/product-integrator#2622 landed.
 *
 * @since 1.8.0
 */
public class DurableAgentAddActivityFormTest extends AbstractLSTest {

    private static final String SOURCE = "durable_agent_activities.bal";
    // Inside the body of `interactWithBillingAgent`, right after the `billingAgent` declaration: where
    // the designer requests the form from. Zero-based; keep in step with the fixture's layout.
    private static final LinePosition INSIDE_INTERACT_FUNCTION = LinePosition.from(27, 0);

    @Test(description = "Registering a chosen activity asks for its bindings and the two policies, nothing more")
    public void testChosenActivityFormShowsBindingsAndPoliciesOnly() throws IOException {
        Map<String, JsonObject> properties = templateProperties("lookupBill");
        Assert.assertEquals(visible(properties), Set.of("bindings.api", "approvalPolicy", "retryPolicy"));
        assertHidden(properties, "activity", "name", "description");
        Assert.assertEquals(properties.get("activity").get("value").getAsString(), "lookupBill");
    }

    @Test(description = "From the palette the form offers the activity selector and the policies; the entry's "
            + "name and description are still not asked for")
    public void testPaletteFormShowsSelectorAndPoliciesOnly() throws IOException {
        Map<String, JsonObject> properties = templateProperties(null);
        Assert.assertEquals(visible(properties), Set.of("activity", "approvalPolicy", "retryPolicy"));
        assertHidden(properties, "name", "description");
    }

    @Override
    protected Object[] getConfigsList() {
        return new Object[0];
    }

    @Override
    @Test(enabled = false)
    public void test(Path config) {
        // The scenarios above are plain test methods; there are no config files to drive.
    }

    private static void assertHidden(Map<String, JsonObject> properties, String... keys) {
        for (String key : keys) {
            Assert.assertTrue(properties.containsKey(key), "The template has no '" + key + "' property");
            Assert.assertTrue(properties.get(key).get("hidden").getAsBoolean(), key + " must be hidden");
        }
    }

    private Map<String, JsonObject> templateProperties(String activitySymbol) throws IOException {
        JsonObject codedata = new JsonObject();
        codedata.addProperty("node", "DURABLE_AGENT_ADD_ACTIVITY");
        codedata.addProperty("org", "ballerina");
        codedata.addProperty("module", "workflow");
        if (activitySymbol != null) {
            codedata.addProperty("symbol", activitySymbol);
        }
        FlowModelNodeTemplateRequest request = new FlowModelNodeTemplateRequest(
                sourceDir.resolve(SOURCE).toAbsolutePath().toString(), INSIDE_INTERACT_FUNCTION, codedata);
        JsonObject properties = getResponseAndCloseFile(request, SOURCE)
                .getAsJsonObject("flowNode").getAsJsonObject("properties");
        Map<String, JsonObject> byKey = new LinkedHashMap<>();
        properties.entrySet().forEach(entry -> byKey.put(entry.getKey(), entry.getValue().getAsJsonObject()));
        return byKey;
    }

    private static Set<String> visible(Map<String, JsonObject> properties) {
        Set<String> keys = new TreeSet<>();
        properties.forEach((key, property) -> {
            if (!property.get("hidden").getAsBoolean()) {
                keys.add(key);
            }
        });
        return keys;
    }

    @Override
    protected String getResourceDir() {
        return "node_template";
    }

    @Override
    protected Class<? extends AbstractLSTest> clazz() {
        return DurableAgentAddActivityFormTest.class;
    }

    @Override
    protected String getApiName() {
        return "getNodeTemplate";
    }
}
