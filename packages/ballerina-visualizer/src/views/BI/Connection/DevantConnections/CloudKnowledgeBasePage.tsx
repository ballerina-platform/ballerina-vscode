/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

import React from "react";
import styled from "@emotion/styled";
import { Codicon, ThemeColors } from "@wso2/ui-toolkit";
import ButtonCard from "../../../../components/ButtonCard";
import { usePlatformExtContext } from "../../../../providers/platform-ext-ctx-provider";
import { hasCloudProject } from "../../../../providers/cloud-project";
import { CloudAccessNotice, useCloudAccessRefresh } from "./CloudAccessNotice";

const Page = styled.div<{ inset?: boolean }>`
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    gap: 24px;
    padding-inline: ${({ inset }: { inset?: boolean }) => (inset ? "16px" : "0")};
`;

const Intro = styled.p`
    margin: 0;
    max-width: 62ch;
    font-size: 13px;
    line-height: 1.5;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

const Group = styled.section`
    display: flex;
    flex-direction: column;
    gap: 10px;
`;

const GroupLabel = styled.h4`
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: ${ThemeColors.ON_SURFACE};
`;

const GroupText = styled.p`
    margin: 0;
    max-width: 62ch;
    font-size: 13px;
    line-height: 1.5;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

interface CloudKnowledgeBasePageProps {
    inset?: boolean;
    // Opens a blank CloudKnowledgeBase create form (manual entry, no Devant service pre-selected).
    onCreateNew: () => void;
}

/**
 * Intermediate page shown when the "WSO2 Cloud Knowledge Base" box is selected. Offers creating a
 * new knowledge base manually.
 */
export function CloudKnowledgeBasePage(props: CloudKnowledgeBasePageProps) {
    const { inset, onCreateNew } = props;
    const { platformExtState } = usePlatformExtContext();
    // Access allowed from the Accounts menu is not announced by VS Code: read the sign-in again on open.
    useCloudAccessRefresh();

    const isSignedIn = hasCloudProject(platformExtState);

    return (
        <Page inset={inset}>
            <Intro>
                A knowledge base gives the agent documents to retrieve from. Connect one managed in WSO2 Cloud, or
                configure the connection yourself.
            </Intro>

            <Group>
                <GroupLabel>Configure manually</GroupLabel>
                <ButtonCard
                    id="create-new-cloud-kb"
                    title="Manually Config WSO2 Cloud Knowledge Base"
                    description="Add configurations for the Knowledge Base connection."
                    icon={<Codicon name="add" />}
                    onClick={onCreateNew}
                />
            </Group>

            <CloudAccessNotice purpose="to use WSO2 Cloud knowledge bases" />

            {isSignedIn && (
                <Group>
                    <GroupLabel>Existing in WSO2 Cloud</GroupLabel>
                    {/* WSO2 Cloud keeps knowledge bases apart from services, and connecting to one is not
                        offered yet; listing services here would always come back empty. */}
                    <GroupText>
                        Picking an existing WSO2 Cloud knowledge base is not available yet. Configure the connection manually above.
                    </GroupText>
                </Group>
            )}
        </Page>
    );
}
