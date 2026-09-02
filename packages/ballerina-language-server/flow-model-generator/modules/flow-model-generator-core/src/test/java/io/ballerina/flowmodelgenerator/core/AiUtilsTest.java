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

import org.testng.Assert;
import org.testng.annotations.Test;

/**
 * Tests for {@link AiUtils}.
 *
 * @since 1.7.0
 */
public class AiUtilsTest {

    @Test(description = "Same patch: 1.11.1 vs 1.11.1 should be equal (0).")
    public void testCompareMajorMinor_samePatch() {
        Assert.assertEquals(AiUtils.compareMajorMinor("1.11.1", "1.11.1"), 0);
    }

    @Test(description = "Newer patch in entry: 1.11.1 vs 1.11.2 should be equal (0) — "
            + "same minor means the entry is compatible.")
    public void testCompareMajorMinor_newerPatchInEntry() {
        Assert.assertEquals(AiUtils.compareMajorMinor("1.11.1", "1.11.2"), 0);
    }

    @Test(description = "Older patch in entry: 1.11.2 vs 1.11.0 should be equal (0) — "
            + "both are the same minor.")
    public void testCompareMajorMinor_olderPatchInEntry() {
        Assert.assertEquals(AiUtils.compareMajorMinor("1.11.2", "1.11.0"), 0);
    }

    @Test(description = "Higher minor in entry: 1.11.1 vs 1.12.0 should be negative — "
            + "a 1.12.x module must not appear for a 1.11.x user.")
    public void testCompareMajorMinor_higherMinorInEntry() {
        Assert.assertTrue(AiUtils.compareMajorMinor("1.11.1", "1.12.0") < 0);
    }

    @Test(description = "Lower minor in entry: 1.11.1 vs 1.10.0 should be positive — "
            + "a 1.10.x module is always compatible with a 1.11.x user.")
    public void testCompareMajorMinor_lowerMinorInEntry() {
        Assert.assertTrue(AiUtils.compareMajorMinor("1.11.1", "1.10.0") > 0);
    }
}
