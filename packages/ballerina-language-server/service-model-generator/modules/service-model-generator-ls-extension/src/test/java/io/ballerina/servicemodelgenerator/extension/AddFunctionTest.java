/*
 *  Copyright (c) 2025, WSO2 LLC. (http://www.wso2.com)
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

package io.ballerina.servicemodelgenerator.extension;

import com.google.gson.JsonObject;
import com.google.gson.reflect.TypeToken;
import io.ballerina.modelgenerator.commons.AbstractLSTest;
import io.ballerina.servicemodelgenerator.extension.model.Codedata;
import io.ballerina.servicemodelgenerator.extension.model.Function;
import io.ballerina.servicemodelgenerator.extension.model.request.FunctionSourceRequest;
import org.eclipse.lsp4j.TextEdit;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.io.BufferedReader;
import java.io.IOException;
import java.lang.reflect.Type;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Tests for the service model source generator addFunction service.
 *
 * @since 1.0.0
 */
public class AddFunctionTest extends AbstractLSTest {

    private static final String NO_TYPES_BAL_CONFIG = "add_kafka_on_consumer_record_no_types_bal.json";

    private static final Type TEXT_EDIT_LIST_TYPE = new TypeToken<Map<String, List<TextEdit>>>() {
    }.getType();

    @Override
    @Test(dataProvider = "data-provider")
    public void test(Path config) throws IOException {
        Path configJsonPath = configDir.resolve(config);
        BufferedReader bufferedReader = Files.newBufferedReader(configJsonPath);
        TestConfig testConfig = gson.fromJson(bufferedReader, TestConfig.class);
        bufferedReader.close();

        // The case covers the absence of types.bal. A file left behind by an interrupted run would let the test pass
        // for the wrong reason, so its absence is asserted instead of assumed.
        if (config.getFileName().toString().equals(NO_TYPES_BAL_CONFIG)) {
            Path typesBal = sourceDir.resolve(Path.of("sample2", "types.bal"));
            Assert.assertFalse(Files.exists(typesBal),
                    "A types.bal of a previous run is present, and this test has to start without it: " + typesBal);
        }

        FunctionSourceRequest request = new FunctionSourceRequest(
                sourceDir.resolve(testConfig.filePath()).toAbsolutePath().toString(),
                testConfig.function(), testConfig.codedata());
        JsonObject jsonMap = getResponse(request).getAsJsonObject("textEdits");

        Map<String, List<TextEdit>> actualTextEdits = gson.fromJson(jsonMap, TEXT_EDIT_LIST_TYPE);

        boolean assertFailure = false;

        if (actualTextEdits.size() != testConfig.output().size()) {
            log.info("The number of text edits does not match the expected output.");
            assertFailure = true;
        }

        Map<String, List<TextEdit>> newMap = new HashMap<>();
        for (Map.Entry<String, List<TextEdit>> entry : actualTextEdits.entrySet()) {
            Path fullPath = Paths.get(entry.getKey());
            String relativePath = sourceDir.relativize(fullPath).toString();

            List<TextEdit> textEdits = testConfig.output().get(relativePath.replace("\\", "/"));
            if (textEdits == null) {
                log.info("No text edits found for the file: " + relativePath);
                assertFailure = true;
            } else if (!assertArray("text edits", entry.getValue(), textEdits)) {
                assertFailure = true;
            }

            newMap.put(relativePath, entry.getValue());
        }

        if (assertFailure) {
            TestConfig updatedConfig =
                    new TestConfig(testConfig.filePath(), testConfig.description(), testConfig.codedata(),
                            testConfig.function(), newMap);
//            updateConfig(configJsonPath, updatedConfig);
            Assert.fail(String.format("Failed test: '%s' (%s)", testConfig.description(), configJsonPath));
        }
    }

    @Override
    protected String getResourceDir() {
        return "add_function";
    }

    @Override
    protected Class<? extends AbstractLSTest> clazz() {
        return AddFunctionTest.class;
    }

    @Override
    protected String getServiceName() {
        return "serviceDesign";
    }

    @Override
    protected String getApiName() {
        return "addFunction";
    }

    /**
     * Represents the test configuration for the source generator test.
     *
     * @param filePath    The path to the source file.
     * @param description The description of the test.
     * @param codedata    The codedata of the function.
     * @param function    The function to be updated.
     * @param output      The expected output.
     */
    private record TestConfig(String filePath, String description, Codedata codedata, Function function,
                              Map<String, List<TextEdit>> output) {

        public String description() {
            return description == null ? "" : description;
        }
    }
}
