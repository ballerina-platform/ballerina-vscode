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

package io.ballerina.servicemodelgenerator.extension.connector;

import io.ballerina.projects.Project;
import io.ballerina.projects.directory.BuildProject;
import io.ballerina.servicemodelgenerator.extension.model.Listener;
import io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import org.eclipse.lsp4j.TextEdit;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.net.URISyntaxException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Verifies the SAP JCo driver-JAR fields (product-integrator#2020): both {@code sapIdocDriverPath}
 * and {@code sapJcoDriverPath} are hidden from the init form once their own
 * {@code [[platform.java21.dependency]]} is already declared in Ballerina.toml (so a second
 * listener/service in the same project isn't asked again), a filled field is turned into a
 * Ballerina.toml edit when the source is generated, and the listener edit view shows a declared
 * path read-only while still asking for one that isn't configured yet.
 */
public class DriverDependencyFieldTest {

    @Test
    public void testBothFieldsStayEnabledWhenNotYetDeclared() throws URISyntaxException {
        ServiceInitModel initModel = loadSapJcoInitModel();
        Project project = load("platform_dependency/no_dependency");

        PlatformDependencyEditUtil.populateDriverDependencyFields(initModel, project);

        Map<String, Value> driverFields = PlatformDependencyEditUtil
                .findDriverDependencyFields(initModel.getProperties());
        Assert.assertEquals(driverFields.size(), 2, "sap.jco must ship two driver fields");
        driverFields.values().forEach(field -> Assert.assertTrue(field.isEnabled()));
    }

    @Test
    public void testOnlyTheDeclaredFieldIsHidden() throws URISyntaxException {
        ServiceInitModel initModel = loadSapJcoInitModel();
        Project project = load("platform_dependency/already_declared");

        PlatformDependencyEditUtil.populateDriverDependencyFields(initModel, project);

        Map<String, Value> driverFields = PlatformDependencyEditUtil
                .findDriverDependencyFields(initModel.getProperties());
        Assert.assertFalse(driverFields.get("sapJcoDriverPath").isEnabled(),
                "the already-declared jco driver must be hidden");
        Assert.assertTrue(driverFields.get("sapIdocDriverPath").isEnabled(),
                "the idoc driver isn't declared yet and must still be asked for");
    }

    @Test
    public void testGroupIsCollapsedWhenEveryDriverIsAlreadyDeclared() throws URISyntaxException {
        ServiceInitModel initModel = loadSapJcoInitModel();
        Project project = load("platform_dependency/both_declared");

        PlatformDependencyEditUtil.populateDriverDependencyFields(initModel, project);

        Map<String, Value> driverFields = PlatformDependencyEditUtil
                .findDriverDependencyFields(initModel.getProperties());
        driverFields.values().forEach(field -> Assert.assertFalse(field.isEnabled(),
                "every declared driver must be hidden"));
        Value group = initModel.getProperties().get("driverDependencies");
        Assert.assertNotNull(group, "sap.jco must ship the driver fields inside a group");
        Assert.assertFalse(group.isEnabled(),
                "a group left with nothing but hidden drivers must not render as an empty section");
    }

    @Test
    public void testGroupStaysEnabledWhileAnyDriverIsStillNeeded() throws URISyntaxException {
        ServiceInitModel initModel = loadSapJcoInitModel();
        Project project = load("platform_dependency/already_declared");

        PlatformDependencyEditUtil.populateDriverDependencyFields(initModel, project);

        Assert.assertTrue(initModel.getProperties().get("driverDependencies").isEnabled(),
                "the group must stay visible while the idoc driver is still unanswered");
    }

    @Test
    public void testOverlaySkipsConnectorsWithoutABundledModel() throws URISyntaxException {
        Listener listener = new Listener(null, null, null, null, null, "http", "ballerina", "2.14.0",
                null, null, null, new LinkedHashMap<>(), null);
        Project project = load("platform_dependency/no_dependency");

        PlatformDependencyEditUtil.overlayDriverDependencies(listener, "ballerina", "http", "2.14.0", project);

        Assert.assertTrue(listener.getProperties().isEmpty(),
                "a connector with no bundled trigger model must not be resolved on the listener-model path");
    }

    @Test
    public void testFilledFieldsProduceOneTomlEditEach() throws URISyntaxException {
        ServiceInitModel filledModel = loadSapJcoInitModel();
        Map<String, Value> driverFields = PlatformDependencyEditUtil
                .findDriverDependencyFields(filledModel.getProperties());
        Project project = load("platform_dependency/no_dependency");
        driverFields.get("sapIdocDriverPath").setValue(
                project.sourceRoot().resolve("libs/sapidoc3.jar").toString());
        driverFields.get("sapJcoDriverPath").setValue(
                project.sourceRoot().resolve("libs/sapjco3.jar").toString());
        Map<String, List<TextEdit>> edits = new HashMap<>();

        PlatformDependencyEditUtil.addDriverDependenciesIfPresent(edits, project, filledModel.getProperties());

        List<TextEdit> tomlEdits = edits.values().iterator().next();
        Assert.assertEquals(tomlEdits.size(), 2, "both filled driver fields must produce a toml edit");
        Assert.assertTrue(tomlEdits.stream()
                .anyMatch(edit -> edit.getNewText().contains("path = \"libs/sapidoc3.jar\"")));
        Assert.assertTrue(tomlEdits.stream()
                .anyMatch(edit -> edit.getNewText().contains("path = \"libs/sapjco3.jar\"")));
    }

    @Test
    public void testDisabledFieldProducesNoTomlEdit() throws URISyntaxException {
        ServiceInitModel filledModel = loadSapJcoInitModel();
        Map<String, Value> driverFields = PlatformDependencyEditUtil
                .findDriverDependencyFields(filledModel.getProperties());
        driverFields.get("sapJcoDriverPath").setValue("libs/sapjco3.jar");
        driverFields.get("sapJcoDriverPath").setEnabled(false);
        Project project = load("platform_dependency/no_dependency");
        Map<String, List<TextEdit>> edits = new HashMap<>();

        PlatformDependencyEditUtil.addDriverDependenciesIfPresent(edits, project, filledModel.getProperties());

        Assert.assertTrue(edits.isEmpty(), "a hidden/disabled field must not be written to Ballerina.toml");
    }

    @Test
    public void testOverlayShowsDeclaredPathReadOnlyAndAsksForTheMissingOne() throws URISyntaxException {
        Listener listener = new Listener(null, null, null, null, null, "sap.jco", "ballerinax", "2.0.1",
                null, null, null, new LinkedHashMap<>(), null);
        Project project = load("platform_dependency/already_declared");

        PlatformDependencyEditUtil.overlayDriverDependencies(listener, "ballerinax", "sap.jco", "2.0.1", project);

        Value jco = listener.getProperties().get("sapJcoDriverPath");
        Value idoc = listener.getProperties().get("sapIdocDriverPath");
        Assert.assertNotNull(jco);
        Assert.assertNotNull(idoc);
        Assert.assertEquals(jco.getValue(), "libs/sapjco3.jar");
        Assert.assertFalse(jco.isEditable(), "a declared driver path is shown read-only");
        Assert.assertEquals(idoc.getValue(), "", "an undeclared driver has no path to show yet");
        Assert.assertTrue(idoc.isEditable(), "an undeclared driver must still be askable from the edit view");
        Assert.assertTrue(idoc.isEnabled());
    }

    private ServiceInitModel loadSapJcoInitModel() {
        Optional<ServiceInitModel> model = TriggerModelReader.getInstance()
                .getSchemaDrivenServiceInitModel("ballerinax", "sap.jco", "2.0.1");
        Assert.assertTrue(model.isPresent(), "the bundled sap.jco init model must be resolvable");
        return model.get();
    }

    private Project load(String resource) throws URISyntaxException {
        Path projectPath = Paths.get(getClass().getClassLoader().getResource(resource).toURI());
        return BuildProject.load(projectPath);
    }
}
