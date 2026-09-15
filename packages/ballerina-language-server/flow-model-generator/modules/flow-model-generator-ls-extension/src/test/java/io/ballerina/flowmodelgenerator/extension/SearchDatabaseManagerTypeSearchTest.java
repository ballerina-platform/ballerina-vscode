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

import io.ballerina.modelgenerator.commons.ModuleCoordinate;
import io.ballerina.modelgenerator.commons.SearchDatabaseManager;
import io.ballerina.modelgenerator.commons.SearchResult;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Tests the type-search queries of {@link SearchDatabaseManager} against the real shipped {@code search-index.sqlite}.
 *
 * <p>The index is a static, versioned asset with no injection seam, so these tests use its actual contents as fixed
 * data points instead of mocking it. The ones they lean on:</p>
 * <ul>
 *     <li>{@code ballerina/np} has 3 types while {@code ballerinax/np} has none - a same-name, different-org pair
 *     that is only distinguishable if a query binds organization and module name together. {@code Package.name} has
 *     no uniqueness constraint, so this is legal index content, not corruption.</li>
 *     <li>{@code xlibb/solace} (32 types) and {@code ballerinax/solace} (29) are the same collision with rows on
 *     both sides, so an org-blind query merges two unrelated vendors' connectors.</li>
 *     <li>{@code ballerinax/np} is present in {@code Package} with zero {@code Type} rows, so "has no types" must
 *     not be read as "not indexed".</li>
 *     <li>{@code ballerina/grpc} is absent from the index entirely while still being resolvable from the
 *     distribution - the condition behind wso2/product-integrator#2172.</li>
 *     <li>{@code ballerina/os} has 5 types and {@code ballerina/time} 15, an uneven pair that shows whether
 *     pagination shares the window fairly.</li>
 * </ul>
 *
 * <p>Should the shipped index be regenerated and these counts drift, re-derive them with
 * {@code SELECT p.org, p.name, COUNT(t.id) FROM Package p LEFT JOIN Type t ON t.package_id = p.id GROUP BY p.id}
 * rather than relaxing the assertions.</p>
 *
 * @since 1.8.0
 */
public class SearchDatabaseManagerTypeSearchTest {

    private static final String BALLERINA = "ballerina";
    private static final String BALLERINAX = "ballerinax";
    private static final String XLIBB = "xlibb";
    private static final String ABSENT_ORG = "totally-fake-org-xyz";

    private final SearchDatabaseManager dbManager = SearchDatabaseManager.getInstance();

    private static ModuleCoordinate mod(String org, String moduleName) {
        return new ModuleCoordinate(org, moduleName);
    }

    @Test(description = "A query for one org's module must not return a same-named module from another org")
    public void testSearchTypesByPackagesMatchesRequestedOrgOnly() {
        List<SearchResult> ballerinaResults = dbManager.searchTypesByPackages(Set.of(mod(BALLERINA, "np")), 100, 0);
        Assert.assertEquals(ballerinaResults.size(), 3);
        for (SearchResult result : ballerinaResults) {
            Assert.assertEquals(result.packageInfo().org(), BALLERINA);
        }

        List<SearchResult> ballerinaxResults = dbManager.searchTypesByPackages(Set.of(mod(BALLERINAX, "np")), 100, 0);
        Assert.assertTrue(ballerinaxResults.isEmpty(),
                "ballerinax/np has no types of its own and must not fall back to ballerina/np's rows");
    }

    @Test(description = "Two orgs publishing the same module name must never have their types merged")
    public void testSearchTypesByPackagesDoesNotMergeCollidingOrgs() {
        List<SearchResult> xlibbResults = dbManager.searchTypesByPackages(Set.of(mod(XLIBB, "solace")), 100, 0);
        Assert.assertEquals(xlibbResults.size(), 32);
        for (SearchResult result : xlibbResults) {
            Assert.assertEquals(result.packageInfo().org(), XLIBB);
        }

        List<SearchResult> ballerinaxResults =
                dbManager.searchTypesByPackages(Set.of(mod(BALLERINAX, "solace")), 100, 0);
        Assert.assertEquals(ballerinaxResults.size(), 29);
        for (SearchResult result : ballerinaxResults) {
            Assert.assertEquals(result.packageInfo().org(), BALLERINAX);
        }
    }

    @Test(description = "A module indexed with zero types still counts as indexed; one absent from the index does not")
    public void testFindIndexedModulesMatchesOrg() {
        Set<ModuleCoordinate> zeroTypeModule = dbManager.findIndexedModules(Set.of(mod(BALLERINAX, "np")));
        Assert.assertTrue(zeroTypeModule.contains(mod(BALLERINAX, "np")),
                "ballerinax/np is indexed with zero types and must still count as indexed, otherwise every request "
                        + "would needlessly fall back to live compilation");

        Assert.assertTrue(dbManager.findIndexedModules(Set.of(mod(ABSENT_ORG, "np"))).isEmpty(),
                "no such org publishes np, so it must be reported as missing");

        // The condition behind the reported issue: resolvable from the distribution, absent from the index.
        Assert.assertTrue(dbManager.findIndexedModules(Set.of(mod(BALLERINA, "grpc"))).isEmpty(),
                "ballerina/grpc is not indexed, so it must be reported as missing and resolved live");

        Set<ModuleCoordinate> mixed = dbManager.findIndexedModules(
                Set.of(mod(BALLERINA, "os"), mod(BALLERINA, "grpc"), mod(XLIBB, "solace")));
        Assert.assertEquals(mixed, Set.of(mod(BALLERINA, "os"), mod(XLIBB, "solace")));
    }

    @Test(description = "Importing same-named modules from two orgs must keep both, not collapse to one")
    public void testCollidingModuleNamesFromTwoOrgsCoexist() {
        Set<ModuleCoordinate> bothOrgs = Set.of(mod(XLIBB, "solace"), mod(BALLERINAX, "solace"));

        Assert.assertEquals(dbManager.countIndexedTypes(bothOrgs), 61, "xlibb/solace=32 + ballerinax/solace=29");
        Assert.assertEquals(dbManager.findIndexedModules(bothOrgs), bothOrgs,
                "both orgs are indexed and must each be reported, so neither is misread as missing");

        List<SearchResult> page = dbManager.searchTypesByPackages(bothOrgs, 61, 0);
        Assert.assertEquals(page.size(), 61);
        long xlibbCount = page.stream().filter(r -> XLIBB.equals(r.packageInfo().org())).count();
        long ballerinaxCount = page.stream().filter(r -> BALLERINAX.equals(r.packageInfo().org())).count();
        Assert.assertEquals(xlibbCount, 32, "keying by module name alone would have dropped one org entirely");
        Assert.assertEquals(ballerinaxCount, 29);
    }

    @Test(description = "A colliding pair where only one org is indexed must still resolve the other live")
    public void testCollisionDoesNotMaskAnUnindexedModule() {
        // ballerina/np is indexed; a same-named module from an org publishing no such package is not. Keying by
        // module name alone would let the indexed one answer for both and suppress the live fallback.
        Set<ModuleCoordinate> mixed = Set.of(mod(BALLERINA, "np"), mod(ABSENT_ORG, "np"));
        Assert.assertEquals(dbManager.findIndexedModules(mixed), Set.of(mod(BALLERINA, "np")));
    }

    @Test(description = "countIndexedTypes must sum real per-module counts and contribute 0 for absent modules")
    public void testCountIndexedTypesSumsAcrossModules() {
        int total = dbManager.countIndexedTypes(Set.of(
                mod(BALLERINAX, "copybook"),
                mod(BALLERINA, "np"),
                mod(BALLERINA, "os"),
                mod(BALLERINA, "grpc")));
        Assert.assertEquals(total, 11, "ballerinax/copybook=3 + ballerina/np=3 + ballerina/os=5, grpc contributes 0");

        Assert.assertEquals(dbManager.countIndexedTypes(Set.of()), 0);
    }

    @Test(description = "A zero-count colliding module must not disturb another module's fair share")
    public void testFairShareUnaffectedByCollidingZeroCountModule() {
        List<SearchResult> results = dbManager.searchTypesByPackages(
                Set.of(mod(BALLERINAX, "np"), mod(BALLERINA, "os")), 100, 0);
        Assert.assertEquals(results.size(), 5);
        for (SearchResult result : results) {
            Assert.assertEquals(result.packageInfo().moduleName(), "os");
            Assert.assertEquals(result.packageInfo().org(), BALLERINA);
        }
    }

    @Test(description = "A large module must not consume the whole page while a small one starves")
    public void testFairShareSplitsThePageAcrossModules() {
        Set<ModuleCoordinate> modules = Set.of(mod(BALLERINA, "os"), mod(BALLERINA, "time"));
        List<SearchResult> page = dbManager.searchTypesByPackages(modules, 8, 0);
        Assert.assertEquals(page.size(), 8);

        long osCount = page.stream().filter(r -> "os".equals(r.packageInfo().moduleName())).count();
        long timeCount = page.stream().filter(r -> "time".equals(r.packageInfo().moduleName())).count();
        Assert.assertEquals(osCount, 4, "os (5 types) must get its half of the window rather than be crowded out");
        Assert.assertEquals(timeCount, 4, "time (15 types) must be capped at its fair share");
    }

    @Test(description = "Consecutive pages must tile: every row exactly once, none dropped or duplicated")
    public void testPaginationTilesWithoutGapsOrOverlaps() {
        Set<ModuleCoordinate> modules = Set.of(mod(BALLERINA, "os"), mod(BALLERINA, "time"));
        int total = dbManager.countIndexedTypes(modules);
        Assert.assertEquals(total, 20, "ballerina/os=5 + ballerina/time=15");

        List<String> seen = new ArrayList<>();
        for (int offset = 0; offset < total; offset += 8) {
            for (SearchResult result : dbManager.searchTypesByPackages(modules, 8, offset)) {
                seen.add(result.packageInfo().moduleName() + ":" + result.name());
            }
        }
        Assert.assertEquals(seen.size(), total, "paging must return every row exactly once");
        Assert.assertEquals(new HashSet<>(seen).size(), total, "paging must not repeat a row across pages");
    }

    @Test(description = "Negative limit/offset must clamp to an empty page, not to SQLite's unlimited LIMIT")
    public void testNegativeLimitAndOffsetAreClamped() {
        Set<ModuleCoordinate> modules = Set.of(mod(BALLERINA, "os"), mod(BALLERINA, "time"));
        Assert.assertTrue(dbManager.searchTypesByPackages(modules, -1, 0).isEmpty());
        Assert.assertTrue(dbManager.searchTypesByPackages(modules, -1, -1).isEmpty());
        Assert.assertTrue(dbManager.searchTypes("Civil", -1, 0).isEmpty());
        Assert.assertTrue(dbManager.searchTypesExcludingPackages("Civil", modules, -1, 0).isEmpty());

        // A negative offset must behave like offset 0 rather than shifting the window backwards.
        Assert.assertEquals(dbManager.searchTypesByPackages(modules, 8, -5),
                dbManager.searchTypesByPackages(modules, 8, 0));
    }

    @Test(description = "A large limit must not overflow the pagination window end")
    public void testHugeLimitDoesNotOverflowWindow() {
        Set<ModuleCoordinate> modules = Set.of(mod(BALLERINA, "os"), mod(BALLERINA, "time"));
        Assert.assertEquals(dbManager.searchTypesByPackages(modules, Integer.MAX_VALUE, 1).size(), 19);
    }

    @Test(description = "The imported and non-imported query tiers must partition the global match set exactly")
    public void testTierCapacitiesSumToGlobalMatchCount() {
        Set<ModuleCoordinate> modules = Set.of(mod(BALLERINA, "os"), mod(BALLERINA, "time"));
        for (String query : List.of("Civil", "Error", "Config", "")) {
            int imported = dbManager.countIndexedMatchingTypes(query, modules);
            int rest = dbManager.countTypesExcludingPackages(query, modules);
            int global = dbManager.countTypesExcludingPackages(query, Set.of());
            Assert.assertEquals(imported + rest, global,
                    "tier capacities must partition the match set for query '" + query + "'");
        }
        // 'Civil' matches inside ballerina/time, so the imported tier is genuinely exercised rather than always 0.
        Assert.assertEquals(dbManager.countIndexedMatchingTypes("Civil", modules), 2);
    }

    @Test(description = "The non-imported tier must exclude exactly the imported modules")
    public void testSearchTypesExcludingPackagesOmitsImportedModules() {
        Set<ModuleCoordinate> modules = Set.of(mod(BALLERINA, "time"));
        List<SearchResult> results = dbManager.searchTypesExcludingPackages("Civil", modules, 100, 0);
        Assert.assertFalse(results.isEmpty());
        for (SearchResult result : results) {
            Assert.assertFalse("time".equals(result.packageInfo().moduleName())
                            && BALLERINA.equals(result.packageInfo().org()),
                    "ballerina/time was excluded but still appeared: " + result.name());
        }

        // An empty exclusion set must degrade to the plain global search rather than excluding everything.
        Assert.assertEquals(dbManager.searchTypesExcludingPackages("Civil", Set.of(), 100, 0).size(),
                dbManager.searchTypes("Civil", 100, 0).size());
    }

    @Test(description = "The query-filtered imported tier must stay org-scoped like its unfiltered counterpart")
    public void testSearchTypesByPackagesMatchingIsOrgScoped() {
        List<SearchResult> matches =
                dbManager.searchTypesByPackagesMatching(Set.of(mod(XLIBB, "solace")), "Error", 100, 0);
        Assert.assertFalse(matches.isEmpty());
        for (SearchResult result : matches) {
            Assert.assertEquals(result.packageInfo().org(), XLIBB);
        }

        Assert.assertTrue(dbManager.searchTypesByPackagesMatching(Set.of(mod(BALLERINAX, "np")), "Prompt", 100, 0)
                .isEmpty(), "ballerinax/np has no types, so no query can match within it");
    }
}
