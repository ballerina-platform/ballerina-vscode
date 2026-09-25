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

import styled from "@emotion/styled";
import { useEffect, useState, type ReactNode } from "react";
import { FieldFactory, FormField, useFormContext } from "@wso2/ballerina-side-panel";
import { Codicon, Icon, LinkButton } from "@wso2/ui-toolkit";
import { HintText, NoticeBox, NoticeTitle } from "./styles";

const Selection = styled.div`
    position: relative;
    padding-bottom: 28px;
`;

const Actions = styled.div`
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
`;

const CreateLinks = styled.div`
    display: flex;
    align-items: center;
`;

export interface EvalsetEmptyState {
    icon: ReactNode;
    title: string;
    description: ReactNode;
    canCreate?: boolean;
}

interface EvalsetFileControlProps {
    field?: FormField;
    hasEvalsets: boolean;
    selectedEvalsetFile: string;
    emptyState?: EvalsetEmptyState;
    onCreateEvalset: () => void;
    onOpenEvalset: (evalsetFile: string) => void;
    /** Asks Copilot to write a new evalset and returns the path it will write. */
    onGenerateEvalset?: () => string;
}

export function EvalsetFileControl({
    field, hasEvalsets, selectedEvalsetFile, emptyState, onCreateEvalset, onOpenEvalset, onGenerateEvalset
}: EvalsetFileControlProps) {
    const { form } = useFormContext();
    const [pendingEvalset, setPendingEvalset] = useState<string>();

    useEffect(() => {
        if (field && pendingEvalset && field.itemOptions?.some(option => option.value === pendingEvalset)) {
            form.setValue(field.key, pendingEvalset, { shouldDirty: true });
            setPendingEvalset(undefined);
        }
    }, [field, pendingEvalset]);

    const generateLink = onGenerateEvalset && (
        <LinkButton onClick={() => setPendingEvalset(onGenerateEvalset())} sx={{ fontSize: 12, gap: 4, padding: '0 8px' }}>
            <Icon name="bi-ai-chat" sx={{ width: 12, height: 12 }} iconSx={{ fontSize: '12px' }} />
            Generate with Copilot
        </LinkButton>
    );

    if (!hasEvalsets && !selectedEvalsetFile) {
        if (!emptyState) {
            return null;
        }
        return (
            <NoticeBox>
                <NoticeTitle>
                    {emptyState.icon}
                    {emptyState.title}
                </NoticeTitle>
                <HintText>{emptyState.description}</HintText>
                {emptyState.canCreate && (
                    <CreateLinks>
                        <LinkButton onClick={onCreateEvalset} sx={{ fontSize: 12, marginTop: 2, padding: 8, gap: 4 }}>
                            Create empty evalset
                        </LinkButton>
                        {generateLink}
                    </CreateLinks>
                )}
            </NoticeBox>
        );
    }

    if (!field) {
        return null;
    }

    if (!selectedEvalsetFile) {
        return <FieldFactory field={{ ...field, hidden: false }} />;
    }

    return (
        <Selection>
            <FieldFactory field={{ ...field, hidden: false }} />
            <Actions>
                <CreateLinks>
                    <LinkButton onClick={onCreateEvalset} sx={{ fontSize: 12, padding: '0 8px' }}>
                        Create empty evalset
                    </LinkButton>
                    {generateLink}
                </CreateLinks>
                <LinkButton onClick={() => onOpenEvalset(selectedEvalsetFile)}
                    sx={{ fontSize: 12, gap: 4, padding: '0 8px' }}>
                    <Codicon name="go-to-file" iconSx={{ fontSize: 12 }} sx={{ height: 12 }} />
                    Open evalset
                </LinkButton>
            </Actions>
        </Selection>
    );
}
