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

package io.ballerina.flowmodelgenerator.extension;

import io.ballerina.flowmodelgenerator.core.utils.ConnectorCategoryResolver;
import io.ballerina.modelgenerator.commons.SearchDatabaseManager;
import io.ballerina.modelgenerator.commons.SearchDatabaseManager.IndexedConnector;
import org.testng.Assert;
import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Runs the connector grouping rules over the bundled package index, which the catalogue is derived from at runtime.
 * Covers the index carrying the keywords and pull counts, and the rules placing real connectors sensibly.
 *
 * @since 1.8.0
 */
public class ConnectorIndexKeywordTest {

    private static final Set<String> ALLOWED_ORGANIZATIONS = Set.of("ballerina", "ballerinax", "wso2");

    /**
     * A spot check, deliberately not the whole catalogue: pinning every connector by hand is the problem this design
     * removes.
     */
    private static final Map<String, String> SPOT_CHECKS = Map.ofEntries(
            Map.entry("http:Client", "Network"),
            Map.entry("mcp:StreamableHttpClient", "Network"),
            Map.entry("mysql:Client", "Database"),
            Map.entry("redis:Client", "Database"),
            Map.entry("kafka:Producer", "Messaging"),
            Map.entry("asb:MessageSender", "Messaging"),
            Map.entry("salesforce:Client", "CRM & Sales"),
            Map.entry("googleapis.gmail:Client", "Communication"),
            Map.entry("twilio:Client", "Communication"),
            Map.entry("aws.s3:Client", "Storage & Files"),
            Map.entry("googleapis.sheets:Client", "Productivity & Collaboration"),
            Map.entry("github:Client", "Cloud & DevOps"),
            Map.entry("stripe:Client", "Finance & Accounting"),
            Map.entry("shopify.admin:Client", "E-Commerce"),
            Map.entry("azure.keyvault:Client", "Security & Identity"),
            Map.entry("openai.chat:Client", "AI & Machine Learning"),
            Map.entry("sap:Client", "ERP & Business Operations"),
            Map.entry("email:ImapClient", "Communication"));

    /**
     * Classes that must never be offered as a connector, however the index labels them.
     */
    private static final List<String> NOT_CONNECTORS = List.of("http:Caller", "http:FailoverClient", "ai:ChatClient");

    private List<IndexedConnector> connectors;

    /** Every catalogued connector as {@code module:Class} mapped to the category it was grouped into. */
    private Map<String, String> catalogue;

    @BeforeClass
    public void setUp() {
        connectors = SearchDatabaseManager.getInstance().listConnectors(ALLOWED_ORGANIZATIONS);
        catalogue = new LinkedHashMap<>();
        ConnectorCategoryResolver.group(connectors).forEach((category, results) -> {
            if (ConnectorCategoryResolver.POPULAR_CATEGORY.equals(category)) {
                return; // every Popular entry is also listed under its own category
            }
            results.forEach(result -> catalogue.put(
                    ConnectorCategoryResolver.key(result.packageInfo().moduleName(), result.name()), category));
        });
    }

    @Test(description = "The index returns the connectors the catalogue is built from.")
    public void testIndexReturnsConnectors() {
        Assert.assertTrue(connectors.size() > 500, "Expected the full connector set, got " + connectors.size());
        Assert.assertTrue(catalogue.size() > 500, "Catalogue is smaller than expected: " + catalogue.size());
    }

    @Test(description = "Keywords are populated, since the grouping has no other input.")
    public void testKeywordsArePopulated() {
        long withKeywords = connectors.stream().filter(connector -> !connector.keywords().isEmpty()).count();
        Assert.assertTrue(withKeywords > connectors.size() * 0.95,
                "Only " + withKeywords + " of " + connectors.size() + " connectors carry keywords");
    }

    @Test(description = "Both keyword schemes are present, so both have to be read.")
    public void testBothKeywordSchemesArePresent() {
        long area = connectors.stream()
                .filter(connector -> connector.keywords().stream().anyMatch(k -> k.startsWith("Area/")))
                .count();
        Assert.assertTrue(area > 100, "Expected the current Area/ scheme in the index, found " + area);
        Assert.assertTrue(area < connectors.size() / 2,
                "Area/ now covers most connectors; the legacy scheme may no longer be needed");
    }

    @Test(description = "Pull counts are populated, since they rank every unpinned connector.")
    public void testPullCountsArePopulated() {
        long ranked = connectors.stream().filter(connector -> connector.pullCount() > 0).count();
        Assert.assertTrue(ranked > connectors.size() * 0.9,
                "Only " + ranked + " of " + connectors.size() + " connectors carry a pull count");
    }

    @Test(description = "Well-known connectors land in the category a user would look for them in.")
    public void testSpotChecks() {
        List<String> problems = new ArrayList<>();
        SPOT_CHECKS.forEach((entry, expected) -> {
            String actual = catalogue.get(entry);
            if (actual == null) {
                problems.add(entry + " is missing from the catalogue");
            } else if (!actual.equals(expected)) {
                problems.add(entry + " is in " + actual + ", expected " + expected);
            }
        });
        NOT_CONNECTORS.stream()
                .filter(catalogue::containsKey)
                .forEach(entry -> problems.add(entry + " should not be offered as a connector"));
        Assert.assertTrue(problems.isEmpty(), String.join("; ", problems));
    }

    @Test(description = "Every pinned entry resolves, and into the category it is pinned under.")
    public void testPinnedEntriesResolveIntoTheirCategory() {
        List<String> problems = new ArrayList<>();
        for (String category : ConnectorCategoryResolver.categoryOrder()) {
            for (String pin : ConnectorCategoryResolver.pinnedEntries(category)) {
                String actual = catalogue.get(pin);
                if (actual == null) {
                    problems.add(pin + " is pinned under " + category + " but is not in the catalogue");
                } else if (!actual.equals(category)) {
                    problems.add(pin + " is pinned under " + category + " but resolves to " + actual);
                }
            }
        }
        Assert.assertTrue(problems.isEmpty(), String.join("; ", problems));
    }

    @Test(description = "Every curated Popular entry resolves, or the first screen renders short.")
    public void testPopularEntriesResolve() {
        List<String> unresolved = ConnectorCategoryResolver.popularEntries().stream()
                .filter(entry -> !catalogue.containsKey(entry))
                .toList();
        Assert.assertTrue(unresolved.isEmpty(), "Popular entries not in the catalogue: " + unresolved);
    }

    @Test(description = "Every displayed category has connectors in it, so none renders empty.")
    public void testEveryCategoryIsPopulated() {
        List<String> empty = ConnectorCategoryResolver.categoryOrder().stream()
                .filter(category -> !ConnectorCategoryResolver.POPULAR_CATEGORY.equals(category))
                .filter(category -> catalogue.values().stream().noneMatch(category::equals))
                .toList();
        Assert.assertTrue(empty.isEmpty(), "Categories with no connectors: " + empty);
    }

    @Test(description = "Few connectors fall through to Other, which is the signal that a keyword is unmapped.")
    public void testOtherStaysSmall() {
        List<String> other = catalogue.entrySet().stream()
                .filter(entry -> ConnectorCategoryResolver.OTHER_CATEGORY.equals(entry.getValue()))
                .map(Map.Entry::getKey)
                .toList();
        Assert.assertTrue(other.size() < 20,
                "Too many connectors fell through to Other (" + other.size() + "): " + other);
    }
}
