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
import { Member, TypeFunctionModel } from '@wso2/ballerina-core';
import { EntityModel } from '../EntityModel';
import { EntityPortWidget } from '../../EntityPort/EntityPortWidget';

import { AttributeContainer, AttributeName, AttributeType } from '../styles';
import { CtrlClickGo2Source, DiagramContext } from '../../../common';
import { getAttributeType } from '../../../../utils/utils';
import { getAttributePortName } from '../../../../utils/model-mapper/entityModelMapper';

interface AttributeProps {
    node: EntityModel;
    engine: DiagramEngine;
    attribute: Member | TypeFunctionModel;
    isSelected: boolean;
}

function isFunction(attribute: Member | TypeFunctionModel): attribute is TypeFunctionModel {
    return 'qualifiers' in attribute;
}

export function AttributeWidget(props: AttributeProps) {
    const { node, engine, attribute, isSelected } = props;
    const { setSelectedNodeId, onFunctionOpen } = useContext(DiagramContext);

    const [isHovered, setIsHovered] = useState<boolean>(false);
    const attributePorts = useRef<PortModel[]>([]);

    let attributeType: string = getAttributeType(attribute);// TODO: FIX for anynnymous records
    const portName = getAttributePortName(node.entityObject, attribute);

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

    // A class method's name opens its implementation. A resource method is named here by its symbol rather than
    // its path, so it cannot be matched to its source and stays plain text.
    const openableFunction = onFunctionOpen && node.entityObject?.codedata?.node === 'CLASS'
        && isFunction(attribute) && attribute.kind !== 'RESOURCE' ? attribute : undefined;

    const onClickOnName = (event: React.MouseEvent) => {
        // Ctrl/Cmd+click is left to the row, which goes to source.
        if (event.ctrlKey || event.metaKey) {
            return;
        }
        onFunctionOpen(node.entityObject, openableFunction);
    };

    const onKeyDownOnName = (event: React.KeyboardEvent) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
            return;
        }
        // Space would otherwise scroll the canvas.
        event.preventDefault();
        onFunctionOpen(node.entityObject, openableFunction);
    };

    return (
        <CtrlClickGo2Source node={node.entityObject}>
            <AttributeContainer
                isSelected={isSelected || isHovered}
                onMouseOver={() => handleOnHover('SELECT')}
                onMouseLeave={() => handleOnHover('UNSELECT')}
            >
                <EntityPortWidget
                    port={node.getPort(`left-${node.getID()}/${portName}`)}
                    engine={engine}
                />
                <AttributeName
                    isClickable={!!openableFunction}
                    onClick={openableFunction ? onClickOnName : undefined}
                    {...(openableFunction && {
                        role: 'button',
                        tabIndex: 0,
                        'aria-label': `Open ${attribute.name}`,
                        onKeyDown: onKeyDownOnName,
                    })}
                >
                    {attribute.name}
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
        </CtrlClickGo2Source>
    );
}
