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
import io.ballerina.modelgenerator.commons.trigger.models.TriggerUISchemaModel;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.List;

/**
 * Unit test for {@link PayloadComposer}: the effective parameter type computed from a {@code type}
 * {@link TriggerUISchemaModel.Property} tree — data-binding element + base wrap + active modifier, FLAG
 * framework params, and VARIATION_SELECTOR variant navigation.
 *
 * @since 1.9.0
 */
public class PayloadComposerTest {

    private final Gson gson = new Gson();

    private TriggerUISchemaModel model(String moduleName) {
        return TriggerModelReader.getInstance().getBundledTriggerModel(moduleName).orElseThrow();
    }

    private TriggerUISchemaModel.FunctionModel schemaFunction(TriggerUISchemaModel model, String name) {
        return model.serviceTypes().getFirst().schemaFunctions().stream()
                .filter(f -> name.equals(f.name())).findFirst().orElseThrow();
    }

    @Test
    public void testKafkaDataBindingIncludedRecord() throws Exception {
        // records: DATA_BINDING -> PAYLOAD_TYPE_INCLUDED_RECORD (default kafka:AnydataConsumerRecord,
        // modifiers.template "T[]") -> kafka:AnydataConsumerRecord[].
        TriggerUISchemaModel.Parameter records = schemaFunction(model("kafka"), "onConsumerRecord")
                .parameters().getFirst();
        Assert.assertEquals(PayloadComposer.effectiveType(records.type()), "kafka:AnydataConsumerRecord[]");
    }

    @Test
    public void testKafkaCallerFlagType() throws Exception {
        // caller: FLAG framework param -> the type is the widget's ballerinaType.
        List<TriggerUISchemaModel.Parameter> params = schemaFunction(model("kafka"), "onConsumerRecord").parameters();
        TriggerUISchemaModel.Parameter caller = params.stream()
                .filter(p -> "caller".equals(p.name().value())).findFirst().orElseThrow();
        Assert.assertEquals(PayloadComposer.effectiveType(caller.type()), "kafka:Caller");
    }

    @Test
    public void testFtpCsvVariantDefaultPayload() throws Exception {
        // content: COMPLEX_PAYLOAD -> payload PAYLOAD_TYPE (default string[], base template {{type}}[])
        // with the stream modifier OFF -> string[][].
        TriggerUISchemaModel.Parameter content = schemaFunction(model("ftp"), "onFileCsv").parameters().stream()
                .filter(p -> "content".equals(p.name().value())).findFirst().orElseThrow();
        Assert.assertEquals(PayloadComposer.effectiveType(content.type()), "string[][]");
    }

    @Test
    public void testActiveStreamModifierSupersedesBase() {
        // A checked PAYLOAD_MODIFIER (stream) supersedes the base {{type}}[] wrap.
        String json = """
                { "enabled":true,"editable":true,"optional":false,"advanced":false,
                  "types":[{"fieldType":"COMPLEX_PAYLOAD","selected":true}],
                  "properties":{
                    "payload":{"enabled":true,"editable":true,"optional":false,"advanced":false,
                      "types":[{"fieldType":"PAYLOAD_TYPE","selected":true}],
                      "codedata":{"type":"PAYLOAD_TYPE","defaultType":"string[]","template":"{{type}}[]"}},
                    "stream":{"enabled":true,"editable":true,"optional":false,"advanced":false,"value":true,
                      "types":[{"fieldType":"FLAG","selected":true}],
                      "codedata":{"type":"PAYLOAD_MODIFIER","modifier":"stream",
                        "template":"stream<{{type}}, error?>","supersedes":["base"]}}
                  }}""";
        TriggerUISchemaModel.Property prop = gson.fromJson(json, TriggerUISchemaModel.Property.class);
        Assert.assertEquals(PayloadComposer.effectiveType(prop), "stream<string[], error?>");
    }

    @Test
    public void testInactiveModifierUsesBaseWrapAndBoundType() {
        // stream OFF -> base wrap; a bound type supersedes the default element.
        String json = """
                { "enabled":true,"editable":true,"optional":false,"advanced":false,
                  "types":[{"fieldType":"COMPLEX_PAYLOAD","selected":true}],
                  "properties":{
                    "payload":{"enabled":true,"editable":true,"optional":false,"advanced":false,
                      "types":[{"fieldType":"PAYLOAD_TYPE","selected":true}],
                      "codedata":{"type":"PAYLOAD_TYPE","boundType":"Order","defaultType":"string[]",
                        "template":"{{type}}[]"}},
                    "stream":{"enabled":true,"editable":true,"optional":false,"advanced":false,"value":false,
                      "types":[{"fieldType":"FLAG","selected":true}],
                      "codedata":{"type":"PAYLOAD_MODIFIER","modifier":"stream",
                        "template":"stream<{{type}}, error?>","supersedes":["base"]}}
                  }}""";
        TriggerUISchemaModel.Property prop = gson.fromJson(json, TriggerUISchemaModel.Property.class);
        Assert.assertEquals(PayloadComposer.effectiveType(prop), "Order[]");
    }
}
