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

import io.ballerina.flowmodelgenerator.core.model.AvailableNode;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.projects.BuildOptions;
import io.ballerina.projects.Project;
import io.ballerina.projects.directory.SingleFileProject;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.nio.file.Paths;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Tests for {@link AiUtils}.
 *
 * @since 1.7.0
 */
public class AiUtilsTest {

    @Test(description = "Same patch: 1.11.1 vs 1.11.1 should be equal (0).")
    public void testCompareMajorMinor_samePatch() {
        Assert.assertEquals(AiUtils.compareMajorMinor("1.11.1", "1.11.1"), 0);
    }

    @Test(description = "Newer patch in entry: 1.11.1 vs 1.11.2 should be equal (0) — "
            + "same minor means the entry is compatible.")
    public void testCompareMajorMinor_newerPatchInEntry() {
        Assert.assertEquals(AiUtils.compareMajorMinor("1.11.1", "1.11.2"), 0);
    }

    @Test(description = "Older patch in entry: 1.11.2 vs 1.11.0 should be equal (0) — "
            + "both are the same minor.")
    public void testCompareMajorMinor_olderPatchInEntry() {
        Assert.assertEquals(AiUtils.compareMajorMinor("1.11.2", "1.11.0"), 0);
    }

    @Test(description = "Higher minor in entry: 1.11.1 vs 1.12.0 should be negative — "
            + "a 1.12.x module must not appear for a 1.11.x user.")
    public void testCompareMajorMinor_higherMinorInEntry() {
        Assert.assertTrue(AiUtils.compareMajorMinor("1.11.1", "1.12.0") < 0);
    }

    @Test(description = "Lower minor in entry: 1.11.1 vs 1.10.0 should be positive — "
            + "a 1.10.x module is always compatible with a 1.11.x user.")
    public void testCompareMajorMinor_lowerMinorInEntry() {
        Assert.assertTrue(AiUtils.compareMajorMinor("1.11.1", "1.10.0") > 0);
    }

    @Test(description = "Keeps the newest module version compatible with the ai minor, skips deprecated packages, "
            + "and adds ballerina/ai itself")
    public void testLatestCompatibleModules() {
        Map<String, List<AiUtils.Module>> modules = Map.of(
                "1.0.0", List.of(new AiUtils.Module("ballerinax", "ai.openai", "1.0.0")),
                "1.1.0", List.of(new AiUtils.Module("ballerinax", "ai.openai", "1.1.0"),
                        new AiUtils.Module("ballerinax", "ai.foo", "1.0.0"),
                        new AiUtils.Module("ballerinax", "ai.devant", "1.0.5")),
                "1.2.0", List.of(new AiUtils.Module("ballerinax", "ai.openai", "1.2.0")));

        Assert.assertEquals(Set.copyOf(AiUtils.latestCompatibleModules("1.1.3", modules)), Set.of(
                new AiUtils.Module("ballerinax", "ai.openai", "1.1.0"),
                new AiUtils.Module("ballerinax", "ai.foo", "1.0.0"),
                new AiUtils.Module("ballerina", "ai", "1.1.3")));
    }

    @Test(description = "A cached-only lookup answers from the catalog bundled with the LS")
    public void testCachedOnlyComponentsComeFromBundledCatalog() {
        Project project = SingleFileProject.load(Paths.get("src", "test", "resources", "ballerina", "ai_utils",
                "ai_component_resolution.bal").toAbsolutePath(), BuildOptions.builder().setOffline(true).build());

        List<AvailableNode> modelProviders = AiUtils.getComponents(project, NodeKind.MODEL_PROVIDER, true);

        Assert.assertTrue(modelProviders.stream().anyMatch(node -> "ballerinax".equals(node.codedata().org())),
                "Expected bundled ballerinax model providers, found " + modelProviders);
        Assert.assertTrue(modelProviders.stream()
                        .allMatch(node -> NodeKind.MODEL_PROVIDER == node.codedata().node()),
                "Expected only model providers, found " + modelProviders);
    }
}
