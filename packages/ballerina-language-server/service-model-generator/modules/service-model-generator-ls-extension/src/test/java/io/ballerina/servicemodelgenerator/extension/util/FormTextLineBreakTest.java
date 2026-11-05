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

package io.ballerina.servicemodelgenerator.extension.util;

import io.ballerina.servicemodelgenerator.extension.builder.service.agent.AgentTriggerChannel;
import org.testng.Assert;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

/**
 * Tests that form text is split on any line break, since a form sends "\n" on every OS.
 *
 * @since 1.9.0
 */
public class FormTextLineBreakTest {

    private static final String LS = System.lineSeparator();

    @DataProvider(name = "lineBreaks")
    public Object[][] lineBreaks() {
        return new Object[][]{{"\n"}, {"\r\n"}};
    }

    @Test(dataProvider = "lineBreaks")
    public void testMultiLineParamDescStaysOnOneDocLine(String lineBreak) {
        Assert.assertEquals(Utils.getFormattedParamDesc("The request." + lineBreak + "Keep it short.", "query"),
                "# + query - The request. Keep it short.");
    }

    @Test(dataProvider = "lineBreaks")
    public void testMultiLineReturnDescStaysOnOneDocLine(String lineBreak) {
        Assert.assertEquals(Utils.getFormattedReturnDesc("The response." + lineBreak + "Or an error."),
                "# + return - The response. Or an error.");
    }

    @Test(dataProvider = "lineBreaks")
    public void testIndentReachesEveryLine(String lineBreak) {
        Assert.assertEquals(AgentTriggerChannel.indent("do {" + lineBreak + "}"), "    do {" + LS + "    }");
    }
}
