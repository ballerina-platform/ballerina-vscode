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

import React, { useState } from "react";
import styled from "@emotion/styled";
import { FieldType } from "@wso2/ballerina-core";
import { Button, Codicon, Confirm, LinkButton, ThemeColors, Typography } from "@wso2/ui-toolkit";

const Container = styled.div`
    padding: 0 15px;
    margin-top: 20px;
`;

const Divider = styled.hr`
    margin: 0 0 12px;
    border: 0;
    border-top: 1px solid ${ThemeColors.OUTLINE_VARIANT};
`;

const Header = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
`;

const Body = styled.div`
    padding: 8px 0 15px;
`;

const SubHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 8px 0 0 10px;
`;

// The surface and spacing of the handler rows above, so the page reads as one list of cards; the content differs.
const Row = styled.div`
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    margin-top: 10px;
    padding: 10px;
    background-color: var(--vscode-editorHoverWidget-background);
    cursor: pointer;
    &:hover {
        background-color: var(--vscode-list-hoverBackground);
    }
`;

const Declaration = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
`;

const Name = styled.span`
    white-space: nowrap;
`;

const Detail = styled.span`
    color: var(--vscode-descriptionForeground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const Actions = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
`;

const ActionButton = styled(Button)`
    display: flex;
    align-items: center;
    & > vscode-button::part(control) {
        padding: 4px 8px;
    }
`;

const Muted = styled(Typography)`
    color: var(--vscode-descriptionForeground);
`;

const initialValueOf = (field: FieldType): string => {
    const defaultValue = field.defaultValue;
    return typeof defaultValue === "object" ? String(defaultValue?.value ?? "") : (defaultValue ?? "");
};

export interface ConnectionStateSectionProps {
    fields: FieldType[];
    description: string;
    onAdd: () => void;
    onEdit: (field: FieldType) => void;
    onDelete: (field: FieldType) => void;
}

/**
 * The variables a TCP connection service class keeps for each client. Most services need none, so they sit under
 * Advanced Configurations, collapsed by default, with the editor's usual Expand/Collapse control.
 */
export function ConnectionStateSection(props: ConnectionStateSectionProps) {
    const { fields, description, onAdd, onEdit, onDelete } = props;
    const [isExpanded, setIsExpanded] = useState(false);
    const [pendingDelete, setPendingDelete] = useState<{ field: FieldType; anchor: HTMLElement | null }>();

    const handleConfirmDelete = (confirmed: boolean) => {
        if (confirmed && pendingDelete) {
            onDelete(pendingDelete.field);
        }
        setPendingDelete(undefined);
    };

    return (
        <Container>
            <Divider />
            <Header>
                <Typography variant="h3" sx={{ fontWeight: "bold", margin: "0 0 0 10px" }}>
                    Advanced Configurations
                </Typography>
                <LinkButton
                    id="connection-state-toggle"
                    onClick={() => setIsExpanded(!isExpanded)}
                    sx={{ fontSize: 12, padding: 8, color: ThemeColors.PRIMARY, gap: 4 }}
                >
                    <Codicon name={isExpanded ? "chevron-up" : "chevron-down"} iconSx={{ fontSize: 12 }} sx={{ height: 12 }} />
                    {isExpanded ? "Collapse" : "Expand"}
                </LinkButton>
            </Header>
            {isExpanded && (
                <Body>
                    <SubHeader>
                        <div>
                            <Typography variant="body2" sx={{ fontWeight: "bold", margin: 0 }}>
                                Variables
                            </Typography>
                            <Muted variant="body3" sx={{ margin: 0 }}>
                                {description}
                            </Muted>
                        </div>
                        <Button
                            appearance="secondary"
                            tooltip="Add a value to keep for each connected client"
                            onClick={onAdd}
                        >
                            <Codicon name="add" sx={{ marginRight: 8 }} />
                            Variable
                        </Button>
                    </SubHeader>
                    {fields.map((field) => {
                        const initialValue = initialValueOf(field);
                        return (
                            <Row
                                key={field.name.value}
                                data-testid={`connection-state-${field.name.value}`}
                                onClick={() => onEdit(field)}
                            >
                                <Declaration>
                                    <Codicon name="symbol-variable" sx={{ color: "var(--vscode-symbolIcon-variableForeground)" }} />
                                    <Name>{field.name.value}</Name>
                                    <Detail>
                                        {`${field.type.value}${initialValue ? ` = ${initialValue}` : ""}`}
                                    </Detail>
                                </Declaration>
                                <Actions>
                                    <ActionButton
                                        appearance="secondary"
                                        id={`edit-connection-state-${field.name.value}`}
                                        tooltip="Edit variable"
                                        onClick={(event: React.MouseEvent<HTMLElement | SVGSVGElement>) => {
                                            event.stopPropagation();
                                            onEdit(field);
                                        }}
                                    >
                                        <Codicon name="edit" />
                                    </ActionButton>
                                    <ActionButton
                                        appearance="secondary"
                                        id={`delete-connection-state-${field.name.value}`}
                                        tooltip="Delete variable"
                                        onClick={(event: React.MouseEvent<HTMLElement | SVGSVGElement>) => {
                                            event.stopPropagation();
                                            const anchor = event.currentTarget instanceof HTMLElement
                                                ? event.currentTarget
                                                : null;
                                            setPendingDelete({ field, anchor });
                                        }}
                                    >
                                        <Codicon name="trash" />
                                    </ActionButton>
                                </Actions>
                            </Row>
                        );
                    })}
                    {fields.length === 0 && (
                        <Muted variant="body2" sx={{ margin: "12px 0 0 10px" }}>
                            No variables yet.
                        </Muted>
                    )}
                </Body>
            )}
            <Confirm
                isOpen={!!pendingDelete}
                onConfirm={handleConfirmDelete}
                confirmText="Delete"
                message="Are you sure you want to delete this variable?"
                anchorEl={pendingDelete?.anchor ?? null}
                anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
                transformOrigin={{ vertical: "top", horizontal: "right" }}
            />
        </Container>
    );
}
