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

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerLibraryFacts;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerMetadataModel;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerUISchemaModel;
import io.ballerina.modelgenerator.commons.trigger.models.TypeRef;
import io.ballerina.modelgenerator.commons.trigger.utils.TriggerLibraryIntrospector;
import io.ballerina.modelgenerator.commons.trigger.utils.TriggerUIAuthoringParser;
import io.ballerina.projects.directory.SingleFileProject;
import io.ballerina.servicemodelgenerator.extension.model.Listener;
import io.ballerina.servicemodelgenerator.extension.model.MetaData;
import io.ballerina.servicemodelgenerator.extension.model.PropertyType;
import io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import org.testng.Assert;
import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static io.ballerina.servicemodelgenerator.extension.util.Constants.PROP_KEY_LISTENER_TYPE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.PROP_KEY_VARIABLE_NAME;

/**
 * A listener init param that the L2 metadata only restyles (label, placeholder, state) and that the generic
 * listener model did not expose must still get its real type and its constructor slot, not a widget guessed
 * from its (absent) default value. This is ai.azure's Foundry listener, whose
 * {@code int|http:Listener? listenOn = ()} rendered as a {@code TEXT}/{@code string} field with no codedata,
 * so a port typed into it never reached the generated listener declaration.
 */
public class RestyledListenerParamTest {

    private static final String MODULE = "triggerfixture";
    private static final Gson GSON = new Gson();

    private static final String LIBRARY = """
            import ballerina/http;

            public type ListenerConfiguration record {|
                decimal timeout = 60;
            |};

            public type Service distinct service object {
                resource function post invocations(json payload) returns json|error;
            };

            public isolated class Listener {
                public isolated function init(int|http:Listener? listenOn = (), *ListenerConfiguration config)
                        returns error? {
                }

                public isolated function attach(Service s, string[]|string? name = ()) returns error? {
                }

                public isolated function detach(Service s) returns error? {
                }

                public isolated function 'start() returns error? {
                }

                public isolated function gracefulStop() returns error? {
                }

                public isolated function immediateStop() returns error? {
                }
            }
            """;

    /** Mirrors the formFields block of ai.azure 1.6.0's {@code trigger-ui-metadata.json}. */
    private static final String L2 = """
            {
              "version": "v1.0",
              "listeners": [{
                "target": "$listener",
                "formFields": {
                  "listenerVarName": {
                    "key": "listenerVarName",
                    "default": "fixtureListener",
                    "metadata": {"label": "Listener Name", "description": "The listener's name"},
                    "state": {"enabled": true, "editable": true, "optional": false, "advanced": false}
                  },
                  "listenOn": {
                    "key": "listenOn",
                    "placeholder": "8088",
                    "metadata": {"label": "Port", "description": "The port to listen on"},
                    "state": {"enabled": true, "editable": true, "optional": true, "advanced": true}
                  }
                }
              }]
            }
            """;

    /**
     * A listener whose first param is optional and has no field in the generic listener model, ahead of one that
     * has. The L2 restyles the first, so it is templated by the compiler while the second is templated by the
     * synthesizer's walk; both must number the slots alike.
     */
    private static final String ORDERED_LIBRARY = """
            public type Service distinct service object {
                resource function post invocations(json payload) returns json|error;
            };

            public isolated class Listener {
                public isolated function init(string? region = (), int? port = ()) returns error? {
                }

                public isolated function attach(Service s, string[]|string? name = ()) returns error? {
                }

                public isolated function detach(Service s) returns error? {
                }

                public isolated function 'start() returns error? {
                }

                public isolated function gracefulStop() returns error? {
                }

                public isolated function immediateStop() returns error? {
                }
            }
            """;

    private static final String ORDERED_L2 = """
            {
              "version": "v1.0",
              "listeners": [{
                "target": "$listener",
                "formFields": {
                  "listenerVarName": {
                    "key": "listenerVarName",
                    "default": "orderedListener",
                    "metadata": {"label": "Listener Name", "description": "The listener's name"},
                    "state": {"enabled": true, "editable": true, "optional": false, "advanced": false}
                  },
                  "region": {
                    "key": "region",
                    "placeholder": "eu",
                    "metadata": {"label": "Region", "description": "The region to serve"},
                    "state": {"enabled": true, "editable": true, "optional": true, "advanced": false}
                  },
                  "port": {
                    "key": "port",
                    "metadata": {"label": "Port", "description": "The port to listen on"},
                    "state": {"enabled": true, "editable": true, "optional": true, "advanced": false}
                  }
                }
              }]
            }
            """;

    private SemanticModel semanticModel;
    private TriggerLibraryFacts facts;
    private SemanticModel orderedSemanticModel;
    private TriggerLibraryFacts orderedFacts;

    @BeforeClass
    public void loadLibrary() throws IOException {
        semanticModel = compile(LIBRARY);
        facts = TriggerLibraryIntrospector.introspect(semanticModel, null);
        orderedSemanticModel = compile(ORDERED_LIBRARY);
        orderedFacts = TriggerLibraryIntrospector.introspect(orderedSemanticModel, null);
    }

    private static SemanticModel compile(String library) throws IOException {
        Path source = Files.createTempDirectory("restyled-listener-param").resolve("library.bal");
        Files.writeString(source, library);
        SingleFileProject project = SingleFileProject.load(source);
        return project.currentPackage().getCompilation()
                .getSemanticModel(project.currentPackage().getDefaultModule().moduleId());
    }

    @Test
    public void testRestyledParamKeepsItsRealType() {
        TriggerUISchemaModel.Property listenOn = listenOn();

        Assert.assertEquals(listenOn.metadata().label(), "Port", "the L2 restyling must still apply");
        Assert.assertEquals(listenOn.placeholder(), "8088");
        Assert.assertTrue(listenOn.optional());
        Assert.assertTrue(listenOn.advanced(), "the authored state must still win");
        Assert.assertEquals(listenOn.types().stream().map(TriggerUISchemaModel.PropertyType::fieldType).toList(),
                List.of("NUMBER", "EXPRESSION"), GSON.toJson(listenOn));
        Assert.assertEquals(listenOn.types().getFirst().ballerinaType(), "int");
        Assert.assertEquals(listenOn.types().getLast().ballerinaType(), "int|http:Listener?");
    }

    @Test
    public void testRestyledParamKeepsItsConstructorSlot() {
        TriggerUISchemaModel.Codedata codedata = listenOn().codedata();

        Assert.assertNotNull(codedata, "a listener field without codedata is never written to source");
        Assert.assertEquals(codedata.argType(), "LISTENER_PARAM_REQUIRED");
        Assert.assertEquals(codedata.originalName(), "listenOn");
        Assert.assertEquals(codedata.position(), Integer.valueOf(1));
    }

    @Test
    public void testPortTypedIntoTheFieldReachesTheListenerDeclaration() {
        TriggerUISchemaModel model = synthesize();
        ServiceInitModel initModel = toServiceInitModel(model);
        Value listenOn = findValue(initModel.getProperties(), "listenOn");
        Assert.assertNotNull(listenOn, "listenOn must reach the init form");
        listenOn.setValue("9090");

        String block = SchemaDrivenSourceGenerator.buildServiceBlockForTrigger(initModel, model);
        Assert.assertTrue(block.contains("listener triggerfixture:Listener"), "listener decl emitted: " + block);
        Assert.assertTrue(block.contains("(9090)"), "the port must be the listener's first argument: " + block);
    }

    @Test
    public void testRestyledParamAndWalkedParamTakeTheirOwnSlots() {
        TriggerUISchemaModel model = synthesizeOrdered();
        Map<String, TriggerUISchemaModel.Property> fields = listenerFields(model);

        Assert.assertEquals(fields.get("region").codedata().position(), Integer.valueOf(1), GSON.toJson(fields));
        Assert.assertEquals(fields.get("port").codedata().position(), Integer.valueOf(2), GSON.toJson(fields));
    }

    @Test
    public void testRestyledParamAndWalkedParamBothReachTheListenerDeclaration() {
        TriggerUISchemaModel model = synthesizeOrdered();
        ServiceInitModel initModel = toServiceInitModel(model);
        findValue(initModel.getProperties(), "region").setValue("\"eu\"");
        findValue(initModel.getProperties(), "port").setValue("9090");

        String block = SchemaDrivenSourceGenerator.buildServiceBlockForTrigger(initModel, model);
        Assert.assertTrue(block.contains("(\"eu\", 9090)"), "both arguments, in declaration order: " + block);
    }

    /** Mirrors {@code TriggerModelReader}'s private JSON-level {@code initProperties -> properties} remap. */
    private static ServiceInitModel toServiceInitModel(TriggerUISchemaModel model) {
        JsonObject root = GSON.toJsonTree(model).getAsJsonObject();
        JsonObject remapped = new JsonObject();
        for (String key : List.of("id", "displayName", "description", "orgName", "packageName", "moduleName",
                "version", "type", "icon")) {
            if (root.has(key)) {
                remapped.add(key, root.get(key));
            }
        }
        remapped.add("properties", root.get("initProperties"));
        return GSON.fromJson(remapped, ServiceInitModel.class);
    }

    /** The first field named {@code key}, looked for through nested properties and the enabled choice. */
    private static Value findValue(Map<String, Value> properties, String key) {
        if (properties == null) {
            return null;
        }
        if (properties.containsKey(key)) {
            return properties.get(key);
        }
        for (Value value : properties.values()) {
            Value nested = findValue(value.getProperties(), key);
            if (nested == null && value.getChoices() != null) {
                nested = value.getChoices().stream().filter(Value::isEnabled).findFirst()
                        .map(choice -> findValue(choice.getProperties(), key)).orElse(null);
            }
            if (nested != null) {
                return nested;
            }
        }
        return null;
    }

    private TriggerUISchemaModel.Property listenOn() {
        Map<String, TriggerUISchemaModel.Property> fields = listenerFields(synthesize());
        TriggerUISchemaModel.Property listenOn = fields.get("listenOn");
        Assert.assertNotNull(listenOn, "listenOn is an authored form field: " + GSON.toJson(fields.keySet()));
        return listenOn;
    }

    // A listener the L1 metadata doesn't mark reusable has its fields inlined into the init form.
    private static Map<String, TriggerUISchemaModel.Property> listenerFields(TriggerUISchemaModel model) {
        return model.listeners() == null || model.listeners().isEmpty()
                ? model.initProperties() : model.listeners().getFirst().initProperties();
    }

    /**
     * Synthesizes with no generic listener model, the state in which nothing upstream produced a template for
     * {@code listenOn} and the compiler is left with only the L2 overlay and the library's own facts.
     */
    private TriggerUISchemaModel synthesize() {
        return synthesize(facts, Map.of(), L2, semanticModel);
    }

    /** Synthesizes the ordered listener with a generic listener model that, like ListenerUtil's, has only port. */
    private TriggerUISchemaModel synthesizeOrdered() {
        Value port = new Value.ValueBuilder()
                .setMetadata(new MetaData("Port", "The port to listen on"))
                .value("")
                .types(List.of(PropertyType.types(Value.FieldType.NUMBER, "int"),
                        PropertyType.types(Value.FieldType.EXPRESSION, "int?")))
                .enabled(true).editable(true).optional(true).setAdvanced(false)
                .build();
        Map<String, Value> properties = new LinkedHashMap<>();
        properties.put(PROP_KEY_VARIABLE_NAME, new Value.ValueBuilder()
                .setMetadata(new MetaData("Name", "The name of the listener")).value("").build());
        properties.put(PROP_KEY_LISTENER_TYPE, new Value.ValueBuilder()
                .setMetadata(new MetaData("Listener Type", "The type of the listener")).value("Listener").build());
        properties.put("port", port);
        Listener listenerModel = new Listener.ListenerBuilder()
                .setId("1").setName("Listener").setType("Listener").setDisplayName("Listener")
                .setModuleName(MODULE).setOrgName("testorg").setVersion("0.1.0").setPackageName(MODULE)
                .setListenerProtocol(MODULE)
                .setProperties(properties)
                .build();
        return synthesize(orderedFacts, Map.of("Listener", listenerModel), ORDERED_L2, orderedSemanticModel);
    }

    private static TriggerUISchemaModel synthesize(TriggerLibraryFacts facts, Map<String, Listener> listenerModels,
                                                   String l2, SemanticModel semanticModel) {
        TriggerMetadataModel.Listener listener = new TriggerMetadataModel.Listener(
                "$listener", "Serves the fixture.", new TypeRef("Listener", null), null,
                List.of("$service"), false, null, null, null);
        TriggerMetadataModel.ServiceType serviceType = new TriggerMetadataModel.ServiceType(
                "$service", "A fixture service.", new TypeRef("Service", null), null, false, true, null, null,
                null, null);
        TriggerMetadataModel authoring = new TriggerMetadataModel(
                "v1.0", List.of(listener), List.of(serviceType), null, null);
        return TriggerModelSynthesizer.synthesize(authoring, facts, Map.of(), listenerModels, "1", "Fixture", null,
                "event", "testorg", MODULE, MODULE, "0.1.0", TriggerUIAuthoringParser.parse(l2), semanticModel)
                .orElseThrow();
    }
}
