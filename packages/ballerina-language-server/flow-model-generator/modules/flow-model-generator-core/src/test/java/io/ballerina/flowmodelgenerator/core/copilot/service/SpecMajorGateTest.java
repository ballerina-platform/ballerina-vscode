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

package io.ballerina.flowmodelgenerator.core.copilot.service;

import org.testng.Assert;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

/**
 * Pins {@link TriggerSchemaServiceLoader#supportsSpecMajor}: which declared spec versions this build will
 * read, and which it refuses rather than misreads.
 *
 * <p>The gate is deliberately narrow. Refusing a document costs the library its whole catalog and suppresses
 * the service-index fallback, so it fires only on a version that is both parseable and a major this build
 * does not implement. Anything it cannot interpret is read, on the reasoning that an unreadable version
 * string says nothing about structure.
 *
 * @since 1.7.0
 */
public class SpecMajorGateTest {

    @DataProvider(name = "versions")
    public Object[][] versions() {
        return new Object[][]{
                // The whole corpus, and the reason the gate is invisible today.
                {"v1.0", true, "every bundled document declares this"},
                // Minor is additive, so a newer minor of the implemented major is still readable.
                {"v1.1", true, "a minor is additive"},
                {"v1.12", true, "a two-digit minor is still a minor"},
                // A new major is structural. Reading it as v1 would emit confidently wrong prompt content.
                {"v2.0", false, "a new major is structural"},
                {"v10.0", false, "multi-digit majors are compared numerically, not lexically"},
                // Says nothing about structure -> read it rather than invent a failure mode.
                {null, true, "absent version"},
                {"", true, "empty version"},
                {"1.0", true, "no leading v, so not a version this gate recognises"},
                {"v1", true, "no minor, so not a version this gate recognises"},
                {"vNext", true, "unparseable"},
                {" v1.0 ", true, "surrounding whitespace is trimmed"},
        };
    }

    @Test(dataProvider = "versions")
    public void testSpecMajorGate(String version, boolean readable, String why) {
        Assert.assertEquals(TriggerSchemaServiceLoader.supportsSpecMajor(version), readable, why);
    }

    /**
     * A guard on the constant itself: the corpus is authored at v1, so raising the implemented major
     * without re-authoring the 32 bundled documents would silently refuse every one of them.
     */
    @Test
    public void testTheImplementedMajorStillMatchesTheCorpus() {
        Assert.assertTrue(TriggerSchemaServiceLoader.supportsSpecMajor("v1.0"),
                "the bundled corpus is authored at v1.0; if this fails, the documents must be migrated"
                        + " before SUPPORTED_SPEC_MAJOR is raised");
    }
}
