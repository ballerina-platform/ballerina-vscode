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

import org.testng.Assert;
import org.testng.annotations.Test;

/**
 * Direct unit tests for {@link AiSourceUtils#agentDecisionResourceSource(String, String)}.
 *
 * @since 1.9.0
 */
public class AiSourceUtilsTest {

    @Test
    public void testObjectMethodOperatorGeneratesResumeVariableAndDotCall() {
        String source = AiSourceUtils.agentDecisionResourceSource("supportAgent", ".");

        Assert.assertTrue(source.contains("resource function post decision(@http:Payload ai:DecisionMessage request)"),
                "must declare the decision resource with the fixed accessor, name and payload type");
        Assert.assertTrue(source.contains("returns ai:ChatRespMessage|error"),
                "must declare the fixed return type");
        Assert.assertTrue(source.contains("ai:Resume resume = {decisions: request.decisions};"),
                "the ai:Resume value must be assigned to a local variable built from request.decisions");
        Assert.assertTrue(source.contains("check supportAgent.run(resume, request.sessionId)"),
                "an object-method agent must be invoked with '.', passing the resume variable and " +
                        "request.sessionId");
    }

    @Test
    public void testRemoteMethodOperatorGeneratesResumeVariableAndArrowCall() {
        String source = AiSourceUtils.agentDecisionResourceSource("supportAgent", "->");

        Assert.assertTrue(source.contains("ai:Resume resume = {decisions: request.decisions};"),
                "the ai:Resume value must be assigned to a local variable built from request.decisions " +
                        "regardless of the call operator");
        Assert.assertTrue(source.contains("check supportAgent->run(resume, request.sessionId)"),
                "a remote-method agent must be invoked with '->', passing the resume variable and " +
                        "request.sessionId");
    }
}
