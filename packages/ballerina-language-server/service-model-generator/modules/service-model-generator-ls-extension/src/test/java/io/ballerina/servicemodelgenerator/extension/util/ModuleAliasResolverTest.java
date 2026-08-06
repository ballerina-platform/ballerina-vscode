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
import io.ballerina.servicemodelgenerator.extension.model.Codedata;
import io.ballerina.servicemodelgenerator.extension.model.Function;
import io.ballerina.servicemodelgenerator.extension.model.Service;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import io.ballerina.tools.text.TextDocuments;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Unit test for {@link ModuleAliasResolver}: choosing a collision-free import prefix for a connector's
 * own module in a given file, and re-qualifying model-authored type text onto it.
 *
 * @since 1.9.0
 */
public class ModuleAliasResolverTest {

    private ModulePartNode rootOf(String source) {
        return (ModulePartNode) SyntaxTree.from(TextDocuments.from(source)).rootNode();
    }

    @Test
    public void testDottedModuleGetsCamelCaseAlias() {
        Assert.assertEquals(ModuleAliasResolver.defaultAlias("trigger.twilio"), "triggerTwilio");
        Assert.assertEquals(ModuleAliasResolver.defaultAlias("solace.jms"), "solaceJms");
        Assert.assertEquals(ModuleAliasResolver.defaultAlias("trigger.google.mail"), "triggerGoogleMail");
        Assert.assertEquals(ModuleAliasResolver.defaultAlias("kafka"), "kafka",
                "a single-segment module has no clash risk and is not aliased by default");
    }

    @Test
    public void testSelfPrefixIsTheModulesLastSegment() {
        Assert.assertEquals(ModuleAliasResolver.selfPrefix("trigger.twilio"), "twilio");
        Assert.assertEquals(ModuleAliasResolver.selfPrefix("kafka"), "kafka");
    }

    @Test
    public void testShadowedSingleSegmentModuleIsAliased() {
        // The reported edge case: `import ballerina/file as ftp;` binds the prefix `ftp` to a DIFFERENT
        // module, so adding an `ballerina/ftp` service must not emit a plain `import ballerina/ftp;` —
        // that would redeclare the prefix. It has to take a free one instead.
        String alias = ModuleAliasResolver.resolve(rootOf("import ballerina/file as ftp;\n"),
                "ballerina", "ftp", null);
        Assert.assertEquals(alias, "ftp2", "a shadowed natural prefix must be disambiguated");
    }

    @Test
    public void testUnshadowedSingleSegmentModuleKeepsNaturalPrefix() {
        // Regression guard: no conflict -> unchanged behaviour for every existing connector.
        Assert.assertEquals(ModuleAliasResolver.resolve(rootOf("import ballerina/io;\n"),
                "ballerina", "ftp", null), "ftp");
    }

    @Test
    public void testExistingImportPrefixWins() {
        // Whatever the file already binds the module to is authoritative — including a hand-edited alias
        // and including the unaliased case.
        Assert.assertEquals(ModuleAliasResolver.resolve(
                rootOf("import ballerinax/trigger.twilio as tw;\n"), "ballerinax", "trigger.twilio", null), "tw");
        Assert.assertEquals(ModuleAliasResolver.resolve(
                rootOf("import ballerinax/trigger.twilio;\n"), "ballerinax", "trigger.twilio", null), "twilio");
    }

    @Test
    public void testClaimedAliasIsSuffixed() {
        // Both the natural prefix (claimed by an unrelated import) and the generated fallback alias
        // (also claimed) are already taken, so only the final numeric-suffix step is left.
        Assert.assertEquals(ModuleAliasResolver.resolve(
                rootOf("import foo/bar as twilio;\nimport baz/qux as triggerTwilio;\n"),
                "ballerinax", "trigger.twilio", null),
                "triggerTwilio2");
    }

    @Test
    public void testUnclaimedNaturalPrefixNeedsNoFallbackAlias() {
        // The reported default-behaviour bug: a dotted module (trigger.github) must import and reference
        // itself under its bare natural prefix (github) when nothing in the file claims it, not under
        // the generated alias (triggerGithub) — that alias is a fallback for an actual collision, not
        // the default.
        Assert.assertEquals(ModuleAliasResolver.resolve(rootOf("\n"), "ballerinax", "trigger.github", null),
                "github");
        Assert.assertEquals(ModuleAliasResolver.resolve(rootOf("import ballerina/io;\n"),
                "ballerinax", "trigger.github", null), "github");
    }

    @Test
    public void testOverridePrefixIsPreferred() {
        Assert.assertEquals(ModuleAliasResolver.resolve(rootOf("\n"), "ballerinax", "trigger.twilio", "tw"), "tw");
    }

    @Test
    public void testContextResolvesSeveralModulesAndRequalifiesAllOfThem() {
        // MSSQL CDC spans two modules: its own `mssql` (listener type) and `ballerinax/cdc` (service
        // type + annotations). One context resolves both, and requalify maps each independently — the
        // shadowed one moves, the free one does not.
        ModulePrefixContext prefixes = ModulePrefixContext.from(
                rootOf("import ballerina/file as mssql;\n"));
        Assert.assertEquals(prefixes.prefixFor("ballerinax", "mssql"), "mssql2",
                "own module is shadowed by the aliased file import");
        Assert.assertEquals(prefixes.prefixFor("ballerinax", "cdc"), "cdc",
                "the auxiliary module's prefix is free and must be left alone");

        Assert.assertEquals(prefixes.requalify("mssql:CdcListener"), "mssql2:CdcListener");
        Assert.assertEquals(prefixes.requalify("cdc:Service"), "cdc:Service");
        Assert.assertEquals(prefixes.requalify("cdc:ChangeEvent|mssql:Config"), "cdc:ChangeEvent|mssql2:Config",
                "a single pass maps each module by its own resolved prefix");
        Assert.assertEquals(prefixes.pendingImports().get("ballerinax/mssql"), "mssql2",
                "a module the file lacks must be reported for import emission");
    }

    @Test
    public void testContextReusesExistingImportAndReportsNoPendingImport() {
        ModulePrefixContext prefixes = ModulePrefixContext.from(
                rootOf("import ballerinax/trigger.twilio as tw;\n"));
        Assert.assertEquals(prefixes.prefixFor("ballerinax", "trigger.twilio"), "tw");
        Assert.assertEquals(prefixes.requalify("@twilio:Config"), "@tw:Config",
                "annotation qualifiers resolve through the same map");
        Assert.assertFalse(prefixes.pendingImports().containsKey("ballerinax/trigger.twilio"),
                "an already-imported module needs no new import");
    }

    @Test
    public void testContextIsStableAcrossRepeatedLookups() {
        ModulePrefixContext prefixes = ModulePrefixContext.from(rootOf("import ballerinax/twilio;\n"));
        String first = prefixes.prefixFor("ballerinax", "trigger.twilio");
        Assert.assertEquals(prefixes.prefixFor("ballerinax", "trigger.twilio"), first,
                "resolving once means every later site gets the same answer");
        Assert.assertEquals(first, "triggerTwilio");
    }

    @Test
    public void testPrefixResolvesBackToItsRealModule() {
        // A prefix read out of source identifies a module only via the file's imports. Resolving it is
        // what lets a `@ftp2:ServiceConfig` attachment be matched to the model's `ftp` container instead
        // of being duplicated as a second `annot<Name>` property.
        Assert.assertEquals(Utils.moduleNameForPrefix(
                rootOf("import ballerina/ftp as ftp2;\n"), "ftp2").orElseThrow(), "ftp");

        // And the ambiguity that makes prefix-matching unsound in the first place: two different modules
        // both present as `ftp`, so only the import can say which one a prefix means.
        Assert.assertEquals(Utils.moduleNameForPrefix(
                rootOf("import ballerina/abc.ftp;\n"), "ftp").orElseThrow(), "abc.ftp");
        Assert.assertEquals(Utils.moduleNameForPrefix(
                rootOf("import ballerina/ftp;\n"), "ftp").orElseThrow(), "ftp");

        Assert.assertTrue(Utils.moduleNameForPrefix(rootOf("import ballerina/io;\n"), "ftp").isEmpty(),
                "an unbound prefix resolves to nothing");
    }

    @Test
    public void testServiceAnnotationPrefixResolvesAgainstTheFile() {
        // Regression test: the model stores the annotation's module IDENTITY (`ftp`), but source needs
        // the PREFIX that file binds it to (`ftp2`). Emitting the identity wrote `@ftp:ServiceConfig`
        // into a file where `ftp` is bound to ballerina/file — silently retargeting the annotation.
        Service service = serviceWithAnnotation("ftp", "ServiceConfig", "{path: \"/\"}");
        List<String> annots = Utils.getAnnotationEdits(service,
                rootOf("import ballerina/file as ftp;\nimport ballerina/ftp as ftp2;\n"));
        Assert.assertEquals(annots, List.of("@ftp2:ServiceConfig{path: \"/\"}"),
                "the annotation must follow the prefix its own module is bound to");
    }

    @Test
    public void testServiceAnnotationKeepsNaturalPrefixWhenUnaliased() {
        // Regression guard: nothing shadows `ftp`, so output is unchanged from before.
        Service service = serviceWithAnnotation("ftp", "ServiceConfig", "{path: \"/\"}");
        Assert.assertEquals(Utils.getAnnotationEdits(service, rootOf("import ballerina/ftp;\n")),
                List.of("@ftp:ServiceConfig{path: \"/\"}"));
        Assert.assertEquals(Utils.getAnnotationEdits(service, null),
                List.of("@ftp:ServiceConfig{path: \"/\"}"),
                "with no file context the natural prefix is the only available answer");
    }

    private Service serviceWithAnnotation(String moduleName, String originalName, String body) {
        Codedata codedata = new Codedata.Builder()
                .setType("SERVICE_ANNOTATION")
                .setOriginalName(originalName)
                .setModuleName(moduleName)
                .build();
        Value annotation = new Value.ValueBuilder()
                .setCodedata(codedata)
                .value(body)
                .enabled(true)
                .editable(true)
                .build();
        return new Service.ServiceModelBuilder()
                .setProperties(new LinkedHashMap<>(Map.of("serviceConfig", annotation)))
                .build();
    }

    @Test
    public void testQualifierWithModuleIdentityResolvesExactly() {
        ModulePrefixContext prefixes = ModulePrefixContext.from(
                rootOf("import ballerina/file as ftp;\nimport ballerina/ftp as ftp2;\n"));
        // Identity given -> resolved precisely, no reliance on the prefix at all.
        Assert.assertEquals(prefixes.prefixForQualifier("ballerina", "ftp", "ftp"), "ftp2");
        // No identity -> falls back to the bare prefix, which the registration above has made resolvable.
        Assert.assertEquals(prefixes.prefixForQualifier(null, null, "ftp"), "ftp2");
    }

    @Test
    public void testAmbiguousBarePrefixIsNeverGuessed() {
        // Two registered modules both present as `ftp`, so the bare prefix no longer identifies either.
        // Leaving the authored text alone is recoverable; silently retargeting it would not be.
        ModulePrefixContext prefixes = ModulePrefixContext.from(
                rootOf("import ballerina/file as ftp;\n"));
        prefixes.prefixFor("ballerina", "ftp");        // -> ftp2 (natural `ftp` is taken)
        prefixes.prefixFor("ballerina", "abc.ftp");    // -> also natural `ftp`, now ambiguous

        Assert.assertEquals(prefixes.prefixForQualifier(null, null, "ftp"), "ftp",
                "an ambiguous bare prefix must be left untouched");
        Assert.assertEquals(prefixes.requalify("ftp:DELETE"), "ftp:DELETE",
                "requalify must decline the same way");
        // Identity still resolves each of them unambiguously.
        Assert.assertEquals(prefixes.prefixForQualifier("ballerina", "ftp", "ftp"), "ftp2");
        Assert.assertEquals(prefixes.prefixForQualifier("ballerina", "abc.ftp", "ftp"),
                prefixes.prefixFor("ballerina", "abc.ftp"));
    }

    @Test
    public void testFunctionAnnotationPrefixResolvesAtRenderTime() {
        // The model keeps the module IDENTITY (`ftp`); the prefix is a property of the target file and is
        // resolved when rendering, rather than being written back into codedata.moduleName.
        Function function = functionWithAnnotation("ftp", "FunctionConfig", "{afterProcess: ftp2:DELETE}");
        Assert.assertEquals(
                Utils.getAnnotationEdits(function, new HashMap<>(),
                        rootOf("import ballerina/file as ftp;\nimport ballerina/ftp as ftp2;\n")),
                List.of("@ftp2:FunctionConfig{afterProcess: ftp2:DELETE}"));
        // Unaliased and no-file-context both keep the natural prefix: unchanged from before.
        Assert.assertEquals(Utils.getAnnotationEdits(function, new HashMap<>(), rootOf("import ballerina/ftp;\n")),
                List.of("@ftp:FunctionConfig{afterProcess: ftp2:DELETE}"));
        Assert.assertEquals(Utils.getAnnotationEdits(function, new HashMap<>()),
                List.of("@ftp:FunctionConfig{afterProcess: ftp2:DELETE}"));
    }

    private Function functionWithAnnotation(String moduleName, String originalName, String body) {
        Codedata codedata = new Codedata.Builder()
                .setType("ANNOTATION_ATTACHMENT")
                .setOriginalName(originalName)
                .setModuleName(moduleName)
                .build();
        Value annotation = new Value.ValueBuilder()
                .setCodedata(codedata)
                .value(body)
                .enabled(true)
                .editable(true)
                .build();
        Function function = new Function.FunctionBuilder().build();
        function.setProperties(new LinkedHashMap<>(Map.of("annotFunctionConfig", annotation)));
        return function;
    }

    @Test
    public void testRewriteOnlyTouchesStandaloneSelfQualifier() {
        Assert.assertEquals(ModuleAliasResolver.rewriteSelfPrefix(
                "twilio:CallStatusEventWrapper", "twilio", "triggerTwilio"),
                "triggerTwilio:CallStatusEventWrapper");
        Assert.assertEquals(ModuleAliasResolver.rewriteSelfPrefix(
                "int|twilio:Foo[]?", "twilio", "triggerTwilio"), "int|triggerTwilio:Foo[]?",
                "must reach union/array/nilable positions");
        Assert.assertEquals(ModuleAliasResolver.rewriteSelfPrefix(
                "@twilio:Config", "twilio", "triggerTwilio"), "@triggerTwilio:Config",
                "must reach an annotation qualifier");
        Assert.assertEquals(ModuleAliasResolver.rewriteSelfPrefix(
                "mytwilio:Foo", "twilio", "triggerTwilio"), "mytwilio:Foo",
                "a longer identifier is not a self-reference");
        Assert.assertEquals(ModuleAliasResolver.rewriteSelfPrefix(
                "http:Request", "twilio", "triggerTwilio"), "http:Request",
                "another module is untouched");
        Assert.assertEquals(ModuleAliasResolver.rewriteSelfPrefix(
                "twilioListener", "twilio", "triggerTwilio"), "twilioListener",
                "an identifier not followed by ':' is not a qualifier");
        Assert.assertEquals(ModuleAliasResolver.rewriteSelfPrefix(
                "twilio:Foo", "twilio", "twilio"), "twilio:Foo", "no-op when no aliasing is in effect");
    }
}
