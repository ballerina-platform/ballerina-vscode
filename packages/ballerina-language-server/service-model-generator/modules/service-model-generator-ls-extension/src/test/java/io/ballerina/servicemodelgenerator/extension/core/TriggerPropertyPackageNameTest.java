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

package io.ballerina.servicemodelgenerator.extension.core;

import io.ballerina.servicemodelgenerator.extension.connector.TriggerPropertiesRegistry;
import io.ballerina.servicemodelgenerator.extension.model.TriggerProperty;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.Collection;
import java.util.List;

/**
 * Invariants for {@link TriggerProperty#effectivePackageName()}, the package a trigger's module is resolved and
 * upgraded by. A module usually is its package's default module (the dotted {@code googleapis.chat} included), so
 * an entry may leave {@code packageName} out; a submodule such as {@code mcp.v2} must name its package.
 */
public class TriggerPropertyPackageNameTest {

    private static TriggerProperty entry(String name, String packageName) {
        return new TriggerProperty(name, "ballerinax", packageName, List.of(), name, null, null, null, null, null);
    }

    @Test(description = "Every shipped entry resolves to a package: its stated packageName, else its module name.")
    public void testEveryShippedEntryResolvesAPackage() {
        Collection<TriggerProperty> entries = TriggerPropertiesRegistry.getInstance().byId().values();
        Assert.assertFalse(entries.isEmpty(), "trigger_properties.json should not be empty");
        for (TriggerProperty property : entries) {
            String expected = property.packageName() == null || property.packageName().isBlank()
                    ? property.name() : property.packageName();
            Assert.assertEquals(property.effectivePackageName(), expected, property.name());
            Assert.assertNotNull(property.effectivePackageName(), property.name() + " resolves no package");
        }
    }

    @Test(description = "A submodule entry resolves to its owning package, not to the module name.")
    public void testSubmoduleEntryResolvesItsOwningPackage() {
        TriggerProperty mcp = TriggerPropertiesRegistry.getInstance().forModule("ballerina", "mcp.v2").orElseThrow();
        Assert.assertEquals(mcp.effectivePackageName(), "mcp");
    }

    @Test(description = "An entry without packageName falls back to its module name, dotted names included.")
    public void testMissingPackageNameFallsBackToTheModuleName() {
        Assert.assertEquals(entry("googleapis.chat", null).effectivePackageName(), "googleapis.chat");
        Assert.assertEquals(entry("trigger.github", "  ").effectivePackageName(), "trigger.github");
        Assert.assertEquals(entry("kafka", "kafka").effectivePackageName(), "kafka");
    }
}
