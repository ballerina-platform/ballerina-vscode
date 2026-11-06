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

package io.ballerina.servicemodelgenerator.extension.builder.service;

import io.ballerina.servicemodelgenerator.extension.model.Service;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.HashMap;
import java.util.Map;

/**
 * Tests that the Chat Agent Service wizard's plain names are written in source form: the base path in the service
 * declaration, and the agent variable the {@code chat} resource invokes, which must match the agent declaration.
 *
 * @since 1.7.0
 */
public class AiChatServiceSourceTest {

    @Test
    public void testBasePathIsWrittenInSourceForm() {
        Service service = service(Map.of("basePath", value("/ai-chat-agent"), "listener", value("chatAgentListener")));
        StringBuilder source = new StringBuilder();

        AbstractServiceBuilder.buildServiceNodeStr(service, source);

        Assert.assertEquals(source.toString(),
                "service /ai\\-chat\\-agent on chatAgentListener {" + System.lineSeparator());
    }

    @Test
    public void testAgentNameMatchesTheAgentDeclaration() {
        // The agent declaration writes the typed name through IdentifierUtil.escapeIfNeeded
        Assert.assertEquals(agentName("ai-chat-agent"), "ai\\-chat\\-agent");
        Assert.assertEquals(agentName("ai\\-chat\\-agent"), "ai\\-chat\\-agent");
        Assert.assertEquals(agentName("type"), "'type");
        Assert.assertEquals(agentName("supportAgent"), "supportAgent");
        Assert.assertEquals(agentName("1st"), "\\1st");
        Assert.assertEquals(agentName(" "), "chat");
        Assert.assertEquals(AiChatServiceBuilder.getAgentNameFromService(service(Map.of())), "chat");
    }

    private static String agentName(String typed) {
        return AiChatServiceBuilder.getAgentNameFromService(service(Map.of("agentName", value(typed))));
    }

    private static Service service(Map<String, Value> properties) {
        return new Service.ServiceModelBuilder()
                .setOrgName("ballerina")
                .setModuleName("ai")
                .setProperties(new HashMap<>(properties))
                .build();
    }

    private static Value value(String value) {
        return new Value.ValueBuilder().value(value).enabled(true).build();
    }
}
