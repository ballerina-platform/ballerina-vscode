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

package io.ballerina.servicemodelgenerator.extension.connector;

import io.ballerina.modelgenerator.commons.trigger.models.TriggerUISchemaModel;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static io.ballerina.servicemodelgenerator.extension.connector.ListenerChoiceDeriver.LISTENER_CONFIG_GROUP_KEY;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.ARG_TYPE_SERVICE_BASE_PATH;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_EXISTING_LISTENER;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_LISTENER_CONFIG;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_LISTENER_TYPE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_LISTENER_VAR_NAME;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.PROP_KEY_LISTENER_TYPE;

/**
 * Unit tests for {@link ListenerChoiceDeriver}, exercised directly against hand-built listener lists. The
 * collapse rule matters most, and is asserted as an absence — no {@code listenerType} key at all — since a
 * single-branch selector would still render a control the user has no reason to see.
 *
 * @since 1.10.0
 */
public class ListenerChoiceDeriverTest {

    @Test
    public void testNothingIsDerivedWithoutListeners() {
        Assert.assertTrue(ListenerChoiceDeriver.derive(null, null, null).isEmpty(),
                "a model declaring no `listeners` authored its listener field itself");
        Assert.assertTrue(ListenerChoiceDeriver.derive(List.of(), null, null).isEmpty(),
                "an empty `listeners` is the same as none: nothing to derive from");
    }

    @Test
    public void testSingleListenerEmitsNoListenerTypeLevel() {
        TriggerUISchemaModel.Property listener = derive(listener("Listener", "ftp:Listener", null, null));

        Assert.assertEquals(listener.codedata().type(), CD_TYPE_LISTENER_CONFIG);
        Assert.assertEquals(listener.types().getFirst().fieldType(), "CHOICE");
        Assert.assertEquals(listener.choices().size(), 2, "create-new and use-existing, always both");

        Map<String, TriggerUISchemaModel.Property> createNew = listener.choices().getFirst().properties();
        Assert.assertFalse(createNew.containsKey(PROP_KEY_LISTENER_TYPE),
                "with one listener there is nothing to choose between, so no switch may be emitted");
        Assert.assertEquals(createNew.keySet(), java.util.Set.of(LISTENER_CONFIG_GROUP_KEY));
        Assert.assertEquals(varNameType(createNew.get(LISTENER_CONFIG_GROUP_KEY)), "ftp:Listener");
    }

    @Test
    public void testSeveralListenersEachGetTheirOwnBranchAndType() {
        TriggerUISchemaModel.Property listener = derive(
                listener("StreamableHttpListener", "mcp:StreamableHttpListener", null, null),
                listener("Listener", "mcp:Listener", null, null));

        TriggerUISchemaModel.Property selector = selector(listener);
        Assert.assertNotNull(selector, "more than one listener means the user must be able to pick one");
        Assert.assertEquals(selector.codedata().type(), CD_TYPE_LISTENER_TYPE);
        Assert.assertEquals(selector.types().getFirst().fieldType(), "CHOICE");
        Assert.assertEquals(selector.value(), "0", "the first branch is selected when the form opens");
        Assert.assertEquals(selector.choices().size(), 2);

        Assert.assertEquals(varNameType(config(selector, 0)), "mcp:StreamableHttpListener");
        Assert.assertEquals(varNameType(config(selector, 1)), "mcp:Listener");
        Assert.assertTrue(selector.choices().get(0).enabled(), "branch 0 is the selected one");
        Assert.assertFalse(selector.choices().get(1).enabled());
        Assert.assertEquals(selector.choices().get(0).metadata().label(), "Streamable Http Listener",
                "a branch is labelled from its listener type when the connector states no label");
    }

    @Test
    public void testDeprecatedListenersSortLastAndKeepTheirReason() {
        TriggerUISchemaModel.Property listener = derive(
                listener("Listener", "mcp:Listener", "Use mcp:StreamableHttpListener instead.", null),
                listener("StreamableHttpListener", "mcp:StreamableHttpListener", null, null));

        TriggerUISchemaModel.Property selector = selector(listener);
        Assert.assertEquals(varNameType(config(selector, 0)), "mcp:StreamableHttpListener",
                "the listener still in favour comes first even though it is declared second");
        Assert.assertEquals(varNameType(config(selector, 1)), "mcp:Listener");
        Assert.assertTrue(selector.choices().get(0).enabled(), "a deprecated listener is never the default");

        TriggerUISchemaModel.Property deprecated = selector.choices().get(1);
        Assert.assertEquals(deprecated.metadata().deprecated(), Boolean.TRUE);
        Assert.assertEquals(deprecated.metadata().notice(), "Use mcp:StreamableHttpListener instead.",
                "the reason reaches the form, so the badge can say why");
        Assert.assertTrue(deprecated.editable(),
                "a deprecated listener stays pickable; deprecated is not the same as unavailable");
    }

    @Test
    public void testAnExplicitlyEnabledListenerBecomesTheDefault() {
        TriggerUISchemaModel.Property listener = derive(
                listener("First", "x:First", null, null),
                listener("Second", "x:Second", null, true));

        TriggerUISchemaModel.Property selector = selector(listener);
        Assert.assertEquals(selector.value(), "1");
        Assert.assertFalse(selector.choices().get(0).enabled());
        Assert.assertTrue(selector.choices().get(1).enabled());
    }

    @Test
    public void testUseExistingSelectorWidget() {
        TriggerUISchemaModel.Property defaulted = derive(listener("Listener", "ftp:Listener", null, null));
        TriggerUISchemaModel.Property selector = defaulted.choices().get(1).properties().get("existingListener");
        Assert.assertEquals(selector.codedata().type(), CD_TYPE_EXISTING_LISTENER);
        Assert.assertEquals(selector.types().getFirst().fieldType(), "SINGLE_SELECT_LISTENER",
                "a model stating no widget attaches to one listener at a time");
        Assert.assertEquals(selector.types().getFirst().ballerinaType(), "ftp:Listener",
                "a single declared listener's own qualified type is the default ballerinaType");

        Optional<TriggerUISchemaModel.Property> multi = ListenerChoiceDeriver.derive(
                List.of(listener("Listener", "smb:Listener", null, null)), "MULTI_SELECT_LISTENER", null);
        Assert.assertEquals(multi.orElseThrow().choices().get(1).properties().get("existingListener")
                .types().getFirst().fieldType(), "MULTI_SELECT_LISTENER");
    }

    /**
     * A service-level field only one listener gives meaning to lives in that listener's branch, outside the
     * section. Generation and validation walk only the enabled branch, so it applies exactly while selected.
     */
    @Test
    public void testAListenerMayContributeItsOwnServiceLevelFields() {
        TriggerUISchemaModel.Property listener = derive(
                listener("StreamableHttpListener", "mcp:StreamableHttpListener", null, null, basePath()),
                listener("StdioListener", "mcp:StdioListener", null, null));

        TriggerUISchemaModel.Property selector = selector(listener);
        Map<String, TriggerUISchemaModel.Property> httpBranch = selector.choices().get(0).properties();
        Map<String, TriggerUISchemaModel.Property> stdioBranch = selector.choices().get(1).properties();

        Assert.assertTrue(httpBranch.containsKey("basePath"),
                "the transport with a URL space offers a base path");
        Assert.assertFalse(stdioBranch.containsKey("basePath"),
                "the transport without one must not, or the user would be asked for a meaningless value");
        Assert.assertEquals(httpBranch.get("basePath").codedata().type(), ARG_TYPE_SERVICE_BASE_PATH);
        Assert.assertEquals(List.copyOf(httpBranch.keySet()), List.of(LISTENER_CONFIG_GROUP_KEY, "basePath"));
        Assert.assertFalse(httpBranch.get(LISTENER_CONFIG_GROUP_KEY).properties().containsKey("basePath"),
                "a service-level field must never end up inside the listener's own section");
    }

    /** A lone listener still contributes its service-level fields; there is just no selector above it. */
    @Test
    public void testASingleListenerStillContributesItsServiceLevelFields() {
        TriggerUISchemaModel.Property listener = derive(
                listener("Listener", "mcp:Listener", null, null, basePath()));

        Map<String, TriggerUISchemaModel.Property> createNew = listener.choices().getFirst().properties();
        Assert.assertFalse(createNew.containsKey(PROP_KEY_LISTENER_TYPE), "still nothing to choose between");
        Assert.assertEquals(List.copyOf(createNew.keySet()), List.of(LISTENER_CONFIG_GROUP_KEY, "basePath"));
    }

    /** The section and the switch are named by the model; the defaults cannot be connector-specific. */
    @Test
    public void testTheSectionAndSwitchAreNamedByTheModel() {
        TriggerUISchemaModel.ListenerFormModel form = new TriggerUISchemaModel.ListenerFormModel(
                new TriggerUISchemaModel.Metadata("Transport", "How this service is reached", null, null, null,
                        null, null, null, null, null),
                new TriggerUISchemaModel.Metadata("Transport Kind", "Pick the transport to serve over", null,
                        null, null, null, null, null, null, null));
        TriggerUISchemaModel.Property listener = ListenerChoiceDeriver.derive(
                List.of(listener("StreamableHttpListener", "mcp:StreamableHttpListener", null, null),
                        listener("Listener", "mcp:Listener", null, null)), null, form).orElseThrow();

        TriggerUISchemaModel.Property selector = selector(listener);
        TriggerUISchemaModel.Property section = selector.choices().getFirst().properties()
                .get(LISTENER_CONFIG_GROUP_KEY);
        Assert.assertEquals(section.metadata().label(), "Transport");
        Assert.assertEquals(section.metadata().description(), "How this service is reached");
        Assert.assertEquals(selector.metadata().label(), "Transport Kind");
        Assert.assertEquals(selector.metadata().description(), "Pick the transport to serve over",
                "the description is what the form renders above the options");
    }

    @Test
    public void testFullListenerFormNamesEachLevelIndependently() {
        TriggerUISchemaModel.Metadata section = metadata("Configure FTP Listener", "Choose a listener");
        TriggerUISchemaModel.Metadata selector = metadata("Protocol", "Choose a protocol");
        TriggerUISchemaModel.Metadata create = metadata("Create new", "Create a listener");
        TriggerUISchemaModel.Metadata existing = metadata("Use existing", "Reuse a listener");
        TriggerUISchemaModel.Metadata config = metadata("Listener Configuration", "Configure the listener");
        TriggerUISchemaModel.ListenerFormModel form = new TriggerUISchemaModel.ListenerFormModel(
                section, selector, create, existing, config);

        TriggerUISchemaModel.Property listener = ListenerChoiceDeriver.derive(
                List.of(listener("Listener", "ftp:Listener", null, null)), null, form).orElseThrow();
        Assert.assertEquals(listener.metadata().label(), "Configure FTP Listener");
        Assert.assertEquals(listener.choices().get(0).metadata().label(), "Create new");
        Assert.assertEquals(listener.choices().get(1).metadata().label(), "Use existing");
        Assert.assertEquals(listener.choices().get(0).types().getFirst().fieldType(), "FORM");
        Assert.assertEquals(listener.choices().get(0).properties().get(LISTENER_CONFIG_GROUP_KEY)
                .metadata().label(), "Listener Configuration");
    }

    @Test
    public void testTheGenericWordingIsUsedWhenTheModelStatesNone() {
        TriggerUISchemaModel.Property listener = derive(
                listener("StreamableHttpListener", "mcp:StreamableHttpListener", null, null),
                listener("Listener", "mcp:Listener", null, null));
        TriggerUISchemaModel.Property selector = selector(listener);
        Assert.assertEquals(selector.metadata().label(), "Listener Type");
        Assert.assertEquals(selector.choices().getFirst().properties().get(LISTENER_CONFIG_GROUP_KEY)
                .metadata().label(), "Listener Configuration");
    }

    private static TriggerUISchemaModel.Metadata metadata(String label, String description) {
        return new TriggerUISchemaModel.Metadata(label, description, null, null, null, null, null, null, null,
                null);
    }

    // ---- helpers -------------------------------------------------------------------------------

    private TriggerUISchemaModel.Property derive(TriggerUISchemaModel.ListenerModel... listeners) {
        return ListenerChoiceDeriver.derive(List.of(listeners), null, null)
                .orElseThrow(() -> new AssertionError("expected a derived listener field"));
    }

    private TriggerUISchemaModel.ListenerModel listener(String name, String ballerinaType, String deprecated,
                                                        Boolean enabled) {
        return listener(name, ballerinaType, deprecated, enabled, null);
    }

    private TriggerUISchemaModel.ListenerModel listener(String name, String ballerinaType, String deprecated,
                                                        Boolean enabled,
                                                        Map<String, TriggerUISchemaModel.Property> service) {
        Map<String, TriggerUISchemaModel.Property> fields = new LinkedHashMap<>();
        fields.put("listenerVarName", new TriggerUISchemaModel.Property(
                new TriggerUISchemaModel.Metadata("Listener Name", null, null, null, null, null, null, null,
                        null, null),
                true, true, false, false, null, "aListener",
                List.of(new TriggerUISchemaModel.PropertyType("IDENTIFIER", true, ballerinaType, null, null,
                        null, null, null)),
                null, null, null,
                TriggerUISchemaModel.Codedata.builder().type(CD_TYPE_LISTENER_VAR_NAME).build(), null));
        return new TriggerUISchemaModel.ListenerModel(
                new TriggerUISchemaModel.Metadata(null, "doc", deprecated, null, null, null, null, null,
                        deprecated == null ? null : true, null),
                name, ballerinaType, enabled, fields, service, null);
    }

    /** A base-path field, the canonical service-level field only some transports give meaning to. */
    private Map<String, TriggerUISchemaModel.Property> basePath() {
        Map<String, TriggerUISchemaModel.Property> service = new LinkedHashMap<>();
        service.put("basePath", new TriggerUISchemaModel.Property(
                new TriggerUISchemaModel.Metadata("Base Path", null, null, null, null, null, null, null, null,
                        null),
                true, true, false, false, null, "/mcp",
                List.of(new TriggerUISchemaModel.PropertyType("SERVICE_PATH", true, "string", null, null, null,
                        null, null)),
                null, null, null,
                TriggerUISchemaModel.Codedata.builder().type(ARG_TYPE_SERVICE_BASE_PATH).build(), null));
        return service;
    }

    /** The listener-kind switch, which sits above the section it configures. */
    private TriggerUISchemaModel.Property selector(TriggerUISchemaModel.Property listener) {
        return listener.choices().getFirst().properties().get(PROP_KEY_LISTENER_TYPE);
    }

    /** The construction section of one listener-type branch. */
    private TriggerUISchemaModel.Property config(TriggerUISchemaModel.Property selector, int branch) {
        return selector.choices().get(branch).properties().get(LISTENER_CONFIG_GROUP_KEY);
    }

    /** The listener type a section's name field states. */
    private String varNameType(TriggerUISchemaModel.Property section) {
        Assert.assertEquals(section.types().getFirst().fieldType(), "GROUP_SECTION");
        return section.properties().get("listenerVarName").types().getFirst().ballerinaType();
    }
}
