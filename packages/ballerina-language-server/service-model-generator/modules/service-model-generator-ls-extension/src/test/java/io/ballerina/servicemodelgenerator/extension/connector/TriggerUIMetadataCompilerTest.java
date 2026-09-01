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

import io.ballerina.modelgenerator.commons.trigger.models.IdentifierSpec;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerLibraryFacts;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerMetadataModel;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerUIMetadataModel;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerUISchemaModel;
import io.ballerina.modelgenerator.commons.trigger.models.TypeRef;
import io.ballerina.servicemodelgenerator.extension.model.Listener;
import io.ballerina.servicemodelgenerator.extension.model.MetaData;
import io.ballerina.servicemodelgenerator.extension.model.PropertyType;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import org.testng.Assert;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static io.ballerina.servicemodelgenerator.extension.util.Constants.PROP_KEY_LISTENER_TYPE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.PROP_KEY_VARIABLE_NAME;

/**
 * Unit coverage for {@link TriggerUIMetadataCompiler}, the engine that overlays sparse L2 UI metadata
 * onto the {@link TriggerUISchemaModel} {@link TriggerModelSynthesizer} derives from L1 + semantic
 * facts. Each test hand-builds a small L1 + {@link TriggerLibraryFacts} + {@link Listener} fixture
 * (following {@link TriggerModelSynthesizerTest}'s convention), derives the pre-L2 model via the real
 * synthesizer, then applies a hand-built L2 through the real compiler -- no {@code .bala} resolution or
 * compilation, so these run fast and hermetically. Fidelity against real connector packages is a
 * separate, more expensive concern covered by {@link TriggerParityTest}.
 *
 * <p>Fixture: one connector ({@code triggerfixture}) with a reusable {@code Listener(host, port =
 * 9092)}, two concrete service types -- {@code Service} (handler {@code onMessage}, annotation {@code
 * ServiceConfig} with an optional {@code topic} field) and {@code PingService} (handler {@code onPing})
 * -- so ordering across two service types is exercisable without a second fixture.
 */
public class TriggerUIMetadataCompilerTest {

    private static final String MODULE = "triggerfixture";

    // ---- fixture construction (mirrors TriggerModelSynthesizerTest's convention) ----

    private static Value textValue(String ballerinaType) {
        return new Value.ValueBuilder()
                .setMetadata(new MetaData("Label", "Description"))
                .value("")
                .types(List.of(PropertyType.types(Value.FieldType.TEXT, ballerinaType),
                        PropertyType.types(Value.FieldType.EXPRESSION, ballerinaType)))
                .enabled(true).editable(true).optional(false).setAdvanced(false)
                .build();
    }

    private static Value numberValue(String ballerinaType, boolean optional) {
        return new Value.ValueBuilder()
                .setMetadata(new MetaData("Label", "Description"))
                .value("")
                .types(List.of(PropertyType.types(Value.FieldType.NUMBER, ballerinaType),
                        PropertyType.types(Value.FieldType.EXPRESSION, ballerinaType)))
                .enabled(true).editable(true).optional(optional).setAdvanced(false)
                .build();
    }

    private static Listener listenerModel() {
        Map<String, Value> properties = new LinkedHashMap<>();
        properties.put(PROP_KEY_VARIABLE_NAME, new Value.ValueBuilder()
                .setMetadata(new MetaData("Name", "The name of the listener")).value("").build());
        properties.put(PROP_KEY_LISTENER_TYPE, new Value.ValueBuilder()
                .setMetadata(new MetaData("Listener Type", "The type of the listener")).value("Listener").build());
        properties.put("host", textValue("string"));
        properties.put("port", numberValue("int", true));
        return new Listener.ListenerBuilder()
                .setId("1").setName("Listener").setType("Listener").setDisplayName("Listener")
                .setModuleName(MODULE).setOrgName("testorg").setVersion("0.1.0").setPackageName(MODULE)
                .setListenerProtocol(MODULE)
                .setProperties(properties)
                .build();
    }

    private static TriggerMetadataModel authoring(boolean multipleServicesAllowed) {
        TypeRef listenerType = new TypeRef("Listener", null);
        TriggerMetadataModel.Listener listener = new TriggerMetadataModel.Listener(
                "$listener", "Listens for events.", listenerType, null, List.of("$service", "$pingService"),
                multipleServicesAllowed, null, null, null);

        TriggerMetadataModel.ServiceType.Handlers handlers = new TriggerMetadataModel.ServiceType.Handlers(true,
                null);
        TriggerMetadataModel.ServiceType service = new TriggerMetadataModel.ServiceType(
                "$service", "The primary service.", new TypeRef("Service", null), null, true, false,
                List.of("$serviceConfig"), new IdentifierSpec(IdentifierSpec.PRESENCE_OPTIONAL,
                        List.of(IdentifierSpec.FORM_BASE_PATH)), handlers, null);
        TriggerMetadataModel.ServiceType pingService = new TriggerMetadataModel.ServiceType(
                "$pingService", "A ping-only service.", new TypeRef("PingService", null), null, true, false,
                null, null, handlers, null);

        TriggerMetadataModel.Annotation annotation = new TriggerMetadataModel.Annotation(
                "$serviceConfig", new TypeRef("ServiceConfig", null),
                TriggerMetadataModel.Annotation.ATTACH_POINT_SERVICE,
                TriggerMetadataModel.Annotation.PRESENCE_OPTIONAL);

        return new TriggerMetadataModel("v1.0", List.of(listener), List.of(service, pingService),
                List.of(annotation), null);
    }

    private static TriggerLibraryFacts facts() {
        TriggerLibraryFacts.Param host = new TriggerLibraryFacts.Param(
                "host", "string", false, "REQUIRED", "The listener host.", List.of());
        TriggerLibraryFacts.Param port = new TriggerLibraryFacts.Param(
                "port", "int", true, "DEFAULTABLE", "The listener port.", List.of());
        TriggerLibraryFacts.Listener listener = new TriggerLibraryFacts.Listener("Listener", List.of(host, port));

        TriggerLibraryFacts.Param payload = new TriggerLibraryFacts.Param(
                "payload", "record {}", false, "REQUIRED", "", List.of());
        TriggerLibraryFacts.Function onMessage = new TriggerLibraryFacts.Function(
                "onMessage", List.of("remote"), "REMOTE", "error?", true, "Handles an inbound message.",
                List.of(payload));
        TriggerLibraryFacts.Function onOther = new TriggerLibraryFacts.Function(
                "onOther", List.of("remote"), "REMOTE", "error?", true, "Handles another message.",
                List.of());
        TriggerLibraryFacts.ServiceType service = new TriggerLibraryFacts.ServiceType(
                "Service", "", List.of(onMessage, onOther));

        TriggerLibraryFacts.Function onPing = new TriggerLibraryFacts.Function(
                "onPing", List.of("remote"), "REMOTE", "error?", true, "Handles a ping.", List.of());
        TriggerLibraryFacts.ServiceType pingService = new TriggerLibraryFacts.ServiceType(
                "PingService", "", List.of(onPing));

        TriggerLibraryFacts.Param topic = new TriggerLibraryFacts.Param(
                "topic", "string", true, "RECORD_FIELD", "", List.of());
        TriggerLibraryFacts.Annotation annotation = new TriggerLibraryFacts.Annotation(
                "ServiceConfig", MODULE, "triggerfixture:ServiceConfigData", List.of("SERVICE"), "",
                List.of(topic));

        return new TriggerLibraryFacts(List.of(listener), List.of(service, pingService), List.of(annotation));
    }

    /** The pre-L2 derived model: real {@link TriggerModelSynthesizer} output, no compiler overlay. */
    private static TriggerUISchemaModel derived(boolean multipleServicesAllowed) {
        return TriggerModelSynthesizer.synthesize(authoring(multipleServicesAllowed), facts(), listenerModel(),
                "999", "Trigger Fixture", "https://example.test/icon.png", "event",
                "testorg", MODULE, MODULE, "0.1.0").orElseThrow();
    }

    /** {@code multipleServicesAllowed} must match whatever {@link #derived} built {@code derived} with --
     * {@link TriggerUIMetadataCompiler}'s L1 param drives {@code finalizeListenerOwnership}'s fold rule
     * independently of the pre-compiler model, so a mismatched L1 here would silently fold or not fold
     * against the wrong listener shape. */
    private static TriggerUISchemaModel apply(TriggerUISchemaModel derived, boolean multipleServicesAllowed,
                                              TriggerUIMetadataModel l2) {
        return TriggerUIMetadataCompiler.apply(derived, authoring(multipleServicesAllowed), facts(), Map.of(), null,
                l2);
    }

    private static TriggerUIMetadataModel.Target l1Target(String id) {
        return new TriggerUIMetadataModel.Target("l1", id, null, null, null, null, null, null, null, null, null);
    }

    private static TriggerUIMetadataModel.Target handlerTarget(String name) {
        return new TriggerUIMetadataModel.Target("l1", null, null, null, null, null, null, null, null, name, null);
    }

    private static TriggerUISchemaModel.ServiceTypeModel service(TriggerUISchemaModel model, String name) {
        return model.serviceTypes().stream().filter(candidate -> name.equals(candidate.name()))
                .findFirst().orElseThrow();
    }

    @Test
    public void testTriggerKindIsCanonicalAndKindRemainsCompatible() {
        TriggerUIMetadataModel.Metadata newerMetadata = new TriggerUIMetadataModel.Metadata(
                null, null, null, null, null, null, null, null, null, null, "listener", "event");
        TriggerUIMetadataModel newer = new TriggerUIMetadataModel(
                "v1.0", newerMetadata, null, null, null, null, null, null);
        TriggerUISchemaModel newerModel = apply(derived(true), true, newer);
        Assert.assertEquals(newerModel.kind(), "listener");
        Assert.assertEquals(newerModel.triggerKind(), "event");

        TriggerUIMetadataModel.Metadata legacyMetadata = new TriggerUIMetadataModel.Metadata(
                null, null, null, null, null, null, null, null, null, null, "file");
        TriggerUIMetadataModel legacy = new TriggerUIMetadataModel(
                "v1.0", legacyMetadata, null, null, null, null, null, null);
        TriggerUISchemaModel legacyModel = apply(derived(true), true, legacy);
        Assert.assertEquals(legacyModel.kind(), "file");
        Assert.assertEquals(legacyModel.triggerKind(), "file");
    }

    private static TriggerUISchemaModel.FunctionModel function(TriggerUISchemaModel model, String serviceName,
                                                                String functionName) {
        TriggerUISchemaModel.ServiceTypeModel service = service(model, serviceName);
        return service.functions().stream().filter(candidate -> functionName.equals(candidate.name()))
                .findFirst().orElseThrow();
    }

    // ---- listeners[].listener.form + metadata ----

    @Test
    public void testListenerFormAndMetadataOverlay() {
        TriggerUIMetadataModel.Metadata badge = new TriggerUIMetadataModel.Metadata(
                null, null, "Superseded soon", null, null, null, null, null, null, null, null);
        TriggerUIMetadataModel.ListenerForm form = new TriggerUIMetadataModel.ListenerForm(
                new TriggerUIMetadataModel.Metadata("Configure Listener", null, null, null, null, null, null,
                        null, null, null, null),
                null,
                new TriggerUIMetadataModel.Metadata("New", null, null, null, null, null, null, null, null, null,
                        null),
                new TriggerUIMetadataModel.Metadata("Existing", null, null, null, null, null, null, null, null,
                        null, null),
                null);
        TriggerUIMetadataModel.ListenerNode listenerNode = new TriggerUIMetadataModel.ListenerNode(
                badge, null, form, null, null);
        TriggerUIMetadataModel.TargetedNode overlay = new TriggerUIMetadataModel.TargetedNode(
                l1Target("$listener"), null, null, null, null, null, null, listenerNode,
                null, null, null, null, null);
        TriggerUIMetadataModel l2 = new TriggerUIMetadataModel(
                "v1.0", null, null, null, null, List.of(overlay), null, null);

        TriggerUISchemaModel model = apply(derived(true), true, l2);

        Assert.assertNotNull(model.listenerForm(), "listener.form must hoist to the model's listenerForm");
        Assert.assertEquals(model.listenerForm().section().label(), "Configure Listener");
        Assert.assertEquals(model.listenerForm().createNew().label(), "New");
        Assert.assertEquals(model.listenerForm().useExisting().label(), "Existing");

        Assert.assertEquals(model.listeners().size(), 1);
        Assert.assertEquals(model.listeners().get(0).metadata().notice(), "Superseded soon",
                "listener display metadata comes from listener.metadata, not the targeted node's own metadata");
    }

    // ---- listeners[].listener.serviceProperties ----

    @Test
    public void testListenerServiceProperty() {
        TriggerUIMetadataModel.Field basePath = new TriggerUIMetadataModel.Field(
                "basePath", new TriggerUIMetadataModel.Metadata("Base Path", "The service base path", null, null,
                        null, null, null, null, null, null, null),
                "/", "\"/\"", null, null, null, null, null, null, null, null, null);
        TriggerUIMetadataModel.ListenerNode listenerNode = new TriggerUIMetadataModel.ListenerNode(
                null, null, null, Map.of("basePath", basePath), null);
        TriggerUIMetadataModel.TargetedNode overlay = new TriggerUIMetadataModel.TargetedNode(
                l1Target("$listener"), null, null, null, null, null, null, listenerNode,
                null, null, null, null, null);
        TriggerUIMetadataModel l2 = new TriggerUIMetadataModel(
                "v1.0", null, null, null, null, List.of(overlay), null, null);

        TriggerUISchemaModel model = apply(derived(true), true, l2);

        TriggerUISchemaModel.ListenerModel listener = model.listeners().get(0);
        Assert.assertNotNull(listener.serviceProperties(), "serviceProperties must be compiled onto the listener");
        Assert.assertTrue(listener.serviceProperties().containsKey("basePath"));
        Assert.assertEquals(listener.serviceProperties().get("basePath").metadata().label(), "Base Path");
        Assert.assertEquals(listener.serviceProperties().get("basePath").placeholder(), "/");
    }

    // ---- serviceTypes[].metadata + ordering ----

    @Test
    public void testServiceTypeSelectorMetadataAndOrdering() {
        TriggerUIMetadataModel.TargetedNode pingOverlay = new TriggerUIMetadataModel.TargetedNode(
                l1Target("$pingService"),
                null, new TriggerUIMetadataModel.Metadata("Ping", null, null, null, null, null, null, null, null,
                        null, null),
                null, null, null, null, null, null, null, null, null, null);
        TriggerUIMetadataModel.TargetedNode serviceOverlay = new TriggerUIMetadataModel.TargetedNode(
                l1Target("$service"),
                null, new TriggerUIMetadataModel.Metadata("Main", null, null, null, null, null, null, null, null,
                        null, null),
                null, null, null, null, null, null, null, null, null, null);
        // L2 declares ping BEFORE service -- the runtime order must follow.
        TriggerUIMetadataModel l2 = new TriggerUIMetadataModel(
                "v1.0", null, null, null, null, null, List.of(pingOverlay, serviceOverlay), null);

        TriggerUISchemaModel model = apply(derived(true), true, l2);

        Assert.assertEquals(model.serviceTypes().stream().map(TriggerUISchemaModel.ServiceTypeModel::name).toList(),
                List.of("triggerfixture:PingService", "triggerfixture:Service"),
                "serviceTypes must follow L2 authoring order");
        Assert.assertEquals(model.serviceTypes().get(0).metadata().label(), "Ping");
        Assert.assertEquals(model.serviceTypes().get(1).metadata().label(), "Main");
    }

    // ---- handlers[].function: metadata + layout + nameEditable/repeatable ----

    @Test
    public void testHandlerMetadataLayoutAndRepeatable() {
        TriggerUIMetadataModel.LayoutSection section = new TriggerUIMetadataModel.LayoutSection(
                "main", null, "Message", "What to send", false, List.of("payload"));
        TriggerUIMetadataModel.FunctionNode function = new TriggerUIMetadataModel.FunctionNode(
                null, null, Boolean.FALSE, null, "TRUE", null, null, "handlers", null, List.of(section), null);
        TriggerUIMetadataModel.TargetedNode handlerOverlay = new TriggerUIMetadataModel.TargetedNode(
                new TriggerUIMetadataModel.Target("l1", null, null, null, null, null, null, null, null,
                        "onMessage", null),
                null, new TriggerUIMetadataModel.Metadata("On Message", "Fires per inbound message", null, null,
                        null, null, null, null, null, null, null),
                null, null, function, null, null, null, null, null, null, null);
        TriggerUIMetadataModel.TargetedNode serviceOverlay = new TriggerUIMetadataModel.TargetedNode(
                l1Target("$service"), null, null, null, null, null, null, null,
                null, List.of(handlerOverlay), null, null, null);
        TriggerUIMetadataModel l2 = new TriggerUIMetadataModel(
                "v1.0", null, null, null, null, null, List.of(serviceOverlay), null);

        TriggerUISchemaModel model = apply(derived(true), true, l2);

        TriggerUISchemaModel.ServiceTypeModel service = model.serviceTypes().stream()
                .filter(s -> "triggerfixture:Service".equals(s.name())).findFirst().orElseThrow();
        TriggerUISchemaModel.FunctionModel onMessage = service.functions().stream()
                .filter(f -> "onMessage".equals(f.name())).findFirst().orElseThrow();
        Assert.assertEquals(onMessage.metadata().label(), "On Message");
        Assert.assertFalse(onMessage.nameEditable());
        Assert.assertEquals(onMessage.repeatable().name(), "TRUE");
        Assert.assertEquals(onMessage.group(), "handlers");
        Assert.assertNotNull(onMessage.layout());
        Assert.assertEquals(onMessage.layout().get(0).id(), "main");
        Assert.assertEquals(onMessage.layout().get(0).fields(), List.of("payload"));
    }

    // ---- function.documentation: editable -> documentationSchema ----

    @Test
    public void testHandlerDocumentationBecomesEditableSchema() {
        TriggerUIMetadataModel.Documentation documentation = new TriggerUIMetadataModel.Documentation(
                Boolean.TRUE, "Describe what this handler does", "Handles a message", null);
        TriggerUIMetadataModel.FunctionNode function = new TriggerUIMetadataModel.FunctionNode(
                null, null, null, null, null, null, null, null, documentation, null, null);
        TriggerUIMetadataModel.TargetedNode handlerOverlay = new TriggerUIMetadataModel.TargetedNode(
                new TriggerUIMetadataModel.Target("l1", null, null, null, null, null, null, null, null,
                        "onMessage", null),
                null, null, null, null, function, null, null, null, null, null, null, null);
        TriggerUIMetadataModel.TargetedNode serviceOverlay = new TriggerUIMetadataModel.TargetedNode(
                l1Target("$service"), null, null, null, null, null, null, null,
                null, List.of(handlerOverlay), null, null, null);
        TriggerUIMetadataModel l2 = new TriggerUIMetadataModel(
                "v1.0", null, null, null, null, null, List.of(serviceOverlay), null);

        TriggerUISchemaModel model = apply(derived(true), true, l2);

        TriggerUISchemaModel.FunctionModel onMessage = model.serviceTypes().stream()
                .filter(s -> "triggerfixture:Service".equals(s.name())).findFirst().orElseThrow()
                .functions().stream().filter(f -> "onMessage".equals(f.name())).findFirst().orElseThrow();
        Assert.assertNull(onMessage.documentation(), "an editable doc moves to documentationSchema");
        Assert.assertNotNull(onMessage.documentationSchema());
        Assert.assertEquals(onMessage.documentationSchema().placeholder(), "Describe what this handler does");
        Assert.assertEquals(onMessage.documentationSchema().value(), "Handles a message");
    }

    // ---- parameters[].field: metadata + binding override ----

    @Test
    public void testParameterMetadataAndBindingOverride() {
        TriggerUIMetadataModel.Binding binding = new TriggerUIMetadataModel.Binding(
                "Payload", "The message body", null, null, "RECORD_MAP_EXPRESSION", null);
        TriggerUIMetadataModel.Field field = new TriggerUIMetadataModel.Field(
                null, null, null, null, null, null, null, null, null, binding, null, null, null);
        TriggerUIMetadataModel.TargetedNode paramOverlay = new TriggerUIMetadataModel.TargetedNode(
                new TriggerUIMetadataModel.Target("l1", null, null, null, null, null, null, null, null,
                        "payload", null),
                null, new TriggerUIMetadataModel.Metadata("Message Body", null, null, null, null, null, null,
                        null, null, null, null),
                null, field, null, null, null, null, null, null, null, null);
        TriggerUIMetadataModel.TargetedNode handlerOverlay = new TriggerUIMetadataModel.TargetedNode(
                new TriggerUIMetadataModel.Target("l1", null, null, null, null, null, null, null, null,
                        "onMessage", null),
                null, null, null, null, null, null, null, null, null, List.of(paramOverlay), null, null);
        TriggerUIMetadataModel.TargetedNode serviceOverlay = new TriggerUIMetadataModel.TargetedNode(
                l1Target("$service"), null, null, null, null, null, null, null,
                null, List.of(handlerOverlay), null, null, null);
        TriggerUIMetadataModel l2 = new TriggerUIMetadataModel(
                "v1.0", null, null, null, null, null, List.of(serviceOverlay), null);

        TriggerUISchemaModel model = apply(derived(true), true, l2);

        TriggerUISchemaModel.FunctionModel onMessage = model.serviceTypes().stream()
                .filter(s -> "triggerfixture:Service".equals(s.name())).findFirst().orElseThrow()
                .functions().stream().filter(f -> "onMessage".equals(f.name())).findFirst().orElseThrow();
        TriggerUISchemaModel.Parameter payload = onMessage.parameters().stream()
                .filter(p -> "payload".equals(p.name().value())).findFirst().orElseThrow();
        Assert.assertEquals(payload.metadata().label(), "Message Body");
        Assert.assertEquals(payload.codedata().bindingKind(), "RECORD_MAP_EXPRESSION");
    }

    @Test
    public void testOptionalParameterUsesAuthoredFlagWidget() {
        TriggerUIMetadataModel.Widget flag = new TriggerUIMetadataModel.Widget(
                "FLAG", Boolean.TRUE, "string", null, null, null, null, null, null);
        TriggerUIMetadataModel.Field typeField = new TriggerUIMetadataModel.Field(
                null, null, null, null, new TriggerUIMetadataModel.WidgetPolicy(Boolean.FALSE, List.of(flag)),
                null, null, null, null, null, null, null, null);
        TriggerUIMetadataModel.TargetedNode typeOverlay = new TriggerUIMetadataModel.TargetedNode(
                new TriggerUIMetadataModel.Target("semantic", null, "recordField", "type", null, null, null,
                        null, null, null, "payload"),
                null, null, null, typeField, null, null, null, null, null, null, null, null);
        TriggerUIMetadataModel.TargetedNode parameterOverlay = new TriggerUIMetadataModel.TargetedNode(
                handlerTarget("payload"), null, null,
                new TriggerUIMetadataModel.State(null, null, Boolean.TRUE, null, null, null),
                null, null, null, null, List.of(typeOverlay), null, null, null, null);
        TriggerUIMetadataModel.TargetedNode handlerOverlay = new TriggerUIMetadataModel.TargetedNode(
                handlerTarget("onMessage"), null, null, null, null, null, null, null, null, null,
                List.of(parameterOverlay), null, null);
        TriggerUIMetadataModel.TargetedNode serviceOverlay = new TriggerUIMetadataModel.TargetedNode(
                l1Target("$service"), null, null, null, null, null, null, null, null,
                List.of(handlerOverlay), null, null, null);
        TriggerUIMetadataModel l2 = new TriggerUIMetadataModel(
                "v1.0", null, null, null, null, null, List.of(serviceOverlay), null);

        TriggerUISchemaModel.Parameter payload = function(apply(derived(true), true, l2),
                "triggerfixture:Service", "onMessage").parameters().getFirst();

        Assert.assertEquals(payload.kind(), "OPTIONAL");
        Assert.assertEquals(payload.type().types().getFirst().fieldType(), "FLAG");
        Assert.assertEquals(payload.type().types().getFirst().ballerinaType(), "string");
    }

    @Test
    public void testParameterKindNormalizationInvariant() {
        Assert.assertEquals(TriggerUIMetadataCompiler.normalizeParameterKind("REQUIRED", Boolean.TRUE, false),
                "OPTIONAL", "optional non-data-binding parameters become optional flags");
        Assert.assertEquals(TriggerUIMetadataCompiler.normalizeParameterKind("REQUIRED", Boolean.FALSE, false),
                "REQUIRED", "required parameters are unaffected");
        Assert.assertEquals(TriggerUIMetadataCompiler.normalizeParameterKind("DATA_BINDING", Boolean.TRUE, false),
                "DATA_BINDING", "data-binding parameters are unaffected");
        Assert.assertEquals(TriggerUIMetadataCompiler.normalizeParameterKind("REQUIRED", Boolean.FALSE, true),
                "DATA_BINDING", "an L2 payload field supplies the UI classification without a false L1 binding");
        Assert.assertEquals(TriggerUIMetadataCompiler.normalizeParameterKind("OPTIONAL", Boolean.TRUE, true),
                "DATA_BINDING", "payload classification takes precedence over optionality");
    }

    @DataProvider(name = "returnTypeOverrides")
    public Object[][] returnTypeOverrides() {
        return new Object[][] {{"error?", Boolean.TRUE}, {"error", Boolean.TRUE}, {"()", Boolean.FALSE}};
    }

    @Test(dataProvider = "returnTypeOverrides")
    public void testReturnTypeOverrideRecomputesHasError(String returnType, boolean hasError) {
        TriggerUIMetadataModel.Field returnField = new TriggerUIMetadataModel.Field(
                null, null, null, returnType, null, null, null, null, null, null, null, null, null);
        TriggerUIMetadataModel.TargetedNode returnOverlay = new TriggerUIMetadataModel.TargetedNode(
                null, null, null, null, returnField, null, null, null, null, null, null, null, null);
        TriggerUIMetadataModel.TargetedNode handlerOverlay = new TriggerUIMetadataModel.TargetedNode(
                handlerTarget("onMessage"), null, null, null, null, null, null, null, null, null, null, null,
                returnOverlay);
        TriggerUIMetadataModel.TargetedNode serviceOverlay = new TriggerUIMetadataModel.TargetedNode(
                l1Target("$service"), null, null, null, null, null, null, null, null,
                List.of(handlerOverlay), null, null, null);
        TriggerUIMetadataModel l2 = new TriggerUIMetadataModel(
                "v1.0", null, null, null, null, null, List.of(serviceOverlay), null);

        TriggerUISchemaModel.ReturnType actual = function(apply(derived(true), true, l2),
                "triggerfixture:Service", "onMessage").returnType();

        Assert.assertEquals(actual.type(), returnType);
        Assert.assertEquals(actual.hasError(), Boolean.valueOf(hasError));
    }

    @Test
    public void testExcludedHandlerDoesNotPruneUnmentionedHandlers() {
        TriggerUIMetadataModel.FunctionNode excluded = new TriggerUIMetadataModel.FunctionNode(
                Boolean.FALSE, null, null, null, null, null, null, null, null, null, null);
        TriggerUIMetadataModel.TargetedNode excludedHandler = new TriggerUIMetadataModel.TargetedNode(
                handlerTarget("onMessage"), null, null, null, null, excluded, null, null, null, null, null, null,
                null);
        TriggerUIMetadataModel.TargetedNode serviceOverlay = new TriggerUIMetadataModel.TargetedNode(
                l1Target("$service"), null, null, null, null, null, null, null, null,
                List.of(excludedHandler), null, null, null);
        TriggerUIMetadataModel.TargetedNode pingOverlay = new TriggerUIMetadataModel.TargetedNode(
                l1Target("$pingService"), null, null, null, null, null, null, null, null, null, null, null, null);
        TriggerUIMetadataModel l2 = new TriggerUIMetadataModel(
                "v1.0", null, null, null, null, null, List.of(serviceOverlay, pingOverlay), null);

        TriggerUISchemaModel model = apply(derived(true), true, l2);

        Assert.assertEquals(service(model, "triggerfixture:Service").functions().stream()
                .map(TriggerUISchemaModel.FunctionModel::name).toList(), List.of("onOther"));
        Assert.assertEquals(service(model, "triggerfixture:PingService").functions().stream()
                .map(TriggerUISchemaModel.FunctionModel::name).toList(), List.of("onPing"));
    }

    @Test
    public void testServiceDescriptionIsDistinctFromMetadataDescription() {
        TriggerUIMetadataModel.Metadata metadata = new TriggerUIMetadataModel.Metadata(
                "Service", "Selector card description", null, null, null, null, null, null, null, null, null);
        TriggerUIMetadataModel.TargetedNode serviceOverlay = new TriggerUIMetadataModel.TargetedNode(
                l1Target("$service"), null, metadata, null, null, null,
                new TriggerUIMetadataModel.ServiceNode(null, "Runtime service description", null), null,
                null, null, null, null, null);
        TriggerUIMetadataModel l2 = new TriggerUIMetadataModel(
                "v1.0", null, null, null, null, null, List.of(serviceOverlay), null);

        TriggerUISchemaModel.ServiceTypeModel actual = service(apply(derived(true), true, l2),
                "triggerfixture:Service");

        Assert.assertEquals(actual.metadata().description(), "Selector card description");
        Assert.assertEquals(actual.description(), "Runtime service description");
    }

    // ---- field.source.codedata override (CDC-shaped skipped-operation flag) ----

    @Test
    public void testInitFieldCodedataOverride() {
        TriggerUIMetadataModel.Codedata codedata = new TriggerUIMetadataModel.Codedata(
                null, "CDC_OPERATION_ENABLE", "onInsert", null, null, null, null, "options.skippedOperations",
                null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null);
        TriggerUIMetadataModel.Field field = new TriggerUIMetadataModel.Field(
                "enableCreate", new TriggerUIMetadataModel.Metadata("Enable Create", null, null, null, null, null,
                        null, null, null, null, null),
                null, Boolean.TRUE, null, null, null, null, null, null, null,
                new TriggerUIMetadataModel.Source(codedata), null);
        TriggerUIMetadataModel.TargetedNode fieldOverlay = new TriggerUIMetadataModel.TargetedNode(
                new TriggerUIMetadataModel.Target("semantic", null, "listenerInitParam", "skippedOperations",
                        "$listener", null, null, null, null, null, null),
                null, null, null, field, null, null, null, null, null, null, null, null);
        TriggerUIMetadataModel.InitForm initForm = new TriggerUIMetadataModel.InitForm(null, List.of(fieldOverlay));
        TriggerUIMetadataModel l2 = new TriggerUIMetadataModel(
                "v1.0", null, null, null, initForm, null, null, null);

        TriggerUISchemaModel model = apply(derived(true), true, l2);

        Assert.assertTrue(model.initProperties().containsKey("enableCreate"));
        TriggerUISchemaModel.Property enableCreate = model.initProperties().get("enableCreate");
        Assert.assertEquals(enableCreate.codedata().argType(), "CDC_OPERATION_ENABLE");
        Assert.assertEquals(enableCreate.codedata().originalName(), "onInsert");
        Assert.assertEquals(enableCreate.codedata().path(), "options.skippedOperations");
        Assert.assertEquals(enableCreate.value(), Boolean.TRUE);
    }

    // ---- l2.initForm() == null preserves the derived initProperties (locks the applyInitForm fix) ----

    @Test
    public void testNullInitFormPreservesDerivedInitProperties() {
        TriggerUISchemaModel before = derived(true);
        Assert.assertFalse(before.initProperties().isEmpty(), "sanity: the synthesizer derives an init form");

        TriggerUIMetadataModel l2 = new TriggerUIMetadataModel("v1.0", null, null, null, null, null, null, null);
        TriggerUISchemaModel after = apply(before, true, l2);

        // "identifier" is the one deliberate exception: the fixture's service type marks it optional,
        // and a skeleton L2 with no initForm at all has no way to explicitly restate it back in.
        Set<String> expectedKeys = new LinkedHashSet<>(before.initProperties().keySet());
        expectedKeys.remove("identifier");
        Assert.assertEquals(after.initProperties().keySet(), expectedKeys,
                "a skeleton L2 with no initForm must not drop the derived init form, except an optional identifier");
    }

    // ---- l2.initForm() == null still drops an *optional* L1 identifier/base path ----

    @Test
    public void testNullInitFormDropsOptionalIdentifier() {
        TriggerUISchemaModel before = derived(true);
        Assert.assertTrue(before.initProperties().containsKey("identifier"),
                "sanity: the fixture's service type derives an identifier field");

        TriggerUIMetadataModel l2 = new TriggerUIMetadataModel("v1.0", null, null, null, null, null, null, null);
        TriggerUISchemaModel after = apply(before, true, l2);

        Assert.assertFalse(after.initProperties().containsKey("identifier"),
                "L1 marks the identifier optional, so a connector with no initForm shouldn't show it by default");
    }

    // ---- finalizeListenerOwnership: a non-reusable single listener folds its fields into initProperties ----

    @Test
    public void testNonReusableListenerFoldsIntoInit() {
        TriggerUIMetadataModel.TargetedNode overlay = new TriggerUIMetadataModel.TargetedNode(
                l1Target("$listener"), null, null, null, null, null, null,
                new TriggerUIMetadataModel.ListenerNode(null, null, null, null, null),
                null, null, null, null, null);
        TriggerUIMetadataModel l2 = new TriggerUIMetadataModel(
                "v1.0", null, null, null, null, List.of(overlay), null, null);

        TriggerUISchemaModel model = apply(derived(false), false, l2);

        Assert.assertTrue(model.listeners() == null || model.listeners().isEmpty(),
                "a single non-reusable listener has no create-new/use-existing choice to offer");
        Assert.assertNull(model.listenerForm());
        Assert.assertTrue(model.initProperties().containsKey("host"),
                "the listener's own ctor fields are flattened directly into the trigger's init form");
        Assert.assertTrue(model.initProperties().containsKey("port"));
        Assert.assertFalse(model.initProperties().containsKey("listener"),
                "the CHOICE field is replaced, not merged alongside the flattened fields");
    }

    // ---- semantic service-annotation field with no matching introspected param: the non-semantic-model
    //      fallback path (defaultProperty() + SERVICE_ANNOTATION codedata identity, no widget derivation) ----

    @Test
    public void testServiceAnnotationFieldFallbackWithoutMatchingParam() {
        TriggerUIMetadataModel.TargetedNode fieldOverlay = new TriggerUIMetadataModel.TargetedNode(
                new TriggerUIMetadataModel.Target("semantic", null, "serviceAnnotationField", "doesNotExist",
                        null, "$service", "$serviceConfig", null, null, null, null),
                null, new TriggerUIMetadataModel.Metadata("Unmapped Field", null, null, null, null, null, null,
                        null, null, null, null),
                null, new TriggerUIMetadataModel.Field("unmapped", null, null, null, null, null, null, null,
                        null, null, null, null, null),
                null, null, null, null, null, null, null, null);
        TriggerUIMetadataModel.InitForm initForm = new TriggerUIMetadataModel.InitForm(null, List.of(fieldOverlay));
        TriggerUIMetadataModel l2 = new TriggerUIMetadataModel(
                "v1.0", null, null, null, initForm, null, null, null);

        TriggerUISchemaModel model = apply(derived(true), true, l2);

        Assert.assertTrue(model.initProperties().containsKey("unmapped"));
        TriggerUISchemaModel.Property property = model.initProperties().get("unmapped");
        Assert.assertEquals(property.codedata().type(), "SERVICE_ANNOTATION");
        Assert.assertEquals(property.codedata().originalName(), "ServiceConfig",
                "identity comes from the L1 annotation's own type name, not the unmatched path");
        Assert.assertEquals(property.codedata().path(), "doesNotExist");
        Assert.assertTrue(property.enabled(), "no matching param -> defaultProperty()'s baseline state");
        Assert.assertTrue(property.editable());
    }
}
