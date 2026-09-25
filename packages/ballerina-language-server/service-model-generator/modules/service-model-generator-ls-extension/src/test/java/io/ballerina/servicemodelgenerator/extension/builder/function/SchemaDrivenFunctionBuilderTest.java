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

package io.ballerina.servicemodelgenerator.extension.builder.function;

import io.ballerina.modelgenerator.commons.trigger.models.TriggerLibraryFacts;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerMetadataModel;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerUISchemaModel;
import io.ballerina.modelgenerator.commons.trigger.models.TypeRef;
import io.ballerina.modelgenerator.commons.trigger.models.ValueSpec;
import io.ballerina.servicemodelgenerator.extension.connector.TriggerModelSynthesizer;
import io.ballerina.servicemodelgenerator.extension.connector.adapter.TriggerFunctionAdapter;
import io.ballerina.servicemodelgenerator.extension.model.Function;
import io.ballerina.servicemodelgenerator.extension.model.Listener;
import io.ballerina.servicemodelgenerator.extension.model.MetaData;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static io.ballerina.servicemodelgenerator.extension.util.Constants.PROP_KEY_LISTENER_TYPE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.PROP_KEY_VARIABLE_NAME;

/**
 * Tests for {@link SchemaDrivenFunctionBuilder}'s connector metadata overlay.
 */
public class SchemaDrivenFunctionBuilderTest {

    private static final String MODULE = "triggerfixture";

    @Test
    public void testResourceTakesMetadataOfTemplatePinnedToItsAccessor() {
        ValueSpec requiredPath = new ValueSpec("required", null);
        TriggerUISchemaModel model = synthesize(List.of(
                new TriggerMetadataModel.ServiceType.HandlerOption("$service.*", "*", "resource", "many",
                        "Serves any resource.", null, null, null, List.of(), null,
                        new ValueSpec("required", List.of("*")), requiredPath, null),
                new TriggerMetadataModel.ServiceType.HandlerOption("$service.get", "get", "resource", null,
                        "Serves a get resource.", null, "optional", null, List.of(), null,
                        new ValueSpec("required", List.of("get")), requiredPath, null)));
        TriggerUISchemaModel.FunctionModel wildcard = model.serviceTypes().get(0).schemaFunctions().get(0);

        Function function = TriggerFunctionAdapter.toFunction(wildcard);
        function.getAccessor().setValue("get");

        SchemaDrivenFunctionBuilder.overlayConnectorMetadata(function, model, null);

        Assert.assertEquals(function.getMetadata().description(), "Serves a get resource.",
                "the get template, not the wildcard that merely lists get, supplies the metadata");
    }

    private static TriggerUISchemaModel synthesize(List<TriggerMetadataModel.ServiceType.HandlerOption> options) {
        TriggerMetadataModel.Listener listener = new TriggerMetadataModel.Listener(
                "$listener", "Listens for events.", new TypeRef("Listener", null), null,
                List.of("$service"), false, null, null, null);
        TriggerMetadataModel.ServiceType serviceType = new TriggerMetadataModel.ServiceType(
                "$service", "A service.", new TypeRef("Service", null), null, false, false, null, null,
                new TriggerMetadataModel.ServiceType.Handlers(false, options), null);
        TriggerMetadataModel authoring = new TriggerMetadataModel(
                "v1.0", List.of(listener), List.of(serviceType), null, null);
        TriggerLibraryFacts facts = new TriggerLibraryFacts(
                List.of(new TriggerLibraryFacts.Listener("Listener", List.of())),
                List.of(new TriggerLibraryFacts.ServiceType("Service", "", List.of())), List.of());
        return TriggerModelSynthesizer.synthesize(authoring, facts, listenerModel(), "1", "Test", null,
                "event", "testorg", MODULE, MODULE, "0.1.0").orElseThrow();
    }

    private static Listener listenerModel() {
        Map<String, Value> properties = new LinkedHashMap<>();
        properties.put(PROP_KEY_VARIABLE_NAME, new Value.ValueBuilder()
                .setMetadata(new MetaData("Name", "The name of the listener")).value("").build());
        properties.put(PROP_KEY_LISTENER_TYPE, new Value.ValueBuilder()
                .setMetadata(new MetaData("Listener Type", "The type of the listener")).value("Listener").build());
        return new Listener.ListenerBuilder()
                .setId("1").setName("Listener").setType("Listener").setDisplayName("Listener")
                .setModuleName(MODULE).setOrgName("testorg").setVersion("0.1.0").setPackageName(MODULE)
                .setListenerProtocol(MODULE)
                .setProperties(properties)
                .build();
    }
}
