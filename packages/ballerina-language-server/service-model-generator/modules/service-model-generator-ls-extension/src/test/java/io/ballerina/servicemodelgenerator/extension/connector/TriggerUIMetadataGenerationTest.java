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
import io.ballerina.modelgenerator.commons.trigger.models.TriggerUISchemaModel;
import org.testng.Assert;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

import java.util.List;

/**
 * Behavioural coverage for runtime models generated from packaged L1 + L2 and semantic facts, over a
 * small, cheap set of connectors. Byte-for-byte parity against all 26 bundled runtime models is a
 * separate, more expensive concern covered by {@link TriggerParityTest}.
 */
public class TriggerUIMetadataGenerationTest {

    private static final Gson GSON = new Gson();

    @DataProvider(name = "resolvableTriggers")
    public Object[][] resolvableTriggers() {
        return new Object[][] {
                {"ballerinax", "kafka", "event"},
                {"ballerina", "ftp", "file"},
                {"ballerinax", "mssql", "event"},
        };
    }

    @Test(dataProvider = "resolvableTriggers")
    public void testGeneratesRuntimeModel(String org, String module, String triggerKind) {
        TriggerUISchemaModel generated = TriggerModelReader.getInstance()
                .getGeneratedTriggerModel(org, module, null)
                .orElseThrow(() -> new AssertionError(org + "/" + module + " could not be generated"));

        Assert.assertEquals(generated.moduleName(), module);
        Assert.assertFalse(generated.serviceTypes() == null || generated.serviceTypes().isEmpty());
        Assert.assertNotNull(generated.initProperties());
        Assert.assertFalse(generated.initProperties().isEmpty());
        Assert.assertEquals(generated.triggerKind(), triggerKind);
        Assert.assertEquals(generated.kind(), triggerKind, "legacy kind remains available on generated models");
    }

    @Test
    public void testL1ControlsWhetherListenerIsReusable() {
        TriggerModelReader reader = TriggerModelReader.getInstance();
        TriggerUISchemaModel kafka = reader.getGeneratedTriggerModel("ballerinax", "kafka", null).orElseThrow();
        Assert.assertTrue(kafka.listeners() == null || kafka.listeners().isEmpty());
        Assert.assertTrue(kafka.initProperties().containsKey("bootstrapServers"));

        TriggerUISchemaModel ftp = reader.getGeneratedTriggerModel("ballerina", "ftp", null).orElseThrow();
        Assert.assertEquals(ftp.listeners().size(), 1);
        Assert.assertTrue(ftp.initProperties().containsKey("listener"));
        TriggerUISchemaModel.Property listener = ListenerChoiceDeriver
                .derive(ftp.listeners(), ftp.listenerKind(), ftp.listenerForm()).orElseThrow();
        Assert.assertEquals(listener.choices().size(), 2);
        Assert.assertEquals(ftp.initProperties().get("listener").choices().size(), 2);
    }

    @Test
    public void testMssqlCdcOverridesAndDerivedWidgets() {
        TriggerUISchemaModel model = TriggerModelReader.getInstance()
                .getGeneratedTriggerModel("ballerinax", "mssql", null).orElseThrow();
        TriggerUISchemaModel.ListenerModel listener = model.listeners().getFirst();
        Assert.assertEquals(listener.initProperties().get("enableCreate").codedata().argType(),
                "CDC_OPERATION_ENABLE");
        Assert.assertEquals(listener.initProperties().get("enableCreate").types().getFirst().fieldType(), "FLAG");
        Assert.assertEquals(listener.initProperties().get("offsetStorage").types().stream()
                .map(TriggerUISchemaModel.PropertyType::fieldType).toList(),
                List.of("RECORD_MAP_EXPRESSION", "EXPRESSION"));
    }

    @DataProvider(name = "cdcTriggers")
    public Object[][] cdcTriggers() {
        return new Object[][] {
                {"mssql", "1.19.0"},
                {"mysql", "1.18.0"},
                {"oracledb", "1.17.0"},
                {"postgresql", "1.18.0"},
        };
    }

    @Test(dataProvider = "cdcTriggers")
    public void testCdcLegacyHandlerAndSourceShapes(String module, String version) {
        TriggerUISchemaModel model = cdcModel(module, version);
        TriggerUISchemaModel.ServiceTypeModel service = model.serviceTypes().stream()
                .filter(candidate -> "cdc:Service".equals(candidate.name())).findFirst().orElseThrow();
        List<String> handlerNames = service.schemaFunctions().stream()
                .map(TriggerUISchemaModel.FunctionModel::name).toList();

        for (String handlerName : List.of("onRead", "onCreate", "onUpdate", "onDelete")) {
            TriggerUISchemaModel.FunctionModel handler = schemaFunction(service, handlerName);
            TriggerUISchemaModel.Parameter tableName = parameter(handler, "tableName");
            Assert.assertEquals(tableName.kind(), "OPTIONAL", module + "/" + handlerName);
            Assert.assertFalse(tableName.enabled(), module + "/" + handlerName);
            Assert.assertEquals(tableName.type().types().getFirst().fieldType(), "FLAG");

            String disabledSource = SchemaDrivenSourceGenerator.buildFunctionSource(handler);
            Assert.assertFalse(disabledSource.contains(" tableName"),
                    "an unchecked tableName flag must not enter the signature: " + disabledSource);
            String enabledSource = SchemaDrivenSourceGenerator.buildFunctionSource(
                    withTableNameFlag(handler, Boolean.TRUE));
            Assert.assertTrue(enabledSource.contains("string tableName"),
                    "a checked tableName flag must enter the signature: " + enabledSource);
        }

        TriggerUISchemaModel.FunctionModel onError = schemaFunction(service, "onError");
        TriggerUISchemaModel.Parameter cdcError = parameter(onError, "cdcError");
        Assert.assertEquals(cdcError.type().types().getFirst().fieldType(), "TYPE");
        Assert.assertNull(cdcError.type().types().getFirst().ballerinaType());
        Assert.assertEquals(onError.returnType().type(), "error?");
        Assert.assertEquals(onError.returnType().hasError(), Boolean.TRUE);
        String onErrorSource = SchemaDrivenSourceGenerator.buildFunctionSource(onError);
        Assert.assertTrue(onErrorSource.contains("remote function onError(cdc:Error cdcError) returns error?"),
                module + ": unexpected onError source: " + onErrorSource);

        if ("postgresql".equals(module)) {
            Assert.assertFalse(handlerNames.contains("onTruncate"),
                    "PostgreSQL retains its truncate listener option but omits the handler catalog entry");
        }
    }

    @Test
    public void testOracleLegacyListenerWidgets() {
        TriggerUISchemaModel model = cdcModel("oracledb", "1.17.0");
        MapView listener = listenerFields(model);
        TriggerUISchemaModel.Property schemas = listener.get("schemas");
        Assert.assertEquals(schemas.types().size(), 1);
        Assert.assertEquals(schemas.types().getFirst().fieldType(), "TEXT_SET");

        TriggerUISchemaModel.Property advanced = listener.get("advancedConfig");
        Assert.assertTrue(advanced.optional());
        MapView advancedFields = new MapView(advanced.properties());
        TriggerUISchemaModel.Property tls = advancedFields.get("driverTls");
        Assert.assertTrue(tls.optional());
        Assert.assertEquals(tls.types().stream().map(TriggerUISchemaModel.PropertyType::fieldType).toList(),
                List.of("RECORD_MAP_EXPRESSION", "EXPRESSION"));
        Assert.assertEquals(tls.types().get(1).ballerinaType(), "oracledb:DriverSslConfiguration|string");
        Assert.assertTrue(advancedFields.get("options").types().getFirst().typeMembers().getFirst().selected());
        assertStorageAlias(advancedFields.get("internalSchemaStorage"), "cdc:InternalSchemaStorage");
        assertStorageAlias(advancedFields.get("offsetStorage"), "cdc:OffsetStorage");
    }

    @Test
    public void testPostgresqlLegacyListenerWidgets() {
        TriggerUISchemaModel model = cdcModel("postgresql", "1.18.0");
        MapView listener = listenerFields(model);
        TriggerUISchemaModel.Property schemas = listener.get("schemas");
        Assert.assertEquals(schemas.types().size(), 1);
        Assert.assertEquals(schemas.types().getFirst().fieldType(), "TEXT_SET");
        Assert.assertFalse(schemas.types().getFirst().selected());
        Assert.assertEquals(listener.get("options").types().getFirst().ballerinaType(), "cdc:Options");
        Assert.assertTrue(listener.get("options").types().getFirst().typeMembers().getFirst().selected());
        assertStorageAlias(listener.get("internalSchemaStorage"), "cdc:InternalSchemaStorage");
        assertStorageAlias(listener.get("offsetStorage"), "cdc:OffsetStorage");
    }

    private static TriggerUISchemaModel.FunctionModel schemaFunction(
            TriggerUISchemaModel.ServiceTypeModel service, String name) {
        return service.schemaFunctions().stream().filter(candidate -> name.equals(candidate.name()))
                .findFirst().orElseThrow();
    }

    private static TriggerUISchemaModel cdcModel(String module, String version) {
        TriggerModelReader reader = TriggerModelReader.getInstance();
        // The parity corpus separately proves the generated pinned model equals this bundled fallback.
        // Some developer homes contain the exact bala without a repository index entry, so the smaller
        // behavioural suite remains runnable without duplicating TriggerParityTest's direct bala loader.
        return reader.getGeneratedTriggerModel("ballerinax", module, version)
                .or(() -> reader.getBundledTriggerModel(module, version)).orElseThrow();
    }

    private static MapView listenerFields(TriggerUISchemaModel model) {
        if (model.listeners() != null && !model.listeners().isEmpty()) {
            return new MapView(model.listeners().getFirst().initProperties());
        }
        TriggerUISchemaModel.Property listener = model.initProperties().get("listener");
        TriggerUISchemaModel.Property listenerConfig = listener.choices().getFirst().properties()
                .get("listenerConfig");
        return new MapView(listenerConfig.properties());
    }

    private static TriggerUISchemaModel.Parameter parameter(TriggerUISchemaModel.FunctionModel function,
                                                             String name) {
        return function.parameters().stream()
                .filter(candidate -> name.equals(candidate.name().value())).findFirst().orElseThrow();
    }

    private static TriggerUISchemaModel.FunctionModel withTableNameFlag(
            TriggerUISchemaModel.FunctionModel function, boolean selected) {
        JsonObject json = GSON.toJsonTree(function).getAsJsonObject();
        for (var parameter : json.getAsJsonArray("parameters")) {
            JsonObject value = parameter.getAsJsonObject();
            if ("tableName".equals(value.getAsJsonObject("name").get("value").getAsString())) {
                value.getAsJsonObject("type").addProperty("value", selected);
            }
        }
        return GSON.fromJson(json, TriggerUISchemaModel.FunctionModel.class);
    }

    private static void assertStorageAlias(TriggerUISchemaModel.Property property, String expectedAlias) {
        Assert.assertEquals(property.types().getFirst().ballerinaType(), expectedAlias);
        Assert.assertTrue(property.types().getFirst().typeMembers().getFirst().selected());
    }

    private record MapView(java.util.Map<String, TriggerUISchemaModel.Property> properties) {
        TriggerUISchemaModel.Property get(String key) {
            TriggerUISchemaModel.Property property = properties.get(key);
            Assert.assertNotNull(property, "missing property " + key);
            return property;
        }
    }
}
