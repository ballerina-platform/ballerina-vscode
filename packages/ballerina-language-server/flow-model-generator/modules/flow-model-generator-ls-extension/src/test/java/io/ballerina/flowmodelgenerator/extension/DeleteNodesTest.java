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

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.reflect.TypeToken;
import io.ballerina.flowmodelgenerator.core.model.Branch;
import io.ballerina.flowmodelgenerator.core.model.Diagram;
import io.ballerina.flowmodelgenerator.core.model.FlowNode;
import io.ballerina.flowmodelgenerator.extension.request.FlowModelGeneratorRequest;
import io.ballerina.flowmodelgenerator.extension.request.FlowNodesDeleteRequest;
import io.ballerina.modelgenerator.commons.AbstractLSTest;
import io.ballerina.tools.text.LinePosition;
import org.eclipse.lsp4j.TextEdit;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.io.IOException;
import java.lang.reflect.Type;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Tests for deleting several flow nodes of one file in a single edit.
 *
 * @since 1.7.0
 */
public class DeleteNodesTest extends AbstractLSTest {

    private static final Type TEXT_EDITS_TYPE = new TypeToken<Map<String, List<TextEdit>>>() { }.getType();

    @Override
    @Test(dataProvider = "data-provider")
    public void test(Path config) throws IOException {
        Path configJsonPath = configDir.resolve(config);
        TestConfig testConfig = gson.fromJson(Files.newBufferedReader(configJsonPath), TestConfig.class);

        String sourceFile = sourceDir.resolve(testConfig.source()).toAbsolutePath().toString();
        FlowModelGeneratorRequest request = new FlowModelGeneratorRequest(sourceFile, testConfig.functionStart(),
                testConfig.functionEnd());
        JsonObject jsonMap = getResponse(request, "flowDesignService/getFlowModel").getAsJsonObject("flowModel");
        Diagram diagram = gson.fromJson(jsonMap, Diagram.class);

        List<JsonElement> nodesToDelete = new ArrayList<>();
        for (NodeRange range : testConfig.nodes()) {
            Optional<FlowNode> found = diagram.nodes().stream()
                    .map(node -> findNode(node, range.start(), range.end()))
                    .flatMap(Optional::stream)
                    .findFirst();
            if (found.isEmpty()) {
                Assert.fail(String.format("Failed test: '%s', cannot find the node at %s", configJsonPath, range));
            }
            nodesToDelete.add(gson.toJsonTree(found.get()));
        }
        FlowNodesDeleteRequest deleteRequest = new FlowNodesDeleteRequest(sourceFile, nodesToDelete, false);
        JsonObject deleteResponse = getResponse(deleteRequest).getAsJsonObject("textEdits");
        Map<String, List<TextEdit>> actualTextEdits = gson.fromJson(deleteResponse, TEXT_EDITS_TYPE);

        boolean assertFailure = false;
        Map<String, List<TextEdit>> relativeEdits = new HashMap<>();
        for (Map.Entry<String, List<TextEdit>> entry : actualTextEdits.entrySet()) {
            String relativePath = sourceDir.relativize(Paths.get(entry.getKey())).toString().replace("\\", "/");
            List<TextEdit> expected = testConfig.output().get(relativePath);
            if (expected == null || !assertArray("text edits", entry.getValue(), expected)) {
                assertFailure = true;
            }
            relativeEdits.put(relativePath, entry.getValue());
        }
        if (assertFailure) {
            TestConfig updatedConfig = new TestConfig(testConfig.description(), testConfig.functionStart(),
                    testConfig.functionEnd(), testConfig.nodes(), testConfig.source(), relativeEdits);
//            updateConfig(configJsonPath, updatedConfig);
            Assert.fail(String.format("Failed test: '%s' (%s)", testConfig.description(), configJsonPath));
        }
    }

    private Optional<FlowNode> findNode(FlowNode node, LinePosition start, LinePosition end) {
        LinePosition nodeStart = node.codedata().lineRange().startLine();
        LinePosition nodeEnd = node.codedata().lineRange().endLine();
        if (nodeStart.equals(start) && nodeEnd.equals(end)) {
            return Optional.of(node);
        }
        if (node.branches() == null || nodeStart.line() > start.line() || nodeEnd.line() < end.line()) {
            return Optional.empty();
        }
        for (Branch branch : node.branches()) {
            for (FlowNode child : branch.children()) {
                Optional<FlowNode> found = findNode(child, start, end);
                if (found.isPresent()) {
                    return found;
                }
            }
        }
        return Optional.empty();
    }

    @Override
    protected String getResourceDir() {
        return "delete_nodes";
    }

    @Override
    protected Class<? extends AbstractLSTest> clazz() {
        return DeleteNodesTest.class;
    }

    @Override
    protected String getApiName() {
        return "deleteFlowNodes";
    }

    private record NodeRange(LinePosition start, LinePosition end) {
    }

    /**
     * Represents the test configuration for deleting several nodes.
     *
     * @param description   The description of the test
     * @param functionStart The start position of the function that contains the nodes
     * @param functionEnd   The end position of the function that contains the nodes
     * @param nodes         The ranges of the nodes to delete
     * @param source        The source file that contains the nodes
     * @param output        The expected output
     */
    private record TestConfig(String description, LinePosition functionStart, LinePosition functionEnd,
                              List<NodeRange> nodes, String source, Map<String, List<TextEdit>> output) {

        public String description() {
            return description == null ? "" : description;
        }
    }
}
