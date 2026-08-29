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
import io.ballerina.servicemodelgenerator.extension.connector.adapter.TriggerServiceAdapter;
import io.ballerina.servicemodelgenerator.extension.model.Function;
import io.ballerina.servicemodelgenerator.extension.model.Service;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import org.testng.Assert;
import org.testng.annotations.Test;

/**
 * Unit test for {@link TriggerServiceAdapter}: builds the designer wire {@link Service} template from
 * a unified {@link TriggerUISchemaModel}. Pure (no LS): verifies the service descriptor and the wire
 * {@link Function}s (name/kind/params/return) produced from the unified {@code serviceTypes[]}.
 *
 * @since 1.9.0
 */
public class TriggerServiceAdapterTest {

    private TriggerUISchemaModel model(String moduleName) {
        return TriggerModelReader.getInstance().getBundledTriggerModel(moduleName).orElseThrow();
    }

    @Test
    public void testGithubServiceTemplate() throws Exception {
        Service service = TriggerServiceAdapter.toServiceTemplate(
                model("trigger.github"), "github:IssuesService", "ballerinax", "github", "github");
        Assert.assertNotNull(service);
        Assert.assertEquals(service.getServiceType().getValue(), "github:IssuesService",
                "descriptor should resolve from the selected service type");

        Function onOpened = service.getFunctions().stream()
                .filter(f -> "onOpened".equals(f.getName().getValue()))
                .findFirst().orElse(null);
        Assert.assertNotNull(onOpened, "the IssuesService handlers should be present as wire functions");
        Assert.assertEquals(onOpened.getKind(), "REMOTE");
        Assert.assertFalse(onOpened.getParameters().isEmpty());
        // Parameter type/name come from the unified Parameter's Property sub-nodes.
        Assert.assertEquals(onOpened.getParameters().getFirst().getType().getValue(), "github:IssuesEvent");
        Assert.assertEquals(onOpened.getParameters().getFirst().getName().getValue(), "payload");
        Assert.assertNotNull(onOpened.getReturnType(), "return type should be adapted");
    }

    @Test
    public void testKafkaSchemaFunctionsSurfacedAsAddable() throws Exception {
        Service service = TriggerServiceAdapter.toServiceTemplate(
                model("kafka"), "Service", "ballerinax", "kafka", "kafka");
        Assert.assertNotNull(service);
        Assert.assertEquals(service.getServiceType().getValue(), "kafka:Service");

        // kafka has no PRESENT handlers (functions[]) — they're all addable (schemaFunctions[]),
        // surfaced in the wire template's schemaFunctions catalog as enabled:false wire functions.
        Assert.assertTrue(service.getFunctions().isEmpty(), "kafka has no present handlers");
        Assert.assertTrue(service.getSchemaFunctions().stream().noneMatch(Function::isEnabled),
                "an addable catalog entry is enabled:false");

        Function onConsumerRecord = service.getSchemaFunctions().stream()
                .filter(f -> "onConsumerRecord".equals(f.getName().getValue()))
                .findFirst().orElse(null);
        Assert.assertNotNull(onConsumerRecord, "the addable onConsumerRecord handler should be surfaced");
        Assert.assertFalse(onConsumerRecord.isEnabled(), "an addable handler is enabled:false");
        // The data-binding param carries the COMPOSED type (element + template), not a raw value.
        Assert.assertEquals(onConsumerRecord.getParameters().getFirst().getType().getValue(),
                "kafka:AnydataConsumerRecord[]");
        // The connector identity is stamped so addFunction routes back to the schema-driven builder.
        Assert.assertNotNull(onConsumerRecord.getCodedata());
        Assert.assertEquals(onConsumerRecord.getCodedata().getModuleName(), "kafka");
    }

    @Test
    public void testListenerPropertyWidgetFollowsListenerKind() throws Exception {
        // The model's `listenerKind` drives the listener property's widget in the wire template.
        Service github = TriggerServiceAdapter.toServiceTemplate(
                model("trigger.github"), "github:IssuesService", "ballerinax", "github", "github");
        Assert.assertEquals(github.getProperties().get("listener").getTypes().getFirst().fieldType(),
                Value.FieldType.MULTIPLE_SELECT_LISTENER,
                "github declares listenerKind MULTIPLE_SELECT_LISTENER");
    }

    @Test
    public void testListenerPropertyDefaultsToSingleSelectWhenListenerKindAbsent() throws Exception {
        // Kafka declares listenerKind SINGLE_SELECT_LISTENER (single-listener connector): the widget
        // resolves to the same default a model omitting listenerKind entirely would fall back to.
        Service kafka = TriggerServiceAdapter.toServiceTemplate(
                model("kafka"), "Service", "ballerinax", "kafka", "kafka");
        Assert.assertEquals(kafka.getProperties().get("listener").getTypes().getFirst().fieldType(),
                Value.FieldType.SINGLE_SELECT_LISTENER,
                "single-listener connectors resolve to SINGLE_SELECT_LISTENER");
    }
}
