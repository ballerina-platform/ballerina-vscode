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
 * Holds a task form's audience section to its contract: every audience field renders in it, and the section
 * itself asks for the roles or the users — the one omission the source generator refuses — in that refusal's
 * own words. The form enforces the ask, so this pins what it is told.
 */
public class AudienceGroupTest {

    private static final Gson GSON = new Gson();

    @DataProvider(name = "taskRoleKeys")
    public Object[][] taskRoleKeys() {
        return new Object[][]{{HumanTaskBuilder.USER_ROLES_KEY}, {DurableAgentHumanTaskBuilder.USER_ROLES_KEY}};
    }

    @Test(dataProvider = "taskRoleKeys")
    public void testGroupAudiencePlacesEveryAudienceField(String userRolesKey) {
        List<String> audienceKeys = new ArrayList<>();
        audienceKeys.add(userRolesKey);
        audienceKeys.addAll(WorkflowUtil.AUDIENCE_KEYS);
        Map<String, Property> properties = new LinkedHashMap<>();
        for (String key : audienceKeys) {
            properties.put(key, property(true));
        }
        properties.put("taskName", property(false));

        WorkflowUtil.groupAudience(properties, userRolesKey);

        FormGroup expected = WorkflowUtil.audienceGroup(userRolesKey);
        for (String key : audienceKeys) {
            Property grouped = properties.get(key);
            Assert.assertEquals(grouped.metadata().data().get(FormGroup.DATA_KEY), expected, key);
            Assert.assertFalse(grouped.advanced(), key + " renders in its section, not the advanced options");
        }
        Property taskName = properties.get("taskName");
        Assert.assertTrue(taskName.metadata().data() == null
                || !taskName.metadata().data().containsKey(FormGroup.DATA_KEY));
        Assert.assertEquals(new ArrayList<>(properties.keySet()).subList(0, audienceKeys.size()), audienceKeys,
                "grouping keeps the property order");
    }

    @Test(dataProvider = "taskRoleKeys")
    public void testSectionAsksForTheRolesOrTheUsers(String userRolesKey) {
        FormGroup group = WorkflowUtil.audienceGroup(userRolesKey);
        // Exactly the two fields either of which satisfies the source generator; the excluded and
        // administrator fields name nobody who may decide.
        Assert.assertEquals(group.requireAnyOf(), List.of(userRolesKey, WorkflowUtil.USERS_KEY));
        Assert.assertFalse(group.collapsed(), "a section that must be filled in opens");
        Assert.assertEquals(group.description(), WorkflowUtil.AUDIENCE_REQUIRED_MESSAGE,
                "the section says up front what the refusal would");

        // The form reads the section from the property's metadata, as serialized.
        JsonObject wire = JsonParser.parseString(GSON.toJson(group)).getAsJsonObject();
        Assert.assertEquals(wire.get("id").getAsString(), "audience");
        Assert.assertEquals(wire.getAsJsonArray("requireAnyOf").size(), 2);
    }

    @Test
    public void testSectionWithoutAnAskRequiresNothing() {
        Assert.assertEquals(new FormGroup("x", "X", null, true, null).requireAnyOf(), List.of());
    }

    private static Property property(boolean advanced) {
        String json = "{\"metadata\": {\"label\": \"field\"}, \"optional\": true, \"editable\": true, "
                + "\"advanced\": " + advanced + ", \"value\": []}";
        return GSON.fromJson(json, Property.class);
    }
}
