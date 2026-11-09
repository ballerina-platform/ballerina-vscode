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

package io.ballerina.flowmodelgenerator.extension;

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.RecordTypeSymbol;
import io.ballerina.compiler.api.symbols.TypeDefinitionSymbol;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.flowmodelgenerator.core.UserFacingException;
import io.ballerina.flowmodelgenerator.core.utils.ConnectionConfigurables;
import io.ballerina.flowmodelgenerator.core.utils.ConnectionConfigurables.Configurable;
import io.ballerina.projects.BuildOptions;
import io.ballerina.projects.Package;
import io.ballerina.projects.directory.BuildProject;
import org.testng.Assert;
import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;

/**
 * Names the configurables of fields that would share a name.
 */
public class ConnectionConfigurablesTest {

    private static final Path PROJECT = Path.of("src/test/resources/connection_configurables");
    private RecordTypeSymbol config;
    private RecordTypeSymbol pool;

    @BeforeClass
    public void compile() {
        Package currentPackage = BuildProject.load(PROJECT, BuildOptions.builder().setOffline(true).build())
                .currentPackage();
        SemanticModel model = currentPackage.getCompilation()
                .getSemanticModel(currentPackage.getDefaultModule().moduleId());
        config = record(model, "Config");
        pool = record(model, "Pool");
    }

    @Test
    public void fieldsOfOneNameTakeTheParameterName() {
        ConnectionConfigurables configurables = new ConnectionConfigurables("c", Map.of(), symbol -> false);
        Assert.assertEquals(configurables.rewrite("{foo_bar: \"one\", fooBar: \"two\"}", "config", config, false),
                "{foo_bar: cFooBar, fooBar: cConfigFooBar}");
        Assert.assertEquals(configurables.rewrite("{password: \"p\"}", "pool", pool, false),
                "{password: cPassword}");
        Assert.assertEquals(configurables.rewrite("{password: \"q\", size: 5}", "config", config, false),
                "{password: cConfigPassword, size: cSize}");
        Assert.assertEquals(configurables.configurables().stream().map(Configurable::declaration).toList(), List.of(
                "configurable string cFooBar = ?;", "configurable string cConfigFooBar = ?;",
                "configurable string cPassword = ?;", "configurable string cConfigPassword = ?;",
                "configurable int cSize = ?;"));
    }

    @Test
    public void fieldsStillOfOneNameAreRefused() {
        ConnectionConfigurables configurables = new ConnectionConfigurables("c", Map.of(), symbol -> false);
        configurables.rewrite("\"one\"", "foo_bar", field(config, "foo_bar"), true);
        UserFacingException refusal = Assert.expectThrows(UserFacingException.class,
                () -> configurables.rewrite("\"two\"", "fooBar", field(config, "fooBar"), true));
        Assert.assertEquals(refusal.getMessage(), "Two of this connection's fields would both be configured by "
                + "'cFooBar'.");
    }

    @Test
    public void valuesConfigTomlCantHoldStayInSource() {
        // An empty string is the form's placeholder; Ballerina's config reader rejects the escapes for a bell or a line
        // break, but reads a tab's, and parses no number TOML doesn't write as Ballerina does.
        ConnectionConfigurables configurables = new ConnectionConfigurables("c", Map.of(), symbol -> false);
        Assert.assertEquals(configurables.rewrite("{foo_bar: \"\", fooBar: \"bell\\u{7}\", password: \"tab\\t\"}",
                "config", config, false), "{foo_bar: \"\", fooBar: \"bell\\u{7}\", password: cPassword}");
        Assert.assertEquals(configurables.rewrite("{password: \"two\\nlines\"}", "pool", pool, false),
                "{password: \"two\\nlines\"}");
        // TOML writes no number as .5 or 0x1.8p1 do; 2.5d and 0x10 have a TOML form.
        Assert.assertEquals(configurables.rewrite("{timeout: .5, rate: 2.5d, size: 0x10}", "config", config, false),
                "{timeout: .5, rate: cRate, size: cSize}");
        Assert.assertEquals(configurables.rewrite("{timeout: 0x1.8p1}", "config", config, false),
                "{timeout: 0x1.8p1}");
        Assert.assertEquals(configurables.configurables().stream().map(Configurable::configTomlEntry).toList(),
                List.of("cPassword = \"tab\\t\"", "cRate = 2.5", "cSize = 0x10"));
    }

    private static RecordTypeSymbol record(SemanticModel model, String name) {
        return model.moduleSymbols().stream()
                .filter(symbol -> symbol instanceof TypeDefinitionSymbol && symbol.getName().orElseThrow().equals(name))
                .map(symbol -> (RecordTypeSymbol) ((TypeDefinitionSymbol) symbol).typeDescriptor())
                .findFirst().orElseThrow();
    }

    private static TypeSymbol field(RecordTypeSymbol record, String name) {
        return record.fieldDescriptors().get(name).typeDescriptor();
    }
}
