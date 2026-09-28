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
import io.ballerina.flowmodelgenerator.core.model.Category;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.Metadata;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.modelgenerator.commons.CommonUtils;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.List;
import java.util.Map;

/**
 * Tests adaptive package grouping for AI component search results.
 *
 * @since 1.8.0
 */
public class AiUtilsGroupingTest {

    private static final List<String> AI_COMPONENT_CATEGORY_LABELS = List.of(
            "Model Providers", "Embedding Providers", "Vector Stores", "Chunkers", "Data Loaders",
            "Memory Stores", "Knowledge Bases");

    @Test(description = "Keeps packages with a single component as direct selectable leaves.")
    public void testSingleComponentPackageRemainsFlat() {
        AvailableNode openAi = component("OpenAI Model Provider", "ai.openai", "OpenAiModelProvider");

        Category category = AiUtils.buildAdaptiveAiComponentCategory("Model Providers", List.of(openAi), null);

        Assert.assertEquals(category.items(), List.of(openAi));
    }

    @Test(description = "Groups multiple implementations from one package while preserving leaf codedata.")
    public void testMultiComponentPackageIsGrouped() {
        AvailableNode openAi = component("OpenAI Model Provider", "ai.openai", "OpenAiModelProvider");
        AvailableNode azureOpenAi = component("Azure OpenAI Model Provider", "ai.azure", "AzureOpenAiModelProvider");
        AvailableNode azureAnthropic = component("Azure Anthropic Model Provider", "ai.azure",
                "AzureAnthropicModelProvider");

        Category category = AiUtils.buildAdaptiveAiComponentCategory("Model Providers",
                List.of(openAi, azureOpenAi, azureAnthropic), null);

        Assert.assertEquals(category.items().size(), 2);
        Assert.assertSame(category.items().getFirst(), openAi);
        Category azure = (Category) category.items().get(1);
        Assert.assertEquals(azure.metadata().label(), "Azure Model Providers");
        Assert.assertEquals(azure.items(), List.of(azureOpenAi, azureAnthropic));
        Assert.assertSame(((AvailableNode) azure.items().getFirst()).codedata(), azureOpenAi.codedata());
    }

    @Test(description = "Filters grouped packages by subtype and retains all children when the package matches.")
    public void testGroupedPackageSearch() {
        AvailableNode azureOpenAi = component("Azure OpenAI Model Provider", "ai.azure", "AzureOpenAiModelProvider");
        AvailableNode azureAnthropic = component("Azure Anthropic Model Provider", "ai.azure",
                "AzureAnthropicModelProvider");

        Category subtypeSearch = AiUtils.buildAdaptiveAiComponentCategory("Model Providers",
                List.of(azureOpenAi, azureAnthropic), "Anthropic");
        Category azureFromSubtypeSearch = (Category) subtypeSearch.items().getFirst();
        Assert.assertEquals(azureFromSubtypeSearch.items(), List.of(azureAnthropic));

        Category packageSearch = AiUtils.buildAdaptiveAiComponentCategory("Model Providers",
                List.of(azureOpenAi, azureAnthropic), "Azure");
        Category azureFromPackageSearch = (Category) packageSearch.items().getFirst();
        Assert.assertEquals(azureFromPackageSearch.items(), List.of(azureOpenAi, azureAnthropic));
    }

    @Test(description = "Uses a discovered icon when latest-version components omit codedata version.")
    public void testGroupedLatestVersionComponentsKeepAValidIcon() {
        AvailableNode first = component("First Chunker", "ai", "FirstChunker", null);
        AvailableNode second = component("Second Chunker", "ai", "SecondChunker", null);

        Category category = AiUtils.buildAdaptiveAiComponentCategory("Chunkers", List.of(first, second), null);

        Assert.assertEquals(((Category) category.items().getFirst()).metadata().icon(), first.metadata().icon());
    }

    @Test(description = "Builds categories for every supported AI component type using the shared grouping helper.")
    public void testAllAiComponentCategoriesUseSharedGrouping() {
        List<AvailableNode> components = List.of(
                component("Azure First", "ai.azure", "AzureFirst"),
                component("Azure Second", "ai.azure", "AzureSecond"));

        for (String categoryLabel : AI_COMPONENT_CATEGORY_LABELS) {
            Category category = AiUtils.buildAdaptiveAiComponentCategory(categoryLabel, components, null);
            Assert.assertEquals(category.metadata().label(), categoryLabel);
            Assert.assertTrue(category.items().getFirst() instanceof Category);
        }
    }

    @Test(description = "Nests leaves under @ai:Group paths, collapsing single-leaf groups only.")
    public void testNestedGroupTree() {
        AvailableNode root = component("AWS Default", "ai.aws", "AwsDefault");
        AvailableNode sonnet = grouped("Claude Sonnet", "AwsSonnet",
                segment("Bedrock", "Bedrock models"), segment("Anthropic", null));
        AvailableNode haiku = grouped("Claude Haiku", "AwsHaiku", segment("Bedrock", null),
                segment("Anthropic", null));
        AvailableNode llama = grouped("Llama", "AwsLlama", segment("Bedrock", null), segment("Meta", null));
        AvailableNode titan = grouped("Titan", "AwsTitan", segment("Bedrock", "Conflicting"));
        AvailableNode local1 = grouped("Local One", "AwsLocal1", segment("Outposts", null),
                segment("On-Premises", null));
        AvailableNode local2 = grouped("Local Two", "AwsLocal2", segment("Outposts", null),
                segment("On-Premises", null));
        AvailableNode nova = grouped("Nova Pro", "AwsNova", segment("Nova", null));

        Category category = AiUtils.buildAdaptiveAiComponentCategory("Model Providers",
                List.of(root, sonnet, haiku, llama, titan, local1, local2, nova), null);

        Category aws = (Category) category.items().getFirst();
        Assert.assertEquals(aws.metadata().label(), "AWS Model Providers");
        Assert.assertSame(aws.items().getFirst(), root);
        Category bedrock = (Category) aws.items().get(1);
        Assert.assertEquals(bedrock.metadata().label(), "Bedrock");
        Assert.assertEquals(bedrock.metadata().description(), "Bedrock models");
        Category anthropic = (Category) bedrock.items().getFirst();
        Assert.assertEquals(anthropic.items(), List.of(sonnet, haiku));
        Assert.assertSame(bedrock.items().get(1), llama);
        Assert.assertSame(bedrock.items().get(2), titan);
        Category outposts = (Category) aws.items().get(2);
        Assert.assertEquals(outposts.items().size(), 1);
        Assert.assertEquals(((Category) outposts.items().getFirst()).items(), List.of(local1, local2));
        Assert.assertSame(aws.items().get(3), nova);
    }

    @Test(description = "Uses a default description for subgroups that declare none.")
    public void testSubgroupDefaultMetadata() {
        AvailableNode first = grouped("First", "First", segment("Mantle", null));
        AvailableNode second = grouped("Second", "Second", segment("Mantle", null));

        Category category = AiUtils.buildAdaptiveAiComponentCategory("Model Providers", List.of(first, second),
                null);

        Category mantle = (Category) ((Category) category.items().getFirst()).items().getFirst();
        Assert.assertEquals(mantle.metadata().description(), "Model Providers in AWS");
        Assert.assertEquals(mantle.metadata().icon(),
                CommonUtils.generateIcon("ballerinax", "ai.aws", "1.0.0"));
    }

    @Test(description = "A subgroup without its own icon inherits the nearest ancestor's icon.")
    public void testSubgroupIconInheritance() {
        AiUtils.GroupSegment sageMaker = new AiUtils.GroupSegment("SageMaker", null, "icon-sagemaker");
        AvailableNode falcon = grouped("Falcon", "Falcon", sageMaker, segment("JumpStart", null));
        AvailableNode mixtral = grouped("Mixtral", "Mixtral", segment("SageMaker", null), segment("JumpStart", null));

        Category category = AiUtils.buildAdaptiveAiComponentCategory("Model Providers", List.of(falcon, mixtral),
                null);

        Category sageMakerGroup = (Category) ((Category) category.items().getFirst()).items().getFirst();
        Assert.assertEquals(sageMakerGroup.metadata().icon(), "icon-sagemaker");
        Assert.assertEquals(((Category) sageMakerGroup.items().getFirst()).metadata().icon(), "icon-sagemaker");
    }

    @Test(description = "Search keeps matching leaves with their ancestor groups, or a whole matching subtree.")
    public void testNestedGroupSearch() {
        AvailableNode sonnet = grouped("Claude Sonnet", "AwsSonnet", segment("Bedrock", null),
                segment("Anthropic", null));
        AvailableNode haiku = grouped("Claude Haiku", "AwsHaiku", segment("Bedrock", null),
                segment("Anthropic", null));
        AvailableNode mantle = grouped("Mantle OpenAI", "AwsMantle", segment("Mantle", null));
        AvailableNode mantle2 = grouped("Mantle Mistral", "AwsMantle2", segment("Mantle", null));
        List<AvailableNode> components = List.of(sonnet, haiku, mantle, mantle2);

        Category leafSearch = AiUtils.buildAdaptiveAiComponentCategory("Model Providers", components, "haiku");
        Category aws = (Category) leafSearch.items().getFirst();
        Assert.assertEquals(aws.items().size(), 1);
        Category bedrock = (Category) aws.items().getFirst();
        Assert.assertEquals(((Category) bedrock.items().getFirst()).items(), List.of(haiku));

        Category groupSearch = AiUtils.buildAdaptiveAiComponentCategory("Model Providers", components, "anthropic");
        Category anthropic = (Category) ((Category) ((Category) groupSearch.items().getFirst()).items().getFirst())
                .items().getFirst();
        Assert.assertEquals(anthropic.items(), List.of(sonnet, haiku));

        Category noMatch = AiUtils.buildAdaptiveAiComponentCategory("Model Providers", components, "vertex");
        Assert.assertTrue(noMatch.items().isEmpty());
    }

    private static AiUtils.GroupSegment segment(String label, String description) {
        return new AiUtils.GroupSegment(label, description, null);
    }

    private static AvailableNode grouped(String label, String object, AiUtils.GroupSegment... path) {
        return new AvailableNode(
                new Metadata(label, label + " description", null, "icon-ai.aws", null,
                        Map.of(AiUtils.AI_GROUP_PATH_KEY, List.of(path)), null, null),
                new Codedata(NodeKind.MODEL_PROVIDER, "ballerinax", "ai.aws", "ai.aws", object, "init",
                        "1.0.0", null, null, null, null, null, false, false, null, null),
                true);
    }

    private static AvailableNode component(String label, String packageName, String object) {
        return component(label, packageName, object, "1.0.0");
    }

    private static AvailableNode component(String label, String packageName, String object, String version) {
        return new AvailableNode(
                new Metadata(label, label + " description", null, "icon-" + packageName, null, null, null,
                        null),
                new Codedata(NodeKind.MODEL_PROVIDER, "ballerinax", packageName, packageName, object, "init",
                        version, null, null, null, null, null, false, false, null, null),
                true);
    }
}
