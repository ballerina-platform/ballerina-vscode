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
import io.ballerina.compiler.syntax.tree.CheckExpressionNode;
import io.ballerina.compiler.syntax.tree.ClassDefinitionNode;
import io.ballerina.compiler.syntax.tree.ExplicitNewExpressionNode;
import io.ballerina.compiler.syntax.tree.ExpressionFunctionBodyNode;
import io.ballerina.compiler.syntax.tree.ExpressionNode;
import io.ballerina.compiler.syntax.tree.FunctionArgumentNode;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.ModuleMemberDeclarationNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.SeparatedNodeList;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.projects.BuildOptions;
import io.ballerina.projects.Document;
import io.ballerina.projects.DocumentId;
import io.ballerina.projects.Project;
import io.ballerina.projects.directory.SingleFileProject;
import org.testng.Assert;
import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;

import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Tests {@link AiUtils#getModelIconUrl(SemanticModel, ExpressionNode)} and
 * {@link AiUtils#getMemoryStoreData(SemanticModel, SeparatedNodeList)} against the reference forms a
 * model or memory-store argument takes at a call site: a plain variable, a variable typed by the
 * generic interface, a class field, and (for the model) an expression neither resolves.
 *
 * @since 1.8.0
 */
public class AiUtilsComponentResolutionTest {

    private static final Path RES_DIR = Paths.get("src", "test", "resources", "ballerina", "ai_utils")
            .toAbsolutePath();

    private SemanticModel semanticModel;
    private ModulePartNode modulePart;

    @BeforeClass
    public void setup() {
        BuildOptions buildOptions = BuildOptions.builder().setOffline(true).build();
        Project project = SingleFileProject.load(RES_DIR.resolve("ai_component_resolution.bal"), buildOptions);
        semanticModel = PackageUtil.getCompilation(project)
                .getSemanticModel(project.currentPackage().getDefaultModule().moduleId());
        DocumentId documentId = project.documentId(project.sourceRoot());
        Document document = project.currentPackage().module(documentId.moduleId()).document(documentId);
        modulePart = (ModulePartNode) document.syntaxTree().rootNode();
    }

    @Test(description = "No store argument resolves to no memory store")
    public void testMemoryWithoutStoreResolvesToNull() {
        Assert.assertNull(AiUtils.getMemoryStoreData(semanticModel, newExpressionArgumentsOf("memoryWithNoStore")));
    }

    @Test(description = "A memory store passed as a positional variable argument is resolved")
    public void testMemoryStoreResolvesFromPositionalVariable() {
        assertMemoryStore(AiUtils.getMemoryStoreData(semanticModel,
                newExpressionArgumentsOf("memoryWithPositionalStore")), "memoryStoreVar");
    }

    @Test(description = "A memory store passed as a named variable argument is resolved")
    public void testMemoryStoreResolvesFromNamedVariable() {
        assertMemoryStore(AiUtils.getMemoryStoreData(semanticModel,
                newExpressionArgumentsOf("memoryWithNamedStore")), "memoryStoreVar");
    }

    @Test(description = "A memory store held in a class field is not resolved: CommonUtils#isAiMemoryStore "
            + "filters by symbol kind before resolveComponent ever sees the field, and its getClassSymbol "
            + "helper does not unwrap a ClassFieldSymbol (unlike the VariableSymbol/ParameterSymbol it does "
            + "handle) - a pre-existing gap in a shared helper outside this change, not a regression here")
    public void testMemoryStoreFromClassFieldIsNotYetResolved() {
        Assert.assertNull(
                AiUtils.getMemoryStoreData(semanticModel, newExpressionArgumentsOf("memoryWithFieldStore")));
    }

    @Test(description = "A model provider referenced by a variable of its own type keeps that type name")
    public void testModelIconUsesConcreteTypeName() {
        AiUtils.ModelData model =
                AiUtils.getModelIconUrl(semanticModel, expressionBodyOf("referenceTypedModelProvider"));
        Assert.assertNotNull(model);
        Assert.assertEquals(model.name(), "typedModelProvider");
        Assert.assertEquals(model.type(), "Wso2ModelProvider");
        assertBallerinaAiIcon(model.path());
    }

    @Test(description = "A model provider referenced by the generic ModelProvider type falls back to the "
            + "package name")
    public void testModelIconFallsBackToPackageNameForGenericType() {
        AiUtils.ModelData model =
                AiUtils.getModelIconUrl(semanticModel, expressionBodyOf("referenceGenericModelProvider"));
        Assert.assertNotNull(model);
        Assert.assertEquals(model.name(), "genericModelProvider");
        Assert.assertEquals(model.type(), "ai");
    }

    @Test(description = "A model provider held in a class field is resolved through the field access")
    public void testModelIconResolvesThroughFieldAccess() {
        AiUtils.ModelData model = AiUtils.getModelIconUrl(semanticModel, expressionBodyOf("referenceFieldModel"));
        Assert.assertNotNull(model);
        Assert.assertEquals(model.name(), "fieldModel");
        Assert.assertEquals(model.type(), "ai");
    }

    @Test(description = "An expression that is neither a name nor a field access round-trips as source text")
    public void testModelIconFallsBackToSourceTextForOtherExpressions() {
        AiUtils.ModelData model =
                AiUtils.getModelIconUrl(semanticModel, expressionBodyOf("referenceFallbackModelExpression"));
        Assert.assertEquals(model, new AiUtils.ModelData("fallbackModelExpression()", null, null));
    }

    private static void assertMemoryStore(AiUtils.ModelData store, String expectedName) {
        Assert.assertNotNull(store);
        Assert.assertEquals(store.name(), expectedName);
        // A memory store's icon always groups by package, not by its concrete class name.
        Assert.assertEquals(store.type(), "ai");
        assertBallerinaAiIcon(store.path());
    }

    private static void assertBallerinaAiIcon(String path) {
        Assert.assertNotNull(path);
        Assert.assertTrue(path.startsWith("https://bcentral-packageicons.azureedge.net/images/ballerina_ai_"));
        Assert.assertTrue(path.endsWith(".png"));
    }

    private ExpressionNode expressionBodyOf(String functionName) {
        return unwrapCheck(findFunctionBody(functionName).expression());
    }

    private SeparatedNodeList<FunctionArgumentNode> newExpressionArgumentsOf(String functionName) {
        ExpressionNode expression = expressionBodyOf(functionName);
        if (!(expression instanceof ExplicitNewExpressionNode newExpression)) {
            throw new IllegalStateException("Expected a new-expression in " + functionName);
        }
        return newExpression.parenthesizedArgList().arguments();
    }

    private static ExpressionNode unwrapCheck(ExpressionNode expression) {
        return expression instanceof CheckExpressionNode checkExpression ? checkExpression.expression() : expression;
    }

    private ExpressionFunctionBodyNode findFunctionBody(String functionName) {
        for (ModuleMemberDeclarationNode member : modulePart.members()) {
            if (member instanceof FunctionDefinitionNode function && isTarget(function, functionName)) {
                return (ExpressionFunctionBodyNode) function.functionBody();
            }
            if (member instanceof ClassDefinitionNode classDefinition) {
                for (Node classMember : classDefinition.members()) {
                    if (classMember instanceof FunctionDefinitionNode function && isTarget(function, functionName)) {
                        return (ExpressionFunctionBodyNode) function.functionBody();
                    }
                }
            }
        }
        throw new IllegalStateException("Function not found: " + functionName);
    }

    private static boolean isTarget(FunctionDefinitionNode function, String name) {
        return function.functionName().text().equals(name)
                && function.functionBody() instanceof ExpressionFunctionBodyNode;
    }
}
