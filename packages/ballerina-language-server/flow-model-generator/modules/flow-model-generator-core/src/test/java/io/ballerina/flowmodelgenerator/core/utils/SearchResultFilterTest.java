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

package io.ballerina.flowmodelgenerator.core.utils;

import io.ballerina.projects.BuildOptions;
import io.ballerina.projects.Project;
import io.ballerina.projects.directory.BuildProject;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.nio.file.Paths;
import java.util.Set;

/**
 * Tests for {@link SearchResultFilter}. The bundled tool package list ships with the language server extension, so
 * its lookup is covered by {@code SearchResultFilterToolPackagesTest} there.
 *
 * @since 1.7.0
 */
public class SearchResultFilterTest {

    @Test
    public void testAllowedOrganizations() {
        Assert.assertEquals(SearchResultFilter.allowedOrganizations(), Set.of("ballerina", "ballerinax", "wso2"));
    }

    @Test
    public void testAllowedOrganizationsIncludeCurrentPackageOrg() {
        Project project = BuildProject.load(
                Paths.get("src", "test", "resources", "ballerina", "search_filter").toAbsolutePath(),
                BuildOptions.builder().setOffline(true).build());
        Assert.assertEquals(SearchResultFilter.allowedOrganizations(project),
                Set.of("ballerina", "ballerinax", "wso2", "acme"));
    }

    @Test
    public void testBlacklistedConnector() {
        Assert.assertTrue(SearchResultFilter.isBlacklistedConnector("OpenAiModelProvider"));
        Assert.assertFalse(SearchResultFilter.isBlacklistedConnector("Client"));
        Assert.assertFalse(SearchResultFilter.isBlacklistedConnector(null));
    }

    @Test
    public void testBlacklistedConnectorWithPatterns() {
        Set<String> patterns = Set.of("Listener", "Caller");
        Assert.assertTrue(SearchResultFilter.isBlacklistedConnector("HttpCaller", patterns));
        Assert.assertFalse(SearchResultFilter.isBlacklistedConnector("Client", patterns));
        Assert.assertFalse(SearchResultFilter.isBlacklistedConnector("Client", Set.of()));
        Assert.assertFalse(SearchResultFilter.isBlacklistedConnector(null, patterns));
    }
}
