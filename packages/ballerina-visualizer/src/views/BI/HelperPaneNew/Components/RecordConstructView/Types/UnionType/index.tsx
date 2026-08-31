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
import React, { useRef, useState, useEffect } from "react";

import { VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react";
import { TypeField } from "@wso2/ballerina-core";
import { Codicon, Dropdown, Tooltip, Typography } from "@wso2/ui-toolkit";

import { TypeProps } from "../../ParameterBranch";
import { useHelperPaneStyles } from "../../styles";
import { ParameterBranch } from "../../ParameterBranch";
import { getSelectedUnionMember, isRequiredParam, updateFieldsSelection, resetFieldValues } from "../../utils";

export default function UnionType(props: TypeProps) {
    const { param, depth, onChange } = props;
    const helperStyleClass = useHelperPaneStyles();

    const requiredParam = isRequiredParam(param) && depth > 1; // Only apply required param logic after depth 1
    if (requiredParam) {
        param.selected = true;
    }
    const memberTypes = param.members?.map((field, index) => ({ id: index.toString(), value: getUnionParamName(field) }));
    const initSelectedMember = getSelectedUnionMember(param);

    const [paramSelected, setParamSelected] = useState(param.selected || requiredParam);
    const [selectedMemberType, setSelectedMemberType] = useState(getUnionParamName(initSelectedMember));
    const [parameter, setParameter] = useState<TypeField>(initSelectedMember);
    const isInitialized = useRef(false);

    // Initialize union member selection when param becomes selected
    const initializeUnionMember = () => {
        if (!param.members || param.members.length === 0) {
            return false;
        }

        // Check if a member is already selected
        const hasSelectedMember = param.members.some(member => member.selected === true);
        if (hasSelectedMember) {
            return true; // Already initialized
        }

        // Get the member to select (use initSelectedMember if available, otherwise first member)
        const memberToSelect = initSelectedMember || param.members[0];

        if (memberToSelect) {
            const memberTypeName = getUnionParamName(memberToSelect);
            if (memberTypeName) {
                const selectedMember = param.members.find((field) => getUnionParamName(field) === memberTypeName);

                if (selectedMember) {
                    updateFormFieldMemberSelection(selectedMember);

                    if (selectedMember.fields && selectedMember.fields.length > 0) {
                        updateFieldsSelection(selectedMember.fields, true);
                    }

                    setSelectedMemberType(memberTypeName);
                    setParameter(selectedMember);

                    return true;
                }
            }
        }

        return false; // Failed to initialize
    };

    // Initialize: Always ensure a member is selected if union param is selected
    useEffect(() => {
        // Only run initialization once
        if (isInitialized.current) {
            return;
        }
        isInitialized.current = true;

        // If union param is selected (or required), ensure a member is selected
        if (paramSelected && param.members && param.members.length > 0) {
            initializeUnionMember();
        }
    }, []);

    useEffect(() => {
        // If param becomes selected but we haven't initialized the member yet
        if (param.selected && !isInitialized.current && param.members && param.members.length > 0) {
            const initialized = initializeUnionMember();
            if (initialized) {
                isInitialized.current = true;
            }
        }
    }, [param.selected]);

    if (!(param.members && param.members.length > 0)) {
        return <></>;
    }

    const updateFormFieldMemberSelection = (unionField: TypeField) => {
        const unionFieldName = getUnionParamName(unionField);
        param.members.forEach((field) => {
            field.selected = getUnionParamName(field) === unionFieldName;

            // If this is the selected field and it has nested fields, update them
            if (field.selected && field.fields && field.fields.length > 0) {
                // Set required fields to selected
                updateFieldsSelection(field.fields, true);
            } else if (!field.selected && field.fields && field.fields.length > 0) {
                // Deselect all fields of non-selected members
                updateFieldsSelection(field.fields, false);
            }
        });
    };

    const handleMemberType = (type: string, inCheckboxTrigger: boolean = true) => {
        if (!type) {
            return;
        }

        const selectedMember = param.members?.find((field) => getUnionParamName(field) === type);

        if (!selectedMember) {
            return;
        }

        // Ensure the union param itself is selected when selecting a member
        if (!param.selected) {
            param.selected = true;
            setParamSelected(true);
        }

        updateFormFieldMemberSelection(selectedMember);

        if (selectedMember.fields && selectedMember.fields.length > 0) {
            updateFieldsSelection(selectedMember.fields, true);
        }

        setSelectedMemberType(type);
        setParameter(selectedMember);

        // Till the LS issue is fixed to generate proper source based on the selected member,
        // we need to clear the value of the param.
        if (inCheckboxTrigger) {
            if (param?.value !== undefined) {
                param.value = "";
            }
        }

        // Call onChange only after all selections are complete
        onChange();
    };

    const toggleParamCheck = () => {
        const newSelectedState = !paramSelected;
        param.selected = newSelectedState;

        // When checkbox is checked, ensure the currently selected member is also marked as selected
        if (newSelectedState) {
            // Ensure member is initialized before proceeding
            if (!isInitialized.current) {
                initializeUnionMember();
                isInitialized.current = true;
            }

            const selectedMember = param.members.find((field) => getUnionParamName(field) === selectedMemberType);
            if (selectedMember) {
                updateFormFieldMemberSelection(selectedMember);

                // If the selected member has fields, recursively set required fields to selected
                if (selectedMember.fields && selectedMember.fields.length > 0) {
                    updateFieldsSelection(selectedMember.fields, true);
                }
            }
        } else {
            // When unchecking, reset values and clear all member selections
            resetFieldValues(param);
            param.members.forEach((field) => {
                field.selected = false;

                // If the member has fields, recursively deselect all fields
                if (field.fields && field.fields.length > 0) {
                    updateFieldsSelection(field.fields, false);
                }
            });
        }

        setParamSelected(newSelectedState);
        onChange();
    };

    return (
        <div className={helperStyleClass.docListDefault}>
            <div className={helperStyleClass.listItemMultiLine} data-testid="union-arg">
                <div className={helperStyleClass.listItemHeader}>
                    <VSCodeCheckbox
                        checked={paramSelected}
                        {...(requiredParam && { disabled: true })}
                        onClick={toggleParamCheck}
                        className={helperStyleClass.parameterCheckbox}
                        aria-label={param.name}
                        data-testid="arg-check"
                    />
                    <Typography
                        variant="body3"
                        sx={{ margin: '0px 5px' }}
                    >
                        {param.name}
                    </Typography>
                    {(param.optional || param.defaultable) && (
                        <Typography
                            className={helperStyleClass.suggestionDataType}
                            variant="body3"
                            data-testid="arg-type"
                        >
                            {"(Optional)"}
                        </Typography>
                    )}
                    {param.documentation && (
                        <Tooltip
                            content={
                                <Typography
                                    className={helperStyleClass.paramTreeDescriptionText}
                                    variant="body3"
                                >
                                    {param.documentation}
                                </Typography>
                            }
                            position="right"
                            sx={{ maxWidth: '300px', whiteSpace: 'normal', pointerEvents: 'none' }}
                        >
                            <Codicon
                                name="info"
                                sx={{ marginLeft: '4px' }}
                            />
                        </Tooltip>
                    )}
                    <div className={helperStyleClass.listDropdownWrapper} data-testid="arg-dropdown">
                        <Dropdown
                            onValueChange={handleMemberType}
                            id="arg-dropdown"
                            value={selectedMemberType}
                            items={memberTypes}
                            data-testid="arg-dropdown-component"
                            sx={{ marginLeft: '5px', width: 'fit-content' }}
                        />
                    </div>
                </div>
                {paramSelected && parameter && (
                    <div className={helperStyleClass.listItemBody}>
                        <ParameterBranch parameters={[parameter]} depth={depth + 1} onChange={onChange} />
                    </div>
                )}
            </div>
        </div>
    );
}

export function getUnionParamName(param: TypeField) {
    return param ? param.name || param.typeName : "";
}
