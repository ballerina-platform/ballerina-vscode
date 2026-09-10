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
 * Tests the function-search queries of {@link SearchDatabaseManager} against the real shipped
 * {@code search-index.sqlite}.
 *
 * <p>The function path shares the organization-aware matching, fair-share pagination and bounds clamping of the type
 * path but has no golden fixture that pages past the first result set, so the behaviour is pinned here instead.
 * Index data points these lean on:</p>
 * <ul>
 *     <li>{@code ballerina/os} has 7 functions and {@code ballerina/time} 18 - an uneven pair that shows whether a
 *     page is shared fairly rather than consumed by the larger module.</li>
 *     <li>{@code ballerina/np} has 1 function while {@code ballerinax/np} has none, so a name-only match would
 *     attribute one organization's function to the other.</li>
 * </ul>
 *
 * <p>Should the shipped index be regenerated and these counts drift, re-derive them with
 * {@code SELECT p.org, p.name, COUNT(f.id) FROM Package p LEFT JOIN Function f ON f.package_id = p.id GROUP BY p.id}
 * rather than relaxing the assertions.</p>
 *
 * @since 1.8.0
 */
public class SearchDatabaseManagerFunctionSearchTest {

    private static final String BALLERINA = "ballerina";
    private static final String BALLERINAX = "ballerinax";
    private static final String ABSENT_ORG = "totally-fake-org-xyz";

    private final SearchDatabaseManager dbManager = SearchDatabaseManager.getInstance();

    private static ModuleCoordinate mod(String org, String moduleName) {
        return new ModuleCoordinate(org, moduleName);
    }

    private static Set<ModuleCoordinate> osAndTime() {
        return Set.of(mod(BALLERINA, "os"), mod(BALLERINA, "time"));
    }

    @Test(description = "A query for one org's module must not return a same-named module from another org")
    public void testSearchFunctionsByPackagesMatchesRequestedOrgOnly() {
        List<SearchResult> ballerinaResults =
                dbManager.searchFunctionsByPackages(Set.of(mod(BALLERINA, "np")), List.of(), 100, 0);
        Assert.assertEquals(ballerinaResults.size(), 1);
        Assert.assertEquals(ballerinaResults.getFirst().packageInfo().org(), BALLERINA);

        Assert.assertTrue(
                dbManager.searchFunctionsByPackages(Set.of(mod(BALLERINAX, "np")), List.of(), 100, 0).isEmpty(),
                "ballerinax/np has no functions of its own and must not fall back to ballerina/np's rows");
        Assert.assertTrue(
                dbManager.searchFunctionsByPackages(Set.of(mod(ABSENT_ORG, "os")), List.of(), 100, 0).isEmpty(),
                "no such org publishes os, so its 7 functions must not leak out under another org");
    }

    @Test(description = "A large module must not consume the whole page while a small one starves")
    public void testFairShareSplitsThePageAcrossModules() {
        List<SearchResult> page = dbManager.searchFunctionsByPackages(osAndTime(), List.of(), 10, 0);
        Assert.assertEquals(page.size(), 10);

        long osCount = page.stream().filter(r -> "os".equals(r.packageInfo().moduleName())).count();
        long timeCount = page.stream().filter(r -> "time".equals(r.packageInfo().moduleName())).count();
        Assert.assertEquals(osCount, 5, "os (7 functions) must get its half of the window rather than be crowded out");
        Assert.assertEquals(timeCount, 5, "time (18 functions) must be capped at its fair share");
    }

    @Test(description = "Consecutive pages must tile: every row exactly once, none dropped or duplicated")
    public void testPaginationTilesWithoutGapsOrOverlaps() {
        Set<ModuleCoordinate> modules = osAndTime();
        int total = 25;

        List<String> seen = new ArrayList<>();
        for (int offset = 0; offset < total; offset += 6) {
            for (SearchResult result : dbManager.searchFunctionsByPackages(modules, List.of(), 6, offset)) {
                seen.add(result.packageInfo().org() + "/" + result.packageInfo().moduleName() + ":" + result.name());
            }
        }
        Assert.assertEquals(seen.size(), total,
                "ballerina/os=7 + ballerina/time=18; paging must return every row exactly once");
        Assert.assertEquals(new HashSet<>(seen).size(), total, "paging must not repeat a row across pages");
    }

    @Test(description = "Negative limit/offset must clamp rather than hit SQLite's unlimited LIMIT")
    public void testNegativeLimitAndOffsetAreClamped() {
        Set<ModuleCoordinate> modules = osAndTime();
        Assert.assertTrue(dbManager.searchFunctionsByPackages(modules, List.of(), -1, 0).isEmpty());
        Assert.assertTrue(dbManager.searchFunctionsByPackages(modules, List.of(), -1, -1).isEmpty());

        // A negative offset must behave like offset 0 rather than shifting the window backwards.
        Assert.assertEquals(dbManager.searchFunctionsByPackages(modules, List.of(), 6, -5),
                dbManager.searchFunctionsByPackages(modules, List.of(), 6, 0));
    }

    @Test(description = "A large limit must not overflow the pagination window end")
    public void testHugeLimitDoesNotOverflowWindow() {
        Assert.assertEquals(
                dbManager.searchFunctionsByPackages(osAndTime(), List.of(), Integer.MAX_VALUE, 1).size(), 24);
    }

    @Test(description = "The function-name filter must apply inside the fair-share window and stay org-scoped")
    public void testFunctionNameFilterIsOrgScopedAndCounted() {
        List<String> names = List.of("getEnv", "utcNow");
        List<SearchResult> results = dbManager.searchFunctionsByPackages(osAndTime(), names, 10, 0);

        Assert.assertEquals(results.size(), 2, "the name filter must narrow the pool, not just the returned page");
        Set<String> returned = new HashSet<>();
        for (SearchResult result : results) {
            returned.add(result.name());
            Assert.assertEquals(result.packageInfo().org(), BALLERINA);
        }
        Assert.assertEquals(returned, Set.of("getEnv", "utcNow"));

        Assert.assertTrue(
                dbManager.searchFunctionsByPackages(Set.of(mod(ABSENT_ORG, "os")), names, 10, 0).isEmpty(),
                "the name filter must not bypass organization scoping");
    }

    @Test(description = "An empty module set must return nothing rather than the whole index")
    public void testEmptyModuleSetReturnsNothing() {
        Assert.assertTrue(dbManager.searchFunctionsByPackages(Set.of(), List.of(), 100, 0).isEmpty());
    }
}
