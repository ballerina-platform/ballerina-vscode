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
import io.ballerina.modelgenerator.commons.SearchResult;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.function.Function;

/**
 * Tests for {@link FunctionSearchCommand#mergeImportedModuleFunctions}, which tops a search page up with the
 * functions of the modules the project imports.
 *
 * <p>The production method takes the Central lookup as a function so these tests can assert not only what comes back
 * but which modules were asked about at all - the request budget and its ordering are otherwise invisible.</p>
 *
 * @since 1.8.0
 */
public class FunctionSearchTopUpMergeTest {

    private static final String PARTNER_ORG = "neatfox";
    private static final String EXTENDED_ORG = "ballerinax";
    private static final String FINANCE = "edifact.d03a.finance";
    private static final String SUPPLYCHAIN = "edifact.d03a.supplychain";
    private static final String INVOIC = FINANCE + ".mINVOIC";
    private static final String ORDERS = SUPPLYCHAIN + ".mORDERS";
    // FunctionSearchCommand.MAX_TOPPED_UP_MODULES, which is private.
    private static final int MAX_TOPPED_UP_MODULES = 5;

    @Test(description = "A page past the first is returned untouched, so paging cannot repeat a topped-up function.")
    public void testLaterPagesAreNotToppedUp() {
        List<SearchResult> page = List.of(result("ballerina", "edi", "edi", "fromEdiString"));
        RecordingLookup lookup = lookup(Map.of(module(PARTNER_ORG, INVOIC),
                List.of(result(PARTNER_ORG, FINANCE, INVOIC, "fromEdiString"))));

        List<SearchResult> merged = FunctionSearchCommand.mergeImportedModuleFunctions(page,
                imported(module(PARTNER_ORG, INVOIC)), 1, lookup);

        Assert.assertSame(merged, page);
        Assert.assertTrue(lookup.queried.isEmpty());
    }

    @Test(description = "A project that imports nothing costs no extra request.")
    public void testNoImportsCostsNoRequest() {
        List<SearchResult> page = List.of(result("ballerina", "edi", "edi", "fromEdiString"));
        RecordingLookup lookup = lookup(Map.of());

        List<SearchResult> merged = FunctionSearchCommand.mergeImportedModuleFunctions(page, Set.of(), 0, lookup);

        Assert.assertSame(merged, page);
        Assert.assertTrue(lookup.queried.isEmpty());
    }

    @Test(description = "A short page does not stop an imported module being topped up.")
    public void testShortPageStillTopsUp() {
        // A short page is the normal outcome of a broad query: the fetch loop behind it gives up after a fixed
        // number of iterations and discards every row from an organization the page does not carry. Measured
        // against a reindexed registry, eight rows survived of the hundred and eighty scanned out of thirteen
        // hundred matches - so page length says nothing about what Central still held.
        List<SearchResult> page = List.of(result("ballerina", "edi", "edi", "fromEdiString"));
        SearchResult imported = result(EXTENDED_ORG, SUPPLYCHAIN, ORDERS, "fromEdiString");
        RecordingLookup lookup = lookup(Map.of(module(EXTENDED_ORG, ORDERS), List.of(imported)));

        List<SearchResult> merged = FunctionSearchCommand.mergeImportedModuleFunctions(page,
                imported(module(EXTENDED_ORG, ORDERS)), 0, lookup);

        Assert.assertEquals(lookup.queried, List.of(module(EXTENDED_ORG, ORDERS)));
        Assert.assertSame(merged.getFirst(), imported);
        Assert.assertEquals(merged.size(), 2);
    }

    @Test(description = "A module already holding a row on the page is still topped up with the rest of its "
            + "functions.")
    public void testModuleWithARowOnThePageStillToppedUp() {
        // Treating one row as proof the module is fully represented is what hid the function the user was after
        // behind whichever of its siblings happened to rank highest.
        SearchResult onPage = result(EXTENDED_ORG, SUPPLYCHAIN, ORDERS, "fromEdiStringWithSchema");
        List<SearchResult> page = List.of(onPage, result("ballerina", "edi", "edi", "fromEdiString"));
        SearchResult wanted = result(EXTENDED_ORG, SUPPLYCHAIN, ORDERS, "fromEdiString");
        RecordingLookup lookup = lookup(Map.of(module(EXTENDED_ORG, ORDERS), List.of(
                wanted, result(EXTENDED_ORG, SUPPLYCHAIN, ORDERS, "fromEdiStringWithSchema"))));

        List<SearchResult> merged = FunctionSearchCommand.mergeImportedModuleFunctions(page,
                imported(module(EXTENDED_ORG, ORDERS)), 0, lookup);

        Assert.assertEquals(lookup.queried, List.of(module(EXTENDED_ORG, ORDERS)));
        Assert.assertSame(merged.getFirst(), wanted);
    }

    @Test(description = "A function already listed on the page is not repeated ahead of it.")
    public void testFunctionAlreadyOnThePageNotRepeated() {
        SearchResult onPage = result(EXTENDED_ORG, SUPPLYCHAIN, ORDERS, "fromEdiStringWithSchema");
        List<SearchResult> page = List.of(onPage, result("ballerina", "edi", "edi", "fromEdiString"));
        SearchResult wanted = result(EXTENDED_ORG, SUPPLYCHAIN, ORDERS, "fromEdiString");
        RecordingLookup lookup = lookup(Map.of(module(EXTENDED_ORG, ORDERS), List.of(
                wanted, result(EXTENDED_ORG, SUPPLYCHAIN, ORDERS, "fromEdiStringWithSchema"))));

        List<SearchResult> merged = FunctionSearchCommand.mergeImportedModuleFunctions(page,
                imported(module(EXTENDED_ORG, ORDERS)), 0, lookup);

        // Deduplication is by function, not by module: the new one arrives, the listed one keeps its place.
        Assert.assertEquals(merged, List.of(wanted, onPage, page.get(1)));
    }

    @Test(description = "A module whose lookup fails leaves the page as it was rather than emptying it.")
    public void testFailedLookupLeavesThePageIntact() {
        List<SearchResult> page = List.of(result("ballerina", "edi", "edi", "fromEdiString"));
        SearchResult wanted = result(PARTNER_ORG, FINANCE, INVOIC, "fromEdiString");
        // A null answer is how CentralSearchUtil reports a failed request, as distinct from an empty list. The
        // failing module must not take the ones after it down with it.
        RecordingLookup lookup = lookup(Map.of(module(PARTNER_ORG, INVOIC), List.of(wanted)));

        List<SearchResult> merged = FunctionSearchCommand.mergeImportedModuleFunctions(page,
                imported(module(EXTENDED_ORG, ORDERS), module(PARTNER_ORG, INVOIC)), 0, lookup);

        Assert.assertEquals(lookup.queried.size(), 2);
        Assert.assertSame(merged.getFirst(), wanted);
    }

    @Test(description = "The request budget caps how many imported modules one search asks Central about.")
    public void testRequestBudgetIsCapped() {
        List<SearchResult> page = List.of(result("ballerina", "edi", "edi", "fromEdiString"));
        Set<ModuleCoordinate> importedModules = new TreeSet<>();
        Map<ModuleCoordinate, List<SearchResult>> responses = new LinkedHashMap<>();
        List<ModuleCoordinate> expected = new ArrayList<>();
        for (int index = 0; index < MAX_TOPPED_UP_MODULES + 1; index++) {
            String moduleName = "partner.pkg.m" + index;
            ModuleCoordinate coordinate = module(PARTNER_ORG, moduleName);
            importedModules.add(coordinate);
            responses.put(coordinate, List.of(result(PARTNER_ORG, "partner.pkg", moduleName, "fromEdiString")));
            if (index < MAX_TOPPED_UP_MODULES) {
                expected.add(coordinate);
            }
        }
        RecordingLookup lookup = lookup(responses);

        List<SearchResult> merged =
                FunctionSearchCommand.mergeImportedModuleFunctions(page, importedModules, 0, lookup);

        // Spent in the imported modules' own order, so which ones are reached is predictable rather than arbitrary.
        Assert.assertEquals(lookup.queried, expected);
        Assert.assertEquals(merged.size(), MAX_TOPPED_UP_MODULES + page.size());
    }

    @Test(description = "The budget is spent on the modules missing from the page before those already on it.")
    public void testUnpagedModulesGetTheBudgetFirst() {
        SearchResult onPage = result(EXTENDED_ORG, SUPPLYCHAIN, ORDERS, "fromEdiStringWithSchema");
        List<SearchResult> page = List.of(onPage);
        RecordingLookup lookup = lookup(Map.of());

        FunctionSearchCommand.mergeImportedModuleFunctions(page,
                imported(module(EXTENDED_ORG, ORDERS), module(PARTNER_ORG, INVOIC)), 0, lookup);

        Assert.assertEquals(lookup.queried, List.of(module(PARTNER_ORG, INVOIC), module(EXTENDED_ORG, ORDERS)));
    }

    @Test(description = "A module with no matching function leaves the page exactly as it was.")
    public void testNothingFoundLeavesThePageUnchanged() {
        List<SearchResult> page = List.of(result("ballerina", "edi", "edi", "fromEdiString"));
        RecordingLookup lookup = lookup(Map.of(module(PARTNER_ORG, INVOIC), List.of()));

        List<SearchResult> merged = FunctionSearchCommand.mergeImportedModuleFunctions(page,
                imported(module(PARTNER_ORG, INVOIC)), 0, lookup);

        Assert.assertEquals(lookup.queried, List.of(module(PARTNER_ORG, INVOIC)));
        Assert.assertSame(merged, page);
    }

    private static SearchResult result(String org, String packageName, String moduleName, String functionName) {
        return SearchResult.from(org, packageName, moduleName, "1.0.0", functionName, "");
    }

    private static ModuleCoordinate module(String org, String moduleName) {
        return new ModuleCoordinate(org, moduleName);
    }

    private static Set<ModuleCoordinate> imported(ModuleCoordinate... modules) {
        // A TreeSet, matching what ImportedModules hands over, so the natural order is the one under test.
        Set<ModuleCoordinate> imported = new TreeSet<>();
        imported.addAll(List.of(modules));
        return imported;
    }

    private static RecordingLookup lookup(Map<ModuleCoordinate, List<SearchResult>> responses) {
        return new RecordingLookup(responses);
    }

    /**
     * Stands in for the Central request the command would make, recording which modules were asked about and
     * replaying a fixed answer. A module with no entry answers null, which is how a failed request is reported.
     */
    private static final class RecordingLookup implements Function<ModuleCoordinate, List<SearchResult>> {

        private final Map<ModuleCoordinate, List<SearchResult>> responses;
        private final List<ModuleCoordinate> queried = new ArrayList<>();

        private RecordingLookup(Map<ModuleCoordinate, List<SearchResult>> responses) {
            this.responses = responses;
        }

        @Override
        public List<SearchResult> apply(ModuleCoordinate candidate) {
            queried.add(candidate);
            return responses.get(candidate);
        }
    }
}
