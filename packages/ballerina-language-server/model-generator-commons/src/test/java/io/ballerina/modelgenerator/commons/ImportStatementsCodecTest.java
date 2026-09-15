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

import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Unit test for the {@code importStatements} string that carries a model's imports.
 *
 * <p>
 * This pair is the backward-compatibility contract: a qualifier rides in the existing comma-joined string as
 * {@code prefix=org/module}, and a bare {@code org/module} — which is everything the index holds today — still
 * parses. Neither may need an index rebuild, so both directions are pinned here.
 * </p>
 *
 * @since 1.9.0
 */
public class ImportStatementsCodecTest {

    private Map<String, String> imports(String... pairs) {
        Map<String, String> map = new LinkedHashMap<>();
        for (int i = 0; i < pairs.length; i += 2) {
            map.put(pairs[i], pairs[i + 1]);
        }
        return map;
    }

    // -------- the legacy shape still parses --------

    @Test
    public void testABareEntryTakesTheModulesNaturalPrefix() {
        Assert.assertEquals(CommonUtils.parseImportStatements("ballerinax/github"),
                imports("github", "ballerinax/github"));
    }

    @Test
    public void testABareDottedEntryTakesItsLastSegment() {
        Assert.assertEquals(CommonUtils.parseImportStatements("ballerinax/trigger.github"),
                imports("github", "ballerinax/trigger.github"));
    }

    @Test
    public void testTwoBareEntriesSharingASegmentDoNotDisplaceEachOther() {
        // The failure this whole change exists to prevent: one key, two modules, second write wins.
        Map<String, String> parsed =
                CommonUtils.parseImportStatements("ballerinax/github,ballerinax/trigger.github");

        Assert.assertEquals(parsed.size(), 2, "neither module may be lost");
        Assert.assertEquals(List.copyOf(parsed.values()),
                List.of("ballerinax/github", "ballerinax/trigger.github"));
        Assert.assertEquals(parsed.get("github"), "ballerinax/github",
                "the first claimant keeps the natural segment");
        Assert.assertEquals(parsed.get("triggerGithub"), "ballerinax/trigger.github");
    }

    @Test
    public void testAVersionTailIsKeptInTheValueAndIgnoredForThePrefix() {
        Assert.assertEquals(CommonUtils.parseImportStatements("ballerinax/github:5.1.0"),
                imports("github", "ballerinax/github:5.1.0"));
    }

    @Test
    public void testAnOrgLessEntryIsAModuleOfTheCurrentPackage() {
        Assert.assertEquals(CommonUtils.parseImportStatements("pkg.sub"), imports("sub", "pkg.sub"));
    }

    @Test
    public void testBlankAndNullParseToNothing() {
        Assert.assertTrue(CommonUtils.parseImportStatements(null).isEmpty());
        Assert.assertTrue(CommonUtils.parseImportStatements("   ").isEmpty());
        Assert.assertTrue(CommonUtils.parseImportStatements(",, ,").isEmpty());
    }

    // -------- the qualified shape --------

    @Test
    public void testAQualifiedEntryKeepsTheQualifierTheTextWasRenderedUnder() {
        Assert.assertEquals(CommonUtils.parseImportStatements("aiGoogleDrive=ballerinax/ai.google.drive"),
                imports("aiGoogleDrive", "ballerinax/ai.google.drive"));
    }

    @Test
    public void testAQualifierIsWrittenOutOnlyWhenItIsARename() {
        // An entry naming no colliding module keeps the shape it has always had, index included.
        Assert.assertEquals(CommonUtils.encodeImportStatements(imports("github", "ballerinax/github")),
                "ballerinax/github");
        Assert.assertEquals(
                CommonUtils.encodeImportStatements(imports("github2", "ballerinax/github")),
                "github2=ballerinax/github");
    }

    @Test
    public void testAnImplicitQualifierIsStillImplicitWithAVersionTail() {
        Assert.assertEquals(CommonUtils.encodeImportStatements(imports("github", "ballerinax/github:5.1.0")),
                "ballerinax/github:5.1.0");
    }

    @Test
    public void testEncodingNothingYieldsNull() {
        Assert.assertNull(CommonUtils.encodeImportStatements(null));
        Assert.assertNull(CommonUtils.encodeImportStatements(Map.of()));
    }

    // -------- round trip --------

    @Test
    public void testRoundTripPreservesEveryModuleAndItsQualifier() {
        Map<String, String> original = imports(
                "github", "ballerinax/github",
                "triggerGithub", "ballerinax/trigger.github",
                "http", "ballerina/http:2.10.0",
                "sub", "pkg.sub");

        Assert.assertEquals(CommonUtils.parseImportStatements(CommonUtils.encodeImportStatements(original)),
                original);
    }

    @Test
    public void testRoundTripSurvivesAnAliasThatIsNotDerivableFromTheModuleName() {
        // The case the encoding exists for: nothing about "ai.google.drive" yields "drive2", so the qualifier
        // has to travel with it.
        Map<String, String> original = imports(
                "drive", "ballerinax/googleapis.drive",
                "drive2", "ballerinax/ai.google.drive");

        String encoded = CommonUtils.encodeImportStatements(original);
        Assert.assertTrue(encoded.contains("drive2=ballerinax/ai.google.drive"), encoded);
        Assert.assertEquals(CommonUtils.parseImportStatements(encoded), original);
    }

    @Test
    public void testAMixOfBothShapesParses() {
        // What an older client, or a not-yet-rebuilt index, sends alongside a freshly rendered entry.
        Assert.assertEquals(
                CommonUtils.parseImportStatements("ballerinax/github,triggerGithub=ballerinax/trigger.github"),
                imports("github", "ballerinax/github", "triggerGithub", "ballerinax/trigger.github"));
    }
}
