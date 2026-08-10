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

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import io.ballerina.flowmodelgenerator.extension.request.GetSelectedLibrariesRequest;
import io.ballerina.modelgenerator.commons.AbstractLSTest;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.io.IOException;
import java.nio.file.Path;

/**
 * Integration tests for the Copilot instruction augmentation functionality.
 * Verifies that custom instructions from resource files are correctly added to libraries.
 *
 * @since 1.7.0
 */
public class CopilotInstructionAugmentationTest extends AbstractLSTest {

    private static final String FIELD_NAME = "name";
    private static final String FIELD_INSTRUCTIONS = "instructions";

    @Test
    public void testBallerinaTestInstructionsAugmented() {
        // ballerina/test has: library.md (no service.md, no test.md)
        JsonObject testLib = fetchLibrary("ballerina/test");

        Assert.assertTrue(testLib.has(FIELD_INSTRUCTIONS),
                "ballerina/test should have library-level instructions");
        Assert.assertFalse(testLib.get(FIELD_INSTRUCTIONS).getAsString().isEmpty(),
                "ballerina/test library instructions should not be empty");
    }

    private JsonObject fetchLibrary(String libraryName) {
        GetSelectedLibrariesRequest request = new GetSelectedLibrariesRequest(
                new String[]{libraryName});
        JsonElement response;
        try {
            response = getResponse(request);
        } catch (IOException e) {
            throw new RuntimeException("Failed to fetch library: " + libraryName, e);
        }
        JsonArray libraries = response.getAsJsonObject().getAsJsonArray("libraries");

        Assert.assertNotNull(libraries, "Libraries array should not be null");
        Assert.assertEquals(libraries.size(), 1, "Should return exactly one library");

        JsonObject library = libraries.get(0).getAsJsonObject();
        Assert.assertEquals(library.get(FIELD_NAME).getAsString(), libraryName);
        return library;
    }

    @Override
    protected Object[] getConfigsList() {
        return new Object[0];
    }

    @Override
    @Test(enabled = false)
    public void test(Path config) throws IOException {
        // Not used - tests are defined as individual methods above
    }

    @Override
    protected String getResourceDir() {
        return "copilot_library";
    }

    @Override
    protected Class<? extends AbstractLSTest> clazz() {
        return CopilotInstructionAugmentationTest.class;
    }

    @Override
    protected String getApiName() {
        return "getFilteredLibraries";
    }

    @Override
    protected String getServiceName() {
        return "copilotLibraryManager";
    }
}
