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

package io.ballerina.flowmodelgenerator.core.model.node;

import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.NodeBuilder;
import io.ballerina.projects.BuildOptions;
import io.ballerina.projects.Package;
import io.ballerina.projects.directory.SingleFileProject;
import io.ballerina.tools.text.LinePosition;
import org.testng.Assert;
import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Optional;

/**
 * Tests {@link TypedAgentBuilder}'s resolution of a Central-search result's missing agent class: a Central
 * package carries no class name, so {@code resolveAgentClass} must fill it in from the package before the
 * init form is built, while leaving an already-resolved codedata untouched.
 *
 * @since 1.8.0
 */
public class TypedAgentBuilderTest {

    private static final Path AGENT_CLASSES_BAL = Paths.get("src", "test", "resources", "ballerina", "ai_utils")
            .toAbsolutePath().resolve("agent_classes.bal");

    private final TypedAgentBuilder builder = new TypedAgentBuilder();
    private Package agentPackage;

    @BeforeClass
    public void setup() {
        BuildOptions buildOptions = BuildOptions.builder().setOffline(true).build();
        agentPackage = SingleFileProject.load(AGENT_CLASSES_BAL, buildOptions).currentPackage();
    }

    @Test(description = "A null codedata does not need an agent class resolved")
    public void testNeedsAgentClassWithNullCodedata() {
        Assert.assertFalse(TypedAgentBuilder.needsAgentClass(null));
    }

    @Test(description = "A codedata with no object, or a blank one, needs an agent class resolved")
    public void testNeedsAgentClassWithMissingObject() {
        Assert.assertTrue(TypedAgentBuilder.needsAgentClass(codedata(null)));
        Assert.assertTrue(TypedAgentBuilder.needsAgentClass(codedata("")));
    }

    @Test(description = "A codedata that already names a class does not need one resolved")
    public void testNeedsAgentClassWithExistingObject() {
        Assert.assertFalse(TypedAgentBuilder.needsAgentClass(codedata("ExistingAgent")));
    }

    @Test(description = "A null context is returned as-is, without inspecting its codedata")
    public void testResolveAgentClassWithNullContext() {
        Assert.assertNull(builder.resolveAgentClass(null));
    }

    @Test(description = "A context whose codedata already names a class is returned unchanged")
    public void testResolveAgentClassSkipsAlreadyResolvedContext() {
        NodeBuilder.TemplateContext context = new NodeBuilder.TemplateContext(null, null, null,
                codedata("ExistingAgent"), null);

        Assert.assertSame(builder.resolveAgentClass(context), context);
    }

    @Test(description = "A codedata pointing at a package that cannot be resolved leaves the context unchanged")
    public void testResolveAgentClassFallsBackWhenPackageUnresolved() {
        Codedata unresolved = new Codedata.Builder<>(null)
                .org("does_not_exist_org")
                .packageName("does_not_exist_pkg")
                .module("does_not_exist_pkg")
                .version("99.99.99")
                .build();
        NodeBuilder.TemplateContext context = new NodeBuilder.TemplateContext(null, null, null, unresolved, null);

        Assert.assertSame(builder.resolveAgentClass(context), context);
    }

    @Test(description = "Resolving the agent class keeps every other codedata and context field untouched")
    public void testWithAgentClassOverridesOnlyTheObjectField() {
        Codedata original = codedata(null);
        NodeBuilder.TemplateContext context = new NodeBuilder.TemplateContext(null, null,
                LinePosition.from(1, 2), original, null);

        NodeBuilder.TemplateContext resolved = TypedAgentBuilder.withAgentClass(context, "ResolvedAgent");

        Assert.assertEquals(resolved.codedata().object(), "ResolvedAgent");
        Assert.assertEquals(resolved.codedata().org(), original.org());
        Assert.assertEquals(resolved.codedata().packageName(), original.packageName());
        Assert.assertEquals(resolved.position(), context.position());
    }

    @Test(description = "Finds the first class in the package that qualifies as an agent class")
    public void testFindAgentClassReturnsFirstMatch() {
        Optional<String> agentClass = TypedAgentBuilder.findAgentClass(agentPackage);

        Assert.assertEquals(agentClass, Optional.of("CustomAgent"));
    }

    private static Codedata codedata(String object) {
        return new Codedata.Builder<>(null)
                .org("agent_org")
                .packageName("agent_pkg")
                .module("agent_pkg")
                .version("1.0.0")
                .object(object)
                .build();
    }
}
