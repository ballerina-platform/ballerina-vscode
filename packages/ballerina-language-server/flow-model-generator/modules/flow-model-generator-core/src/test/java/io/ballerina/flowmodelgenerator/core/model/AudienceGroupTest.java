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

package io.ballerina.flowmodelgenerator.core.model;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import io.ballerina.flowmodelgenerator.core.model.node.DurableAgentHumanTaskBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.HumanTaskBuilder;
import io.ballerina.flowmodelgenerator.core.utils.WorkflowUtil;
import org.testng.Assert;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Holds a form's audience sections to the module's grouping: who decides (the one section that asks for
 * anything, and only for the roles or the users — the omission the source generator refuses), and inside it,
 * collapsed, who may not and who administers. The form enforces the ask, so this pins what it is told.
 */
public class AudienceGroupTest {

    private static final Gson GSON = new Gson();

    @DataProvider(name = "audienceKeys")
    public Object[][] audienceKeys() {
        return new Object[][]{
                {WorkflowUtil.AudienceKeys.task(HumanTaskBuilder.USER_ROLES_KEY)},
                {WorkflowUtil.AudienceKeys.task(DurableAgentHumanTaskBuilder.USER_ROLES_KEY)},
                // The review forms name the same fields with a prefix; the grouping must not care.
                {new WorkflowUtil.AudienceKeys("retryUserRoles", "retryUsers", "retryExcludedUsers",
                        "retryExcludedRoles", "retryAdministratorRoles", "retryAdministratorUsers")}
        };
    }

    @Test(dataProvider = "audienceKeys")
    public void testGroupAudiencePlacesEachFieldInItsSection(WorkflowUtil.AudienceKeys keys) {
        List<String> audienceKeys = List.of(keys.roles(), keys.users(), keys.excludedUsers(), keys.excludedRoles(),
                keys.adminRoles(), keys.adminUsers());
        Map<String, Property> properties = new LinkedHashMap<>();
        for (String key : audienceKeys) {
            properties.put(key, property(true));
        }
        properties.put("taskName", property(false));

        WorkflowUtil.groupAudience(properties, "audience", keys);

        List<FormGroup> groups = WorkflowUtil.audienceGroups("audience", keys);
        Map<String, FormGroup> expected = Map.of(
                keys.roles(), groups.get(0), keys.users(), groups.get(0),
                keys.excludedUsers(), groups.get(1), keys.excludedRoles(), groups.get(1),
                keys.adminRoles(), groups.get(2), keys.adminUsers(), groups.get(2));
        for (String key : audienceKeys) {
            Property grouped = properties.get(key);
            Assert.assertEquals(grouped.metadata().data().get(FormGroup.DATA_KEY), expected.get(key), key);
            Assert.assertFalse(grouped.advanced(), key + " renders in its section, not the advanced options");
        }
        Property taskName = properties.get("taskName");
        Assert.assertTrue(taskName.metadata().data() == null
                || !taskName.metadata().data().containsKey(FormGroup.DATA_KEY));
        Assert.assertEquals(new ArrayList<>(properties.keySet()).subList(0, audienceKeys.size()), audienceKeys,
                "grouping keeps the property order");
    }

    @Test(dataProvider = "audienceKeys")
    public void testOnlyWhoDecidesAsksAndTheRestNestCollapsed(WorkflowUtil.AudienceKeys keys) {
        List<FormGroup> groups = WorkflowUtil.audienceGroups("audience", keys);
        Assert.assertEquals(groups.size(), 3);
        FormGroup deciders = groups.get(0);
        // Exactly the two fields either of which satisfies the source generator; the excluded and
        // administrator fields name nobody who may decide.
        Assert.assertEquals(deciders.requireAnyOf(), List.of(keys.roles(), keys.users()));
        Assert.assertFalse(deciders.collapsed(), "a section that must be filled in opens");
        Assert.assertNull(deciders.parent());
        Assert.assertEquals(deciders.label(), "Who decides");
        for (FormGroup nested : groups.subList(1, 3)) {
            Assert.assertEquals(nested.requireAnyOf(), List.of(), nested.label() + " asks for nothing");
            Assert.assertTrue(nested.collapsed(), nested.label() + " stays out of the way");
            Assert.assertEquals(nested.parent(), deciders.id(), nested.label() + " renders inside Who decides");
        }
        Assert.assertEquals(groups.stream().map(FormGroup::id).distinct().count(), 3L);

        // The form reads the sections from the property's metadata, as serialized: a top-level section
        // carries no parent at all.
        JsonObject wire = JsonParser.parseString(GSON.toJson(deciders)).getAsJsonObject();
        Assert.assertEquals(wire.get("id").getAsString(), "audience-deciders");
        Assert.assertEquals(wire.getAsJsonArray("requireAnyOf").size(), 2);
        Assert.assertFalse(wire.has("parent"));
        Assert.assertEquals(JsonParser.parseString(GSON.toJson(groups.get(2))).getAsJsonObject()
                .get("parent").getAsString(), "audience-deciders");
    }

    @Test
    public void testSectionWithoutAnAskRequiresNothing() {
        FormGroup group = new FormGroup("x", "X", null, true, null);
        Assert.assertEquals(group.requireAnyOf(), List.of());
        Assert.assertNull(group.parent());
    }

    private static Property property(boolean advanced) {
        String json = "{\"metadata\": {\"label\": \"field\"}, \"optional\": true, \"editable\": true, "
                + "\"advanced\": " + advanced + ", \"value\": []}";
        return GSON.fromJson(json, Property.class);
    }
}
