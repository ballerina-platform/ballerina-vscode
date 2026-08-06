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
import io.ballerina.servicemodelgenerator.extension.connector.adapter.TriggerReadOnlyMetadataAdapter;
import io.ballerina.servicemodelgenerator.extension.model.Service;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.List;
import java.util.Map;

/**
 * Unit test for {@link TriggerReadOnlyMetadataAdapter#build}, covering the paths reachable without a
 * compiled syntax tree / semantic model — the {@code STRING_LITERAL} kind (reads straight off the
 * {@link Service} wire model), the null/empty-definitions short-circuit, unknown-kind fallback, and
 * definition aggregation under a shared display name. The {@code SERVICE_ANNOTATION}/
 * {@code LISTENER_PARAM}/{@code SERVICE_DESCRIPTION} kinds delegate to the shared extractors, already
 * exercised at the higher {@code get_sm_from_source} test level with a real compiled project.
 *
 * @since 1.9.0
 */
public class TriggerReadOnlyMetadataAdapterTest {

    @Test
    public void testBuildReturnsNullWhenNoDefinitions() {
        Assert.assertNull(TriggerReadOnlyMetadataAdapter.build(null, service(null), null, null));
        Assert.assertNull(TriggerReadOnlyMetadataAdapter.build(List.of(), service(null), null, null));
    }

    @Test
    @SuppressWarnings("unchecked")
    public void testStringLiteralKindResolvesFromServiceModel() {
        TriggerUISchemaModel.ReadOnlyMetadata definition =
                new TriggerUISchemaModel.ReadOnlyMetadata("path", "Monitored Path", "STRING_LITERAL", null, null);
        Service service = service("\"/home/in\"");

        Value result = TriggerReadOnlyMetadataAdapter.build(List.of(definition), service, null, null);

        Assert.assertNotNull(result, "a resolvable definition must produce a value");
        Map<String, List<String>> resolved = (Map<String, List<String>>) result.getValueAsObject();
        Assert.assertEquals(resolved.get("Monitored Path"), List.of("/home/in"),
                "the string literal's value must be unquoted");
    }

    @Test
    @SuppressWarnings("unchecked")
    public void testUnknownKindResolvesToEmptyList() {
        TriggerUISchemaModel.ReadOnlyMetadata definition =
                new TriggerUISchemaModel.ReadOnlyMetadata("key", "Some Chip", "NOT_A_REAL_KIND", null, null);

        Value result = TriggerReadOnlyMetadataAdapter.build(List.of(definition), service(null), null, null);

        Map<String, List<String>> resolved = (Map<String, List<String>>) result.getValueAsObject();
        Assert.assertEquals(resolved.get("Some Chip"), List.of(), "an unknown kind resolves to no values");
    }

    @Test
    @SuppressWarnings("unchecked")
    public void testDisplayNameFallsBackToKeyWhenBlank() {
        TriggerUISchemaModel.ReadOnlyMetadata definition =
                new TriggerUISchemaModel.ReadOnlyMetadata("queueName", "", "STRING_LITERAL", null, null);
        Service service = service("\"orders\"");

        Value result = TriggerReadOnlyMetadataAdapter.build(List.of(definition), service, null, null);

        Map<String, List<String>> resolved = (Map<String, List<String>>) result.getValueAsObject();
        Assert.assertTrue(resolved.containsKey("queueName"),
                "a blank displayName must fall back to the definition's key, got: " + resolved.keySet());
    }

    @Test
    @SuppressWarnings("unchecked")
    public void testDefinitionsSharingDisplayNameAggregateUnderOneChip() {
        // Mirrors RabbitMQ's two "Queue Name" definitions: both resolve into the same chip's bucket.
        TriggerUISchemaModel.ReadOnlyMetadata first =
                new TriggerUISchemaModel.ReadOnlyMetadata("queueName", "Queue Name", "STRING_LITERAL", null, null);
        TriggerUISchemaModel.ReadOnlyMetadata second =
                new TriggerUISchemaModel.ReadOnlyMetadata("altQueueName", "Queue Name", "STRING_LITERAL", null, null);
        Service service = service("\"orders\"");

        Value result = TriggerReadOnlyMetadataAdapter.build(List.of(first, second), service, null, null);

        Map<String, List<String>> resolved = (Map<String, List<String>>) result.getValueAsObject();
        Assert.assertEquals(resolved.get("Queue Name"), List.of("orders", "orders"),
                "definitions sharing a display name must aggregate into one chip's bucket");
    }

    private static Service service(String stringLiteralValue) {
        Service service = new Service.ServiceModelBuilder().build();
        if (stringLiteralValue != null) {
            service.setStringLiteral(new Value.ValueBuilder().value(stringLiteralValue).build());
        }
        return service;
    }
}
