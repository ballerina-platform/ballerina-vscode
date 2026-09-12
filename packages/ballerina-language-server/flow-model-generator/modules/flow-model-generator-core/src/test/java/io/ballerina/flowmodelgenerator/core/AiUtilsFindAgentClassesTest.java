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

import io.ballerina.compiler.api.symbols.ClassSymbol;
import io.ballerina.projects.BuildOptions;
import io.ballerina.projects.Package;
import io.ballerina.projects.directory.SingleFileProject;
import org.testng.Assert;
import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;

/**
 * Tests {@link AiUtils#findAgentClasses(Package)} picks out only classes that type-include one of the
 * {@code ai} module's agent types, skipping unrelated classes in the same package.
 *
 * @since 1.8.0
 */
public class AiUtilsFindAgentClassesTest {

    private static final Path RES_DIR = Paths.get("src", "test", "resources", "ballerina", "ai_utils")
            .toAbsolutePath();

    private Package agentPackage;

    @BeforeClass
    public void setup() {
        BuildOptions buildOptions = BuildOptions.builder().setOffline(true).build();
        agentPackage = SingleFileProject.load(RES_DIR.resolve("agent_classes.bal"), buildOptions).currentPackage();
    }

    @Test(description = "Finds the class that type-includes ai:FixedTypedAgent and skips the unrelated class")
    public void testFindsOnlyAgentClasses() {
        List<ClassSymbol> agentClasses = AiUtils.findAgentClasses(agentPackage);

        Assert.assertEquals(agentClasses.size(), 1);
        Assert.assertEquals(agentClasses.getFirst().getName().orElse(null), "CustomAgent");
    }
}
