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
import io.ballerina.servicemodelgenerator.extension.model.TriggerBasicInfo;
import io.ballerina.servicemodelgenerator.extension.model.TriggerProperty;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.Collection;
import java.util.Optional;

/**
 * Invariants over the shipped {@code trigger_properties.json} for the picker card's tooltip text
 * ({@link TriggerBasicInfo#documentation()}), on both resolution paths of
 * {@link ServiceModelGeneratorService#getTriggerBasicInfoByName(TriggerProperty)}: built straight from an
 * entry that carries {@code version}/{@code kind}, and the lookup fallback for an entry that doesn't.
 */
public class TriggerBasicInfoDescriptionTest {

    private final ServiceModelGeneratorService service = new ServiceModelGeneratorService();

    private static Collection<TriggerProperty> shippedEntries() {
        Collection<TriggerProperty> entries = TriggerPropertiesRegistry.getInstance().byId().values();
        Assert.assertFalse(entries.isEmpty(), "trigger_properties.json should not be empty");
        return entries;
    }

    /** The same entry without the scalars that let it skip the lookup, so it takes the fallback path. */
    private static TriggerProperty withoutVersionAndKind(TriggerProperty entry, String description) {
        return new TriggerProperty(entry.name(), entry.orgName(), entry.packageName(), entry.keywords(),
                entry.triggerName(), null, null, null, entry.minSupportedVersion(), description);
    }

    private static TriggerProperty withDescription(TriggerProperty entry, String description) {
        return new TriggerProperty(entry.name(), entry.orgName(), entry.packageName(), entry.keywords(),
                entry.triggerName(), entry.version(), entry.kind(), entry.triggerKind(),
                entry.minSupportedVersion(), description);
    }

    @Test(description = "Every entry with version/kind is shown with its own description, or none when unset.")
    public void testDirectEntriesUseTheirDescription() {
        int checked = 0;
        for (TriggerProperty entry : shippedEntries()) {
            if (entry.version() == null || (entry.kind() == null && entry.triggerKind() == null)) {
                continue;
            }
            String expected = entry.description() != null ? entry.description() : "";
            TriggerBasicInfo info = service.getTriggerBasicInfoByName(entry).orElseThrow();
            Assert.assertEquals(info.documentation(), expected, "Tooltip of " + entry.name());

            TriggerBasicInfo undescribed = service.getTriggerBasicInfoByName(withDescription(entry, null))
                    .orElseThrow();
            Assert.assertEquals(undescribed.documentation(), "",
                    "An entry not yet backfilled must fall back to an empty description: " + entry.name());
            checked++;
        }
        Assert.assertTrue(checked > 0, "Expected at least one entry carrying version/kind");
    }

    @Test(description = "On the lookup fallback, the entry's own name and description replace the looked-up "
            + "ones, and everything else is kept from the lookup.")
    public void testFallbackOverlaysEntryNameAndDescription() {
        int resolved = 0;
        for (TriggerProperty entry : shippedEntries()) {
            if (entry.triggerName() == null) {
                continue;
            }
            Optional<TriggerBasicInfo> original = service.getTriggerBasicInfoByName(entry.orgName(), entry.name());
            if (original.isEmpty()) {
                continue;
            }
            String description = "Tooltip for " + entry.name();
            TriggerBasicInfo info = service.getTriggerBasicInfoByName(withoutVersionAndKind(entry, description))
                    .orElseThrow();

            Assert.assertEquals(info.name(), entry.triggerName(), "Card title of " + entry.name());
            Assert.assertEquals(info.documentation(), description, "Tooltip of " + entry.name());
            Assert.assertEquals(info.id(), original.get().id());
            Assert.assertEquals(info.moduleName(), original.get().moduleName());
            Assert.assertEquals(info.version(), original.get().version());
            Assert.assertEquals(info.displayName(), original.get().displayName());
            Assert.assertEquals(info.icon(), original.get().icon());
            resolved++;
        }
        Assert.assertTrue(resolved > 0, "Expected at least one entry to resolve through the lookup fallback");
    }

    @Test(description = "On the lookup fallback, an entry without a description keeps the looked-up one.")
    public void testFallbackKeepsLookedUpDescriptionWhenUnset() {
        // Both real lookup sources send an empty description, so stub one that doesn't: otherwise an
        // entry that dropped the looked-up text would compare "" with "" and still pass.
        String lookedUp = "Looked-up description";
        ServiceModelGeneratorService stubbed = new ServiceModelGeneratorService() {
            @Override
            Optional<TriggerBasicInfo> getTriggerBasicInfoByName(String orgName, String name) {
                return Optional.of(new TriggerBasicInfo(1, name, orgName, name, name, "1.0.0", "event", name,
                        lookedUp, "", "", null));
            }
        };
        int checked = 0;
        for (TriggerProperty entry : shippedEntries()) {
            if (entry.triggerName() == null) {
                continue;
            }
            TriggerBasicInfo info = stubbed.getTriggerBasicInfoByName(withoutVersionAndKind(entry, null))
                    .orElseThrow();
            Assert.assertEquals(info.documentation(), lookedUp, "Tooltip of " + entry.name());
            checked++;
        }
        Assert.assertTrue(checked > 0, "Expected at least one entry with a card title");
    }
}
