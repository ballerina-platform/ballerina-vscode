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

import io.ballerina.modelgenerator.commons.SearchResult;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.function.BiFunction;

public class FunctionPageTest {
    private static SearchResult row(int number) {
        return SearchResult.from("ballerina", "sample", "sample", "0.1.0", "f" + number, "");
    }

    private static BiFunction<Integer, Integer, FunctionPage.Raw> source(List<SearchResult> rows) {
        return (take, offset) -> {
            int end = Math.min(rows.size(), offset + take);
            return new FunctionPage.Raw(rows.subList(Math.min(offset, rows.size()), end), end < rows.size());
        };
    }

    @Test
    public void concatenatedPagesNeverSkipEligibleLookahead() {
        List<SearchResult> raw = new ArrayList<>();
        for (int i = 0; i < 777; i++) {
            raw.add(i % 7 == 0 ? row(i) : null);
        }
        List<SearchResult> actual = new ArrayList<>();
        int cursor = 0;
        boolean more;
        do {
            var page = FunctionPage.scan(9, cursor, source(raw), row -> row);
            actual.addAll(page.rows());
            more = page.pagination().hasMore();
            Assert.assertTrue(page.pagination().nextOffset() > cursor);
            cursor = page.pagination().nextOffset();
        } while (more);
        Assert.assertEquals(actual, raw.stream().filter(java.util.Objects::nonNull).toList());
    }

    @Test
    public void emptyFilteredPagesAdvanceAndRemainReachableAtBudgetBoundary() {
        List<SearchResult> raw = new ArrayList<>();
        for (int i = 0; i < 550; i++) {
            raw.add(row(i));
        }
        var first = FunctionPage.scan(5, 0, source(raw), row -> row.name().equals("f549") ? row : null);
        Assert.assertTrue(first.rows().isEmpty());
        Assert.assertTrue(first.pagination().hasMore());
        Assert.assertEquals(first.pagination().nextOffset(), 500);
        var second = FunctionPage.scan(5, 500, source(raw), row -> row.name().equals("f549") ? row : null);
        Assert.assertEquals(second.rows(), List.of(row(549)));
        Assert.assertFalse(second.pagination().hasMore());
        Assert.assertEquals(second.pagination().nextOffset(), 550);
    }

    @Test
    public void libraryCursorsStayWithTheirSource() {
        var central = source(List.of(row(10), row(11), row(12)));
        var index = source(List.of(row(20), row(21), row(22)));
        var first = FunctionPage.library(1, 0, null, central, index, row -> row);
        Assert.assertEquals(first.pagination().source(), "central");
        Assert.assertEquals(first.rows(), List.of(row(10)));
        var offline = FunctionPage.library(1, 0, null, (take, skip) -> null, index, row -> row);
        Assert.assertEquals(offline.pagination().source(), "index");
        var recovered = FunctionPage.library(1, offline.pagination().nextOffset(), "index",
                (take, skip) -> {
                    throw new AssertionError("Index continuation must not query Central");
                },
                index, row -> row);
        Assert.assertEquals(recovered.rows(), List.of(row(21)));
        Assert.assertEquals(recovered.pagination().source(), "index");
        Assert.expectThrows(IllegalStateException.class, () -> FunctionPage.library(1,
                first.pagination().nextOffset(), "central", (take, skip) -> null,
                (take, skip) -> {
                    throw new AssertionError("Central cursor must not query the index");
                },
                row -> row));
        var retry = FunctionPage.library(1, first.pagination().nextOffset(), "central", central, index, row -> row);
        Assert.assertEquals(retry.rows(), List.of(row(11)));
        Assert.assertEquals(retry.pagination().nextOffset(), 2);
    }

    @Test
    public void failedSourceSignalsFallbackRatherThanExhaustion() {
        Assert.assertNull(FunctionPage.scan(20, 0, (take, skip) -> null, row -> row));
    }
}
