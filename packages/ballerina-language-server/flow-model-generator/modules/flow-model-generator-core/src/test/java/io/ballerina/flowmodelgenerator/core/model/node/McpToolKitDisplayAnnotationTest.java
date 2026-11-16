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

import org.testng.Assert;
import org.testng.annotations.Test;

/**
 * The {@code @display} annotation written on a generated MCP toolkit class from what its server advertises.
 *
 * @since 2.0.0
 */
public class McpToolKitDisplayAnnotationTest {

    private static final String NL = System.lineSeparator();

    @Test
    public void omittedWhenServerStatesNothing() {
        Assert.assertEquals(McpToolKitBuilder.displayAnnotation(null, null), "");
    }

    @Test
    public void carriesLabelAndIcon() {
        Assert.assertEquals(McpToolKitBuilder.displayAnnotation("DeepWiki", "https://x.dev/icon.svg"),
                "@display {label: \"DeepWiki\", iconPath: \"https://x.dev/icon.svg\"}" + NL);
    }

    @Test
    public void labelIsRequiredByDisplay() {
        Assert.assertEquals(McpToolKitBuilder.displayAnnotation(null, "https://x.dev/icon.svg"),
                "@display {label: \"\", iconPath: \"https://x.dev/icon.svg\"}" + NL);
    }

    @Test
    public void escapesWhatTheServerSends() {
        Assert.assertEquals(McpToolKitBuilder.displayAnnotation("Say \"hi\"\\now\n", null),
                "@display {label: \"Say \\\"hi\\\"\\\\now\\n\"}" + NL);
    }
}
