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

package io.ballerina.modelgenerator.commons;

import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.SyntaxTree;
import io.ballerina.tools.text.TextDocuments;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.Optional;

/**
 * Regression tests for {@link ImportPrefixReader} against reserved-keyword module names. An import whose last
 * segment is a reserved keyword is written escaped in source (e.g. {@code hubspot.crm.'import}), but the model
 * stores the module name raw ({@code hubspot.crm.import}). The reader must unescape when matching a module name
 * yet keep the bound prefix escaped, so it recognises the existing import instead of allocating a duplicate.
 */
public class ImportPrefixReaderTest {

    private static ModulePartNode parse(String source) {
        return (ModulePartNode) SyntaxTree.from(TextDocuments.from(source)).rootNode();
    }

    @Test
    public void testExistingImportPrefixMatchesRawReservedKeywordModule() {
        ModulePartNode root = parse("import ballerinax/hubspot.crm.'import;\n");
        Optional<String> prefix = ImportPrefixReader.existingImportPrefix(root, "ballerinax", "hubspot.crm.import");
        Assert.assertTrue(prefix.isPresent(),
                "escaped import must be recognised for the raw module name the model stores");
        Assert.assertEquals(prefix.get(), "'import",
                "the bound prefix must stay escaped so the emitted reference is valid Ballerina");
    }

    @Test
    public void testResolveReusesEscapedPrefixInsteadOfAllocatingDuplicate() {
        ModulePartNode root = parse("import ballerinax/hubspot.crm.'import;\n");
        String prefix = ImportPrefixReader.resolve(root, "ballerinax", "hubspot.crm.import", null);
        Assert.assertEquals(prefix, "'import",
                "resolve must reuse the existing escaped prefix rather than allocate a fresh one");
    }

    @Test
    public void testBoundPrefixOfReservedKeywordModuleStaysEscaped() {
        ModulePartNode root = parse("import ballerinax/hubspot.crm.'import;\n");
        Assert.assertEquals(ImportPrefixReader.boundPrefix(root, "ballerinax", "hubspot.crm.import"), "'import");
    }

    @Test
    public void testImportedPrefixesKeepsEscapedForm() {
        ModulePartNode root = parse("import ballerinax/hubspot.crm.'import;\n");
        Assert.assertTrue(ImportPrefixReader.importedPrefixes(root).contains("'import"),
                "the taken-prefix set must carry the escaped form a new import must not collide with");
    }

    @Test
    public void testModuleNameForPrefixReturnsRawModule() {
        ModulePartNode root = parse("import ballerinax/hubspot.crm.'import;\n");
        Optional<String> module = ImportPrefixReader.moduleNameForPrefix(root, "'import");
        Assert.assertTrue(module.isPresent());
        Assert.assertEquals(module.get(), "hubspot.crm.import",
                "the resolved module identity must be raw to match the model");
    }

    @Test
    public void testAliasedReservedKeywordModuleHonoursAlias() {
        ModulePartNode root = parse("import ballerinax/hubspot.crm.'import as hsImport;\n");
        Optional<String> prefix = ImportPrefixReader.existingImportPrefix(root, "ballerinax", "hubspot.crm.import");
        Assert.assertTrue(prefix.isPresent());
        Assert.assertEquals(prefix.get(), "hsImport", "an explicit alias must be honoured verbatim");
    }

    @Test
    public void testNonReservedModuleUnaffected() {
        ModulePartNode root = parse("import ballerinax/hubspot.crm.contacts;\n");
        Optional<String> prefix = ImportPrefixReader.existingImportPrefix(root, "ballerinax", "hubspot.crm.contacts");
        Assert.assertTrue(prefix.isPresent());
        Assert.assertEquals(prefix.get(), "contacts");
    }
}
