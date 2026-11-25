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

package io.ballerina.flowmodelgenerator.core.utils;

import io.ballerina.flowmodelgenerator.core.UserFacingException;
import io.ballerina.toml.api.Toml;
import org.eclipse.lsp4j.Position;
import org.eclipse.lsp4j.TextEdit;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.nio.file.Path;
import java.util.Optional;

/**
 * Renaming a configurable's value in a Config.toml: only the key the connection form would read changes, where the
 * form looks for it, as the Configurables view does ({@code [<org>.<package>]}, then top level).
 *
 * @since 1.9.0
 */
public class ConfigTomlKeysTest {

    private static final String MODULE = "wso2.http1";

    private static String renamed(String config, String from, String to) {
        Optional<TextEdit> edit = ConfigTomlKeys.renameKey(Toml.read(config, "Config.toml"), MODULE, from, to);
        return edit.map(e -> apply(config, e)).orElse(config);
    }

    private static String apply(String text, TextEdit edit) {
        return text.substring(0, offset(text, edit.getRange().getStart())) + edit.getNewText()
                + text.substring(offset(text, edit.getRange().getEnd()));
    }

    private static int offset(String text, Position position) {
        int offset = 0;
        for (int line = 0; line < position.getLine(); line++) {
            offset = text.indexOf('\n', offset) + 1;
        }
        return offset + position.getCharacter();
    }

    @Test
    public void renamesTopLevelKey() {
        Assert.assertEquals(renamed("sfToken = \"abc\"\nother = 1\n", "sfToken", "salesforceToken"),
                "salesforceToken = \"abc\"\nother = 1\n");
    }

    @Test
    public void renamesKeyInModuleTable() {
        String config = "other = 1\n\n[wso2.http1]\nsfToken = \"abc\"\n";
        Assert.assertEquals(renamed(config, "sfToken", "salesforceToken"),
                "other = 1\n\n[wso2.http1]\nsalesforceToken = \"abc\"\n");
    }

    @Test
    public void leavesAKeyInThePackagesOwnTableAlone() {
        // The Configurables view reads no [<package>] table for the root module, so neither does the form.
        String config = "[http1]\nsfToken = \"abc\"\n";
        Assert.assertEquals(renamed(config, "sfToken", "salesforceToken"), config);
    }

    @Test
    public void keepsQuotedKeyQuoted() {
        Assert.assertEquals(renamed("\"sfToken\" = \"abc\"\n", "sfToken", "salesforceToken"),
                "\"salesforceToken\" = \"abc\"\n");
    }

    @Test
    public void keepsValueCommentsOrderAndLayout() {
        String config = "# Values for the connections\n"
                + "first   =   \"one\"\n"
                + "  sfToken   =   \"abc\"   # the token\n"
                + "last = 3\n";
        Assert.assertEquals(renamed(config, "sfToken", "salesforceToken"),
                "# Values for the connections\n"
                        + "first   =   \"one\"\n"
                        + "  salesforceToken   =   \"abc\"   # the token\n"
                        + "last = 3\n");
    }

    @Test
    public void renamesOnlyTheKeyTheFormReads() {
        // The root module's table is read before the top level; a value of the same name in another module's table
        // is another's.
        String config = "sfToken = \"abc\"\n\n[wso2.http1]\nsfToken = \"xyz\"\n\n[other.module]\nsfToken = \"q\"\n";
        Assert.assertEquals(renamed(config, "sfToken", "salesforceToken"),
                "sfToken = \"abc\"\n\n[wso2.http1]\nsalesforceToken = \"xyz\"\n\n[other.module]\nsfToken = \"q\"\n");
    }

    @Test
    public void leavesAnotherModulesKeyAlone() {
        String config = "[other.module]\nsfToken = \"q\"\n";
        Assert.assertTrue(ConfigTomlKeys.renameKey(Toml.read(config, "Config.toml"), MODULE, "sfToken",
                "salesforceToken").isEmpty());
    }

    @Test
    public void changesNothingWhenThereIsNoValue() {
        Assert.assertTrue(ConfigTomlKeys.renameKey(Toml.read("other = 1\n", "Config.toml"), MODULE,
                "sfToken", "salesforceToken").isEmpty());
    }

    @Test
    public void refusesToDuplicateAValueOfTheNewName() {
        Toml toml = Toml.read("sfToken = \"abc\"\nsalesforceToken = \"old\"\n", "Config.toml");
        UserFacingException refused = Assert.expectThrows(UserFacingException.class,
                () -> ConfigTomlKeys.renameKey(toml, MODULE, "sfToken", "salesforceToken"));
        Assert.assertTrue(refused.getMessage().contains("Config.toml already has a value for 'salesforceToken'"));
    }

    @Test
    public void refusesTheNewNameInAnotherTableOfTheRootModule() {
        Toml toml = Toml.read("salesforceToken = \"other\"\n\n[wso2.http1]\nsfToken = \"abc\"\n", "Config.toml");
        UserFacingException refused = Assert.expectThrows(UserFacingException.class,
                () -> ConfigTomlKeys.renameKey(toml, MODULE, "sfToken", "salesforceToken"));
        Assert.assertTrue(refused.getMessage().contains("Config.toml already has a value for 'salesforceToken'"));
    }

    @Test
    public void refusesTheNameOfATable() {
        Toml toml = Toml.read("oldName = \"a\"\n\n[wso2.http1]\nother = 1\n", "Config.toml");
        UserFacingException refused = Assert.expectThrows(UserFacingException.class,
                () -> ConfigTomlKeys.renameKey(toml, MODULE, "oldName", "wso2"));
        Assert.assertTrue(refused.getMessage().contains("already has a table named 'wso2'"));
    }

    @Test
    public void refusesTheNewNameInAFileWithoutTheOldOne() {
        Toml toml = Toml.read("salesforceToken = \"test\"\n", "Config.toml");
        Assert.expectThrows(UserFacingException.class,
                () -> ConfigTomlKeys.renameKey(toml, MODULE, "sfToken", "salesforceToken"));
    }

    @Test
    public void refusesAConfigTomlWithSyntaxErrors() {
        Toml toml = Toml.read("sfToken = \"abc\"\nbroken = \n", "Config.toml");
        UserFacingException refused = Assert.expectThrows(UserFacingException.class,
                () -> ConfigTomlKeys.parsed(toml, Path.of("project", "Config.toml")));
        Assert.assertTrue(refused.getMessage().startsWith("Config.toml has syntax errors"));
        Toml valid = Toml.read("sfToken = \"abc\"\n", "Config.toml");
        Assert.assertSame(ConfigTomlKeys.parsed(valid, Path.of("project", "Config.toml")), valid);
    }

    @Test
    public void allowsTheNewNameInAnotherTable() {
        String config = "sfToken = \"abc\"\n\n[other.module]\nsalesforceToken = \"q\"\n";
        Assert.assertEquals(renamed(config, "sfToken", "salesforceToken"),
                "salesforceToken = \"abc\"\n\n[other.module]\nsalesforceToken = \"q\"\n");
    }

    @Test
    public void findsTheTableTheFormReads() {
        Toml toml = Toml.read("sfToken = 1\n\n[wso2.http1]\nsfToken = 2\n", "Config.toml");
        Assert.assertEquals(ConfigTomlKeys.tableOf(toml, MODULE, "sfToken").orElseThrow()
                .toMap().get("sfToken"), 2L);
    }
}
