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

import io.ballerina.flowmodelgenerator.core.InstructionLoader;
import org.testng.Assert;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

import java.util.Optional;

/**
 * Unit tests for the InstructionLoader utility class.
 *
 * @since 1.7.0
 */
public class InstructionLoaderTest {

    @Test
    public void testLoadNonExistentInstruction() {
        // Test loading instruction for non-existent package
        Optional<String> instruction = InstructionLoader.loadLibraryInstruction("non/existent");
        Assert.assertFalse(instruction.isPresent(),
                "Instruction for non-existent package should not be present");
    }

    @Test
    public void testLoadTestInstructionForBallerina() {
        // ballerina/test is distribution-bundled with no docs/README.md or docs/Package.md, so its
        // guidance cannot ship through package documentation and stays bundled here.
        Optional<String> instruction = InstructionLoader.loadLibraryInstruction("ballerina/test");
        Assert.assertTrue(instruction.isPresent(), "Library instruction for ballerina/test should exist");
    }

    @Test(dataProvider = "packagesWithMigratedInstructions")
    public void testMigratedPackagesHaveNoBundledInstruction(String packageName) {
        Assert.assertFalse(InstructionLoader.loadLibraryInstruction(packageName).isPresent(),
                "Bundled library instruction should be gone for " + packageName);
        Assert.assertFalse(InstructionLoader.loadServiceInstruction(packageName).isPresent(),
                "Bundled service instruction should be gone for " + packageName);
    }

    @DataProvider(name = "packagesWithMigratedInstructions")
    public Object[][] packagesWithMigratedInstructions() {
        return new Object[][]{
                {"ballerina/ai"},
                {"ballerina/graphql"},
                {"ballerina/http"},
                {"ballerina/sql"},
                {"ballerina/workflow"},
                {"ballerinax/client.config"},
                {"ballerinax/mailchimp.transactional"}
        };
    }
}
