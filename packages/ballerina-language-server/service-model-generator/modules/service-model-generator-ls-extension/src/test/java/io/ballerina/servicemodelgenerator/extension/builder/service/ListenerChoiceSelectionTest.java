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

package io.ballerina.servicemodelgenerator.extension.builder.service;

import com.google.gson.Gson;
import io.ballerina.servicemodelgenerator.extension.model.Option;
import io.ballerina.servicemodelgenerator.extension.model.PropertyType;
import io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import static io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel.KEY_CONFIGURE_LISTENER;
import static io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel.KEY_EXISTING_LISTENER;

/**
 * Verifies {@link SchemaDrivenServiceBuilder#applyListenerChoiceSelection}: when the project has
 * existing listeners the "use existing" branch is enabled, populated with a selector, and made the
 * default; when there are none it is disabled and create-new is the default.
 *
 * @since 1.8.0
 */
public class ListenerChoiceSelectionTest {

    private final Gson gson = new Gson();

    @Test
    public void testUseExistingEnabledAndDefaultWhenListenersPresent() throws Exception {
        ServiceInitModel model = loadHubspotCreationModel();
        Value configureListener = model.getProperties().get(KEY_CONFIGURE_LISTENER);
        // Fixture ships create-new at index 0 (enabled) and use-existing at index 1 (disabled).
        Value createNew = configureListener.getChoices().get(0);
        Value useExisting = configureListener.getChoices().get(1);
        Assert.assertTrue(createNew.isEnabled());
        Assert.assertFalse(useExisting.isEnabled());

        Value prebuiltSelector = new Value.ValueBuilder()
                .metadata("Select Listener", "Select from the existing hubspot listeners")
                .value("hubspotListenerA")
                .types(List.of(PropertyType.types(Value.FieldType.SINGLE_SELECT,
                        Option.of(List.of("hubspotListenerA", "hubspotListenerB")))))
                .enabled(true)
                .editable(true)
                .build();
        SchemaDrivenServiceBuilder.applyListenerChoiceSelection(configureListener, prebuiltSelector);

        Assert.assertTrue(useExisting.isEnabled(), "use-existing must be enabled when listeners exist");
        Assert.assertFalse(createNew.isEnabled(), "create-new must be deselected by default");
        Assert.assertEquals(configureListener.getValue(), "1", "use-existing (index 1) is the default");
        // Both branches must be editable so the radio (ChoiceForm) allows switching between them.
        Assert.assertTrue(createNew.isEditable(), "create-new radio must be switchable");
        Assert.assertTrue(useExisting.isEditable(), "use-existing radio must be switchable");

        // Like FTP/RabbitMQ, the selector is nested inside the branch's listenerConfig GROUP_SECTION.
        Value selector = useExisting.getProperties().get("listenerConfig").getProperties().get(KEY_EXISTING_LISTENER);
        Assert.assertSame(selector, prebuiltSelector, "the supplied selector must be nested into the group");
    }

    @Test
    public void testUseExistingDisabledWhenNoListeners() throws Exception {
        ServiceInitModel model = loadHubspotCreationModel();
        Value configureListener = model.getProperties().get(KEY_CONFIGURE_LISTENER);

        SchemaDrivenServiceBuilder.applyListenerChoiceSelection(configureListener, null);

        Assert.assertFalse(configureListener.getChoices().get(1).isEnabled(),
                "use-existing must be disabled when no listeners exist");
        Assert.assertTrue(configureListener.getChoices().get(0).isEnabled(),
                "create-new must be the default when no listeners exist");
        Assert.assertFalse(configureListener.getChoices().get(1).isEditable(),
                "use-existing radio is disabled when there are no listeners to attach to");
        Assert.assertEquals(configureListener.getValue(), "0");
    }

    /**
     * A connector declaring several listeners nests its params under a per-listener-type branch, so locating
     * the create-new branch has to look through choices. The branches are reversed first because
     * {@code indexOfCreateNewBranch} falls back to index 0, which would mask a broken search.
     */
    @Test
    public void testCreateNewBranchIsFoundWhenParamsAreNestedUnderAListenerTypeChoice() throws Exception {
        ServiceInitModel model = loadMcpMultiCreationModel();
        Value listener = model.getProperties().get("listener");
        Collections.reverse(listener.getChoices());
        Value useExisting = listener.getChoices().get(0);
        Value createNew = listener.getChoices().get(1);

        Value prebuiltSelector = new Value.ValueBuilder()
                .metadata("Select Listener", "Select from the existing mcp listeners")
                .value("mcpListener")
                .types(List.of(PropertyType.types(Value.FieldType.SINGLE_SELECT,
                        Option.of(List.of("mcpListener")))))
                .enabled(true)
                .editable(true)
                .build();
        SchemaDrivenServiceBuilder.applyListenerChoiceSelection(listener, prebuiltSelector);

        Value nested = useExisting.getProperties().get("listenerConfig").getProperties()
                .get(KEY_EXISTING_LISTENER);
        Assert.assertSame(nested, prebuiltSelector,
                "the selector belongs in the use-existing branch; landing in create-new means the"
                        + " create-new branch was located by its index rather than by its params");
        Assert.assertEquals(listener.getValue(), "0", "use-existing is at index 0 in this fixture");
        Assert.assertFalse(createNew.isEnabled(), "create-new must be deselected once a listener exists");
        Assert.assertTrue(useExisting.isEnabled());
    }

    /**
     * Every listener-name node is collected, not just the first: a branch left holding the shipped default
     * would offer a name that may already be taken in the project.
     */
    @Test
    public void testEveryListenerVarNameNodeIsCollectedAcrossListenerTypeBranches() throws Exception {
        ServiceInitModel model = loadMcpMultiCreationModel();
        List<Value> nodes = new ArrayList<>();
        SchemaDrivenServiceBuilder.collectListenerVarNameNodes(model.getProperties(), nodes);

        Assert.assertEquals(nodes.size(), 2,
                "the fixture declares one listener name per listener-type branch");
        List<String> types = nodes.stream()
                .map(node -> node.getTypes().getFirst().ballerinaType())
                .toList();
        Assert.assertEquals(types, List.of("mcp:StreamableHttpListener", "mcp:Listener"),
                "collected in document order, each branch naming its own listener type");
    }

    private ServiceInitModel loadHubspotCreationModel() throws Exception {
        return load("connector_models/hubspot/resources/service-creation.json");
    }

    private ServiceInitModel loadMcpMultiCreationModel() throws Exception {
        return load("connector_models/mcp_multi/resources/service-creation.json");
    }

    private ServiceInitModel load(String resource) throws Exception {
        Path path = Paths.get(getClass().getClassLoader().getResource(resource).toURI());
        return gson.fromJson(Files.readString(path, StandardCharsets.UTF_8), ServiceInitModel.class);
    }
}
