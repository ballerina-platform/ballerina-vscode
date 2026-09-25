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

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.testng.Assert;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

/**
 * Holds {@link WorkflowUtil#roleFieldValue} to the role-value corpus the designer's two parsers also read,
 * so the three cannot drift apart without a suite failing.
 */
public class RoleValueCorpusTest {

    private static final Path CORPUS = Paths.get("..", "..", "..", "..", "ballerina-core", "src", "utils",
            "__fixtures__", "roleValues.json").toAbsolutePath().normalize();

    @DataProvider(name = "corpus", propagateFailureAsTestFailure = true)
    public Object[][] corpus() throws IOException {
        Assert.assertTrue(Files.exists(CORPUS), "the shared corpus moved: " + CORPUS);
        JsonArray entries = JsonParser.parseString(Files.readString(CORPUS)).getAsJsonArray();
        Assert.assertFalse(entries.isEmpty(), "the shared corpus is empty: " + CORPUS);
        List<Object[]> cases = new ArrayList<>();
        for (JsonElement element : entries) {
            JsonObject entry = element.getAsJsonObject();
            JsonElement items = entry.get("items");
            List<String> expected = null;
            if (!items.isJsonNull()) {
                expected = new ArrayList<>();
                for (JsonElement item : items.getAsJsonArray()) {
                    expected.add(item.getAsString());
                }
            }
            cases.add(new Object[]{entry.get("note").getAsString(), entry.get("source").getAsString(), expected});
        }
        return cases.toArray(new Object[0][]);
    }

    @Test(dataProvider = "corpus")
    public void testRoleFieldValueMatchesTheCorpus(String note, String source, List<String> expected) {
        Object actual = WorkflowUtil.roleFieldValue(source);
        if (expected == null) {
            Assert.assertEquals(actual, source.trim(), note);
        } else {
            Assert.assertEquals(actual, expected, note);
        }
    }
}
