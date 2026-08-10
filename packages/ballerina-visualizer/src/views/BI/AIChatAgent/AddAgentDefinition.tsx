/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { View, ViewContent } from "@wso2/ui-toolkit";
import styled from "@emotion/styled";
import { TitleBar } from "../../../components/TitleBar";
import { TopNavigationBar } from "../../../components/TopNavigationBar";
import { FormHeader } from "../../../components/FormHeader";
import { AgentDefinitionForm } from "./AgentDefinitionForm";

const Container = styled.div`
    display: flex;
    flex-direction: column;
    gap: 20px;
`;

const FormContainer = styled.div`
    display: flex;
    flex-direction: column;
    max-width: 600px;
    gap: 20px;
    padding: 0 16px;
`;

interface AddAgentDefinitionProps {
    projectPath: string;
}

export function AddAgentDefinition(props: AddAgentDefinitionProps) {
    const { projectPath } = props;
    return (
        <View>
            <TopNavigationBar projectPath={projectPath} />
            <TitleBar title="Agent Definition" subtitle="Create a reusable agent definition" />
            <ViewContent padding>
                <Container>
                    <FormHeader title="Create Agent Definition" subtitle="Define a reusable agent for your library" />
                    <FormContainer>
                        <AgentDefinitionForm projectPath={projectPath} submitText="Create Agent Definition" />
                    </FormContainer>
                </Container>
            </ViewContent>
        </View>
    );
}

export default AddAgentDefinition;
