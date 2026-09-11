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

package io.ballerina.modelgenerator.commons;

import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/**
 * Tests the properties {@link FairShareWindow} has to hold for stateless pagination to be correct.
 *
 * <p>Search pages are computed with no memory of earlier pages: a page is the difference between the allocation at
 * {@code offset} and the one at {@code offset + limit}. That only tiles if quotas grow monotonically with the window
 * and never exceed what a source can supply, so those are asserted directly rather than through a query.</p>
 *
 * @since 1.8.0
 */
public class FairShareWindowTest {

    @Test(description = "Slack from a source that can't fill its share must carry over to the larger ones")
    public void testSmallSourceSlackCarriesOver() {
        Map<String, Integer> counts = Map.of("small", 2, "large", 100);
        Map<String, Integer> quotas = FairShareWindow.quotas(counts, 20);

        Assert.assertEquals(quotas.get("small").intValue(), 2, "a source can never be given more rows than it has");
        Assert.assertEquals(quotas.get("large").intValue(), 18, "the 8 rows small couldn't use must go to large");
    }

    @Test(description = "A large source must not crowd the others off the page")
    public void testLargeSourceDoesNotCrowdOutOthers() {
        Map<String, Integer> counts = Map.of("http", 330, "connector", 40);
        Map<String, Integer> quotas = FairShareWindow.quotas(counts, 20);

        // The regression behind wso2/product-integrator#2172: whichever pool an imported module's rows come from,
        // a module the size of ballerina/http must not take the whole first page for itself.
        Assert.assertEquals(quotas.get("http").intValue(), 10);
        Assert.assertEquals(quotas.get("connector").intValue(), 10);
    }

    @Test(description = "A source with no rows takes nothing, so including it changes no other source's quota")
    public void testEmptySourcesAreNeutral() {
        Map<String, Integer> withoutEmpty = Map.of("a", 7, "b", 9);
        Map<String, Integer> withEmpty = Map.of("a", 7, "b", 9, "empty", 0, "alsoEmpty", 0);

        Map<String, Integer> plain = FairShareWindow.quotas(withoutEmpty, 10);
        Map<String, Integer> padded = FairShareWindow.quotas(withEmpty, 10);

        Assert.assertEquals(padded.get("empty").intValue(), 0);
        Assert.assertEquals(padded.get("a"), plain.get("a"));
        Assert.assertEquals(padded.get("b"), plain.get("b"));
    }

    @Test(description = "The allocation must not depend on the map's iteration order")
    public void testAllocationIsIndependentOfIterationOrder() {
        Map<String, Integer> ascending = new LinkedHashMap<>();
        ascending.put("a", 5);
        ascending.put("b", 5);
        ascending.put("c", 5);
        Map<String, Integer> descending = new LinkedHashMap<>();
        descending.put("c", 5);
        descending.put("b", 5);
        descending.put("a", 5);

        // Equal counts make the key tie-break the only thing deciding who gets the odd row out of 7.
        Assert.assertEquals(FairShareWindow.quotas(ascending, 7), FairShareWindow.quotas(descending, 7));
    }

    @Test(description = "Quotas must never shrink as the window grows, or consecutive pages would drop rows")
    public void testQuotasGrowMonotonicallyWithTheWindow() {
        Map<String, Integer> counts = Map.of("a", 1, "b", 4, "c", 17, "d", 0, "e", 250);

        Map<String, Integer> previous = FairShareWindow.quotas(counts, 0);
        for (int window = 1; window <= 300; window++) {
            Map<String, Integer> current = FairShareWindow.quotas(counts, window);
            for (Map.Entry<String, Integer> entry : counts.entrySet()) {
                String key = entry.getKey();
                Assert.assertTrue(current.get(key) >= previous.get(key),
                        "quota for " + key + " shrank between windows " + (window - 1) + " and " + window);
                Assert.assertTrue(current.get(key) <= entry.getValue(),
                        "quota for " + key + " exceeded its available rows at window " + window);
            }
            int total = current.values().stream().mapToInt(Integer::intValue).sum();
            Assert.assertEquals(total, Math.min(window, 272),
                    "the window must be filled whenever there are rows left to fill it at window " + window);
            previous = current;
        }
    }

    @Test(description = "Consecutive pages must tile: every row shown exactly once, none skipped")
    public void testConsecutivePagesTileWithoutGapsOrDuplicates() {
        Map<String, Integer> counts = Map.of("a", 1, "b", 4, "c", 17, "d", 0, "e", 33);
        int total = 55;
        int limit = 8;

        Set<String> seen = new HashSet<>();
        for (int offset = 0; offset < total + limit; offset += limit) {
            FairShareWindow.Ranges<String> ranges = FairShareWindow.rangesOf(counts, offset, limit);
            for (Map.Entry<String, Integer> entry : counts.entrySet()) {
                FairShareWindow.Range range = ranges.of(entry.getKey());
                Assert.assertTrue(range.take() >= 0, "a page can never take a negative number of rows");
                Assert.assertTrue(range.skip() + range.take() <= entry.getValue(),
                        "a page must not run past the rows " + entry.getKey() + " actually has");
                for (int row = range.skip(); row < range.skip() + range.take(); row++) {
                    Assert.assertTrue(seen.add(entry.getKey() + "#" + row),
                            entry.getKey() + " row " + row + " was returned on more than one page");
                }
            }
        }
        Assert.assertEquals(seen.size(), total, "paging to the end must have shown every row exactly once");
    }

    @Test(description = "A window near Integer.MAX_VALUE must not overflow into an empty allocation")
    public void testHugeWindowReturnsEverything() {
        Map<String, Integer> counts = Map.of("a", 3, "b", 11);

        Map<String, Integer> quotas = FairShareWindow.quotas(counts, Integer.MAX_VALUE);
        Assert.assertEquals(quotas.get("a").intValue(), 3);
        Assert.assertEquals(quotas.get("b").intValue(), 11);

        // offset + limit is what actually overflows: a client asking for "everything" from a non-zero offset.
        FairShareWindow.Ranges<String> ranges = FairShareWindow.rangesOf(counts, 4, Integer.MAX_VALUE);
        int taken = counts.keySet().stream().mapToInt(key -> ranges.of(key).take()).sum();
        Assert.assertEquals(taken, 10, "14 rows less the 4 skipped");
    }

    @Test(description = "Negative limit and offset are clamped rather than inverting the range")
    public void testNegativeWindowIsClamped() {
        Map<String, Integer> counts = Map.of("a", 5);

        Assert.assertEquals(FairShareWindow.quotas(counts, -7).get("a").intValue(), 0);

        FairShareWindow.Range negativeLimit = FairShareWindow.rangesOf(counts, 0, -3).of("a");
        Assert.assertEquals(negativeLimit.take(), 0);

        // A negative offset must behave as offset 0, not as a skip that pulls the range backwards.
        Assert.assertEquals(FairShareWindow.rangesOf(counts, -3, 2).of("a"),
                FairShareWindow.rangesOf(counts, 0, 2).of("a"));
    }

    @Test(description = "A source absent from the counts gets an empty range instead of a negative one")
    public void testUnknownSourceGetsAnEmptyRange() {
        FairShareWindow.Range range = FairShareWindow.rangesOf(Map.of("a", 5), 10, 10).of("absent");
        Assert.assertEquals(range.skip(), 0);
        Assert.assertEquals(range.take(), 0);
    }

    @Test(description = "An empty set of sources must not divide by zero")
    public void testNoSources() {
        Assert.assertTrue(FairShareWindow.quotas(new HashMap<String, Integer>(), 20).isEmpty());
    }
}
