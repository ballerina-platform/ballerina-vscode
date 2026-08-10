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

package io.ballerina.servicemodelgenerator.extension.util;

import io.ballerina.centralconnector.CentralAPI;
import io.ballerina.centralconnector.response.ConnectorResponse;
import io.ballerina.centralconnector.response.ConnectorsResponse;
import io.ballerina.centralconnector.response.DependentPackage;
import io.ballerina.centralconnector.response.FunctionResponse;
import io.ballerina.centralconnector.response.FunctionsResponse;
import io.ballerina.centralconnector.response.Listeners;
import io.ballerina.centralconnector.response.PackageResponse;
import io.ballerina.centralconnector.response.SymbolResponse;
import io.ballerina.servicemodelgenerator.extension.model.TriggerBasicInfo;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Unit tests for {@link TriggerSearchUtil}: the Central trigger-identification heuristic and the
 * package -> {@link TriggerBasicInfo} mapping/filtering, exercised without a network call.
 *
 * @since 1.8.0
 */
public class TriggerSearchUtilTest {

    @Test
    public void testIsTriggerPackage() {
        Assert.assertTrue(TriggerSearchUtil.isTriggerPackage(List.of("messaging", "Trigger"), "salesforce"),
                "keyword 'Trigger' (case-insensitive) marks a trigger");
        Assert.assertTrue(TriggerSearchUtil.isTriggerPackage(List.of("webhook", "listener"), "github"),
                "keyword 'listener' marks a trigger");
        Assert.assertTrue(TriggerSearchUtil.isTriggerPackage(List.of(), "trigger.github"),
                "trigger.* module convention marks a trigger");
        Assert.assertFalse(TriggerSearchUtil.isTriggerPackage(List.of("http", "client"), "foo"),
                "a plain client package is not a trigger");
        Assert.assertFalse(TriggerSearchUtil.isTriggerPackage(null, "foo"),
                "no keywords + non-trigger name -> not a trigger");
    }

    @Test
    public void testTypeTriggerTagIsAuthoritative() {
        Assert.assertTrue(TriggerSearchUtil.isTriggerPackage(
                        List.of("IT Operations/Message Brokers", "Vendor/Amazon", "Type/Connector", "Type/Trigger"),
                        "aws.sqs"),
                "the Type/Trigger tag alone marks a trigger");
        Assert.assertTrue(TriggerSearchUtil.isTriggerPackage(List.of("type/trigger"), "kafka"),
                "the Type/Trigger tag is matched case-insensitively");
        Assert.assertFalse(TriggerSearchUtil.isTriggerPackage(List.of("Type/Connector", "Type/Library"), "aws"),
                "Type/Connector or Type/Library alone do not mark a trigger");
    }

    @Test
    public void testDisplayNameHumanizesPackageNames() {
        Assert.assertEquals(TriggerSearchUtil.displayName("trigger.github"), "Github",
                "the trigger. family prefix is dropped, keeping only the connector name");
        Assert.assertEquals(TriggerSearchUtil.displayName("confluent.cavroserdes"), "Cavroserdes",
                "a vendor-namespaced package keeps only the trailing segment");
        Assert.assertEquals(TriggerSearchUtil.displayName("cdc-mysql"), "Cdc Mysql",
                "every hyphen-separated word is Title-Cased, not just the first");
        Assert.assertEquals(TriggerSearchUtil.displayName("kafka"), "Kafka",
                "a single lowercase word is capitalized");
        Assert.assertEquals(TriggerSearchUtil.displayName("googleapis.gmail"), "Gmail",
                "only the trailing segment survives");
    }

    @Test
    public void testToTriggerResultsFiltersAndMaps() {
        PackageResponse response = new PackageResponse(
                List.of(
                        pkg("ballerinax", "mqtt", "1.0.0", List.of("mqtt", "listener"), "MQTT trigger", "mqtt-icon"),
                        pkg("ballerinax", "somehttpclient", "2.0.0", List.of("http", "client"), "", ""),
                        pkg("ballerinax", "kafka", "4.5.0", List.of("kafka", "trigger"), "Kafka", "kafka-icon")),
                List.of(), null, 3, 0, 30);

        // kafka is already known locally, so it must be excluded.
        List<TriggerBasicInfo> results = TriggerSearchUtil.toTriggerResults(response, Set.of("ballerinax/kafka"));

        Assert.assertEquals(results.size(), 1, "only the non-local trigger package survives");
        TriggerBasicInfo mqtt = results.getFirst();
        Assert.assertEquals(mqtt.orgName(), "ballerinax");
        Assert.assertEquals(mqtt.packageName(), "mqtt");
        Assert.assertEquals(mqtt.type(), "event", "results render under Event Integration");
        Assert.assertEquals(mqtt.icon(), "mqtt-icon");
        Assert.assertEquals(mqtt.listenerProtocol(), "mqtt");
    }

    @Test
    public void testPackageWithoutTriggerSignalExcluded() {
        PackageResponse response = new PackageResponse(
                List.of(
                        pkg("ballerinax", "activemq", "1.0.0", List.of("messaging", "jms"), "ActiveMQ", "amq-icon"),
                        pkg("ballerinax", "somehttpclient", "2.0.0", List.of("http", "client"), "", "")),
                List.of(), null, 2, 0, 30);

        List<TriggerBasicInfo> results = TriggerSearchUtil.toTriggerResults(response, Set.of());

        Assert.assertTrue(results.isEmpty(), "neither package carries a trigger signal");
    }

    @Test
    public void testSearchCentralScopesToBallerinaAndBallerinaxOnly() {
        FakeCentralAPI central = new FakeCentralAPI();
        central.responsesByOrg.put("ballerina", new PackageResponse(
                List.of(pkg("ballerina", "mqtt", "1.0.0", List.of("mqtt", "listener"), "MQTT", "mqtt-icon")),
                List.of(), null, 1, 0, 30));
        central.responsesByOrg.put("ballerinax", new PackageResponse(
                List.of(pkg("ballerinax", "kafka", "4.5.0", List.of("Type/Trigger"), "Kafka", "kafka-icon")),
                List.of(), null, 1, 0, 30));

        List<TriggerBasicInfo> results = TriggerSearchUtil.searchCentral(central, "trigger", null, Set.of());

        Assert.assertEquals(central.queriesSent.size(), 2, "one search call per allowed org");
        Assert.assertTrue(central.queriesSent.stream().anyMatch(q -> "ballerina".equals(q.get("org"))));
        Assert.assertTrue(central.queriesSent.stream().anyMatch(q -> "ballerinax".equals(q.get("org"))));
        Assert.assertEquals(results.size(), 2, "results from both allowed orgs are merged");
        Assert.assertTrue(results.stream().anyMatch(r -> r.orgName().equals("ballerina")
                && r.packageName().equals("mqtt")));
        Assert.assertTrue(results.stream().anyMatch(r -> r.orgName().equals("ballerinax")
                && r.packageName().equals("kafka")));
    }

    @Test
    public void testSearchCentralOneOrgFailureDoesNotDiscardTheOther() {
        FakeCentralAPI central = new FakeCentralAPI();
        central.responsesByOrg.put("ballerina", new PackageResponse(
                List.of(pkg("ballerina", "mqtt", "1.0.0", List.of("mqtt", "listener"), "MQTT", "mqtt-icon")),
                List.of(), null, 1, 0, 30));
        central.failingOrgs.add("ballerinax");

        List<TriggerBasicInfo> results = TriggerSearchUtil.searchCentral(central, "trigger", null, Set.of());

        Assert.assertEquals(results.size(), 1, "the failing org must not discard the succeeding org's results");
        Assert.assertEquals(results.getFirst().orgName(), "ballerina");
    }

    @Test
    public void testSearchCentralInterleavesAcrossOrgsUnderTruncation() {
        FakeCentralAPI central = new FakeCentralAPI();
        central.responsesByOrg.put("ballerina", new PackageResponse(
                List.of(
                        pkg("ballerina", "a", "1.0.0", List.of("trigger"), "", ""),
                        pkg("ballerina", "b", "1.0.0", List.of("trigger"), "", ""),
                        pkg("ballerina", "c", "1.0.0", List.of("trigger"), "", "")),
                List.of(), null, 3, 0, 30));
        central.responsesByOrg.put("ballerinax", new PackageResponse(
                List.of(pkg("ballerinax", "kafka", "1.0.0", List.of("trigger"), "", "")),
                List.of(), null, 1, 0, 30));

        List<TriggerBasicInfo> results = TriggerSearchUtil.searchCentral(central, "trigger", 2, Set.of());

        Assert.assertEquals(results.size(), 2, "truncated to the requested limit");
        Assert.assertTrue(results.stream().anyMatch(r -> r.orgName().equals("ballerinax")),
                "ballerinax must not be truncated away entirely just because ballerina alone fills the limit");
    }

    @Test
    public void testDeprecatedPackagesSkipped() {
        PackageResponse response = new PackageResponse(
                List.of(deprecated("ballerinax", "oldtrigger", List.of("trigger"))),
                List.of(), null, 1, 0, 30);
        Assert.assertTrue(TriggerSearchUtil.toTriggerResults(response, Set.of()).isEmpty(),
                "deprecated trigger packages are not offered");
    }

    private static PackageResponse.Package pkg(String org, String name, String version, List<String> keywords,
                                               String summary, String icon) {
        return build(org, name, version, keywords, summary, icon, false);
    }

    private static PackageResponse.Package deprecated(String org, String name, List<String> keywords) {
        return build(org, name, "1.0.0", keywords, "", "", true);
    }

    private static PackageResponse.Package build(String org, String name, String version, List<String> keywords,
                                                 String summary, String icon, boolean deprecatedFlag) {
        return new PackageResponse.Package(
                1, org, name, version, "java21", "2201.0.0", deprecatedFlag, "", "", version, "", "",
                summary, "", false, List.of(), List.of(), "", keywords, "2201.0.0", icon, "", 0L, 0,
                "public", List.of(), "", "true");
    }

    /** A minimal {@link CentralAPI} test double keyed by the query's {@code org} parameter. */
    private static final class FakeCentralAPI implements CentralAPI {

        final Map<String, PackageResponse> responsesByOrg = new HashMap<>();
        final Set<String> failingOrgs = Collections.synchronizedSet(new HashSet<>());
        final List<Map<String, String>> queriesSent = Collections.synchronizedList(new ArrayList<>());

        @Override
        public PackageResponse searchPackages(Map<String, String> queryMap) {
            queriesSent.add(queryMap);
            String org = queryMap.get("org");
            if (failingOrgs.contains(org)) {
                throw new RuntimeException("simulated Central failure for org '" + org + "'");
            }
            PackageResponse response = responsesByOrg.get(org);
            return response != null ? response : new PackageResponse(List.of(), List.of(), null, 0, 0, 30);
        }

        @Override
        public SymbolResponse searchSymbols(Map<String, String> queryMap) {
            return null;
        }

        @Override
        public FunctionsResponse functions(String organization, String name, String version) {
            return null;
        }

        @Override
        public Listeners listeners(String organization, String name, String version) {
            return null;
        }

        @Override
        public FunctionResponse function(String organization, String name, String version, String functionName) {
            return null;
        }

        @Override
        public ConnectorsResponse connectors(Map<String, String> queryMap) {
            return null;
        }

        @Override
        public ConnectorResponse connector(String id) {
            return null;
        }

        @Override
        public ConnectorResponse connector(String organization, String name, String version, String clientName) {
            return null;
        }

        @Override
        public String latestPackageVersion(String org, String name) {
            return null;
        }

        @Override
        public List<String> allPackageVersions(String org, String name) {
            return List.of();
        }

        @Override
        public Map<String, List<DependentPackage>> dependentPackages(String org, String packageName,
                                                                      List<String> versions) {
            return Map.of();
        }

        @Override
        public Map<String, List<String>> packageKeywords(List<DependentPackage> modules) {
            return Map.of();
        }

        @Override
        public boolean hasAuthorizedAccess() {
            return false;
        }
    }
}
