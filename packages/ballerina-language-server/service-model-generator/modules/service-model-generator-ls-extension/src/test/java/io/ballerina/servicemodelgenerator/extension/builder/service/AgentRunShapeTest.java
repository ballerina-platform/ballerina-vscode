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

package io.ballerina.servicemodelgenerator.extension.builder.service;

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.projects.directory.SingleFileProject;
import io.ballerina.servicemodelgenerator.extension.builder.service.agent.AgentRunShape;
import org.testng.Assert;
import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

/**
 * Tests reading an agent's {@code run} declaration from the semantic model.
 *
 * @since 1.9.0
 */
public class AgentRunShapeTest {

    private static final String AGENTS = """
            type Summary record {|
                string headline;
            |};

            isolated class SummaryAgent {
                isolated function run(string query, string sessionId = "") returns Summary|error {
                    return {headline: query};
                }
            }

            isolated class TextAgent {
                isolated function run(string query, string sessionId = "") returns string|error => query;
            }

            isolated client class RemoteAgent {
                remote isolated function run(string query) returns string|error => query;
            }

            final SummaryAgent summaryAgent = new;
            final TextAgent textAgent = new;
            final RemoteAgent remoteAgent = new;

            public function main() {
            }
            """;

    private SemanticModel semanticModel;
    private ModuleInfo module;

    @BeforeClass
    public void compile() throws IOException {
        Path source = Files.createTempDirectory("agent-run-shape").resolve("agents.bal");
        Files.writeString(source, AGENTS);
        SingleFileProject project = SingleFileProject.load(source);
        semanticModel = project.currentPackage().getCompilation()
                .getSemanticModel(project.currentPackage().getDefaultModule().moduleId());
        module = ModuleInfo.from(project.currentPackage().getDefaultModule().descriptor());
    }

    @Test
    public void testAFixedRecordAnswerIsAValue() {
        Assert.assertEquals(AgentRunShape.of(semanticModel, module, "summaryAgent"),
                new AgentRunShape(false, AgentRunShape.Answer.VALUE, "Summary", true, Map.of()),
                "a type of the trigger's own module needs no prefix or import");
    }

    @Test
    public void testAFixedStringAnswerIsText() {
        Assert.assertEquals(AgentRunShape.of(semanticModel, module, "textAgent"),
                new AgentRunShape(false, AgentRunShape.Answer.TEXT, "string", true, Map.of()));
    }

    @Test
    public void testARemoteRunIsCalledRemotely() {
        Assert.assertEquals(AgentRunShape.of(semanticModel, module, "remoteAgent").remote(), Boolean.TRUE);
    }

    @Test
    public void testAnUnknownAgentKeepsTheDefaults() {
        Assert.assertEquals(AgentRunShape.of(semanticModel, module, "missingAgent"), AgentRunShape.UNKNOWN);
        Assert.assertEquals(AgentRunShape.of(null, module, "summaryAgent"), AgentRunShape.UNKNOWN);
    }
}
