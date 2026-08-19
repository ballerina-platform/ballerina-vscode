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

package io.ballerina.flowmodelgenerator.core;

import io.ballerina.flowmodelgenerator.core.utils.ConnectorCategoryResolver;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Tests the rules that group connectors into browse categories. Whether real connectors land where they should is
 * covered by {@code ConnectorIndexKeywordTest}, which runs these rules over the bundled package index.
 *
 * @since 1.8.0
 */
public class ConnectorCategoryResolverTest {

    @Test(description = "The current Area/ scheme wins over the legacy one.")
    public void testAreaKeywordWins() {
        Assert.assertEquals(ConnectorCategoryResolver.categorize("acme",
                List.of("Sales & CRM/Customer Relationship Management", "Area/Communication")), "Communication");
    }

    @Test(description = "The legacy subarea is load-bearing, since one area covers unrelated subjects.")
    public void testLegacySubareaIsMatchedBeforeTheArea() {
        Assert.assertEquals(ConnectorCategoryResolver.categorize("acme",
                List.of("IT Operations/Databases")), "Database");
        Assert.assertEquals(ConnectorCategoryResolver.categorize("acme",
                List.of("IT Operations/Source Control")), "Cloud & DevOps");
    }

    @Test(description = "An area with no subarea mapping still resolves through its prefix.")
    public void testLegacyAreaPrefixFallback() {
        Assert.assertEquals(ConnectorCategoryResolver.categorize("acme",
                List.of("Business Intelligence/Something New")), "Analytics");
    }

    @Test(description = "Keywords that describe cost, vendor or type are not subject areas.")
    public void testReservedKeywordsAreIgnored() {
        Assert.assertEquals(ConnectorCategoryResolver.categorize("acme",
                List.of("Cost/Paid", "Vendor/Acme", "Type/Connector", "Name/Acme")),
                ConnectorCategoryResolver.OTHER_CATEGORY);
    }

    @Test(description = "Protocol clients carry no categorising keyword and are mapped by module.")
    public void testStdlibModulesAreMappedByName() {
        Assert.assertEquals(ConnectorCategoryResolver.categorize("http", List.of()), "Network");
        Assert.assertEquals(ConnectorCategoryResolver.categorize("email", List.of()), "Communication");
    }

    @Test(description = "A hand placement overrides whatever keywords the package carries.")
    public void testManualPlacementWins() {
        Assert.assertEquals(ConnectorCategoryResolver.categorize("ldap",
                List.of("Area/Communication")), "Security & Identity");
    }

    @Test(description = "An unrecognised keyword falls through rather than throwing.")
    public void testUnknownKeywordsFallThrough() {
        Assert.assertEquals(ConnectorCategoryResolver.categorize("acme", List.of("Something/Unmapped")),
                ConnectorCategoryResolver.OTHER_CATEGORY);
        Assert.assertEquals(ConnectorCategoryResolver.categorize("acme", null),
                ConnectorCategoryResolver.OTHER_CATEGORY);
    }

    @Test(description = "Protocol plumbing and sub-handles are not offered as connectors.")
    public void testClassFilter() {
        Assert.assertTrue(ConnectorCategoryResolver.isCatalogueConnector("redis", "Client", List.of()));
        Assert.assertTrue(ConnectorCategoryResolver.isCatalogueConnector("kafka", "Consumer", List.of()));
        Assert.assertFalse(ConnectorCategoryResolver.isCatalogueConnector("http", "Caller", List.of()));
        Assert.assertFalse(ConnectorCategoryResolver.isCatalogueConnector("mongodb", "Collection", List.of()));
        Assert.assertFalse(ConnectorCategoryResolver.isCatalogueConnector("ai.openai", "ModelProvider", List.of()));
        Assert.assertFalse(ConnectorCategoryResolver.isCatalogueConnector("health.fhir.r4", "Client", List.of()));
        Assert.assertFalse(ConnectorCategoryResolver.isCatalogueConnector("mysql.driver", "Client", List.of()));
        Assert.assertFalse(ConnectorCategoryResolver.isCatalogueConnector(null, "Client", List.of()));
    }

    @Test(description = "A package is only dropped when every Type/ keyword marks it a non-connector.")
    public void testTypeKeywordFilter() {
        Assert.assertFalse(ConnectorCategoryResolver.isCatalogueConnector("acme", "Client",
                List.of("Type/Driver", "Type/Library")));
        Assert.assertTrue(ConnectorCategoryResolver.isCatalogueConnector("acme", "Client",
                List.of("Type/Trigger", "Type/Connector")));
    }

    @Test(description = "Every curated and pinned entry names a category that is actually displayed.")
    public void testCuratedEntriesReferenceDeclaredCategories() {
        Set<String> ordered = new HashSet<>(ConnectorCategoryResolver.categoryOrder());
        List<String> problems = new ArrayList<>();
        for (String category : ConnectorCategoryResolver.categoryOrder()) {
            for (String pin : ConnectorCategoryResolver.pinnedEntries(category)) {
                if (pin.indexOf(':') < 0) {
                    problems.add("Pin is not a module:Class key: " + pin);
                }
            }
        }
        for (String entry : ConnectorCategoryResolver.popularEntries()) {
            if (entry.indexOf(':') < 0) {
                problems.add("Popular entry is not a module:Class key: " + entry);
            }
        }
        Assert.assertTrue(ordered.contains(ConnectorCategoryResolver.POPULAR_CATEGORY));
        Assert.assertTrue(ordered.contains(ConnectorCategoryResolver.OTHER_CATEGORY));
        Assert.assertTrue(problems.isEmpty(), String.join("; ", problems));
    }

    @Test(description = "The display order has no duplicates, which would render a category twice.")
    public void testCategoryOrderIsUnique() {
        List<String> order = ConnectorCategoryResolver.categoryOrder();
        Assert.assertEquals(new HashSet<>(order).size(), order.size(), "Duplicate category in the display order");
    }
}
