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
import java.util.Set;
import java.util.TreeSet;

/**
 * Tests for {@link FunctionSearchCommand#topUpOrder(Set, Set)}, which decides the order in which a search spends its
 * request budget on the modules the project imports.
 *
 * @since 1.8.0
 */
public class FunctionSearchTopUpOrderTest {

    private static final String ORG = "ballerinax";
    private static final String SUPPLYCHAIN = "edifact.d03a.supplychain";
    private static final String SHIPPING = "edifact.d03a.shipping";

    @Test(description = "A module with no rows on the page is asked about before one that has some.")
    public void testUnpagedModulesComeFirst() {
        // Ordering by evidence has to override the natural order: shipping sorts first, but supplychain's presence
        // on the page makes it the likelier of the two to be listed in full already.
        Set<ModuleCoordinate> imported = imported(SUPPLYCHAIN, SHIPPING + ".mIFTMIN");

        List<ModuleCoordinate> order = FunctionSearchCommand.topUpOrder(imported, Set.of(module(SUPPLYCHAIN)));

        Assert.assertEquals(order, List.of(module(SHIPPING + ".mIFTMIN"), module(SUPPLYCHAIN)));
    }

    @Test(description = "A module already listed on the page is still asked about, never skipped.")
    public void testPagedModuleStillQueried() {
        // One arbitrary row does not prove the module's matching functions are all on the page. Skipping on that
        // evidence is what hid the rest of a module's functions behind whichever one happened to rank highest.
        Set<ModuleCoordinate> imported = imported(SUPPLYCHAIN + ".mORDERS");

        List<ModuleCoordinate> order =
                FunctionSearchCommand.topUpOrder(imported, Set.of(module(SUPPLYCHAIN + ".mORDERS")));

        Assert.assertEquals(order, List.of(module(SUPPLYCHAIN + ".mORDERS")));
    }

    @Test(description = "A same-named module from another organization does not count as covering this one.")
    public void testOtherOrganizationDoesNotCover() {
        Set<ModuleCoordinate> imported = imported(SUPPLYCHAIN);

        List<ModuleCoordinate> order = FunctionSearchCommand.topUpOrder(imported,
                Set.of(new ModuleCoordinate("someoneelse", SUPPLYCHAIN)));

        // Unpaged as far as this organization is concerned, so it leads rather than trails.
        Assert.assertEquals(order, List.of(module(SUPPLYCHAIN)));
    }

    @Test(description = "The imported modules' own order is kept within each group, so the budget is predictable.")
    public void testOrderIsStableWithinEachGroup() {
        Set<ModuleCoordinate> imported =
                imported(SHIPPING, SHIPPING + ".mIFTMIN", SUPPLYCHAIN, SUPPLYCHAIN + ".mORDERS");

        List<ModuleCoordinate> order = FunctionSearchCommand.topUpOrder(imported,
                Set.of(module(SHIPPING), module(SUPPLYCHAIN)));

        Assert.assertEquals(order, List.of(
                module(SHIPPING + ".mIFTMIN"), module(SUPPLYCHAIN + ".mORDERS"),
                module(SHIPPING), module(SUPPLYCHAIN)));
    }

    @Test(description = "Nothing is queried when the project imports nothing.")
    public void testNoImportsQueriesNothing() {
        Assert.assertTrue(FunctionSearchCommand.topUpOrder(Set.of(), Set.of(module(SUPPLYCHAIN))).isEmpty());
    }

    private static ModuleCoordinate module(String moduleName) {
        return new ModuleCoordinate(ORG, moduleName);
    }

    private static Set<ModuleCoordinate> imported(String... moduleNames) {
        // A TreeSet, matching what ImportedModules hands over, so the natural order is the one under test.
        Set<ModuleCoordinate> imported = new TreeSet<>();
        for (String moduleName : moduleNames) {
            imported.add(module(moduleName));
        }
        return imported;
    }
}
