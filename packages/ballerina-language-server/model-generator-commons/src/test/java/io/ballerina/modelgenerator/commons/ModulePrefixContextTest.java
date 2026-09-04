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

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Unit test for {@link ModulePrefixContext}: classifying a module against the file's own module, resolving the
 * qualifiers a text was authored with, and emitting the imports still missing.
 *
 * @since 1.9.0
 */
public class ModulePrefixContextTest {

    private static final ModuleInfo CURRENT = new ModuleInfo("testorg", "test_pack", "test_pack", "0.1.0");

    private ModulePartNode rootOf(String source) {
        return (ModulePartNode) SyntaxTree.from(TextDocuments.from(source)).rootNode();
    }

    private Map<String, String> imports(String... pairs) {
        Map<String, String> map = new LinkedHashMap<>();
        for (int i = 0; i < pairs.length; i += 2) {
            map.put(pairs[i], pairs[i + 1]);
        }
        return map;
    }

    // -------- classification --------

    @Test
    public void testOwnModuleNeedsNoPrefixAndClaimsNothing() {
        ModulePrefixContext context = ModulePrefixContext.from(rootOf(""), CURRENT);

        Assert.assertEquals(context.prefixFor("testorg", "test_pack"), "",
                "a type of the file's own module carries no qualifier");
        Assert.assertTrue(context.pendingImportStatements().isEmpty(), "and needs no import");

        // The natural prefix must still be free for a genuinely external module of the same name.
        Assert.assertEquals(context.prefixFor("ballerinax", "test_pack"), "test_pack",
                "claiming a prefix for the own module would have pushed this one onto an alias");
    }

    @Test
    public void testTheThreeOriginsDifferInWhetherAnImportIsNeededAtAll() {
        // The file's own module: no import, and no qualifier either -- the type is directly in scope.
        // A sibling module of the same package: a different module, so it still needs an import.
        // Anything else: an import carrying the organization.
        ModulePrefixContext context = ModulePrefixContext.from(rootOf(""), CURRENT);

        Assert.assertEquals(context.prefixFor("testorg", "test_pack"), "", "own module -- no qualifier");
        Assert.assertEquals(context.prefixFor("testorg", "test_pack.sub"), "sub", "sibling -- qualified");
        Assert.assertEquals(context.prefixFor("ballerinax", "github"), "github", "external -- qualified");

        Assert.assertEquals(context.pendingImportStatements(),
                List.of("test_pack.sub", "ballerinax/github"),
                "only the own module is absent: a sibling module is still a separate module");
    }

    @Test
    public void testSamePackageModuleIsImportedWithoutOrganization() {
        ModulePrefixContext context = ModulePrefixContext.from(rootOf(""), CURRENT);

        Assert.assertEquals(context.prefixFor("testorg", "test_pack.sub"), "sub");
        Assert.assertEquals(context.pendingImportStatements(), List.of("test_pack.sub"),
                "a sibling module of the same package is imported without an organization");
    }

    @Test
    public void testSamePackageImportClaimsItsPrefixAgainstAnExternalModule() {
        ModulePrefixContext context = ModulePrefixContext.from(rootOf(""), CURRENT);

        Assert.assertEquals(context.prefixFor("testorg", "test_pack.github"), "github");
        Assert.assertEquals(context.prefixFor("ballerinax", "github"), "github2",
                "the org-less import already binds github, so the external module has to be aliased");
        Assert.assertEquals(context.pendingImportStatements(),
                List.of("test_pack.github", "ballerinax/github as github2"));
    }

    @Test
    public void testWithoutModuleInfoEverythingIsExternal() {
        ModulePrefixContext context = ModulePrefixContext.from(rootOf(""));

        Assert.assertEquals(context.prefixFor("testorg", "test_pack"), "test_pack",
                "with no file knowledge the own module cannot be recognised, which is today's behaviour");
    }

    // -------- pending imports --------

    @Test
    public void testPendingImportsKeepRegistrationOrder() {
        ModulePrefixContext context = ModulePrefixContext.from(rootOf(""), CURRENT);
        context.prefixFor("ballerinax", "zulip");
        context.prefixFor("ballerina", "http");
        context.prefixFor("ballerinax", "aws.s3");

        Assert.assertEquals(List.copyOf(context.pendingImports().keySet()),
                List.of("ballerinax/zulip", "ballerina/http", "ballerinax/aws.s3"));
        Assert.assertEquals(context.pendingImportStatements(),
                List.of("ballerinax/zulip", "ballerina/http", "ballerinax/aws.s3"));
    }

    @Test
    public void testAnImportAlreadyInTheFileIsNotPending() {
        ModulePrefixContext context =
                ModulePrefixContext.from(rootOf("import ballerinax/github as gh;"), CURRENT);

        Assert.assertEquals(context.prefixFor("ballerinax", "github"), "gh",
                "the alias the file already committed to wins outright");
        Assert.assertTrue(context.pendingImportStatements().isEmpty());
    }

    @Test
    public void testCollidingModulesEachGetADistinctPrefix() {
        ModulePrefixContext context = ModulePrefixContext.from(rootOf(""), CURRENT);

        Assert.assertEquals(context.prefixFor("ballerinax", "github"), "github");
        Assert.assertEquals(context.prefixFor("ballerinax", "trigger.github"), "triggerGithub");
        Assert.assertEquals(context.pendingImportStatements(),
                List.of("ballerinax/github", "ballerinax/trigger.github as triggerGithub"));
    }

    // -------- requalifyAuthored --------

    @Test
    public void testTwoTextsAuthoredAgainstOneQualifierForDifferentModules() {
        ModulePrefixContext context = ModulePrefixContext.from(rootOf(""), CURRENT);

        String first = context.requalifyAuthored("github:ReactionRollup",
                imports("github", "ballerinax/github:5.1.0"));
        String second = context.requalifyAuthored("github:ListenerConfig",
                imports("github", "ballerinax/trigger.github:0.11.0"));

        Assert.assertEquals(first, "github:ReactionRollup");
        Assert.assertEquals(second, "triggerGithub:ListenerConfig",
                "the second module is aliased and its text is rewritten to match");
        Assert.assertEquals(context.pendingImportStatements(),
                List.of("ballerinax/github", "ballerinax/trigger.github as triggerGithub"));
    }

    @Test
    public void testAmbiguousNaturalDoesNotSuppressThePerTextMapKey() {
        // ambiguousNaturals ends up holding "github", but the map key is the identity channel and it is scoped
        // to one text, so it must still drive the rewrite. Reads as if the guard should have killed it.
        ModulePrefixContext context = ModulePrefixContext.from(rootOf(""), CURRENT);
        context.requalifyAuthored("github:Client", imports("github", "ballerinax/github:5.1.0"));

        Assert.assertEquals(context.requalifyAuthored("github:ListenerConfig",
                imports("github", "ballerinax/trigger.github:0.11.0")), "triggerGithub:ListenerConfig");
    }

    @Test
    public void testTypeNameKeyStillRegistersTheModuleAndLeavesMatchingTextAlone() {
        // TypeTransformer can key a member's imports by the type name rather than the qualifier.
        ModulePrefixContext context = ModulePrefixContext.from(rootOf(""), CURRENT);

        Assert.assertEquals(context.requalifyAuthored("time:Utc", imports("Utc", "ballerina/time:2.0.0")),
                "time:Utc", "the natural prefix is free, so nothing needs rewriting");
        Assert.assertEquals(context.pendingImportStatements(), List.of("ballerina/time"),
                "the module is registered regardless of what the key was called");
    }

    @Test
    public void testTypeNameKeyIsRewrittenUnderTheNaturalPrefixWhenTheModuleIsAliased() {
        // The case the dual-key exists for: without it the import says "as time2" while the text still says
        // "time:Utc", which is a silent mis-binding rather than a compile error.
        ModulePrefixContext context =
                ModulePrefixContext.from(rootOf("import myorg/time;"), CURRENT);

        Assert.assertEquals(context.requalifyAuthored("time:Utc", imports("Utc", "ballerina/time:2.0.0")),
                "time2:Utc");
        Assert.assertEquals(context.pendingImportStatements(), List.of("ballerina/time as time2"));
    }

    @Test
    public void testStaleEntryRegistersItsModuleWithoutTouchingUnqualifiedText() {
        // A union arm inherits earlier arms' imports through the shared MemberBuilder, so an entry can name a
        // module the text never mentions. The import still has to be emitted, as it is today.
        ModulePrefixContext context = ModulePrefixContext.from(rootOf(""), CURRENT);

        Assert.assertEquals(context.requalifyAuthored("City", imports("Utc", "ballerina/time:2.0.0")), "City");
        Assert.assertEquals(context.pendingImportStatements(), List.of("ballerina/time"));
    }

    @Test
    public void testAnOrgLessEntryNamingTheFilesOwnModuleIsNotSelfImported() {
        // An imports-map entry with no organization is current-package data. Classifying it as external would
        // register the file's own module and emit `import test_pack;` into test_pack itself.
        ModulePrefixContext context = ModulePrefixContext.from(rootOf(""), CURRENT);

        Assert.assertEquals(context.requalifyAuthored("Person", imports("test_pack", "test_pack")), "Person");
        Assert.assertTrue(context.pendingImportStatements().isEmpty(), "a module needs no import into itself");
    }

    @Test
    public void testAnOrgLessEntryNamingASiblingModuleStillImportsIt() {
        // The neighbouring case, to show the normalisation did not swallow it: a sibling module is a different
        // module and still needs its import.
        ModulePrefixContext context = ModulePrefixContext.from(rootOf(""), CURRENT);

        Assert.assertEquals(context.requalifyAuthored("sub:Person", imports("sub", "test_pack.sub")),
                "sub:Person");
        Assert.assertEquals(context.pendingImportStatements(), List.of("test_pack.sub"));
    }

    @Test
    public void testOwnModuleEntryIsNotMappedOntoAnEmptyQualifier() {
        ModulePrefixContext context = ModulePrefixContext.from(rootOf(""), CURRENT);

        Assert.assertEquals(context.requalifyAuthored("test_pack:Person",
                imports("test_pack", "testorg/test_pack:0.1.0")), "test_pack:Person",
                "rewriting onto the empty prefix would have produced \":Person\"");
        Assert.assertTrue(context.pendingImportStatements().isEmpty());
    }

    @Test
    public void testOrgLessImportStatementDoesNotLeakALeadingSlash() {
        // CommonUtils.getImportStatements emits a bare, org-less entry for a module of the current package, so the
        // composite key it registers under starts with "/". Emitting that key verbatim yields "import /pkg.sub;",
        // which does not parse -- every diagnostic from such a probe would be an artefact of the probe.
        ModulePrefixContext context = ModulePrefixContext.from(rootOf(""));
        context.requalifyAuthored("sub:Person", imports("sub", "pkg.sub"));

        Assert.assertEquals(List.copyOf(context.pendingImports().keySet()), List.of("/pkg.sub"),
                "the key is composite and is not an import signature on its own");
        Assert.assertEquals(context.pendingImportStatements(), List.of("pkg.sub"),
                "the statement drops the empty organization");
    }

    /** A package literally named {@code ai}, so that {@code import ai.google;} is its own submodule. */
    private static final ModuleInfo AI_PACKAGE = new ModuleInfo("testorg", "ai", "ai", "0.1.0");

    @Test
    public void testAnOrgLessImportDoesNotStandInForAForeignModule() {
        // Package "ai" imports its own submodule org-lessly, which is one of the two spellings Ballerina allows
        // for a same-package import. ballerinax/ai.google is a different module that happens to share that dotted
        // name. Matching the local import against it would emit no import and render "google:", binding the
        // reference to the local module -- a silent mis-binding, worse than the redeclared-symbol error.
        ModulePrefixContext context = ModulePrefixContext.from(rootOf("import ai.google;"), AI_PACKAGE);

        Assert.assertEquals(context.prefixFor("ballerinax", "ai.google"), "aiGoogle",
                "the foreign module has to be aliased, since google is taken by the local import");
        Assert.assertEquals(context.pendingImportStatements(), List.of("ballerinax/ai.google as aiGoogle"));
    }

    @Test
    public void testAnOrgLessImportStillMatchesTheFilesOwnPackage() {
        // The tolerance itself must survive: the model records a same-package module WITH the organization, while
        // the file may write its import without one. Both spellings name the same module.
        ModulePrefixContext context = ModulePrefixContext.from(rootOf("import ai.google as g;"), AI_PACKAGE);

        Assert.assertEquals(context.prefixFor("testorg", "ai.google"), "g",
                "the alias the file already committed to still wins");
        Assert.assertTrue(context.pendingImportStatements().isEmpty());
    }

    @Test
    public void testSamePackageImportWrittenWithItsOrganizationAlsoMatches() {
        // The other spelling: the file writes the organization out in full for its own submodule.
        ModulePrefixContext context =
                ModulePrefixContext.from(rootOf("import testorg/ai.google as g;"), AI_PACKAGE);

        Assert.assertEquals(context.prefixFor("testorg", "ai.google"), "g");
        Assert.assertTrue(context.pendingImportStatements().isEmpty());
    }

    @Test
    public void testForeignModuleIsUnaffectedByAnOrgFulSamePackageImport() {
        // With the organization written out there is no ambiguity to resolve, and the foreign module is still
        // aliased because the local import holds the natural prefix.
        ModulePrefixContext context =
                ModulePrefixContext.from(rootOf("import testorg/ai.google;"), AI_PACKAGE);

        Assert.assertEquals(context.prefixFor("ballerinax", "ai.google"), "aiGoogle");
        Assert.assertEquals(context.pendingImportStatements(), List.of("ballerinax/ai.google as aiGoogle"));
    }

    // -------- requalifyAuthoredValue: a value is not a type descriptor --------

    /** A context where ballerinax/github must become github2, because the file already binds github. */
    private ModulePrefixContext aliasingContext() {
        return ModulePrefixContext.from(rootOf("import ballerinax/trigger.github;"), CURRENT);
    }

    @Test
    public void testAValueLeavesAStringLiteralAlone() {
        Assert.assertEquals(aliasingContext().requalifyAuthoredValue("\"github://host\"",
                imports("github", "ballerinax/github:5.1.0")), "\"github://host\"",
                "a URL scheme inside a string literal is not a module qualifier");
    }

    @Test
    public void testAValueLeavesAMappingFieldKeyAlone() {
        Assert.assertEquals(aliasingContext().requalifyAuthoredValue("{github: 1}",
                imports("github", "ballerinax/github:5.1.0")), "{github: 1}",
                "a mapping-constructor key is not a module qualifier");
    }

    @Test
    public void testAValueRewritesARealQualifier() {
        Assert.assertEquals(aliasingContext().requalifyAuthoredValue("github:SOME_CONST",
                imports("github", "ballerinax/github:5.1.0")), "github2:SOME_CONST");
    }

    @Test
    public void testAValueRewritesOnlyTheQualifierAmongAllThreePositions() {
        Assert.assertEquals(aliasingContext().requalifyAuthoredValue(
                "{url: \"github://h\", github: 1, kind: github:K}",
                imports("github", "ballerinax/github:5.1.0")),
                "{url: \"github://h\", github: 1, kind: github2:K}",
                "the string literal and the field key are left as authored; only the reference moves");
    }

    @Test
    public void testAUrlStringConcatenatedWithACallOnTheSameModule() {
        // The same four characters twice: once inside a string literal, once as a real qualifier. The parser puts
        // only the second in a QualifiedNameReferenceNode, so only the second moves.
        ModulePrefixContext context =
                ModulePrefixContext.from(rootOf("import myorg/http;"), CURRENT);

        Assert.assertEquals(context.requalifyAuthoredValue(
                "\"http://localhost:5005\" + http:someFunc()",
                imports("http", "ballerina/http:2.10.0")),
                "\"http://localhost:5005\" + http2:someFunc()");
    }

    @Test
    public void testAValueThatDoesNotParseFallsBackToTheTextualRewrite() {
        // Already-malformed source: falling back keeps this no worse than the previous behaviour.
        Assert.assertEquals(aliasingContext().requalifyAuthoredValue("github:foo(",
                imports("github", "ballerinax/github:5.1.0")), "github2:foo(");
    }

    @Test
    public void testAValueIsUntouchedWhenNoModuleWasAliased() {
        // Nothing collides here, so github keeps its natural prefix and no rewrite happens at all.
        ModulePrefixContext context = ModulePrefixContext.from(rootOf(""), CURRENT);

        Assert.assertEquals(context.requalifyAuthoredValue("{github: 1, kind: github:K}",
                imports("github", "ballerinax/github:5.1.0")), "{github: 1, kind: github:K}");
    }

    @Test
    public void testATypeStillUsesTheTextualRewrite() {
        // Every `identifier:` in a type descriptor is a qualifier, so the type path is unchanged.
        Assert.assertEquals(aliasingContext().requalifyAuthored("github:Client|github:Error",
                imports("github", "ballerinax/github:5.1.0")), "github2:Client|github2:Error");
    }

    @Test
    public void testAnEmptyImportsMapLeavesTextAlone() {
        ModulePrefixContext context = ModulePrefixContext.from(rootOf(""), CURRENT);

        Assert.assertEquals(context.requalifyAuthored("string", Map.of()), "string");
        Assert.assertEquals(context.requalifyAuthored("github:Client", null), "github:Client");
    }
}
