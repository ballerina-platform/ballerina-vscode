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

import React, { useContext, useEffect, useRef, useState } from 'react';
import { DiagramEngine, PortModel } from '@projectstorm/react-diagrams';
import {
    Member,
    TypeFunctionModel,
    formatGraphqlFieldDefinition,
    formatInlineGraphqlArgs,
    toGraphqlArgs,
    toGraphqlName,
} from '@wso2/ballerina-core';
import { EntityModel } from '../EntityModel';
import { EntityPortWidget } from '../../EntityPort/EntityPortWidget';

import { Tooltip } from '@wso2/ui-toolkit';
import {
    AttributeContainer,
    AttributeName,
    AttributeType,
    GraphqlArgs,
    GraphqlDefinition,
    GRAPHQL_ROW_TOOLTIP_CONTAINER_SX,
} from '../styles';
import { CtrlClickGo2Source, DiagramContext } from '../../../common';
import { getAttributeType } from '../../../../utils/utils';
import { getAttributePortName } from '../../../../utils/model-mapper/entityModelMapper';

// Pointer travel (px) beyond which a press on an operation is a node drag, not a click.
const DRAG_THRESHOLD = 4;

interface AttributeProps {
    node: EntityModel;
    engine: DiagramEngine;
    attribute: Member | TypeFunctionModel;
    isSelected: boolean;
}

export function AttributeWidget(props: AttributeProps) {
    const { node, engine, attribute, isSelected } = props;
    const { setSelectedNodeId, onOperationSelect, readonly } = useContext(DiagramContext);

    const [isHovered, setIsHovered] = useState<boolean>(false);
    const attributePorts = useRef<PortModel[]>([]);
    const pointerDownAt = useRef<{ x: number; y: number }>();

    const portName = getAttributePortName(node.entityObject, attribute);

    // The GraphQL type model carries each field's GraphQL type; show the schema the client sees.
    const graphqlType = attribute.graphqlType;
    const attributeType: string = graphqlType ?? getAttributeType(attribute);// TODO: FIX for anynnymous records
    const graphqlName = graphqlType ? toGraphqlName(attribute.name) : undefined;
    const graphqlArgs = graphqlType && 'parameters' in attribute ? toGraphqlArgs(attribute.parameters) : [];
    const graphqlDefinition = graphqlType
        ? formatGraphqlFieldDefinition(graphqlName, {
            args: graphqlArgs,
            type: graphqlType,
            description: 'parameters' in attribute ? attribute.description : attribute.docs,
        })
        : undefined;


    useEffect(() => {
        attributePorts.current.push(node.getPortFromID(`left-${node.getID()}/${portName}`));
        attributePorts.current.push(node.getPortFromID(`right-${node.getID()}/${portName}`));
    }, [attribute])

    const handleOnHover = (task: string) => {
        setIsHovered(task === 'SELECT' ? true : false);
        node.handleHover(attributePorts.current, task);
    }

    const onClickOnType = () => {
        if (attribute?.refs[0]) {
            setSelectedNodeId(attribute.refs[0]);
        }
    }

    const hasLinkedNode = !!attribute?.refs?.[0];

    // GraphQL root node rows are operations; clicking one opens its flow diagram.
    const isOperation = node.isGraphqlRoot && !!onOperationSelect && !readonly;

    const onMouseDownOnOperation = (event: React.MouseEvent) => {
        pointerDownAt.current = { x: event.clientX, y: event.clientY };
    }

    const onClickOnOperation = (event: React.MouseEvent) => {
        // Ctrl/Cmd-click is go-to-source, handled by the wrapper around the row.
        if (event.ctrlKey || event.metaKey) {
            return;
        }
        // Dragging the node by this row also ends in a click; that is not a selection.
        const start = pointerDownAt.current;
        if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > DRAG_THRESHOLD) {
            return;
        }
        onOperationSelect(attribute as TypeFunctionModel);
    }

    const onKeyDownOnOperation = (event: React.KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onOperationSelect(attribute as TypeFunctionModel);
        }
    }

    const row = (
        <AttributeContainer
            data-testid={graphqlType ? "graphql-field-row" : undefined}
            isSelected={isSelected || isHovered}
            onMouseOver={() => handleOnHover('SELECT')}
            onMouseLeave={() => handleOnHover('UNSELECT')}
        >
            <EntityPortWidget
                port={node.getPort(`left-${node.getID()}/${portName}`)}
                engine={engine}
            />
            <AttributeName
                onMouseDown={isOperation ? onMouseDownOnOperation : undefined}
                onClick={isOperation ? onClickOnOperation : undefined}
                onKeyDown={isOperation ? onKeyDownOnOperation : undefined}
                role={isOperation ? 'button' : undefined}
                tabIndex={isOperation ? 0 : undefined}
                style={isOperation ? { cursor: 'pointer' } : undefined}
                data-testid={isOperation ? `graphql-operation-${attribute.name}` : undefined}
            >
                {graphqlName ?? `${attribute.name}${'optional' in attribute && attribute.optional ? '?' : ''}`}
                {graphqlArgs.length > 0 && <GraphqlArgs>{formatInlineGraphqlArgs(graphqlArgs)}</GraphqlArgs>}
            </AttributeName>
            {node.entityObject?.codedata?.node !== 'UNION' &&
                node.entityObject?.codedata?.node !== 'ENUM' &&
                node.entityObject?.codedata?.node !== 'ARRAY' &&
                <AttributeType
                    isAnonymous={false}
                    isSelected={isSelected || isHovered}
                    isClickable={hasLinkedNode}
                    onClick={hasLinkedNode ? onClickOnType : undefined}
                >
                    {attributeType}
                </AttributeType>
            }
            {node.entityObject?.codedata?.node === 'ENUM' && ('defaultValue' in attribute && attribute.defaultValue) &&
                <AttributeType
                    isAnonymous={false}
                    isSelected={isSelected || isHovered}
                >
                    {attribute.defaultValue}
                </AttributeType>
            }
            {/* {isHovered && attribute.sourceLocation && editingEnabled &&
                    <NodeMenuWidget
                        background={ThemeColors.SECONDARY}
                        location={attribute.sourceLocation}
                    />
                } */}
            <EntityPortWidget
                port={node.getPort(`right-${node.getID()}/${portName}`)}
                engine={engine}
            />
        </AttributeContainer>
    );

    return (
        <CtrlClickGo2Source node={node.entityObject}>
            {/* A hover-driven tooltip rather than `title`: native tooltips are dropped when the row
                re-renders on hover, so they only appeared intermittently. */}
            {graphqlDefinition ? (
                <Tooltip
                    content={<GraphqlDefinition data-testid="graphql-definition">{graphqlDefinition}</GraphqlDefinition>}
                    containerSx={GRAPHQL_ROW_TOOLTIP_CONTAINER_SX}
                >
                    {row}
                </Tooltip>
            ) : row}
        </CtrlClickGo2Source>
    );
}
