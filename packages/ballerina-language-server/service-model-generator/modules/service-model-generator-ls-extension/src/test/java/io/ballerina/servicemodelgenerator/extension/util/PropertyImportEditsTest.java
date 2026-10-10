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

package io.ballerina.servicemodelgenerator.extension.util;

import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.SyntaxTree;
import io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import io.ballerina.tools.text.TextDocuments;
import org.eclipse.lsp4j.TextEdit;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Unit tests for collecting the imports a property's expression relies on, so the generated source
 * declares the modules a user referenced through a completion.
 *
 * @since 1.9.0
 */
public class PropertyImportEditsTest {

    private static final String TIME_IMPORT = Utils.getImportStmt("ballerina", "time");
    private static final String UUID_IMPORT = Utils.getImportStmt("ballerina", "uuid");

    private ModulePartNode rootOf(String source) {
        return (ModulePartNode) SyntaxTree.from(TextDocuments.from(source)).rootNode();
    }

    private Value propertyWithImports(Map<String, String> imports) {
        return new Value.ValueBuilder().setImports(imports).value("expr").enabled(true).build();
    }

    private Map<String, Value> properties(Object... keyValues) {
        Map<String, Value> properties = new LinkedHashMap<>();
        for (int i = 0; i < keyValues.length; i += 2) {
            properties.put((String) keyValues[i], (Value) keyValues[i + 1]);
        }
        return properties;
    }

    @Test
    public void testMissingImportIsCollected() {
        Map<String, Value> properties = properties("annotServiceConfig",
                propertyWithImports(Map.of("time", "ballerina/time")));
        Set<String> stmts = Utils.getMissingPropertyImportStmts(rootOf(""), properties);
        Assert.assertEquals(stmts, Set.of(TIME_IMPORT));
    }

    @Test
    public void testVersionSuffixOfModuleIdIsIgnored() {
        Map<String, Value> properties = properties("annotServiceConfig",
                propertyWithImports(Map.of("time", "ballerina/time:2.8.3")));
        Assert.assertEquals(Utils.getMissingPropertyImportStmts(rootOf(""), properties), Set.of(TIME_IMPORT));
    }

    @Test
    public void testAlreadyDeclaredImportIsSkipped() {
        Map<String, Value> properties = properties("annotServiceConfig",
                propertyWithImports(Map.of("time", "ballerina/time")));
        Assert.assertTrue(Utils.getMissingPropertyImportStmts(
                rootOf("import ballerina/time;\n"), properties).isEmpty());
    }

    @Test
    public void testOnlyMissingModulesAreCollected() {
        Map<String, String> imports = new LinkedHashMap<>();
        imports.put("time", "ballerina/time");
        imports.put("uuid", "ballerina/uuid");
        Set<String> stmts = Utils.getMissingPropertyImportStmts(rootOf("import ballerina/time;\n"),
                properties("annotServiceConfig", propertyWithImports(imports)));
        Assert.assertEquals(stmts, Set.of(UUID_IMPORT));
    }

    @Test
    public void testSameModuleOnSeveralPropertiesIsCollectedOnce() {
        Map<String, Value> properties = properties(
                "a", propertyWithImports(Map.of("time", "ballerina/time")),
                "b", propertyWithImports(Map.of("time", "ballerina/time:2.8.3")));
        Assert.assertEquals(Utils.getMissingPropertyImportStmts(rootOf(""), properties).size(), 1);
    }

    @Test
    public void testPropertyImportPrefixIsPreserved() {
        Map<String, Value> properties = properties("annotServiceConfig",
                propertyWithImports(Map.of("clockAlias", "ballerina/time")));
        Assert.assertEquals(Utils.getMissingPropertyImportStmts(rootOf(""), properties),
                Set.of(Utils.getImportStmt("ballerina", "time", "clockAlias")));
    }

    @Test
    public void testModuleImportedUnderTwoPrefixesIsCollectedOnce() {
        Map<String, Value> properties = properties(
                "a", propertyWithImports(Map.of("clockAlias", "ballerina/time")),
                "b", propertyWithImports(Map.of("time", "ballerina/time")));
        Assert.assertEquals(Utils.getMissingPropertyImportStmts(rootOf(""), properties).size(), 1);
    }

    @Test
    public void testCoveredModulesAreSkipped() {
        Map<String, Value> properties = properties("annotServiceConfig",
                propertyWithImports(Map.of("time", "ballerina/time")));
        Assert.assertTrue(Utils.getMissingPropertyImportStmts(rootOf(""), properties,
                Set.of("ballerina/time")).isEmpty());
    }

    @Test
    public void testImportsOfPropertyWithoutValueAreSkipped() {
        Value cleared = new Value.ValueBuilder().setImports(Map.of("time", "ballerina/time")).value("")
                .enabled(true).build();
        Value disabled = new Value.ValueBuilder().setImports(Map.of("uuid", "ballerina/uuid")).value("expr")
                .enabled(false).editable(true).build();
        Assert.assertTrue(Utils.getMissingPropertyImportStmts(rootOf(""),
                properties("a", cleared, "b", disabled)).isEmpty());
    }

    @Test
    public void testMalformedModuleIdIsSkipped() {
        Map<String, Value> properties = properties("annotServiceConfig",
                propertyWithImports(Map.of("time", "time")));
        Assert.assertTrue(Utils.getMissingPropertyImportStmts(rootOf(""), properties).isEmpty());
    }

    @Test
    public void testPropertiesWithoutImportsAndNullPropertiesAreTolerated() {
        Assert.assertTrue(Utils.getMissingPropertyImportStmts(rootOf(""), null).isEmpty());
        Map<String, Value> properties = properties("port", new Value.ValueBuilder().value("8080").build());
        Assert.assertTrue(Utils.getMissingPropertyImportStmts(rootOf(""), properties).isEmpty());
    }

    @Test
    public void testNestedPropertyImportsAreCollected() {
        Value nested = propertyWithImports(Map.of("time", "ballerina/time"));
        Value group = new Value.ValueBuilder().setProperties(properties("inner", nested)).build();
        Assert.assertEquals(Utils.getMissingPropertyImportStmts(rootOf(""), properties("group", group)),
                Set.of(TIME_IMPORT));
    }

    @Test
    public void testOnlyEnabledChoiceBranchImportsAreCollected() {
        Value enabledBranch = new Value.ValueBuilder().enabled(true)
                .setProperties(properties("a", propertyWithImports(Map.of("time", "ballerina/time")))).build();
        Value disabledBranch = new Value.ValueBuilder().enabled(false)
                .setProperties(properties("b", propertyWithImports(Map.of("uuid", "ballerina/uuid")))).build();
        Value choice = new Value.ValueBuilder().build();
        choice.setChoices(List.of(enabledBranch, disabledBranch));

        Assert.assertEquals(Utils.getMissingPropertyImportStmts(rootOf(""), properties("choice", choice)),
                Set.of(TIME_IMPORT));
    }

    @Test
    public void testServiceInitImportEditCombinesConnectorAndPropertyImports() {
        ServiceInitModel model = serviceInitModel();
        model.addProperty("annotServiceConfig", propertyWithImports(Map.of("time", "ballerina/time:2.8.3")));

        Optional<TextEdit> edit = Utils.getServiceInitImportEdit(rootOf(""), model);

        Assert.assertTrue(edit.isPresent());
        String newText = edit.get().getNewText();
        Assert.assertTrue(newText.contains(Utils.getImportStmt("ballerina", "http")), newText);
        Assert.assertTrue(newText.contains(TIME_IMPORT), newText);
        Assert.assertEquals(edit.get().getRange().getStart().getLine(), 0);
    }

    @Test
    public void testServiceInitImportEditSkipsDeclaredModules() {
        ServiceInitModel model = serviceInitModel();
        model.addProperty("annotServiceConfig", propertyWithImports(Map.of("time", "ballerina/time")));

        Optional<TextEdit> edit = Utils.getServiceInitImportEdit(
                rootOf("import ballerina/http;\nimport ballerina/time;\n"), model);

        Assert.assertTrue(edit.isEmpty());
    }

    @Test
    public void testServiceInitImportEditAddsOnlyThePropertyImportWhenConnectorIsDeclared() {
        ServiceInitModel model = serviceInitModel();
        model.addProperty("annotServiceConfig", propertyWithImports(Map.of("time", "ballerina/time")));

        Optional<TextEdit> edit = Utils.getServiceInitImportEdit(rootOf("import ballerina/http;\n"), model);

        Assert.assertTrue(edit.isPresent());
        Assert.assertEquals(edit.get().getNewText(), TIME_IMPORT);
    }

    private ServiceInitModel serviceInitModel() {
        return new ServiceInitModel.Builder().setOrgName("ballerina").setModuleName("http").build();
    }
}
