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
import io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import org.testng.Assert;
import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

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

    private SemanticModel semanticModel;
    private TriggerLibraryFacts facts;

    @BeforeClass
    public void loadLibrary() throws IOException {
        Path source = Files.createTempDirectory("restyled-listener-param").resolve("library.bal");
        Files.writeString(source, LIBRARY);
        SingleFileProject project = SingleFileProject.load(source);
        semanticModel = project.currentPackage().getCompilation()
                .getSemanticModel(project.currentPackage().getDefaultModule().moduleId());
        facts = TriggerLibraryIntrospector.introspect(semanticModel, null);
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
        TriggerUISchemaModel model = synthesize();
        // A listener the L1 metadata doesn't mark reusable has its fields inlined into the init form.
        Map<String, TriggerUISchemaModel.Property> fields = model.listeners() == null || model.listeners().isEmpty()
                ? model.initProperties() : model.listeners().getFirst().initProperties();
        TriggerUISchemaModel.Property listenOn = fields.get("listenOn");
        Assert.assertNotNull(listenOn, "listenOn is an authored form field: " + GSON.toJson(fields.keySet()));
        return listenOn;
    }

    /**
     * Synthesizes with no generic listener model, the state in which nothing upstream produced a template for
     * {@code listenOn} and the compiler is left with only the L2 overlay and the library's own facts.
     */
    private TriggerUISchemaModel synthesize() {
        TriggerMetadataModel.Listener listener = new TriggerMetadataModel.Listener(
                "$listener", "Serves the fixture.", new TypeRef("Listener", null), null,
                List.of("$service"), false, null, null, null);
        TriggerMetadataModel.ServiceType serviceType = new TriggerMetadataModel.ServiceType(
                "$service", "A fixture service.", new TypeRef("Service", null), null, false, true, null, null,
                null, null);
        TriggerMetadataModel authoring = new TriggerMetadataModel(
                "v1.0", List.of(listener), List.of(serviceType), null, null);
        return TriggerModelSynthesizer.synthesize(authoring, facts, Map.of(), Map.of(), "1", "Fixture", null,
                "event", "testorg", MODULE, MODULE, "0.1.0", TriggerUIAuthoringParser.parse(L2), semanticModel)
                .orElseThrow();
    }
}
