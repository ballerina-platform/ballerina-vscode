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

import React, { useContext, useState } from 'react';
import { DiagramEngine } from '@projectstorm/react-diagrams';
import { EntityPortWidget } from '../../EntityPort/EntityPortWidget';
import { EntityModel } from '../EntityModel';
import { EntityHead, EntityName } from '../styles';
import { CtrlClickGo2Source } from '../../../common/CtrlClickHandler/CtrlClickGo2Source';
import { DiagramContext } from '../../../common';
import styled from '@emotion/styled';
import { Button, Icon, Confirm, Item, Menu, MenuItem, Popover, ThemeColors } from '@wso2/ui-toolkit';
import { MoreVertIcon } from '../../../../resources';
import { RequestContextBadge } from './RequestContextBadge';

interface ServiceHeadProps {
    engine: DiagramEngine;
    node: EntityModel;
    isSelected: boolean;
}

const MenuButton = styled(Button)`
    border-radius: 5px;
`;

const HeaderButtonsContainer = styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;
    margin-left: auto;
    justify-content: flex-end;
    min-width: 45px;
`;

const EntityNameContainer = styled.div`
    flex: 1;
    justify-content: flex-start;
    display: flex;
    align-items: center;
    padding: 8px;
`;

const HeaderWrapper = styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    width: 100%;
`;

const ImportedLabel = styled.span`
    background-color: ${ThemeColors.SURFACE_CONTAINER};
    border-radius: 3px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    font-family: GilmerRegular;
    font-size: 10px;
    height: 20px;
    line-height: 20px;
    padding: 0 6px;
    margin-left: 8px;
    white-space: nowrap;
`;

const GraphqlIconContainer = styled.div`
    margin-right: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    width: 20px;
`;

interface Origin {
    vertical: "top" | "center" | "bottom";
    horizontal: "left" | "center" | "right";
}

export function EntityHeadWidget(props: ServiceHeadProps) {
    const { engine, node, isSelected } = props;
    const { setFocusedNodeId, onEditNode, goToSource, onNodeDelete, verifyTypeDelete, readonly, hasRequestContext, onOpenRequestContext } = useContext(DiagramContext);

    const displayName: string = node.getID()?.slice(node.getID()?.lastIndexOf(':') + 1);
    const isImported = !node?.entityObject?.editable;

    const [anchorEl, setAnchorEl] = useState<HTMLElement | SVGSVGElement>(null);
    const isMenuOpen = Boolean(anchorEl);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [confirmEl, setConfirmEl] = React.useState<HTMLElement | SVGSVGElement | null>(null);
    const [anchorOrigin, setAnchorOrigin] = useState<Origin>({ vertical: "bottom", horizontal: "left" });
    const [transformOrigin, setTransformOrigin] = useState<Origin>({ vertical: "top", horizontal: "right" });

    const [confirmMessage, setConfirmMessage] = useState<string>("Are you sure you want to delete this?");
    const [isVerifyingDelete, setIsVerifyingDelete] = useState(false);

    const handleOnMenuClick = (event: React.MouseEvent<HTMLElement | SVGSVGElement>) => {
        setAnchorEl(event.currentTarget);
    };

    const onNodeEdit = () => {
        if (onEditNode && node?.entityObject?.editable && !readonly) {
            if (node.isGraphqlRoot) {
                onEditNode(node.getID(), true);
            } else {
                onEditNode(node.getID());
            }
        }
        setAnchorEl(null);
    };

    const onNodeDeleteWithConfirm = async () => {
        if (node?.entityObject?.editable && onNodeDelete && !readonly) {
            onNodeDelete(node.getID());
        }
        setAnchorEl(null);
    };

    const onGoToSource = () => {
        goToSource(node.entityObject);
        setAnchorEl(null);
    };

    const isEditableGraphqlRoot = node.isGraphqlRoot && !readonly;
    const showContextTag = isEditableGraphqlRoot && !!hasRequestContext && !!onOpenRequestContext;

    const onRequestContext = () => {
        setAnchorEl(null);
        onOpenRequestContext?.();
    };

    const onFocusedView = () => {
        setFocusedNodeId && setFocusedNodeId(node.getID());
        setAnchorEl(null);
    }

    // Keep this sync to satisfy Menu Item's onClick: () => void
    const handleDeleteClick = () => {
        const idLabel = node.getID();

        // Position the confirm near the menu button
        if (anchorEl) {
            const rect = anchorEl.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;

            if (spaceBelow < 200 && spaceAbove > 200) {
                setAnchorOrigin({ vertical: "top", horizontal: "left" });
                setTransformOrigin({ vertical: "bottom", horizontal: "right" });
            } else {
                setAnchorOrigin({ vertical: "bottom", horizontal: "left" });
                setTransformOrigin({ vertical: "top", horizontal: "right" });
            }
            setConfirmEl(anchorEl);
        }
        setAnchorEl(null); // close menu

        // Open confirm immediately in "verifying" mode
        setIsVerifyingDelete(true);
        setConfirmMessage("Checking usages...");
        setIsConfirmOpen(true);

        // Verify asynchronously and update the message
        verifyTypeDelete(idLabel)
            .then((canDelete) => {
                setConfirmMessage(
                    canDelete
                        ? `Are you sure you want to delete ${idLabel}?`
                        : `${idLabel} has usages. Deleting it may cause errors. Are you sure you want to proceed?`
                );
            })
            .catch(() => {
                setIsConfirmOpen(false);
                setConfirmEl(null);
            })
            .finally(() => {
                setIsVerifyingDelete(false);
            });
    };

    const menuItems: Item[] = [
        ...(node?.entityObject?.editable ? [
            {
                id: "edit",
                label: "Edit",
                onClick: () => onNodeEdit(),
            },
            {
                id: "goToSource",
                label: "Source",
                onClick: () => onGoToSource()
            },
            ...(isEditableGraphqlRoot && onOpenRequestContext ? [{
                id: "requestContext",
                label: "Request Context",
                onClick: () => onRequestContext()
            }] : []),
            ...(!node.isGraphqlRoot ? [{
                id: "delete",
                label: "Delete",
                onClick: () => handleDeleteClick()
            }] : []),
        ] : []),
        {
            id: "focusView",
            label: "Focused View",
            onClick: () => onFocusedView()
        }
    ];

    const handleConfirm = (state: boolean) => {
        // Block confirm while verifying
        if (isVerifyingDelete) {
            return;
        }
        if (state) {
            onNodeDeleteWithConfirm(); // Call the actual delete function
        }
        setIsConfirmOpen(false); // Close the confirmation dialog
        setConfirmEl(null);
    };

    const isClickable = true;

    return (
        <CtrlClickGo2Source node={node.entityObject}>
            <EntityHead
                isSelected={isSelected && !readonly}
                data-testid={`type-node-${displayName}`}
            >
                <EntityPortWidget
                    port={node.getPort(`left-${node.getID()}`)}
                    engine={engine}
                />
                <HeaderWrapper>
                    <EntityNameContainer>
                        {node.isGraphqlRoot && (
                            <GraphqlIconContainer>
                                <Icon name="bi-graphql" iconSx={{ color: "#e535ab", fontSize: "20px" }} />
                            </GraphqlIconContainer>
                        )}
                        <EntityName
                            isClickable={isClickable && !isImported && !readonly}
                            onClick={onNodeEdit}
                            onDoubleClick={onFocusedView}
                        >
                            {displayName}
                        </EntityName>
                        {isImported && (
                            <ImportedLabel>
                                Imported Type
                            </ImportedLabel>
                        )}
                    </EntityNameContainer>
                    <HeaderButtonsContainer>
                        {showContextTag && (
                            <RequestContextBadge onOpen={onRequestContext} />
                        )}
                        <MenuButton appearance="icon" onClick={handleOnMenuClick} data-testid={`type-node-${displayName}-menu`} disabled={readonly}>
                            <MoreVertIcon />
                        </MenuButton>
                    </HeaderButtonsContainer>
                </HeaderWrapper>
                <EntityPortWidget
                    port={node.getPort(`right-${node.getID()}`)}
                    engine={engine}
                />
                <Popover
                    open={isMenuOpen}
                    anchorEl={anchorEl}
                    handleClose={() => setAnchorEl(null)}
                    sx={{
                        padding: 0,
                        borderRadius: 0
                    }}
                >
                    <Menu>
                        {menuItems.map((item) => (
                            <MenuItem key={item.id} item={item} />
                        ))}
                    </Menu>
                </Popover>
                <Confirm
                    isOpen={isConfirmOpen}
                    onConfirm={handleConfirm}
                    confirmText={isVerifyingDelete ? "Verifying the possibility to delete the type" : "Delete"}
                    message={confirmMessage}
                    anchorEl={confirmEl}
                    anchorOrigin={anchorOrigin}
                    transformOrigin={transformOrigin}
                    sx={{ zIndex: 3002 }}
                />
            </EntityHead>
        </CtrlClickGo2Source>
    )
}
