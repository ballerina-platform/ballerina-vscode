/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { Icon } from "@wso2/ui-toolkit";
import {
    Column,
    Container,
    Description,
    INTEGRATION_AGENT_LABEL,
    OptionCard,
    OptionDescription,
    OptionHeader,
    OptionIcon,
    OptionTitle,
    REMOTE_AGENT_LABEL,
} from "./AddTool";

interface UseAgentOptionsProps {
    onUseIntegrationAgent: () => void;
    onUseA2aAgent: () => void;
}

/** Use Agent: the two kinds of agent a tool can hand off to, as the same cards Add Tool shows. */
export function UseAgentOptions({ onUseIntegrationAgent, onUseA2aAgent }: UseAgentOptionsProps): JSX.Element {
    return (
        <Container>
            <Description>
                Choose the agent this agent hands off requests to:
            </Description>

            <Column>
                <OptionCard onClick={onUseIntegrationAgent}>
                    <OptionHeader>
                        <OptionIcon>
                            <Icon name="bi-ai-agent" />
                        </OptionIcon>
                        <OptionTitle>{INTEGRATION_AGENT_LABEL}</OptionTitle>
                    </OptionHeader>
                    <OptionDescription>
                        Delegate to another agent in your integration. It is wrapped as a tool, so this
                        agent can hand off requests and use the response.
                    </OptionDescription>
                </OptionCard>

                <OptionCard onClick={onUseA2aAgent}>
                    <OptionHeader>
                        <OptionIcon>
                            <Icon name="bi-ai-agent" />
                        </OptionIcon>
                        <OptionTitle>{REMOTE_AGENT_LABEL}</OptionTitle>
                    </OptionHeader>
                    <OptionDescription>
                        Call an agent that runs anywhere, built with any framework, over the A2A protocol.
                        It is added as one tool, and the conversation is kept for you.
                    </OptionDescription>
                </OptionCard>
            </Column>
        </Container>
    );
}

export default UseAgentOptions;
