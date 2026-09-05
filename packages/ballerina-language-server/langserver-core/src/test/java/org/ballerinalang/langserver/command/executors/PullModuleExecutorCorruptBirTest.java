/*
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package org.ballerinalang.langserver.command.executors;

import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.Optional;

/**
 * L1 tests for {@link PullModuleExecutor#detectCorruptBirCache(Throwable)}, the parser that turns a
 * compiler failure into a {@code projectService/corruptBirCache} notification payload. The compiler's
 * BIR reader throws with a fixed signature ("... invalid magic number ...") when a cached BIR is
 * corrupt/incompatible; these tests pin the detection contract so it survives refactors of the
 * surrounding pull flow and flags any drift in the error-message shape it depends on.
 */
public class PullModuleExecutorCorruptBirTest {

    private static final String CORRUPT_WITH_COORDINATES =
            "failed to load the module 'ballerina/ai:1.14.1' from its BIR due to: "
                    + "invalid magic number [99, 111, 114, 114]";

    @Test(description = "A nested corrupt-BIR cause is detected and its module coordinates extracted")
    public void testNestedCorruptBirWithCoordinates() {
        Throwable throwable = new RuntimeException("Pull modules failed",
                new IllegalStateException(CORRUPT_WITH_COORDINATES));

        Optional<CorruptBirCacheParams> result = PullModuleExecutor.detectCorruptBirCache(throwable);

        Assert.assertTrue(result.isPresent(), "Corrupt-BIR cause should be detected in the cause chain");
        CorruptBirCacheParams params = result.get();
        Assert.assertEquals(params.getOrg(), "ballerina");
        Assert.assertEquals(params.getName(), "ai");
        Assert.assertEquals(params.getVersion(), "1.14.1");
        // Detection only parses coordinates; the caller sets these before emitting the notification.
        Assert.assertNull(params.getProjectUri());
        Assert.assertNull(params.getDistVersion());
    }

    @Test(description = "A corrupt-BIR message without parseable coordinates is detected with null coordinates")
    public void testCorruptBirWithoutCoordinates() {
        Throwable throwable = new RuntimeException(
                "failed to read the cached BIR: invalid magic number [99, 111, 114, 114]");

        Optional<CorruptBirCacheParams> result = PullModuleExecutor.detectCorruptBirCache(throwable);

        Assert.assertTrue(result.isPresent(), "Corrupt-BIR failure should be detected even without coordinates");
        CorruptBirCacheParams params = result.get();
        Assert.assertNull(params.getOrg());
        Assert.assertNull(params.getName());
        Assert.assertNull(params.getVersion());
    }

    @Test(description = "A non-corrupt failure is not mistaken for a corrupt-BIR condition")
    public void testNonCorruptFailure() {
        Throwable throwable = new RuntimeException("Failed to pull modules: connection timed out");

        Optional<CorruptBirCacheParams> result = PullModuleExecutor.detectCorruptBirCache(throwable);

        Assert.assertTrue(result.isEmpty(), "A generic failure must not be reported as corrupt BIR");
    }

    @Test(description = "An 'invalid magic number' error unrelated to BIR is not treated as corrupt BIR")
    public void testInvalidMagicNumberWithoutBir() {
        Throwable throwable = new RuntimeException("invalid magic number in class file");

        Optional<CorruptBirCacheParams> result = PullModuleExecutor.detectCorruptBirCache(throwable);

        Assert.assertTrue(result.isEmpty(), "The BIR marker is required, not just 'invalid magic number'");
    }

    @Test(description = "Null and empty-chain throwables are handled without error")
    public void testNoCause() {
        Assert.assertTrue(PullModuleExecutor.detectCorruptBirCache(null).isEmpty());
        Assert.assertTrue(PullModuleExecutor.detectCorruptBirCache(new RuntimeException()).isEmpty());
    }
}
