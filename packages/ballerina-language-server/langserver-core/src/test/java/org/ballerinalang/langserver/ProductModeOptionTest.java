/*
 *  Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com) All Rights Reserved.
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
package org.ballerinalang.langserver;

import org.ballerinalang.langserver.commons.capability.InitializationOptions;
import org.testng.Assert;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

import java.util.HashMap;
import java.util.Map;

/**
 * Tests reading the client's product mode from the initialization options.
 */
public class ProductModeOptionTest {

    @DataProvider
    public Object[][] productModes() {
        return new Object[][]{
                {"agent-builder", true},
                {"integrator", false},
                {"ballerina", false},
                {null, false},
        };
    }

    @Test(dataProvider = "productModes")
    public void testAgentBuilderMode(String productMode, boolean expected) {
        Map<String, Object> options = new HashMap<>();
        if (productMode != null) {
            options.put(InitializationOptions.KEY_PRODUCT_MODE, productMode);
        }
        LSClientCapabilitiesImpl capabilities = new LSClientCapabilitiesImpl(null, null, null, options);
        Assert.assertEquals(capabilities.getInitializationOptions().isAgentBuilderMode(), expected);
    }
}
