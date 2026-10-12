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

import io.ballerina.flowmodelgenerator.core.model.Category;
import io.ballerina.flowmodelgenerator.core.model.Item;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.List;
import java.util.function.Supplier;

/**
 * Tests for {@link AllKindsSearchCommand#searchInParallel}: one delegated search failing must not hide the results of
 * the other. The merged category shape is covered by the {@code search/config/all} fixtures.
 *
 * @since 1.7.0
 */
public class AllKindsSearchFallbackTest {

    private static final Supplier<List<Item>> FAILING = () -> {
        throw new IllegalStateException("Central and the index are both unavailable");
    };

    @Test(description = "A failed connector search still returns the function results.")
    public void testFunctionsSurviveConnectorFailure() {
        List<Item> functions = List.of(category("Standard Library"));

        List<Item> items = AllKindsSearchCommand.searchInParallel(() -> functions, FAILING);

        Assert.assertEquals(items, functions);
    }

    @Test(description = "A failed function search still returns the connector results.")
    public void testConnectorsSurviveFunctionFailure() {
        List<Item> connectors = List.of(category("Azure Files"));

        List<Item> items = AllKindsSearchCommand.searchInParallel(FAILING, () -> connectors);

        Assert.assertEquals(items.size(), 1);
        Category connectorsCategory = (Category) items.get(0);
        Assert.assertEquals(connectorsCategory.metadata().label(), "Connectors");
        Assert.assertEquals(connectorsCategory.items(), connectors);
    }

    @Test(description = "Both searches failing returns no results rather than an error.")
    public void testBothFailuresReturnNoResults() {
        List<Item> items = AllKindsSearchCommand.searchInParallel(FAILING, FAILING);

        Assert.assertTrue(items.isEmpty());
    }

    private static Category category(String label) {
        return new Category.Builder(null).stepIn(label, null, null).items(List.of()).build();
    }
}
