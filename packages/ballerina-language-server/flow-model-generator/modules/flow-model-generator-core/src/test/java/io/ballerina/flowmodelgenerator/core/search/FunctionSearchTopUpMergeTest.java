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
import java.util.TreeMap;
import java.util.function.Function;

/**
 * Tests for {@link FunctionSearchCommand#mergeImportedPackageFunctions}, which decides when a search page is topped
 * up with the functions of a package the project imports, and what is kept from the answer.
 *
 * <p>The production method takes the Central lookup as a function so these tests can assert not only what comes back
 * but which packages were asked about at all - the request budget and the ordering are otherwise invisible.</p>
 *
 * @since 1.8.0
 */
public class FunctionSearchTopUpMergeTest {

    private static final String PARTNER_ORG = "neatfox";
    private static final String EXTENDED_ORG = "ballerinax";
    private static final String FINANCE = "edifact.d03a.finance";
    private static final String SUPPLYCHAIN = "edifact.d03a.supplychain";
    // What a general function-search page is filtered to: the three library organizations plus the project's own.
    private static final Set<String> ALLOWED_ORGS = Set.of("ballerina", EXTENDED_ORG, "wso2", "testorg");
    private static final int LIMIT = 3;
    // FunctionSearchCommand.MAX_TOPPED_UP_PACKAGES, which is private.
    private static final int MAX_TOPPED_UP_PACKAGES = 5;

    @Test(description = "A page past the first is returned untouched, so paging cannot repeat a topped-up function.")
    public void testLaterPagesAreNotToppedUp() {
        List<SearchResult> page = List.of(result("ballerina", "edi", "edi", "fromEdiString"));
        RecordingLookup lookup = lookup(Map.of(pkg(PARTNER_ORG, FINANCE),
                List.of(result(PARTNER_ORG, FINANCE, FINANCE + ".mINVOIC", "fromEdiString"))));

        List<SearchResult> merged = FunctionSearchCommand.mergeImportedPackageFunctions(page,
                imported(pkg(PARTNER_ORG, FINANCE), Set.of(module(PARTNER_ORG, FINANCE + ".mINVOIC"))),
                ALLOWED_ORGS, LIMIT, 1, lookup);

        Assert.assertSame(merged, page);
        Assert.assertTrue(lookup.queried.isEmpty());
    }

    @Test(description = "A project that imports nothing costs no extra request.")
    public void testNoImportsCostsNoRequest() {
        List<SearchResult> page = List.of(result("ballerina", "edi", "edi", "fromEdiString"));
        RecordingLookup lookup = lookup(Map.of());

        List<SearchResult> merged = FunctionSearchCommand.mergeImportedPackageFunctions(page, Map.of(),
                ALLOWED_ORGS, LIMIT, 0, lookup);

        Assert.assertSame(merged, page);
        Assert.assertTrue(lookup.queried.isEmpty());
    }

    @Test(description = "A package outside the page's organization filter is topped up even when the page is short.")
    public void testPartnerPackageToppedUpOnShortPage() {
        // The regression this guards: the page keeps only ballerina/ballerinax/wso2/own-org rows, so a partner
        // package's rows can never reach it however short it is. Gating the top-up on page length hid them.
        List<SearchResult> page = List.of(result("ballerina", "edi", "edi", "fromEdiString"));
        SearchResult imported = result(PARTNER_ORG, FINANCE, FINANCE + ".mINVOIC", "fromEdiString");
        RecordingLookup lookup = lookup(Map.of(pkg(PARTNER_ORG, FINANCE), List.of(imported)));

        List<SearchResult> merged = FunctionSearchCommand.mergeImportedPackageFunctions(page,
                imported(pkg(PARTNER_ORG, FINANCE), Set.of(module(PARTNER_ORG, FINANCE + ".mINVOIC"))),
                ALLOWED_ORGS, LIMIT, 0, lookup);

        Assert.assertEquals(lookup.queried, List.of(pkg(PARTNER_ORG, FINANCE)));
        Assert.assertEquals(merged.size(), 2);
        Assert.assertSame(merged.getFirst(), imported);
    }

    @Test(description = "A package the page would have accepted costs no request while the page is still short.")
    public void testAllowedOrganizationNotQueriedOnShortPage() {
        List<SearchResult> page = List.of(result("ballerina", "edi", "edi", "fromEdiString"));
        RecordingLookup lookup = lookup(Map.of(pkg(EXTENDED_ORG, SUPPLYCHAIN),
                List.of(result(EXTENDED_ORG, SUPPLYCHAIN, SUPPLYCHAIN + ".mORDERS", "fromEdiString"))));

        List<SearchResult> merged = FunctionSearchCommand.mergeImportedPackageFunctions(page,
                imported(pkg(EXTENDED_ORG, SUPPLYCHAIN), Set.of(module(EXTENDED_ORG, SUPPLYCHAIN + ".mORDERS"))),
                ALLOWED_ORGS, LIMIT, 0, lookup);

        Assert.assertSame(merged, page);
        Assert.assertTrue(lookup.queried.isEmpty());
    }

    @Test(description = "A package the page would have accepted is topped up once the page has filled up.")
    public void testAllowedOrganizationQueriedOnFullPage() {
        List<SearchResult> page = fullPage();
        SearchResult imported = result(EXTENDED_ORG, SUPPLYCHAIN, SUPPLYCHAIN + ".mORDERS", "fromEdiString");
        RecordingLookup lookup = lookup(Map.of(pkg(EXTENDED_ORG, SUPPLYCHAIN), List.of(imported)));

        List<SearchResult> merged = FunctionSearchCommand.mergeImportedPackageFunctions(page,
                imported(pkg(EXTENDED_ORG, SUPPLYCHAIN), Set.of(module(EXTENDED_ORG, SUPPLYCHAIN + ".mORDERS"))),
                ALLOWED_ORGS, LIMIT, 0, lookup);

        Assert.assertEquals(lookup.queried, List.of(pkg(EXTENDED_ORG, SUPPLYCHAIN)));
        Assert.assertSame(merged.getFirst(), imported);
        Assert.assertEquals(merged.size(), page.size() + 1);
    }

    @Test(description = "Only the modules the project imports are kept; the package's other modules are dropped.")
    public void testSiblingModulesDropped() {
        // Central answers a package at a time, and an EDI package has thirty modules. Merging them all would bury
        // the page the top-up exists to complete.
        List<SearchResult> page = List.of(result("ballerina", "edi", "edi", "fromEdiString"));
        SearchResult wanted = result(PARTNER_ORG, FINANCE, FINANCE + ".mINVOIC", "fromEdiString");
        RecordingLookup lookup = lookup(Map.of(pkg(PARTNER_ORG, FINANCE), List.of(
                wanted,
                result(PARTNER_ORG, FINANCE, FINANCE + ".mORDERS", "fromEdiString"),
                result(PARTNER_ORG, FINANCE, FINANCE + ".mDESADV", "fromEdiString"))));

        List<SearchResult> merged = FunctionSearchCommand.mergeImportedPackageFunctions(page,
                imported(pkg(PARTNER_ORG, FINANCE), Set.of(module(PARTNER_ORG, FINANCE + ".mINVOIC"))),
                ALLOWED_ORGS, LIMIT, 0, lookup);

        Assert.assertEquals(merged.size(), 2);
        Assert.assertSame(merged.getFirst(), wanted);
    }

    @Test(description = "A module the page already lists is not added a second time.")
    public void testModuleAlreadyOnThePageNotDuplicated() {
        SearchResult onPage = result(EXTENDED_ORG, SUPPLYCHAIN, SUPPLYCHAIN, "fromEdiString");
        List<SearchResult> page = List.of(onPage,
                result("ballerina", "edi", "edi", "fromEdiString"),
                result("ballerina", "io", "io", "println"));
        SearchResult missing = result(EXTENDED_ORG, SUPPLYCHAIN, SUPPLYCHAIN + ".mORDERS", "fromEdiString");
        RecordingLookup lookup = lookup(Map.of(pkg(EXTENDED_ORG, SUPPLYCHAIN), List.of(
                result(EXTENDED_ORG, SUPPLYCHAIN, SUPPLYCHAIN, "fromEdiString"), missing)));

        List<SearchResult> merged = FunctionSearchCommand.mergeImportedPackageFunctions(page,
                imported(pkg(EXTENDED_ORG, SUPPLYCHAIN),
                        Set.of(module(EXTENDED_ORG, SUPPLYCHAIN), module(EXTENDED_ORG, SUPPLYCHAIN + ".mORDERS"))),
                ALLOWED_ORGS, LIMIT, 0, lookup);

        Assert.assertEquals(merged, List.of(missing, onPage, page.get(1), page.get(2)));
    }

    @Test(description = "A package whose lookup fails leaves the page as it was rather than emptying it.")
    public void testFailedLookupLeavesThePageIntact() {
        List<SearchResult> page = List.of(result("ballerina", "edi", "edi", "fromEdiString"));
        // A null answer is how CentralSearchUtil reports a failed request, as distinct from an empty list.
        RecordingLookup lookup = lookup(Map.of());

        List<SearchResult> merged = FunctionSearchCommand.mergeImportedPackageFunctions(page,
                imported(pkg(PARTNER_ORG, FINANCE), Set.of(module(PARTNER_ORG, FINANCE + ".mINVOIC"))),
                ALLOWED_ORGS, LIMIT, 0, lookup);

        Assert.assertEquals(lookup.queried, List.of(pkg(PARTNER_ORG, FINANCE)));
        Assert.assertSame(merged, page);
    }

    @Test(description = "The request budget caps how many imported packages one search asks Central about.")
    public void testRequestBudgetIsCapped() {
        List<SearchResult> page = List.of(result("ballerina", "edi", "edi", "fromEdiString"));
        Map<PackageCoordinate, Set<ModuleCoordinate>> importedModules = new TreeMap<>();
        Map<PackageCoordinate, List<SearchResult>> responses = new LinkedHashMap<>();
        List<PackageCoordinate> expected = new ArrayList<>();
        for (int index = 0; index < MAX_TOPPED_UP_PACKAGES + 1; index++) {
            String packageName = "partner.pkg" + index;
            PackageCoordinate coordinate = pkg(PARTNER_ORG, packageName);
            importedModules.put(coordinate, Set.of(module(PARTNER_ORG, packageName)));
            responses.put(coordinate, List.of(result(PARTNER_ORG, packageName, packageName, "fromEdiString")));
            if (index < MAX_TOPPED_UP_PACKAGES) {
                expected.add(coordinate);
            }
        }
        RecordingLookup lookup = lookup(responses);

        List<SearchResult> merged = FunctionSearchCommand.mergeImportedPackageFunctions(page, importedModules,
                ALLOWED_ORGS, LIMIT, 0, lookup);

        // Ordered by package name, so the budget is spent predictably rather than on whichever package hashes first.
        Assert.assertEquals(lookup.queried, expected);
        Assert.assertEquals(merged.size(), MAX_TOPPED_UP_PACKAGES + page.size());
    }

    @Test(description = "Packages that are not worth a request do not spend the budget meant for those that are.")
    public void testSkippedCandidatesDoNotSpendTheBudget() {
        // The budget is counted where the request is made, not where the candidate is considered. Counting the
        // skips too would let a handful of library imports starve the one partner package that needed topping up.
        List<SearchResult> page = List.of(result("ballerina", "edi", "edi", "fromEdiString"));
        Map<PackageCoordinate, Set<ModuleCoordinate>> importedModules = new TreeMap<>();
        Map<PackageCoordinate, List<SearchResult>> responses = new LinkedHashMap<>();
        // Sort ahead of the partner package, and skipped on a short page because the page would have accepted them.
        for (int index = 0; index < MAX_TOPPED_UP_PACKAGES; index++) {
            String packageName = "aaa.library" + index;
            importedModules.put(pkg(EXTENDED_ORG, packageName), Set.of(module(EXTENDED_ORG, packageName)));
        }
        PackageCoordinate partner = pkg(PARTNER_ORG, "zzz.partner");
        SearchResult imported = result(PARTNER_ORG, "zzz.partner", "zzz.partner", "fromEdiString");
        importedModules.put(partner, Set.of(module(PARTNER_ORG, "zzz.partner")));
        responses.put(partner, List.of(imported));
        RecordingLookup lookup = lookup(responses);

        List<SearchResult> merged = FunctionSearchCommand.mergeImportedPackageFunctions(page, importedModules,
                ALLOWED_ORGS, LIMIT, 0, lookup);

        Assert.assertEquals(lookup.queried, List.of(partner));
        Assert.assertSame(merged.getFirst(), imported);
    }

    @Test(description = "A package with no matching function leaves the page exactly as it was.")
    public void testNothingFoundLeavesThePageUnchanged() {
        List<SearchResult> page = List.of(result("ballerina", "edi", "edi", "fromEdiString"));
        RecordingLookup lookup = lookup(Map.of(pkg(PARTNER_ORG, FINANCE), List.of()));

        List<SearchResult> merged = FunctionSearchCommand.mergeImportedPackageFunctions(page,
                imported(pkg(PARTNER_ORG, FINANCE), Set.of(module(PARTNER_ORG, FINANCE + ".mINVOIC"))),
                ALLOWED_ORGS, LIMIT, 0, lookup);

        Assert.assertEquals(lookup.queried, List.of(pkg(PARTNER_ORG, FINANCE)));
        Assert.assertSame(merged, page);
    }

    /**
     * A page holding exactly the requested limit, which is what tells the merge that Central had more to give.
     */
    private static List<SearchResult> fullPage() {
        List<SearchResult> page = List.of(
                result("ballerina", "edi", "edi", "fromEdiString"),
                result("ballerina", "io", "io", "println"),
                result("ballerinax", "rabbitmq", "rabbitmq", "publish"));
        Assert.assertEquals(page.size(), LIMIT);
        return page;
    }

    private static SearchResult result(String org, String packageName, String moduleName, String functionName) {
        return SearchResult.from(org, packageName, moduleName, "1.0.0", functionName, "");
    }

    private static ModuleCoordinate module(String org, String moduleName) {
        return new ModuleCoordinate(org, moduleName);
    }

    private static PackageCoordinate pkg(String org, String packageName) {
        return new PackageCoordinate(org, packageName);
    }

    private static Map<PackageCoordinate, Set<ModuleCoordinate>> imported(PackageCoordinate coordinate,
                                                                          Set<ModuleCoordinate> modules) {
        // A TreeMap, matching what ImportedModules hands over, so the natural order is the one under test.
        Map<PackageCoordinate, Set<ModuleCoordinate>> importedModules = new TreeMap<>();
        importedModules.put(coordinate, modules);
        return importedModules;
    }

    private static RecordingLookup lookup(Map<PackageCoordinate, List<SearchResult>> responses) {
        return new RecordingLookup(responses);
    }

    /**
     * Stands in for the Central request the command would make, recording which packages were asked about and
     * replaying a fixed answer. A package with no entry answers null, which is how a failed request is reported.
     */
    private static final class RecordingLookup implements Function<PackageCoordinate, List<SearchResult>> {

        private final Map<PackageCoordinate, List<SearchResult>> responses;
        private final List<PackageCoordinate> queried = new ArrayList<>();

        private RecordingLookup(Map<PackageCoordinate, List<SearchResult>> responses) {
            this.responses = responses;
        }

        @Override
        public List<SearchResult> apply(PackageCoordinate candidate) {
            queried.add(candidate);
            return responses.get(candidate);
        }
    }
}
