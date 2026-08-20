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

package io.ballerina.copilotagent.extension;

import com.google.gson.JsonObject;
import io.ballerina.copilotagent.extension.request.EnsureAiBaselineRequest;
import io.ballerina.modelgenerator.commons.AbstractLSTest;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.io.BufferedReader;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/**
 * Tests seeding the ai:// baseline, which the semantic diff is computed against. A file that is not
 * part of the package must be reported rather than silently dropped: the rest of the baseline still
 * lands, so a caller that ignores failedFiles would diff against an incomplete baseline.
 *
 * @since 1.5.0
 */
public class EnsureAiBaselineTest extends AbstractLSTest {

    @Override
    @Test(dataProvider = "data-provider")
    public void test(Path config) throws IOException {
        Path configJsonPath = configDir.resolve(config);
        TestConfig testConfig;
        try (BufferedReader bufferedReader = Files.newBufferedReader(configJsonPath)) {
            testConfig = gson.fromJson(bufferedReader, TestConfig.class);
        }

        Path projectPath = sourceDir.resolve(testConfig.projectPath());
        EnsureAiBaselineRequest request = new EnsureAiBaselineRequest(projectPath.toString(),
                testConfig.files());
        JsonObject response = getResponse(request);

        Assert.assertEquals(response.get("seededFileCount").getAsInt(),
                testConfig.output().get("seededFileCount").getAsInt(),
                "Unexpected seeded file count for " + configJsonPath);
        Assert.assertEquals(response.getAsJsonArray("failedFiles"),
                testConfig.output().getAsJsonArray("failedFiles"),
                "Unexpected failed files for " + configJsonPath);
    }

    @Override
    protected String getResourceDir() {
        return "ensure_ai_baseline";
    }

    @Override
    protected Class<? extends AbstractLSTest> clazz() {
        return EnsureAiBaselineTest.class;
    }

    @Override
    protected String getServiceName() {
        return "copilotAgentService";
    }

    @Override
    protected String getApiName() {
        return "ensureAiBaseline";
    }

    private record TestConfig(String description, String projectPath,
                              List<EnsureAiBaselineRequest.BaselineFile> files, JsonObject output) {
    }
}
