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

import io.ballerina.modelgenerator.commons.trigger.models.TriggerLibraryFacts;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerMetadataModel;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerUIMetadataModel;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerUISchemaModel;
import io.ballerina.modelgenerator.commons.trigger.models.TypeRef;
import io.ballerina.modelgenerator.commons.trigger.models.ValueSpec;
import io.ballerina.modelgenerator.commons.trigger.utils.TriggerUIAuthoringParser;
import io.ballerina.servicemodelgenerator.extension.connector.adapter.TriggerFunctionAdapter;
import io.ballerina.servicemodelgenerator.extension.connector.adapter.TriggerServiceAdapter;
import io.ballerina.servicemodelgenerator.extension.connector.adapter.TriggerSourceMerger;
import io.ballerina.servicemodelgenerator.extension.model.Function;
import io.ballerina.servicemodelgenerator.extension.model.Service;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Stream;

/**
 * A resource handler whose L1 {@code path} spec pins one literal path (ai.azure's Foundry hosted agent:
 * {@code post invocations}, {@code get readiness}, {@code get invocations/[string invocationId]}) is a
 * fixed route, not a user-chosen one. Every such handler must be synthesized under its own path, keep
 * that path read-only, receive its L2 overlay, emit that path in source, and bind back to the same
 * handler when read from source -- even when several handlers share an accessor.
 *
 * @since 1.10.0
 */
public class PinnedResourcePathTest {

    private static final String MODULE = "triggerfixture";

    /** id, accessor, pinned path -- two GET handlers, so the accessor alone can't tell them apart. */
    private static final List<String[]> PINNED = List.of(
            new String[]{"$service.invoke", "post", "invocations"},
            new String[]{"$service.readiness", "get", "readiness"},
            new String[]{"$service.getInvocation", "get", "invocations/[string invocationId]"},
            new String[]{"$service.cancelInvocation", "post", "invocations/[string invocationId]/cancel"});

    private static final String L2 = """
            {
              "version": "v1.0",
              "serviceTypes": [{
                "target": "$service",
                "handlers": [
                  {"target": "$service.invoke", "metadata": {"label": "Invoke", "badge": "POST"},
                   "nameEditable": false},
                  {"target": "$service.readiness", "metadata": {"label": "Readiness Probe", "badge": "GET"},
                   "nameEditable": false},
                  {"target": "$service.getInvocation", "metadata": {"label": "Get Invocation", "badge": "GET"},
                   "nameEditable": false},
                  {"target": "$service.cancelInvocation",
                   "metadata": {"label": "Cancel Invocation", "badge": "POST"}, "nameEditable": false}
                ]
              }]
            }
            """;

    @Test
    public void testPinnedPathIsTheHandlersFixedName() {
        TriggerUISchemaModel.ServiceTypeModel type = synthesize(null).serviceTypes().get(0);
        for (String[] pinned : PINNED) {
            TriggerUISchemaModel.FunctionModel function = byPath(type, pinned[2]);
            Assert.assertFalse(Boolean.TRUE.equals(function.nameEditable()), pinned[0] + " path must be read-only");
            Assert.assertEquals(function.accessor(), pinned[1], pinned[0]);
            Assert.assertEquals(SchemaDrivenSourceGenerator.buildFunctionSource(function).lines().findFirst()
                    .orElseThrow(), "resource function " + pinned[1] + " " + pinned[2] + "() {", pinned[0]);
            Function wire = TriggerFunctionAdapter.toFunction(function);
            Assert.assertFalse(wire.getName().isEditable(), pinned[0] + " must not offer a Resource Path field");
        }
    }

    @Test
    public void testL2OverlayReachesEveryPinnedHandler() {
        TriggerUISchemaModel.ServiceTypeModel type = synthesize(TriggerUIAuthoringParser.parse(L2))
                .serviceTypes().get(0);
        for (String[] pinned : PINNED) {
            TriggerUISchemaModel.FunctionModel function = byPath(type, pinned[2]);
            Assert.assertEquals(function.metadata().badge(), pinned[1].toUpperCase(Locale.ROOT),
                    pinned[0] + " lost its L2 badge");
        }
        Assert.assertEquals(byPath(type, "readiness").metadata().label(), "Readiness Probe");
        Assert.assertEquals(byPath(type, "invocations/[string invocationId]").metadata().label(),
                "Get Invocation");
    }

    @Test
    public void testSourceResourcesBindToTheHandlerServingTheirPath() {
        Service service = TriggerServiceAdapter.toServiceTemplate(synthesize(TriggerUIAuthoringParser.parse(L2)),
                "Service", "testorg", MODULE, MODULE);
        // Path parameter names are the user's: `[string id]` serves the same route as `[string invocationId]`.
        TriggerSourceMerger.mergeSource(service, List.of(
                sourceResource("get", "invocations/[string id]"),
                sourceResource("get", "readiness"),
                sourceResource("post", "invocations")));

        Assert.assertEquals(labelOf(service, "invocations/[string id]"), "Get Invocation");
        Assert.assertEquals(labelOf(service, "readiness"), "Readiness Probe");
        Assert.assertEquals(labelOf(service, "invocations"), "Invoke");
        Assert.assertEquals(service.getSchemaFunctions().stream().map(fn -> fn.getMetadata().label()).toList(),
                List.of("Cancel Invocation"), "only the handler not yet in source stays addable");
    }

    @Test
    public void testResourcePathShapeIgnoresParameterNamesAndWhitespace() {
        Assert.assertEquals(TriggerSourceMerger.resourcePathShape("invocations/[string  id]/cancel"),
                TriggerSourceMerger.resourcePathShape("invocations/[string invocationId]/cancel"));
        Assert.assertEquals(TriggerSourceMerger.resourcePathShape("files/[string... rest]"), "files/[string...]");
        Assert.assertNotEquals(TriggerSourceMerger.resourcePathShape("items/[int id]"),
                TriggerSourceMerger.resourcePathShape("items/[string id]"));
    }

    private static TriggerUISchemaModel synthesize(TriggerUIMetadataModel l2) {
        List<TriggerMetadataModel.ServiceType.HandlerOption> options = PINNED.stream()
                .map(p -> new TriggerMetadataModel.ServiceType.HandlerOption(p[0], p[2], "resource", null,
                        "A Foundry route.", null, "optional", null, List.of(), null,
                        new ValueSpec("required", List.of(p[1])), new ValueSpec("required", List.of(p[2])),
                        null))
                .toList();
        TriggerMetadataModel.Listener listener = new TriggerMetadataModel.Listener(
                "$listener", "Serves Foundry.", new TypeRef("Listener", null), null,
                List.of("$service"), false, null, null, null);
        TriggerMetadataModel.ServiceType serviceType = new TriggerMetadataModel.ServiceType(
                "$service", "A hosted agent.", new TypeRef("Service", null), null, false, true, null, null,
                new TriggerMetadataModel.ServiceType.Handlers(false, options), null);
        TriggerMetadataModel authoring = new TriggerMetadataModel(
                "v1.0", List.of(listener), List.of(serviceType), null, null);
        TriggerLibraryFacts facts = new TriggerLibraryFacts(
                List.of(new TriggerLibraryFacts.Listener("Listener", List.of())),
                List.of(new TriggerLibraryFacts.ServiceType("Service", "", List.of())), List.of());
        return TriggerModelSynthesizer.synthesize(authoring, facts, Map.of(), Map.of(), "1", "Foundry", null,
                "ai", "testorg", MODULE, MODULE, "0.1.0", l2, null).orElseThrow();
    }

    private static TriggerUISchemaModel.FunctionModel byPath(TriggerUISchemaModel.ServiceTypeModel type,
                                                             String path) {
        return Stream.concat(type.functions().stream(), type.schemaFunctions().stream())
                .filter(function -> path.equals(function.name()))
                .findFirst().orElseThrow(() -> new AssertionError("no handler at path " + path));
    }

    private static Function sourceResource(String accessor, String path) {
        return new Function.FunctionBuilder()
                .kind("RESOURCE")
                .name(new Value.ValueBuilder().value(path).build())
                .accessor(new Value.ValueBuilder().value(accessor).build())
                .parameters(List.of())
                .build();
    }

    private static String labelOf(Service service, String path) {
        return service.getFunctions().stream()
                .filter(function -> path.equals(function.getName().getValue()))
                .findFirst().orElseThrow(() -> new AssertionError("no function at path " + path))
                .getMetadata().label();
    }
}
