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

import io.ballerina.flowmodelgenerator.core.utils.SearchResultFilter;
import org.testng.Assert;
import org.testng.annotations.Test;

/**
 * Verifies that {@link SearchResultFilter} loads the tool package list bundled with the language server, which is the
 * only thing keeping bal tool packages out of the Ballerina Central search results.
 *
 * @since 1.7.0
 */
public class SearchResultFilterToolPackagesTest {

    @Test
    public void testBundledToolPackagesAreFiltered() {
        Assert.assertTrue(SearchResultFilter.isToolPackage("ballerina", "editoolspackage"));
        Assert.assertTrue(SearchResultFilter.isToolPackage("ballerinax", "health"));
        Assert.assertTrue(SearchResultFilter.isToolPackage("wso2", "tool_migrate_mule"));
    }

    @Test
    public void testLibraryPackagesAreNotFiltered() {
        Assert.assertFalse(SearchResultFilter.isToolPackage("ballerina", "http"));
        // The EDI library stays searchable; only its CLI tool package is filtered.
        Assert.assertFalse(SearchResultFilter.isToolPackage("ballerina", "edi"));
        Assert.assertFalse(SearchResultFilter.isToolPackage("ballerinax", "edifact.d03a.finance"));
        // A tool package is identified by its organization as well as its name.
        Assert.assertFalse(SearchResultFilter.isToolPackage("ballerinax", "editoolspackage"));
    }
}
