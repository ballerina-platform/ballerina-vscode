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

import React, { useContext, useEffect, useState } from 'react';
import { DiagramEngine } from '@projectstorm/react-diagrams';
import { Codicon } from '@wso2/ui-toolkit';

import { EntityModel } from './EntityModel';
import { EntityLinkModel } from '../EntityLink/EntityLinkModel';
import { EntityPortWidget } from '../EntityPort/EntityPortWidget';
import { EntityHeadWidget } from './EntityHead/EntityHead';
import { AttributeWidget } from './Attribute/AttributeCard';
import { EntityNode, InclusionPortsContainer, OperationSection } from './styles';
import { DiagramContext } from '../../common';
import { getAttributePortName } from '../../../utils/model-mapper/entityModelMapper';
import styled from '@emotion/styled';
import { ThemeColors } from '@wso2/ui-toolkit';
import { isNodeClass } from '../../../utils/model-mapper/entityModelMapper';

const HighlightedButton = styled.div<{ disabled?: boolean }>`
    margin: 16px;
    width: calc(100% - 32px);
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
    gap: 8px;
    padding: 8px;
    color: ${ThemeColors.PRIMARY};
    border: 1px dashed ${ThemeColors.PRIMARY};
    border-radius: 5px;
    cursor: ${props => props.disabled ? 'default' : 'pointer'};
    &:hover {
        border: 1px solid ${props => props.disabled ? ThemeColors.PRIMARY : ThemeColors.HIGHLIGHT};
        background-color: ${ThemeColors.PRIMARY_CONTAINER};
    }
`;

export const AttributeHeader: React.FC<any> = styled.span`
    align-items: center;
    color: ${ThemeColors.ON_SURFACE};
    background-color: ${(props: { isSelected: boolean }) => props.isSelected ? ThemeColors.SURFACE_DIM_2 : ThemeColors.SURFACE_BRIGHT};
    display: flex;
    flex: 1;
    font-family: GilmerMedium;
    font-size: 12px;
    line-height: 30px;
    padding-left: 8px;
    text-align: left;
    padding-top: 8px;
`;


interface EntityWidgetProps {
    node: EntityModel;
    engine: DiagramEngine;
}

export function EntityWidget(props: EntityWidgetProps) {
    const { node, engine } = props;
    const { focusedNodeId, selectedNodeId, onEditNode, readonly } = useContext(DiagramContext);
    const [selectedLink, setSelectedLink] = useState<EntityLinkModel>(undefined);

    const onGraphqlEdit = () => {
        if (!readonly) {
            onEditNode(node.getID(), true);
        }
    };

    const renderOperation = (operation: any) => {
        const portName = getAttributePortName(node.entityObject, operation);
        return (
            <AttributeWidget
                key={portName}
                engine={engine}
                node={node}
                attribute={operation}
                isSelected={node.isNodeSelected(selectedLink, `${node.getID()}/${portName}`)}
            />
        );
    };

    const renderAttributes = () => {
        if (node.isGraphqlRoot) {
            const attributes: React.ReactNode[] = [];
            const categorizedFunctions = {
                query: [],
                mutation: [],
                subscription: [],
            };

            node.entityObject.functions?.forEach((func: any) => {
                if (func.kind === 'RESOURCE') {
                    if (func.accessor === 'subscribe') {
                        categorizedFunctions.subscription.push(func);
                    } else {
                        categorizedFunctions.query.push(func);
                    }
                } else if (func.kind === 'REMOTE') {
                    categorizedFunctions.mutation.push(func);
                }
            });

            const hasAnyOperations = categorizedFunctions.query.length > 0 
                || categorizedFunctions.mutation.length > 0 
                || categorizedFunctions.subscription.length > 0;

            if (!hasAnyOperations) {
                return (
                    <OperationSection>
                        <HighlightedButton onClick={onGraphqlEdit} data-testid="create-operation-button" disabled={readonly}>
                            <Codicon name="plus" />
                            Create Operations
                        </HighlightedButton>
                    </OperationSection>
                );
            }

            // Query section
            if (categorizedFunctions.query.length > 0) {
                attributes.push(
                    <div key="query-section">
                        <OperationSection>
                                <AttributeHeader>Query</AttributeHeader>
                            <div>
                                {categorizedFunctions.query.map(renderOperation)}
                            </div>
                        </OperationSection>
                    </div>
                );
            }

            // Mutation section
            if (categorizedFunctions.mutation.length > 0) {
                attributes.push(
                    <div key="mutation-section">
                        <OperationSection>
                                <AttributeHeader>Mutation</AttributeHeader>
                            <div>
                                {categorizedFunctions.mutation.map(renderOperation)}
                            </div>
                        </OperationSection>
                    </div>
                );
            }

            // Subscription section
            if (categorizedFunctions.subscription.length > 0) {
                attributes.push(
                    <div key="subscription-section">
                        <OperationSection>
                                <AttributeHeader>Subscription</AttributeHeader>
                            <div>
                                {categorizedFunctions.subscription.map(renderOperation)}
                            </div>
                        </OperationSection>
                    </div>
                );
            }

            return attributes;
        } else {
            const attributes: React.ReactNode[] = [];
            const members = isNodeClass(node.entityObject?.codedata?.node) ? node.entityObject.functions : node.entityObject.members; // Use functions if it's a CLASS
            if (members) {
                Object.entries(members).forEach(([key, member]) => (
                    attributes.push(
                        <AttributeWidget
                            key={key}
                            engine={engine}
                            node={node}
                            attribute={member}
                            isSelected={node.isNodeSelected(selectedLink, `${node.getID()}/${getAttributePortName(node.entityObject, member)}`)}
                        />
                    )
                ));
            }

            return attributes;
        }
    };

    useEffect(() => {
        node.registerListener({
            'SELECT': (event: any) => {
                setSelectedLink(event.entity as EntityLinkModel);
            },
            'UNSELECT': () => { setSelectedLink(undefined) }
        })
    }, [node])

    return (
        <>
            {node.getID() &&
                <EntityNode
                    isAnonymous={false}
                    isEditMode={false}
                    isSelected={node.isNodeSelected(selectedLink, node.getID()) || selectedNodeId === node.getID()}
                    shouldShade={false}
                    isFocused={node.getID() === focusedNodeId}
                >
                    <EntityHeadWidget
                        engine={engine}
                        node={node}
                        isSelected={node.isNodeSelected(selectedLink, node.getID()) || selectedNodeId === node.getID()}
                    />

                    {renderAttributes()}

                    <InclusionPortsContainer>
                        <EntityPortWidget
                            port={node.getPort(`top-${node.getID()}`)}
                            engine={engine}
                        />
                        <EntityPortWidget
                            port={node.getPort(`bottom-${node.getID()}`)}
                            engine={engine}
                        />
                    </InclusionPortsContainer>
                </EntityNode>
            }
        </>
    );
}
