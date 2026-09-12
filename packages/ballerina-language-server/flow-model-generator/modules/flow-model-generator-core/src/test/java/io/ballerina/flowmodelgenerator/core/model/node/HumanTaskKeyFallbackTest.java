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

package io.ballerina.flowmodelgenerator.core.model.node;

import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.utils.FlowNodeUtil;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Tests for the one rule {@link HumanTaskBuilder} uses to find a parameter's property: the plain key
 * when the fallback form built it, else the reserved-escaped key the signature-derived form uses
 * ({@code description} lands under {@code $description}). The relabel pass and source generation both
 * go through it, so a Description typed under either spelling is labelled and written.
 *
 * @since 1.7.0
 */
public class HumanTaskKeyFallbackTest {

    private static final String ESCAPED_DESCRIPTION = FlowNodeUtil.getPropertyKey(HumanTaskBuilder.DESCRIPTION_KEY);

    @Test(description = "The plain key wins when present; the escaped key is the fallback; an absent key resolves "
            + "to its escaped form so the caller's lookup simply finds nothing")
    public void testPresentKey() {
        Map<String, Property> plain = new LinkedHashMap<>();
        plain.put(HumanTaskBuilder.DESCRIPTION_KEY, property("\"plain\""));
        Assert.assertEquals(HumanTaskBuilder.presentKey(plain, HumanTaskBuilder.DESCRIPTION_KEY),
                HumanTaskBuilder.DESCRIPTION_KEY);

        Map<String, Property> escaped = new LinkedHashMap<>();
        escaped.put(ESCAPED_DESCRIPTION, property("\"escaped\""));
        Assert.assertEquals(HumanTaskBuilder.presentKey(escaped, HumanTaskBuilder.DESCRIPTION_KEY),
                ESCAPED_DESCRIPTION);

        Assert.assertNotEquals(ESCAPED_DESCRIPTION, HumanTaskBuilder.DESCRIPTION_KEY,
                "the test only means something if the two spellings differ");
        // An absent key resolves to its escaped form, so the caller's lookup simply finds nothing.
        // Assert on presentKey's own return: a get() against an empty map is null for every key,
        // so it would pass whatever presentKey returned.
        Assert.assertEquals(HumanTaskBuilder.presentKey(new LinkedHashMap<>(), HumanTaskBuilder.DESCRIPTION_KEY),
                ESCAPED_DESCRIPTION);
    }

    @Test(description = "The relabel pass reaches the Description under either spelling and keeps its value")
    public void testRelabelUnderBothSpellings() {
        for (String key : new String[]{HumanTaskBuilder.DESCRIPTION_KEY, ESCAPED_DESCRIPTION}) {
            Map<String, Property> properties = new LinkedHashMap<>();
            properties.put(HumanTaskBuilder.TASK_NAME_KEY, property("\"approve\""));
            properties.put(key, property("\"Please review\""));

            HumanTaskBuilder.relabelHumanTaskFormProperties(properties);

            Property description = properties.get(key);
            Assert.assertNotNull(description, "relabelling must not move the property away from " + key);
            Assert.assertEquals(description.value(), "\"Please review\"");
            Assert.assertEquals(description.metadata().label(), "Description");
        }
    }

    private static Property property(String value) {
        return new Property.Builder<Void>(null)
                .metadata().label("compiler-derived").description("compiler-derived").stepOut()
                .value(value)
                .editable(true)
                .build();
    }
}
