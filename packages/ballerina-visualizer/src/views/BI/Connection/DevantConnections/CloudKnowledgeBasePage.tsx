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
import { Codicon } from "@wso2/ui-toolkit";
import ButtonCard from "../../../../components/ButtonCard";
import { BodyTinyInfo } from "../../../styles";
import { usePlatformExtContext } from "../../../../providers/platform-ext-ctx-provider";
import { ConnectorsGrid, Section, SectionHeader, SectionTitle } from "../AddConnectionPopup/styles";
import { CloudAccessNotice } from "./CloudAccessNotice";

interface CloudKnowledgeBasePageProps {
    // Opens a blank CloudKnowledgeBase create form (manual entry, no Devant service pre-selected).
    onCreateNew: () => void;
}

/**
 * Intermediate page shown when the "WSO2 Cloud Knowledge Base" box is selected. Offers creating a
 * new knowledge base manually, and lists the existing WSO2 Cloud knowledge bases to connect to.
 */
export function CloudKnowledgeBasePage(props: CloudKnowledgeBasePageProps) {
    const { onCreateNew } = props;
    const { platformExtState } = usePlatformExtContext();

    const isSignedIn = !!platformExtState?.isLoggedIn && !!platformExtState?.selectedContext?.project;

    return (
        <>
            <Section>
                <ConnectorsGrid>
                    <ButtonCard
                        id="create-new-cloud-kb"
                        title="Manually Config WSO2 Cloud Knowledge Base"
                        description="Add configurations for the Knowledge Base connection."
                        icon={<Codicon name="add" />}
                        onClick={onCreateNew}
                    />
                </ConnectorsGrid>
            </Section>

            <div style={{ height: 16 }} />

            <CloudAccessNotice purpose="to use WSO2 Cloud knowledge bases" />

            {isSignedIn && (
                <Section>
                    <SectionHeader>
                        <SectionTitle variant="h4">Existing WSO2 Cloud Knowledge Bases</SectionTitle>
                    </SectionHeader>
                    {/* WSO2 Cloud keeps knowledge bases apart from services, and connecting to one is not
                        offered yet; listing services here would always come back empty. */}
                    <BodyTinyInfo style={{ paddingBottom: "10px" }}>
                        Picking an existing WSO2 Cloud knowledge base is not available yet. Configure the connection manually above.
                    </BodyTinyInfo>
                </Section>
            )}
        </>
    );
}
