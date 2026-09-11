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

package io.ballerina.flowmodelgenerator.core.search;

import io.ballerina.modelgenerator.commons.ModuleCoordinate;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/**
 * Tests for {@link FunctionSearchCommand#topUpOrder(Map, Set, Set)}, which decides which imported packages are worth
 * an extra request when a search page cannot hold every match.
 *
 * @since 1.8.0
 */
public class FunctionSearchTopUpOrderTest {

    private static final String ORG = "ballerinax";
    private static final String SUPPLYCHAIN = "edifact.d03a.supplychain";
    private static final String SHIPPING = "edifact.d03a.shipping";

    @Test(description = "A package whose every imported module is already listed is not queried again.")
    public void testFullyPagedPackageSkipped() {
        Map<PackageCoordinate, Set<ModuleCoordinate>> imported = imported(
                Map.entry(SUPPLYCHAIN, Set.of(module(SUPPLYCHAIN), module(SUPPLYCHAIN + ".mORDERS"))));

        List<PackageCoordinate> order = FunctionSearchCommand.topUpOrder(imported,
                Set.of(module(SUPPLYCHAIN), module(SUPPLYCHAIN + ".mORDERS")),
                Set.of(new PackageCoordinate(ORG, SUPPLYCHAIN)));

        Assert.assertTrue(order.isEmpty());
    }

    @Test(description = "A package listed for some of its imported modules but not all of them is queried.")
    public void testPartiallyPagedPackageQueried() {
        // The reported case: the package root is on the page, the submodule the project imports is not.
        Map<PackageCoordinate, Set<ModuleCoordinate>> imported = imported(
                Map.entry(SUPPLYCHAIN, Set.of(module(SUPPLYCHAIN), module(SUPPLYCHAIN + ".mORDERS"))));

        List<PackageCoordinate> order = FunctionSearchCommand.topUpOrder(imported,
                Set.of(module(SUPPLYCHAIN)),
                Set.of(new PackageCoordinate(ORG, SUPPLYCHAIN)));

        Assert.assertEquals(order, List.of(new PackageCoordinate(ORG, SUPPLYCHAIN)));
    }

    @Test(description = "A package with rows on the page is queried before one with none, being proven relevant.")
    public void testPartiallyPagedOrderedBeforeUnpaged() {
        // shipping sorts first alphabetically, so ordering by evidence has to override the natural order.
        Map<PackageCoordinate, Set<ModuleCoordinate>> imported = imported(
                Map.entry(SHIPPING, Set.of(module(SHIPPING), module(SHIPPING + ".mIFTMIN"))),
                Map.entry(SUPPLYCHAIN, Set.of(module(SUPPLYCHAIN), module(SUPPLYCHAIN + ".mORDERS"))));

        List<PackageCoordinate> order = FunctionSearchCommand.topUpOrder(imported,
                Set.of(module(SUPPLYCHAIN)),
                Set.of(new PackageCoordinate(ORG, SUPPLYCHAIN)));

        Assert.assertEquals(order, List.of(new PackageCoordinate(ORG, SUPPLYCHAIN),
                new PackageCoordinate(ORG, SHIPPING)));
    }

    @Test(description = "A package absent from the page is still queried once the proven ones are exhausted.")
    public void testUnpagedPackageQueried() {
        Map<PackageCoordinate, Set<ModuleCoordinate>> imported = imported(
                Map.entry(SUPPLYCHAIN, Set.of(module(SUPPLYCHAIN + ".mORDERS"))));

        List<PackageCoordinate> order = FunctionSearchCommand.topUpOrder(imported,
                Set.of(module("edifact.d03a.finance")),
                Set.of(new PackageCoordinate(ORG, "edifact.d03a.finance")));

        Assert.assertEquals(order, List.of(new PackageCoordinate(ORG, SUPPLYCHAIN)));
    }

    @Test(description = "A same-named package from another organization does not count as covering this one.")
    public void testOtherOrganizationDoesNotCover() {
        Map<PackageCoordinate, Set<ModuleCoordinate>> imported = imported(
                Map.entry(SUPPLYCHAIN, Set.of(module(SUPPLYCHAIN))));

        List<PackageCoordinate> order = FunctionSearchCommand.topUpOrder(imported,
                Set.of(new ModuleCoordinate("someoneelse", SUPPLYCHAIN)),
                Set.of(new PackageCoordinate("someoneelse", SUPPLYCHAIN)));

        Assert.assertEquals(order, List.of(new PackageCoordinate(ORG, SUPPLYCHAIN)));
    }

    @Test(description = "Nothing is queried when the project imports nothing.")
    public void testNoImportsQueriesNothing() {
        Assert.assertTrue(FunctionSearchCommand.topUpOrder(Map.of(),
                Set.of(module(SUPPLYCHAIN)), Set.of(new PackageCoordinate(ORG, SUPPLYCHAIN))).isEmpty());
    }

    private static ModuleCoordinate module(String moduleName) {
        return new ModuleCoordinate(ORG, moduleName);
    }

    @SafeVarargs
    private static Map<PackageCoordinate, Set<ModuleCoordinate>> imported(
            Map.Entry<String, Set<ModuleCoordinate>>... entries) {
        // A TreeMap, matching what ImportedModules hands over, so the natural order is the one under test.
        Map<PackageCoordinate, Set<ModuleCoordinate>> imported = new TreeMap<>();
        for (Map.Entry<String, Set<ModuleCoordinate>> entry : entries) {
            imported.put(new PackageCoordinate(ORG, entry.getKey()), entry.getValue());
        }
        return imported;
    }
}
