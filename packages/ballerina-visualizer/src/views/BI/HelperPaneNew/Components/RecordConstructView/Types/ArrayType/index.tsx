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
import React, { useCallback, useRef, useState } from "react";

import { TypeField } from "@wso2/ballerina-core";
import { VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react";
import { Button, Codicon, Dropdown, Tooltip, Typography } from "@wso2/ui-toolkit";

import { TypeProps } from "../../ParameterBranch";
import { useHelperPaneStyles } from "../../styles";
import { MemoizedParameterBranch } from "../../ParameterBranch";
import { getOptionalityLabel, isRequiredParam, updateFieldsSelection, resetFieldValues, getUnionFormFieldName } from "../../utils";

interface ElementEntry {
    id: number;
    field: TypeField;
}

function cloneTypeField(source: TypeField): TypeField {
    const clone: TypeField = { ...source };
    if (source.fields) {
        clone.fields = source.fields.map(cloneTypeField);
    }
    if (source.members) {
        clone.members = source.members.map(cloneTypeField);
    }
    if (source.memberType) {
        clone.memberType = cloneTypeField(source.memberType);
    }
    if (source.elements) {
        clone.elements = source.elements.map(cloneTypeField);
    }
    return clone;
}

function cloneElement(source: TypeField): TypeField {
    const clone = cloneTypeField(source);
    clone.selected = true;
    if (clone.fields) {
        updateFieldsSelection(clone.fields, true);
    }
    return clone;
}

function getElementDisplayName(type: TypeField | undefined): string {
    if (!type) return "unknown";
    if (type.typeName === "array" && type.memberType) {
        return getElementDisplayName(type.memberType) + "[]";
    }
    if ((type.typeName === "union" || type.typeName === "enum")
            && (type.members?.length ?? 0) > 0) {
        return "(" + type.members!.map(m => m.typeInfo?.name || m.name || m.typeName).join("|") + ")";
    }
    return type.typeInfo?.name || type.typeName || "unknown";
}

export default function ArrayType(props: TypeProps & { bodyOnly?: boolean }) {
    const { param, depth, onChange, bodyOnly } = props;
    const helperStyleClass = useHelperPaneStyles();
    const requiredParam = isRequiredParam(param) && depth > 1;
    if (requiredParam) {
        param.selected = true;
    }

    const [paramSelected, setParamSelected] = useState(param.selected || requiredParam);

    const memberType = param.memberType;
    const elementTypeName = getElementDisplayName(memberType);
    const isUnionElement = memberType?.typeName === "union" || memberType?.typeName === "enum";
    const unionMembers = isUnionElement ? memberType?.members : undefined;

    // For union arrays, track which union member is selected for the next "Add"
    const [selectedUnionMember, setSelectedUnionMember] = useState<string>(
        () => unionMembers?.[0] ? getUnionFormFieldName(unionMembers[0]) : ""
    );

    const nextId = useRef(param.elements?.length ?? 0);
    const [elements, setElements] = useState<ElementEntry[]>(() =>
        (param.elements ?? []).map((field, i) => ({ id: i, field }))
    );
    const [expandedIds, setExpandedIds] = useState<Set<number>>(() => new Set(
        (param.elements ?? []).map((_, i) => i)
    ));

    const syncToParam = useCallback((newElements: ElementEntry[]) => {
        param.elements = newElements.map(e => e.field);
        param.selected = newElements.length > 0;
        setParamSelected(newElements.length > 0);
    }, [param]);

    const handleAddElement = () => {
        if (!memberType) return;

        let newElement: TypeField;
        if (isUnionElement && unionMembers) {
            const member = unionMembers.find(m => getUnionFormFieldName(m) === selectedUnionMember)
                || unionMembers[0];
            newElement = cloneElement(member);
        } else {
            newElement = cloneElement(memberType);
        }

        const id = nextId.current++;
        const newElements = [...elements, { id, field: newElement }];
        setElements(newElements);
        setExpandedIds(prev => new Set(prev).add(id));
        syncToParam(newElements);
        onChange();
    };

    const handleRemoveElement = (id: number) => {
        const newElements = elements.filter(e => e.id !== id);
        setElements(newElements);
        setExpandedIds(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
        syncToParam(newElements);
        onChange();
    };

    const toggleExpand = (id: number) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleParamCheck = () => {
        if (requiredParam) return;
        const newSelectedState = !paramSelected;
        param.selected = newSelectedState;
        if (!newSelectedState) {
            resetFieldValues(param);
            setElements([]);
            param.elements = [];
        }
        setParamSelected(newSelectedState);
        onChange();
    };

    if (!memberType) {
        return <></>;
    }

    const renderBody = () => (
        <div className={helperStyleClass.listItemBody}>
            {elements.map(({ id, field: element }, index) => {
                const isRecordElement = element.typeName === "record"
                    && (element.fields?.length ?? 0) > 0;
                const isNestedArray = element.typeName === "array" && element.memberType;
                const isExpandable = isRecordElement || isNestedArray
                    || element.typeName === "inclusion";
                const elDisplayName = getElementDisplayName(element);
                return (
                    <div key={id} className={helperStyleClass.listItemMultiLine}>
                        <div className={`${helperStyleClass.listItemHeader} ${isExpandable ? helperStyleClass.arrayElementHeader : ''}`}
                            onClick={isExpandable ? () => toggleExpand(id) : undefined}>
                            {isExpandable && (
                                <Button appearance="icon">
                                    <Codicon
                                        name={expandedIds.has(id) ? "chevron-down" : "chevron-right"}
                                        iconSx={{ fontSize: '13px' }}
                                    />
                                </Button>
                            )}
                            <Typography variant="body3" className={helperStyleClass.arrayElementIndex}>
                                [{index}]
                            </Typography>
                            <Typography className={helperStyleClass.suggestionDataType} variant="body3">
                                {elDisplayName}
                            </Typography>
                            <Button
                                appearance="icon"
                                onClick={(e: React.MouseEvent) => {
                                    e.stopPropagation();
                                    handleRemoveElement(id);
                                }}
                                tooltip="Remove element"
                                sx={{ marginLeft: '4px' }}
                            >
                                <Codicon name="trash" iconSx={{ fontSize: '12px' }} />
                            </Button>
                        </div>
                        {expandedIds.has(id) && isRecordElement && (
                            <div className={helperStyleClass.listItemBody}>
                                <MemoizedParameterBranch
                                    parameters={element.fields}
                                    depth={depth + 1}
                                    onChange={onChange}
                                />
                            </div>
                        )}
                        {expandedIds.has(id) && isNestedArray && (
                                <ArrayType
                                    param={element}
                                    depth={depth + 1}
                                    onChange={onChange}
                                    bodyOnly
                                />
                        )}
                        {expandedIds.has(id) && isExpandable && !isRecordElement && !isNestedArray && (
                            <div className={helperStyleClass.listItemBody}>
                                <MemoizedParameterBranch
                                    parameters={[element]}
                                    depth={depth + 1}
                                    onChange={onChange}
                                />
                            </div>
                        )}
                    </div>
                );
            })}
            <div className={helperStyleClass.listItemHeader}>
                <div onClick={handleAddElement} className={helperStyleClass.arrayAddWrapper}>
                    <Codicon name="add" iconSx={{ fontSize: '13px' }} />
                    <Typography variant="body3" sx={{ opacity: 0.7 }}>
                        Add{!isUnionElement && ` ${elementTypeName}`}
                    </Typography>
                </div>
                {isUnionElement && unionMembers && (
                    <div className={helperStyleClass.listDropdownWrapper}>
                        <Dropdown
                            id={`${param.name}-union-selector`}
                            value={selectedUnionMember}
                            items={unionMembers.map((m, i) => ({
                                id: i.toString(),
                                value: getUnionFormFieldName(m),
                            }))}
                            onValueChange={setSelectedUnionMember}
                            sx={{ width: 'fit-content' }}
                        />
                    </div>
                )}
            </div>
        </div>
    );

    // When rendered as a nested array element, skip the header (checkbox + label)
    if (bodyOnly) {
        return renderBody();
    }

    return (
        <div className={helperStyleClass.docListDefault}>
            <div className={helperStyleClass.listItemMultiLine}>
                <div className={helperStyleClass.listItemHeader}>
                    <VSCodeCheckbox
                        checked={paramSelected}
                        {...(requiredParam && { disabled: true })}
                        onClick={toggleParamCheck}
                        className={helperStyleClass.parameterCheckbox}
                    />
                    <Typography variant="body3" sx={{ margin: '0px 5px' }}>
                        {param.name}
                    </Typography>
                    <Typography className={helperStyleClass.suggestionDataType} variant="body3">
                        {elementTypeName}[]
                        {getOptionalityLabel(param)}
                    </Typography>
                    {param.documentation && (
                        <Tooltip
                            content={
                                <Typography className={helperStyleClass.paramTreeDescriptionText} variant="body3">
                                    {param.documentation}
                                </Typography>
                            }
                            position="right"
                            sx={{ maxWidth: '300px', whiteSpace: 'normal', pointerEvents: 'none' }}
                        >
                            <Codicon name="info" sx={{ marginLeft: '4px' }} />
                        </Tooltip>
                    )}
                </div>
                {paramSelected && renderBody()}
            </div>
        </div>
    );
}
