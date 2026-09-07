/*
 *  Copyright (c) 2024, WSO2 LLC. (http://www.wso2.com)
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

package io.ballerina.designmodelgenerator.extension;

import com.google.gson.JsonObject;
import io.ballerina.designmodelgenerator.core.model.Activity;
import io.ballerina.designmodelgenerator.core.model.AgentCall;
import io.ballerina.designmodelgenerator.core.model.Automation;
import io.ballerina.designmodelgenerator.core.model.Connection;
import io.ballerina.designmodelgenerator.core.model.DesignModel;
import io.ballerina.designmodelgenerator.core.model.Function;
import io.ballerina.designmodelgenerator.core.model.Listener;
import io.ballerina.designmodelgenerator.core.model.ResourceFunction;
import io.ballerina.designmodelgenerator.core.model.Service;
import io.ballerina.designmodelgenerator.core.model.Workflow;
import io.ballerina.designmodelgenerator.extension.request.GetDesignModelRequest;
import io.ballerina.designmodelgenerator.extension.response.GetDesignModelResponse;
import io.ballerina.modelgenerator.commons.AbstractLSTest;
import org.testng.Assert;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Tests for getting the design model for a package.
 *
 * @since 1.0.0
 */
public class DesignModelGeneratorTest extends AbstractLSTest {

    @Override
    @Test(dataProvider = "data-provider")
    public void test(Path config) throws IOException {
        Path configJsonPath = configDir.resolve(config);
        TestConfig testConfig = gson.fromJson(Files.newBufferedReader(configJsonPath), TestConfig.class);
        String sourceFile = sourceDir.resolve(testConfig.projectPath()).toAbsolutePath().toString();
        GetDesignModelRequest request = new GetDesignModelRequest(sourceFile);
        JsonObject jsonObject = getResponse(request);
        GetDesignModelResponse expectedResponse = gson.fromJson(testConfig.output, GetDesignModelResponse.class);
        GetDesignModelResponse actualResponse = gson.fromJson(jsonObject, GetDesignModelResponse.class);
        boolean asserted = assertDesignModel(actualResponse.getDesignModel(), expectedResponse.getDesignModel());
        if (!asserted) {
            TestConfig updatedConfig = new TestConfig(testConfig.description(), testConfig.projectPath(), jsonObject);
//            updateConfig(configJsonPath, updatedConfig);
            Assert.fail(String.format("Failed test: '%s' (%s)", testConfig.description(), configJsonPath));
        }
    }

    private boolean assertDesignModel(DesignModel actual, DesignModel expected) {
        return assertAutomation(actual.automation(), expected.automation()) &&
                assertConnections(actual.connections(), expected.connections()) &&
                assertListeners(actual.listeners(), expected.listeners()) &&
                assertServices(actual.services(), expected.services()) &&
                assertWorkflows(actual.workflows(), expected.workflows()) &&
                assertActivities(actual.activities(), expected.activities());
    }

    private boolean assertActivities(List<Activity> actual, List<Activity> expected) {
        int actualSize = actual == null ? 0 : actual.size();
        int expectedSize = expected == null ? 0 : expected.size();
        if (actualSize != expectedSize) {
            return false;
        }
        if (actual == null || expected == null) {
            return true;
        }
        for (int i = 0; i < actual.size(); i++) {
            Activity actualActivity = actual.get(i);
            Activity expectedActivity = expected.get(i);
            if (!actualActivity.getSymbol().equals(expectedActivity.getSymbol())
                    || !actualActivity.getLocation().equals(expectedActivity.getLocation())
                    || actualActivity.getConnections().size() != expectedActivity.getConnections().size()
                    || actualActivity.getAttachedWorkflows().size()
                            != expectedActivity.getAttachedWorkflows().size()) {
                return false;
            }
        }
        return true;
    }

    private boolean assertWorkflows(List<Workflow> actual, List<Workflow> expected) {
        int actualSize = actual == null ? 0 : actual.size();
        int expectedSize = expected == null ? 0 : expected.size();
        if (actualSize != expectedSize) {
            return false;
        }
        if (actual == null || expected == null) {
            return true;
        }
        for (int i = 0; i < actual.size(); i++) {
            Workflow actualWorkflow = actual.get(i);
            Workflow expectedWorkflow = expected.get(i);
            if (!actualWorkflow.getSymbol().equals(expectedWorkflow.getSymbol())
                    || !actualWorkflow.getLocation().equals(expectedWorkflow.getLocation())
                    || actualWorkflow.getAttachedServices().size() != expectedWorkflow.getAttachedServices().size()
                    || actualWorkflow.getAttachedFunctions().size()
                            != expectedWorkflow.getAttachedFunctions().size()
                    || sizeOf(actualWorkflow.getHumanTasks()) != sizeOf(expectedWorkflow.getHumanTasks())
                    || sizeOf(actualWorkflow.getActivities()) != sizeOf(expectedWorkflow.getActivities())
                    || !assertWorkflowEvents(actualWorkflow.getEvents(), expectedWorkflow.getEvents())) {
                return false;
            }
        }
        return true;
    }

    private boolean assertWorkflowEvents(List<Workflow.Event> actual, List<Workflow.Event> expected) {
        if (sizeOf(actual) != sizeOf(expected)) {
            return false;
        }
        if (actual == null || expected == null) {
            return true;
        }
        for (int i = 0; i < actual.size(); i++) {
            Workflow.Event actualEvent = actual.get(i);
            Workflow.Event expectedEvent = expected.get(i);
            if (!actualEvent.getName().equals(expectedEvent.getName())
                    || !Objects.equals(actualEvent.getType(), expectedEvent.getType())
                    || actualEvent.getAttachedServices().size() != expectedEvent.getAttachedServices().size()
                    || actualEvent.getAttachedFunctions().size() != expectedEvent.getAttachedFunctions().size()) {
                return false;
            }
        }
        return true;
    }

    private int sizeOf(Collection<?> collection) {
        return collection == null ? 0 : collection.size();
    }

    private boolean assertServices(List<Service> actual, List<Service> expected) {
        if (actual.size() != expected.size()) {
            return false;
        }
        for (int i = 0; i < actual.size(); i++) {
            Service actualService = actual.get(i);
            Service expectedService = expected.get(i);
            if (actualService.hashCode() != expectedService.hashCode() && !actualService.equals(expectedService)) {
                return false;
            }
            if (!assertFunctionListAgentCalls(actualService.getFunctions(), expectedService.getFunctions())
                    || !assertFunctionListAgentCalls(actualService.getRemoteFunctions(),
                            expectedService.getRemoteFunctions())
                    || !assertResourceFunctionAgentCalls(actualService.getResourceFunctions(),
                            expectedService.getResourceFunctions())) {
                return false;
            }
        }
        return true;
    }

    private boolean assertFunctionListAgentCalls(List<Function> actual, List<Function> expected) {
        if (sizeOf(actual) != sizeOf(expected)) {
            return false;
        }
        for (int i = 0; i < actual.size(); i++) {
            if (!assertAgentCalls(actual.get(i).agentCalls(), expected.get(i).agentCalls())) {
                return false;
            }
        }
        return true;
    }

    private boolean assertResourceFunctionAgentCalls(List<ResourceFunction> actual, List<ResourceFunction> expected) {
        if (sizeOf(actual) != sizeOf(expected)) {
            return false;
        }
        for (int i = 0; i < actual.size(); i++) {
            if (!assertAgentCalls(actual.get(i).agentCalls(), expected.get(i).agentCalls())) {
                return false;
            }
        }
        return true;
    }

    private boolean assertAgentCalls(List<AgentCall> actual, List<AgentCall> expected) {
        if (sizeOf(actual) != sizeOf(expected)) {
            return false;
        }
        if (actual == null || expected == null) {
            return true;
        }
        for (int i = 0; i < actual.size(); i++) {
            AgentCall actualCall = actual.get(i);
            AgentCall expectedCall = expected.get(i);
            if (actualCall.line() != expectedCall.line()
                    || !assertAgentCallGroups(actualCall.groups(), expectedCall.groups())) {
                return false;
            }
        }
        return true;
    }

    private boolean assertAgentCallGroups(List<AgentCall.Group> actual, List<AgentCall.Group> expected) {
        if (sizeOf(actual) != sizeOf(expected)) {
            return false;
        }
        for (int i = 0; i < sizeOf(actual); i++) {
            AgentCall.Group actualGroup = actual.get(i);
            AgentCall.Group expectedGroup = expected.get(i);
            if (!actualGroup.kind().equals(expectedGroup.kind())
                    || !actualGroup.label().equals(expectedGroup.label())) {
                return false;
            }
        }
        return true;
    }

    // uuids are regenerated on every run, so connections are matched by symbol name rather than by index.
    private boolean assertConnections(List<Connection> actual, List<Connection> expected) {
        if (actual.size() != expected.size()) {
            return false;
        }
        Map<String, Connection> expectedBySymbol = new HashMap<>();
        for (Connection connection : expected) {
            expectedBySymbol.put(connection.getSymbol(), connection);
        }
        for (Connection actualConnection : actual) {
            Connection expectedConnection = expectedBySymbol.get(actualConnection.getSymbol());
            if (expectedConnection == null
                    || !Objects.equals(actualConnection.getRole(), expectedConnection.getRole())
                    || !Objects.equals(actualConnection.getDependentFunctions(),
                            expectedConnection.getDependentFunctions())
                    || sizeOf(actualConnection.getDelegatesTo()) != sizeOf(expectedConnection.getDelegatesTo())
                    || sizeOf(actualConnection.getToolConnections())
                            != sizeOf(expectedConnection.getToolConnections())
                    || !Objects.equals(actualConnection.getModelProvider(), expectedConnection.getModelProvider())
                    || !Objects.equals(actualConnection.getMemory(), expectedConnection.getMemory())
                    || !Objects.equals(agentToolNames(actualConnection), agentToolNames(expectedConnection))
                    || !Objects.equals(actualConnection.getTypeName(), expectedConnection.getTypeName())) {
                return false;
            }
        }
        return true;
    }

    // The map's values are agent uuids, which change on every run; the tool names are what is stable.
    private static Set<String> agentToolNames(Connection connection) {
        return connection.getAgentTools() == null ? Set.of() : connection.getAgentTools().keySet();
    }

    private boolean assertListeners(List<Listener> actual, List<Listener> expected) {
        return actual.size() == expected.size();
    }

    private boolean assertAutomation(Automation actual, Automation expected) {
        if (actual == null && expected == null) {
            return true;
        }
        if (actual == null || expected == null) {
            return false;
        }
        return assertAutomationFields(actual, expected)
                && assertAgentCalls(actual.getAgentCalls(), expected.getAgentCalls());
    }

    private boolean assertAutomationFields(Automation actual, Automation expected) {
        int actualWorkflows = actual.getWorkflows() == null ? 0 : actual.getWorkflows().size();
        int expectedWorkflows = expected.getWorkflows() == null ? 0 : expected.getWorkflows().size();
        return actual.getType().equals(expected.getType()) &&
                actual.getName().equals(expected.getName()) &&
                Objects.equals(actual.getDisplayName(), expected.getDisplayName())
                && actual.getLocation().equals(expected.getLocation())
                && actual.getConnections().size() == expected.getConnections().size()
                && actualWorkflows == expectedWorkflows;
    }

    @Override
    protected String[] skipList() {
        //TODO: Resolve once the compilation issue with Kafka is fixed
        return new String[] {
                "project_with_all_components.json"
        };
    }

    @Override
    protected String getResourceDir() {
        return "get_design_model";
    }

    @Override
    protected Class<? extends AbstractLSTest> clazz() {
        return DesignModelGeneratorTest.class;
    }

    @Override
    protected String getServiceName() {
        return "designModelService";
    }

    @Override
    protected String getApiName() {
        return "getDesignModel";
    }

    public record TestConfig(String description, String projectPath, JsonObject output) {
    }

    @AfterMethod
    public void shutDownLanguageServer() {
        super.shutDownLanguageServer();
    }

    @BeforeMethod
    public void startLanguageServer() {
        super.startLanguageServer();
    }
}
