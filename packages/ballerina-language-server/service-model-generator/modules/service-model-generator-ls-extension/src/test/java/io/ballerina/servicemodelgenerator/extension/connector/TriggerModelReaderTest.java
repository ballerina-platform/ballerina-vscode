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
import io.ballerina.modelgenerator.commons.trigger.models.TriggerUISchemaModel.FunctionModel;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerUISchemaModel.Parameter;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerUISchemaModel.Property;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerUISchemaModel.ServiceTypeModel;
import io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.List;
import java.util.Map;

/**
 * Unit test for the unified {@code trigger-ui-schema.json} reader on {@link TriggerModelReader}:
 * deserializes the bundled worked examples (kafka / ftp / trigger.github / trigger.hubspot /
 * azure.storage.files) from their
 * classpath resources without spinning up the language server. Verifies the distinctive shapes survive
 * Gson: the listener CHOICE, structured parameters (type/name as {@code Property} sub-nodes),
 * data-binding, composed payloads, and fully-derived multi-service-type handler sets.
 *
 * @since 1.9.0
 */
public class TriggerModelReaderTest {

    private TriggerUISchemaModel read(String moduleName) {
        return TriggerModelReader.getInstance().getBundledTriggerModel(moduleName).orElseThrow();
    }

    private String listenerFieldType(TriggerUISchemaModel model) {
        Property listener = model.initProperties().get("listener");
        Assert.assertNotNull(listener, "initProperties.listener should be present");
        Assert.assertNotNull(listener.codedata());
        Assert.assertEquals(listener.codedata().type(), "LISTENER_CONFIG",
                "the listener node carries codedata.type LISTENER_CONFIG");
        Assert.assertNotNull(listener.types());
        return listener.types().getFirst().fieldType();
    }

    private FunctionModel findFunction(ServiceTypeModel st, String name) {
        return java.util.stream.Stream.concat(
                        st.functions() == null ? java.util.stream.Stream.empty() : st.functions().stream(),
                        st.schemaFunctions() == null ? java.util.stream.Stream.empty()
                                : st.schemaFunctions().stream())
                .filter(f -> name.equals(f.name()))
                .findFirst().orElse(null);
    }

    @Test
    public void testReadKafka() {
        TriggerUISchemaModel model = read("kafka");
        Assert.assertEquals(model.orgName(), "ballerinax");
        Assert.assertEquals(model.moduleName(), "kafka");
        // Kafka does not support attaching to an existing listener, so there is no create/reuse
        // CHOICE — the listener init params sit directly under initProperties, always creating a new
        // listener.
        Assert.assertFalse(model.initProperties().containsKey("listener"), "kafka has no listener CHOICE");
        Assert.assertTrue(model.initProperties().containsKey("listenerVarName"));
        Property bootstrapServers = model.initProperties().get("bootstrapServers");
        Assert.assertNotNull(bootstrapServers, "bootstrapServers should be present directly under initProperties");
        Assert.assertEquals(bootstrapServers.codedata().argType(), "LISTENER_PARAM_REQUIRED");

        List<ServiceTypeModel> serviceTypes = model.serviceTypes();
        Assert.assertNotNull(serviceTypes);
        Assert.assertEquals(serviceTypes.size(), 1);
        ServiceTypeModel st = serviceTypes.getFirst();
        // Kafka: no present handlers; onConsumerRecord/onError are addable templates.
        Assert.assertTrue(st.functions() == null || st.functions().isEmpty());

        FunctionModel onConsumerRecord = findFunction(st, "onConsumerRecord");
        Assert.assertNotNull(onConsumerRecord, "onConsumerRecord should be present (schemaFunctions)");
        Assert.assertEquals(onConsumerRecord.kind(), "REMOTE");

        // The records param carries its type/name as Property sub-nodes and is a data-binding param.
        Parameter records = onConsumerRecord.parameters().getFirst();
        Assert.assertEquals(records.kind(), "DATA_BINDING");
        Assert.assertNotNull(records.type(), "parameter type is a Property sub-node");
        Assert.assertNotNull(records.name(), "parameter name is a Property sub-node");
        Assert.assertEquals(records.name().value(), "records");
        Assert.assertEquals(records.type().types().getFirst().fieldType(), "DATA_BINDING");
    }

    @Test
    public void testReadFtp() {
        TriggerUISchemaModel model = read("ftp");
        Assert.assertEquals(model.moduleName(), "ftp");
        Assert.assertEquals(model.orgName(), "ballerina");
        Assert.assertEquals(listenerFieldType(model), "CHOICE");

        ServiceTypeModel st = model.serviceTypes().getFirst();
        // Each file format is pre-expanded into its own schemaFunction (not fanned out at runtime from
        // a VARIATION_SELECTOR): the content parameter is a data-binding COMPLEX_PAYLOAD directly.
        FunctionModel onFileCsv = findFunction(st, "onFileCsv");
        Assert.assertNotNull(onFileCsv, "onFileCsv should be present");
        Assert.assertEquals(onFileCsv.kind(), "REMOTE");
        Parameter content = onFileCsv.parameters().stream()
                .filter(p -> "content".equals(p.name().value())).findFirst().orElseThrow();
        Assert.assertEquals(content.kind(), "DATA_BINDING");
        Assert.assertEquals(content.type().types().getFirst().fieldType(), "COMPLEX_PAYLOAD");
        // The composed payload's own sub-properties (payload/stream/rows) live under type.properties.
        Assert.assertNotNull(content.type().properties(), "the composed payload lives in type.properties");
        Assert.assertTrue(content.type().properties().containsKey("payload"));
    }

    @Test
    public void testReadGithub() {
        TriggerUISchemaModel model = read("trigger.github");
        Assert.assertEquals(model.moduleName(), "trigger.github");
        Assert.assertEquals(listenerFieldType(model), "CHOICE");
        // Multi-service-type connector: a serviceType selector in the init form.
        Assert.assertTrue(model.initProperties().containsKey("serviceType"),
                "multi-type connectors carry a serviceType selector");

        Assert.assertTrue(model.serviceTypes().size() >= 2, "GitHub exposes several service types");
        ServiceTypeModel issues = model.serviceTypes().getFirst();
        Assert.assertEquals(issues.name(), "github:IssuesService");
        // Handlers are FULLY derived into functions[] (locked); nothing is added from a catalog.
        Assert.assertNotNull(issues.functions());
        Assert.assertFalse(issues.functions().isEmpty(), "IssuesService handlers are fully derived");
        Assert.assertTrue(issues.schemaFunctions() == null || issues.schemaFunctions().isEmpty(),
                "no schemaFunctions for a fully-derived multi-type connector");
        // Each handler param carries type/name as Property sub-nodes.
        Parameter payload = issues.functions().getFirst().parameters().getFirst();
        Assert.assertEquals(payload.name().value(), "payload");
        Assert.assertEquals(payload.type().types().getFirst().fieldType(), "TYPE");
    }

    @Test
    public void testReadAzureStorageFiles() {
        TriggerUISchemaModel model = read("azure.storage.files");
        Assert.assertEquals(model.orgName(), "ballerinax");
        Assert.assertEquals(model.moduleName(), "azure.storage.files");
        Assert.assertEquals(model.shortDisplayName(), "Azure Files",
                "the compact listener-list label ships in the model");
        Assert.assertEquals(model.listenerKind(), "SINGLE_SELECT_LISTENER");
        Assert.assertEquals(listenerFieldType(model), "CHOICE");

        // The monitored path is a service-level annotation field surfaced in the init form.
        Property path = model.initProperties().get("path");
        Assert.assertNotNull(path, "path should be present under initProperties");
        Assert.assertEquals(path.codedata().type(), "SERVICE_BASE_PATH");

        ServiceTypeModel st = model.serviceTypes().getFirst();
        // Like ftp, each file format is pre-expanded into its own addable schemaFunction.
        Assert.assertTrue(st.functions() == null || st.functions().isEmpty());
        FunctionModel onFileCsv = findFunction(st, "onFileCsv");
        Assert.assertNotNull(onFileCsv, "onFileCsv should be present");
        Assert.assertEquals(onFileCsv.kind(), "REMOTE");
        Parameter content = onFileCsv.parameters().stream()
                .filter(p -> "content".equals(p.name().value())).findFirst().orElseThrow();
        Assert.assertEquals(content.kind(), "DATA_BINDING");
        Assert.assertEquals(content.type().types().getFirst().fieldType(), "COMPLEX_PAYLOAD");
    }

    @Test
    public void testAzureInitFormPreservesShippedListenerName() {
        // azure.storage.files opts in to keeping its curated default listener name: the shipped value
        // plus codedata.preserveValue must survive the JSON -> wire ServiceInitModel binding, since
        // that flag is what stops SchemaDrivenServiceBuilder#refreshListenerName from replacing the
        // name with the protocol-derived "filesListener".
        ServiceInitModel init = TriggerModelReader.getInstance()
                .getBundledServiceInitModel("azure.storage.files").orElseThrow();
        Value listener = init.getProperties().get("listener");
        Value createNew = listener.getChoices().stream().filter(Value::isEnabled).findFirst().orElseThrow();
        Value varName = createNew.getProperties().get("listenerConfig").getProperties().get("listenerVarName");
        Assert.assertEquals(varName.getValue(), "azFilesListener");
        Assert.assertEquals(varName.getCodedata().getPreserveValue(), Boolean.TRUE);
    }

    @Test
    public void testKafkaInitFormAsServiceInitModel() {
        // The add-trigger init form is derived from the unified model's initProperties subtree and
        // handed to the frontend as the wire ServiceInitModel (identity + Map<String,Value>).
        ServiceInitModel init = TriggerModelReader.getInstance().getBundledServiceInitModel("kafka").orElseThrow();
        Assert.assertEquals(init.getOrgName(), "ballerinax");
        Assert.assertEquals(init.getModuleName(), "kafka");
        Assert.assertEquals(init.getType(), "kafka");

        // Kafka does not support attaching to an existing listener, so there is no create/reuse
        // CHOICE — the listener init params (listenerVarName plus every init param) sit directly
        // under initProperties, not wrapped in a listenerConfig group.
        Assert.assertFalse(init.getProperties().containsKey("listener"), "kafka has no listener CHOICE");
        Assert.assertTrue(init.getProperties().containsKey("listenerVarName"), "listenerVarName should be present");

        Value bootstrapServers = init.getProperties().get("bootstrapServers");
        Assert.assertNotNull(bootstrapServers);
        // codedata (argType/position) drives positional listener args.
        Assert.assertEquals(bootstrapServers.getCodedata().getArgType(), "LISTENER_PARAM_REQUIRED");
        Assert.assertEquals(bootstrapServers.getCodedata().getPosition(), Integer.valueOf(1));
    }

    @Test
    public void testHubspotGroupedListenerParamAsServiceInitModel() {
        // HubSpot's listener has a record-typed positional param (`config`, holding clientSecret /
        // callbackURL) alongside a scalar positional param (`listenOn`). Regression test for a bug
        // where clientSecret/callbackURL both ended up at position 1 (duplicated) and listenOn was
        // shifted to position 2 as if it were a THIRD arg, instead of clientSecret/callbackURL being
        // flattened as CONFIG_FIELD siblings sharing position 1 (config's own slot) with listenOn
        // correctly at position 2 — all nested inside ONE listenerConfig GROUP_SECTION so the whole
        // listener (not just the record fields) renders as a single titled box.
        ServiceInitModel init = TriggerModelReader.getInstance()
                .getBundledServiceInitModel("trigger.hubspot").orElseThrow();

        Value listener = init.getProperties().get("listener");
        Value createNew = listener.getChoices().stream().filter(Value::isEnabled).findFirst().orElse(null);
        Assert.assertNotNull(createNew);
        Value listenerConfig = createNew.getProperties().get("listenerConfig");
        Assert.assertNotNull(listenerConfig, "the whole listener should be wrapped in one listenerConfig group");
        Assert.assertEquals(listenerConfig.getTypes().getFirst().fieldType(), Value.FieldType.GROUP_SECTION);

        Map<String, Value> cfg = listenerConfig.getProperties();
        Assert.assertTrue(cfg.containsKey("listenerVarName"), "listenerVarName is inside the group, not a sibling");

        Value clientSecret = cfg.get("clientSecret");
        Value callbackURL = cfg.get("callbackURL");
        Assert.assertNotNull(clientSecret);
        Assert.assertNotNull(callbackURL);
        Assert.assertEquals(clientSecret.getCodedata().getArgType(), "LISTENER_PARAM_CONFIG_FIELD");
        Assert.assertEquals(callbackURL.getCodedata().getArgType(), "LISTENER_PARAM_CONFIG_FIELD");
        // Both config fields share the SAME position — the record param's own slot — never their own.
        Assert.assertEquals(clientSecret.getCodedata().getPosition(), Integer.valueOf(1));
        Assert.assertEquals(callbackURL.getCodedata().getPosition(), Integer.valueOf(1));

        Value listenOn = cfg.get("listenOn");
        Assert.assertNotNull(listenOn);
        Assert.assertEquals(listenOn.getCodedata().getArgType(), "LISTENER_PARAM_REQUIRED");
        Assert.assertEquals(listenOn.getCodedata().getPosition(), Integer.valueOf(2));
    }

    @Test
    public void testInitFormBuildsForAllExamples() {
        // ftp and github init forms use only known wire fieldTypes, so they deserialize cleanly too.
        for (String moduleName : new String[] {"ftp", "trigger.github"}) {
            ServiceInitModel init = TriggerModelReader.getInstance()
                    .getBundledServiceInitModel(moduleName).orElseThrow();
            Value listener = init.getProperties().get("listener");
            Assert.assertNotNull(listener, moduleName + " listener present");
            Assert.assertEquals(listener.getTypes().getFirst().fieldType(), Value.FieldType.CHOICE);
        }
    }

    @Test
    public void testMissingModelReturnsEmpty() {
        Assert.assertTrue(
                TriggerModelReader.getInstance().getBundledTriggerModel("no-such-module").isEmpty(),
                "a module with no bundled trigger-ui-schema.json must yield empty (so the router falls back)");
    }

    /**
     * mcp is registered as an ordered variant list: the {@code StreamableHttpService} surface only exists
     * from 1.2.0, and 1.0.3 has {@code mcp:Service} alone. The resolved connector version — not the
     * newest bundled document — must decide which one a caller sees.
     */
    @Test
    public void testVersionGatedVariantSelection() {
        TriggerModelReader reader = TriggerModelReader.getInstance();

        TriggerUISchemaModel current = reader.getBundledTriggerModel("mcp", "1.2.0").orElseThrow();
        Assert.assertEquals(current.version(), "1.2.0");
        Assert.assertEquals(serviceTypeNames(current), List.of("StreamableHttpService", "Service"),
                "1.2.0 keeps the deprecated Service type so an existing service still reads back");
        Assert.assertEquals(findServiceType(current, "Service").codedata().originalName(), "Service",
                "each type's originalName must be its own -- it is what the emitted descriptor is built from");

        TriggerUISchemaModel legacy = reader.getBundledTriggerModel("mcp", "1.0.3").orElseThrow();
        Assert.assertEquals(legacy.version(), "1.0.3");
        Assert.assertEquals(serviceTypeNames(legacy), List.of("Service"),
                "1.0.3 has no StreamableHttpService");
        Assert.assertEquals(legacy.initProperties().get("serviceName").codedata().originalName(),
                "ServiceConfig", "1.0.3 predates the @mcp:StreamableHttpServiceConfig annotation");
        Assert.assertEquals(
                legacy.initProperties().get("listenerVarName").types().getFirst().ballerinaType(),
                "mcp:Listener", "1.0.3 predates mcp:StreamableHttpListener");

        // A version below every declared floor still resolves -- to the oldest variant.
        Assert.assertEquals(reader.getBundledTriggerModel("mcp", "1.0.0").orElseThrow().version(), "1.0.3");
        // 1.2.0's floor is inclusive, and anything above it stays on the newest variant.
        Assert.assertEquals(reader.getBundledTriggerModel("mcp", "1.3.1").orElseThrow().version(), "1.2.0");
        // No version in hand (e.g. the trigger picker) -> the newest variant.
        Assert.assertEquals(reader.getBundledTriggerModel("mcp").orElseThrow().version(), "1.2.0");
        // The init form is gated by the same resolution.
        Assert.assertEquals(reader.getBundledServiceInitModel("mcp", "1.0.3").orElseThrow().getVersion(),
                "1.0.3");
    }

    /**
     * Each mcp variant pins its own service type through a hidden {@code SERVICE_TYPE_DESCRIPTOR}
     * field in the init form, so the type a new service is written against never rests on
     * {@code serviceTypes[]} order. The value must stay unqualified: the source generator matches it
     * against {@code serviceTypes[].name} (unqualified for mcp) and qualifies it on emit.
     */
    @Test
    public void testInitFormPinsServiceType() {
        TriggerModelReader reader = TriggerModelReader.getInstance();
        for (String[] expected : new String[][] {{"1.2.0", "StreamableHttpService"}, {"1.0.3", "Service"}}) {
            ServiceInitModel init = reader.getBundledServiceInitModel("mcp", expected[0]).orElseThrow();
            Value serviceType = init.getProperties().get("serviceType");
            Assert.assertNotNull(serviceType, expected[0] + " pins a service type");
            Assert.assertEquals(serviceType.getCodedata().getType(), "SERVICE_TYPE_DESCRIPTOR");
            Assert.assertEquals(serviceType.getValue(), expected[1]);
            Assert.assertFalse(serviceType.getValue().contains(":"),
                    "the pinned value must be unqualified so it matches serviceTypes[].name");
            Assert.assertTrue(serviceType.isHidden(), "the user must not see the pinned type");
            Assert.assertTrue(serviceType.isEnabledWithValue(),
                    "hidden must not be expressed as enabled:false -- the resolver skips disabled fields");
        }
    }

    /** A single-variant registry entry (the plain-string form) ignores the version entirely. */
    @Test
    public void testUngatedModuleIgnoresVersion() {
        TriggerModelReader reader = TriggerModelReader.getInstance();
        Assert.assertEquals(reader.getBundledTriggerModel("kafka", "0.0.1").orElseThrow().moduleName(),
                reader.getBundledTriggerModel("kafka").orElseThrow().moduleName());
    }

    private static List<String> serviceTypeNames(TriggerUISchemaModel model) {
        return model.serviceTypes().stream().map(ServiceTypeModel::name).toList();
    }

    private static ServiceTypeModel findServiceType(TriggerUISchemaModel model, String name) {
        return model.serviceTypes().stream()
                .filter(st -> name.equals(st.name()))
                .findFirst()
                .orElseThrow();
    }
}
