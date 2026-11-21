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
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.TypeDefinitionSymbol;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.flowmodelgenerator.core.UserFacingException;
import io.ballerina.flowmodelgenerator.core.utils.ConnectionConfigurables;
import io.ballerina.flowmodelgenerator.core.utils.ConnectionConfigurables.Choice;
import io.ballerina.flowmodelgenerator.core.utils.ConnectionConfigurables.Configurable;
import io.ballerina.flowmodelgenerator.core.utils.ConnectionConfigurables.Declaration;
import io.ballerina.flowmodelgenerator.core.utils.ConnectionConfigurables.Preview;
import io.ballerina.projects.BuildOptions;
import io.ballerina.projects.Package;
import io.ballerina.projects.directory.BuildProject;
import org.testng.Assert;
import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Names the configurables of fields that would share a name.
 */
public class ConnectionConfigurablesTest {

    private static final Path PROJECT = Path.of("src/test/resources/connection_configurables");
    private RecordTypeSymbol config;
    private RecordTypeSymbol pool;
    private RecordTypeSymbol client;
    private TypeSymbol connection;
    private Symbol sharedUrl;
    private Symbol sharedSize;
    private Symbol cafe;

    @BeforeClass
    public void compile() {
        Package currentPackage = BuildProject.load(PROJECT, BuildOptions.builder().setOffline(true).build())
                .currentPackage();
        SemanticModel model = currentPackage.getCompilation()
                .getSemanticModel(currentPackage.getDefaultModule().moduleId());
        config = record(model, "Config");
        pool = record(model, "Pool");
        client = record(model, "Client");
        connection = model.moduleSymbols().stream()
                .filter(symbol -> symbol instanceof TypeDefinitionSymbol
                        && symbol.getName().orElseThrow().equals("Connection"))
                .map(symbol -> ((TypeDefinitionSymbol) symbol).typeDescriptor())
                .findFirst().orElseThrow();
        sharedUrl = model.moduleSymbols().stream()
                .filter(symbol -> symbol.getName().orElse("").equals("sharedUrl"))
                .findFirst().orElseThrow();
        sharedSize = model.moduleSymbols().stream()
                .filter(symbol -> symbol.getName().orElse("").equals("sharedSize"))
                .findFirst().orElseThrow();
        cafe = model.moduleSymbols().stream()
                .filter(symbol -> symbol.getName().orElse("").equals("café"))
                .findFirst().orElseThrow();
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

    @Test
    public void aNegativeNumberIsConfigured() {
        ConnectionConfigurables configurables = new ConnectionConfigurables("c", Map.of(), symbol -> false);
        Assert.assertEquals(configurables.rewrite("{size: -5, timeout: -1, rate: -2.5d}", "config", config, false),
                "{size: cSize, timeout: cTimeout, rate: cRate}");
        // TOML writes no sign before a hexadecimal number.
        Assert.assertEquals(configurables.rewrite("{size: -0x10}", "pool", config, false), "{size: -0x10}");
        Assert.assertEquals(configurables.configurables().stream().map(Configurable::configTomlEntry).toList(),
                List.of("cSize = -5", "cTimeout = -1.0", "cRate = -2.5"));
    }

    @Test
    public void aStringTheTextBoxWritesAsATemplateIsConfigured() {
        // The connection form's text box writes a string as string `...`: with no interpolation, it is that string.
        ConnectionConfigurables configurables = new ConnectionConfigurables("c", Map.of(), symbol -> false);
        Assert.assertEquals(configurables.rewrite("string `C:\\dir`", "password", field(config, "password"), true),
                "cPassword");
        Assert.assertEquals(configurables.rewrite("string `a${x}`", "foo_bar", field(config, "foo_bar"), true),
                "string `a${x}`");
        Assert.assertEquals(configurables.rewrite("string ``", "foo_bar", field(config, "foo_bar"), true),
                "string ``");
        Assert.assertEquals(configurables.rewrite("string `5`", "timeout", field(config, "timeout"), true),
                "string `5`");
        Assert.assertEquals(configurables.configurables().stream().map(Configurable::configTomlEntry).toList(),
                List.of("cPassword = \"C:\\\\dir\""));
    }

    @Test
    public void aFieldTheUserKeepsStaysInSource() {
        ConnectionConfigurables configurables = new ConnectionConfigurables("c", Map.of(), symbol -> false);
        Assert.assertEquals(configurables.rewrite("{auth: {token: \"t\"}, url: \"u\", retries: 3}", "config", client,
                false, Map.of("url", new Choice(null, true), "retries", new Choice(null, true))),
                "{auth: {token: cAuthToken}, url: \"u\", retries: 3}");
        Assert.assertEquals(configurables.configurables().stream().map(Configurable::declaration).toList(),
                List.of("configurable string cAuthToken = ?;"));
    }

    @Test
    public void aNameTheUserGivesIsUsedAsIs() {
        ConnectionConfigurables configurables = new ConnectionConfigurables("c", Map.of(), symbol -> false);
        Assert.assertEquals(configurables.rewrite("{auth: {token: \"t\"}, url: \"u\"}", "config", client, false,
                Map.of("auth.token", new Choice("apiToken", false))), "{auth: {token: apiToken}, url: cUrl}");
        Assert.assertEquals(configurables.configurables().stream().map(Configurable::declaration).toList(),
                List.of("configurable string apiToken = ?;", "configurable string cUrl = ?;"));
    }

    @Test
    public void aNameTheUserGivesThatIsTakenIsRefused() {
        ConnectionConfigurables configurables = new ConnectionConfigurables("c", Map.of(), symbol -> false);
        UserFacingException refusal = Assert.expectThrows(UserFacingException.class,
                () -> configurables.rewrite("{auth: {token: \"t\"}, url: \"u\"}", "config", client, false,
                        Map.of("auth.token", new Choice("shared", false), "url", new Choice("shared", false))));
        Assert.assertEquals(refusal.getMessage(),
                "Two of this connection's fields would both be configured by 'shared'.");
    }

    @Test
    public void aNameTheUserGivesMustBeAnIdentifier() {
        ConnectionConfigurables configurables = new ConnectionConfigurables("c", Map.of(), symbol -> false);
        UserFacingException refusal = Assert.expectThrows(UserFacingException.class,
                () -> configurables.rewrite("{url: \"u\"}", "config", client, false,
                        Map.of("url", new Choice("my url", false))));
        Assert.assertEquals(refusal.getMessage(),
                "'my url' is not a valid name. Use letters, digits and _, and don't start with a digit.");
    }

    @Test
    public void aPreviewNamesEachFieldWithoutRefusing() {
        // Each field the form shows, by its path within the argument: the name saving gives it, the one a kept field
        // would get, and why a clashing one gets none; the literals stay as they are.
        ConnectionConfigurables configurables = new ConnectionConfigurables("c", Map.of(), symbol -> false, true);
        // What the connection form shows in place of the argument: names where saving gives them, literals elsewhere.
        Assert.assertEquals(configurables.rewrite("{auth: {token: \"t\"}, url: \"u\", retries: 3}", "config", client,
                false, Map.of("url", new Choice("cAuthToken", false), "retries", new Choice(null, true))),
                "{auth: {token: cAuthToken}, url: \"u\", retries: 3}");
        Assert.assertEquals(configurables.previews(), List.of(
                new Preview("config", "auth.token", "cAuthToken", "string", false, false, null),
                new Preview("config", "url", "cAuthToken", "string", false, false,
                        "Two of this connection's fields would both be configured by 'cAuthToken'."),
                new Preview("config", "retries", "cRetries", "int", false, true, null)));
    }

    @Test
    public void aFieldReachedThroughUnionsIsKeyedByItsFieldNames() {
        // The form keys a field by the names of the fields leading to it, never a union member's: a record field of a
        // `string|record` parameter, inside a field of a `record|record[]` union, is `serverAddress.host`.
        ConnectionConfigurables configurables = new ConnectionConfigurables("mongodbClient", Map.of(),
                symbol -> false, true);
        Assert.assertEquals(configurables.rewrite("{serverAddress: {host: \"my-host\"}}", "connection", connection,
                false), "{serverAddress: {host: mongodbClientServerAddressHost}}");
        Assert.assertEquals(configurables.previews(), List.of(new Preview("connection", "serverAddress.host",
                "mongodbClientServerAddressHost", "string", false, false, null)));
    }

    @Test
    public void aPreviewShowsAConfigurableTheConnectionAlreadyUses() {
        // Editing a connection: a field that refers to a configurable shows its value, read from Config.toml, and
        // where it is declared, for renaming it; the reference stays as it is.
        Declaration declaration = new Declaration("/project/config.bal", 3, 20);
        ConnectionConfigurables configurables = new ConnectionConfigurables("c", Map.of("sharedUrl", sharedUrl),
                symbol -> true, true)
                .withExisting(name -> name.equals("sharedUrl") ? Optional.of("\"https://api\"") : Optional.empty(),
                        symbol -> Optional.of(declaration));
        Assert.assertEquals(configurables.rewrite("{url: sharedUrl}", "config", client, false),
                "{url: sharedUrl}");
        Assert.assertEquals(configurables.previews(), List.of(new Preview("config", "url", "sharedUrl", "string",
                true, false, null, "\"https://api\"", true, declaration)));
    }

    @Test
    public void aConfigurableTheConnectionAlreadyUsesKeepsItsName() {
        // Saving an edited connection with the value the form showed: the configurable is reused, though other code
        // refers to it, and only its value changes.
        ConnectionConfigurables configurables = new ConnectionConfigurables("c", Map.of("sharedUrl", sharedUrl),
                symbol -> true);
        Assert.assertEquals(configurables.rewrite("{url: \"https://new\"}", "config", client, false,
                Map.of("url", new Choice("sharedUrl", false, true))), "{url: sharedUrl}");
        Assert.assertEquals(configurables.configurables().stream().map(Configurable::exists).toList(),
                List.of(true));
    }

    @Test
    public void aConfigurableTheConnectionAlreadyUsesKeepsAnEmptyValue() {
        // Config.toml gives it "": the form opens on that, and saving keeps the configurable rather than the literal.
        ConnectionConfigurables configurables = new ConnectionConfigurables("c", Map.of("sharedUrl", sharedUrl),
                symbol -> true);
        Assert.assertEquals(configurables.rewrite("{url: \"\"}", "config", client, false,
                Map.of("url", new Choice("sharedUrl", false, true))), "{url: sharedUrl}");
        // A new field's empty string is still the form's placeholder.
        Assert.assertEquals(configurables.rewrite("{url: \"\"}", "config", client, false,
                Map.of("url", new Choice("cUrl", false))), "{url: \"\"}");
    }

    @Test
    public void aConfigurableTheConnectionAlreadyUsesKeepsANameOfAnyLetters() {
        ConnectionConfigurables configurables = new ConnectionConfigurables("c", Map.of("café", cafe),
                symbol -> true);
        Assert.assertEquals(configurables.rewrite("{url: \"https://a\"}", "config", client, false,
                Map.of("url", new Choice("café", false, true))), "{url: café}");
        // A new name is still held to letters, digits and _.
        ConnectionConfigurables named = new ConnectionConfigurables("c", Map.of(), symbol -> false);
        Assert.expectThrows(UserFacingException.class, () -> named.rewrite("{url: \"https://a\"}", "config",
                client, false, Map.of("url", new Choice("thé", false))));
    }

    @Test
    public void fieldsThatShareAConfigurableKeepSharingIt() {
        // Reopened, both fields show the configurable's value; saved unchanged, both keep using it, and its value
        // is written once.
        Map<String, Choice> both = Map.of("foo_bar", new Choice("sharedUrl", false, true),
                "fooBar", new Choice("sharedUrl", false, true));
        ConnectionConfigurables configurables = new ConnectionConfigurables("c", Map.of("sharedUrl", sharedUrl),
                symbol -> true);
        Assert.assertEquals(configurables.rewrite("{foo_bar: \"https://a\", fooBar: \"https://a\"}", "config", config,
                false, both), "{foo_bar: sharedUrl, fooBar: sharedUrl}");
        Assert.assertEquals(configurables.configurables().size(), 1);

        // Given different values, they can't both be that one configurable.
        ConnectionConfigurables differing = new ConnectionConfigurables("c", Map.of("sharedUrl", sharedUrl),
                symbol -> true);
        UserFacingException refusal = Assert.expectThrows(UserFacingException.class,
                () -> differing.rewrite("{foo_bar: \"https://a\", fooBar: \"https://b\"}", "config", config, false,
                        both));
        Assert.assertEquals(refusal.getMessage(), "Two of this connection's fields would both be configured by "
                + "'sharedUrl'.");

        // A field of another type can't share it, though its value is written the same: sharedSize is an int.
        ConnectionConfigurables mistyped = new ConnectionConfigurables("c", Map.of("sharedSize", sharedSize),
                symbol -> true);
        Assert.expectThrows(UserFacingException.class, () -> mistyped.rewrite("{size: 5, timeout: 5}",
                "config", config, false, Map.of("size", new Choice("sharedSize", false, true),
                        "timeout", new Choice("sharedSize", false, true))));
    }

    @Test
    public void anEditedConnectionKeepsTheLiteralsTheUserDidNotMakeConfigurable() {
        ConnectionConfigurables configurables = new ConnectionConfigurables("c", Map.of(), symbol -> false)
                .keepingUnchosen(true);
        Assert.assertEquals(configurables.rewrite("{auth: {token: \"t\"}, url: \"https://a\"}", "config", client,
                false, Map.of("url", new Choice(null, false))), "{auth: {token: \"t\"}, url: cUrl}");
    }

    @Test
    public void aConfigurableOtherCodeUsesCantBeTakenOver() {
        ConnectionConfigurables configurables = new ConnectionConfigurables("c", Map.of("sharedUrl", sharedUrl),
                symbol -> true);
        UserFacingException refusal = Assert.expectThrows(UserFacingException.class,
                () -> configurables.rewrite("{url: \"https://new\"}", "config", client, false,
                        Map.of("url", new Choice("sharedUrl", false))));
        Assert.assertEquals(refusal.getMessage(), "'sharedUrl' is already used in this module. Choose another name.");
    }

    @Test
    public void aStringWithALineBreakHasNoConfigTomlForm() {
        Assert.assertTrue(ConnectionConfigurables.hasNoTomlForm(
                ConnectionConfigurables.ballerinaStringLiteral("two\nlines")));
        Assert.assertTrue(ConnectionConfigurables.hasNoTomlForm(
                ConnectionConfigurables.ballerinaStringLiteral("\u0007")));
        Assert.assertFalse(ConnectionConfigurables.hasNoTomlForm(
                ConnectionConfigurables.ballerinaStringLiteral("tab\t")));
    }

    @Test
    public void aBallerinaStringLiteralEscapesWhatItMust() {
        Assert.assertEquals(ConnectionConfigurables.ballerinaStringLiteral("say \"hi\"\tC:\\x\n"),
                "\"say \\\"hi\\\"\\tC:\\\\x\\n\"");
    }

    @Test
    public void choicesAreReadFromAPropertysCodedata() {
        Map<String, Object> data = Map.of(
                "auth.token", Map.of("name", " apiToken "),
                "url", Map.of("keep", true),
                "retries", Map.of("name", "sharedUrl", "existing", true),
                "ignored", "not a choice");
        Assert.assertEquals(Choice.fromData(data), Map.of(
                "auth.token", new Choice("apiToken", false),
                "url", new Choice(null, true),
                "retries", new Choice("sharedUrl", false, true)));
        Assert.assertEquals(Choice.fromData(null), Map.of());
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
