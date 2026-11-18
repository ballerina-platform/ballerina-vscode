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

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import io.ballerina.servicemodelgenerator.extension.connector.TriggerPropertiesRegistry;
import io.ballerina.servicemodelgenerator.extension.model.TriggerProperty;
import org.testng.Assert;
import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The Choreo Agent Manager card in {@code trigger_properties.json}. Central serves a package's icon at a URL that
 * names the package version it was published with, so an icon URL left on a version that was never published with
 * an icon renders as a broken image on the card.
 */
public class AgentManagerTriggerPropertyTest {

    private static final Pattern CENTRAL_ICON =
            Pattern.compile("https://bcentral-packageicons\\.azureedge\\.net/images/([^_]+)_(.+)_([^_]+)\\.png");

    private JsonObject entries;

    @BeforeClass
    public void loadEntries() throws IOException {
        try (InputStream in = TriggerPropertiesRegistry.class.getClassLoader()
                .getResourceAsStream("trigger_properties.json")) {
            entries = JsonParser.parseReader(new InputStreamReader(Objects.requireNonNull(in),
                    StandardCharsets.UTF_8)).getAsJsonObject();
        }
    }

    @Test(description = "The Agent Manager card shows the icon of the amp version it pulls.")
    public void testAgentManagerIconMatchesItsVersion() {
        TriggerProperty amp = TriggerPropertiesRegistry.getInstance().forModule("ballerinax", "amp").orElseThrow();
        String id = TriggerPropertiesRegistry.getInstance().byId().entrySet().stream()
                .filter(entry -> entry.getValue() == amp).map(Map.Entry::getKey).findFirst().orElseThrow();

        Matcher icon = CENTRAL_ICON.matcher(entries.getAsJsonObject(id).get("icon").getAsString());
        Assert.assertTrue(icon.matches(), "the icon should be the one Central serves for the package");
        Assert.assertEquals(icon.group(1) + "/" + icon.group(2), "ballerinax/amp");
        Assert.assertEquals(icon.group(3), amp.version(),
                "Central serves an icon per published version, and amp 1.2.0 was published without one");
    }

    @Test(description = "Choreo Agent Manager needs amp 1.2.1, the first release with its icon and one-listener form.")
    public void testAgentManagerPullsTheFirstChoreoRelease() {
        TriggerProperty amp = TriggerPropertiesRegistry.getInstance().forModule("ballerinax", "amp").orElseThrow();

        Assert.assertEquals(amp.version(), "1.2.1");
        Assert.assertEquals(amp.minSupportedVersion(), "1.2.1",
                "amp 1.2.0 has no Central icon and still offers an existing listener and a service path");
    }
}
