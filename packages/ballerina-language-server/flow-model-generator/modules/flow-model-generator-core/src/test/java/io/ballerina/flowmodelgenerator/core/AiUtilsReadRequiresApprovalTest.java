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

package io.ballerina.flowmodelgenerator.core;

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.FunctionSymbol;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.projects.BuildOptions;
import io.ballerina.projects.Project;
import io.ballerina.projects.directory.SingleFileProject;
import org.testng.Assert;
import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;

import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Tests {@link AiUtils#readRequiresApproval(Symbol, Project)} against the four documented forms of the
 * {@code @ai:AgentTool} {@code requiresApproval} field: absent, explicit {@code false}, explicit {@code true},
 * and a predicate-function reference.
 *
 * @since 1.8.0
 */
public class AiUtilsReadRequiresApprovalTest {

    private static final Path RES_DIR = Paths.get("src", "test", "resources", "ballerina", "ai_utils")
            .toAbsolutePath();

    private Project project;
    private SemanticModel semanticModel;

    @BeforeClass
    public void setup() {
        BuildOptions buildOptions = BuildOptions.builder().setOffline(true).build();
        project = SingleFileProject.load(RES_DIR.resolve("requires_approval.bal"), buildOptions);
        semanticModel = PackageUtil.getCompilation(project)
                .getSemanticModel(project.currentPackage().getDefaultModule().moduleId());
    }

    @Test(description = "A bare @ai:AgentTool with no requiresApproval field is not gated")
    public void testBareAgentTool() {
        Assert.assertFalse(AiUtils.readRequiresApproval(findFunction("bareTool"), project));
    }

    @Test(description = "requiresApproval: false is not gated")
    public void testExplicitFalse() {
        Assert.assertFalse(AiUtils.readRequiresApproval(findFunction("notGatedTool"), project));
    }

    @Test(description = "requiresApproval: true is gated")
    public void testExplicitTrue() {
        Assert.assertTrue(AiUtils.readRequiresApproval(findFunction("gatedTool"), project));
    }

    @Test(description = "requiresApproval bound to a predicate-function reference is gated")
    public void testPredicateFunctionReference() {
        Assert.assertTrue(AiUtils.readRequiresApproval(findFunction("predicateGatedTool"), project));
    }

    private FunctionSymbol findFunction(String name) {
        return semanticModel.moduleSymbols().stream()
                .filter(symbol -> symbol instanceof FunctionSymbol)
                .map(symbol -> (FunctionSymbol) symbol)
                .filter(function -> function.getName().filter(name::equals).isPresent())
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("Function not found: " + name));
    }
}
