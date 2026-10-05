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

package io.ballerina.servicemodelgenerator.extension;

import io.ballerina.servicemodelgenerator.extension.model.request.ServiceModelRequest;
import org.testng.Assert;
import org.testng.annotations.Test;

/**
 * Tests for {@link ServiceModelRequest}.
 *
 * @since 1.9.0
 */
public class ServiceModelRequestTest {

    @Test
    public void testWithVersionKeepsAgentFields() {
        ServiceModelRequest request = new ServiceModelRequest("main.bal", "ballerina", "ai", "ai", "", "1.13.0",
                false, "newsAgent", "ballerina", "durable", "orders", "ack");

        Assert.assertEquals(request.withVersion("1.15.0"), new ServiceModelRequest("main.bal", "ballerina", "ai",
                "ai", "", "1.15.0", false, "newsAgent", "ballerina", "durable", "orders", "ack"));
    }
}
