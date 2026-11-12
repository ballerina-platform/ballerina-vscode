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


package io.ballerina.flowmodelgenerator.core.model;

import org.testng.Assert;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Tests the keys of a map value (the map editor's object form) as {@link Property#toSourceCode()} writes them.
 */
public class PropertyMapSourceTest {

    @DataProvider
    public Object[][] keys() {
        return new Object[][]{
                // The key field takes a plain name, which as typed does not parse as a field name
                {"type", "'type"},
                {"issue-number", "issue\\-number"},
                {"name", "name"},
                // Read back from the source: kept as it is
                {"'type", "'type"},
                {"issue\\-number", "issue\\-number"},
                {"a\\\\b", "a\\\\b"},
                {"\"a b\"", "\"a b\""},
                {"[k]", "[k]"},
        };
    }

    @Test(dataProvider = "keys")
    public void testWritesMapKeyInSourceForm(String key, String expected) {
        Assert.assertEquals(mapSource(Map.of(key, Map.of("value", "1"))), "{" + expected + ": 1}");
    }

    @Test
    public void testWritesEveryEntryInOrder() {
        Map<String, Object> entries = new LinkedHashMap<>();
        entries.put("type", Map.of("value", "1"));
        entries.put("issue-number", Map.of("value", "2"));
        Assert.assertEquals(mapSource(entries), "{'type: 1, issue\\-number: 2}");
    }

    private static String mapSource(Map<String, ?> entries) {
        Property.Builder<Object> builder = new Property.Builder<>(null);
        return builder.value(entries).build().toSourceCode();
    }
}
