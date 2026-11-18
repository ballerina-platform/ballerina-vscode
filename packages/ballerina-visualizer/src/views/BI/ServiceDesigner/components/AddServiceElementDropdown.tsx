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

import { DropdownButton, Icon, ProgressRing, Typography } from "@wso2/ui-toolkit";
import styled from "@emotion/styled";

const ButtonText = styled.span`
    @media (max-width: 768px) {
        display: none;
    }
    width: 100%;
`;

interface AddServiceElementDropdownProps {
    buttonTitle: string;
    toolTip?: string;
    defaultOption?: string;
    onPrimaryAction?: () => void;
    buttonIconName?: string;
    buttonIconIsCodicon?: boolean;
    showButtonSpinner?: boolean;
    onOptionChange: (option: string) => void;
    options: DropdownOptionProps[];
}


export function AddServiceElementDropdown(props: AddServiceElementDropdownProps) {
    const {
        buttonTitle,
        toolTip,
        defaultOption,
        onPrimaryAction,
        buttonIconName,
        buttonIconIsCodicon = false,
        showButtonSpinner = false,
        onOptionChange,
        options
    } = props;
    const enablePrimaryAction = !!onPrimaryAction;
    const dropdownOptions = options.map((option) => (
        {
            content: <DropdownOption
                title={option.title}
                description={option.description}
            />,
            value: option.value,
        }
    ));

    return (
        <div style={{ position: 'relative', zIndex: 1000 }}>
            <DropdownButton
                buttonContent={
                    <>
                        {showButtonSpinner ? (
                            <ProgressRing sx={{ width: 18, height: 18, marginRight: 8 }} />
                        ) : (
                            buttonIconName && (
                                <Icon
                                    name={buttonIconName}
                                    isCodicon={buttonIconIsCodicon}
                                    sx={{ marginRight: buttonTitle ? 8 : 0, fontSize: "16px", width:"16px" }}
                                />
                            )
                        )}
                        <ButtonText>{buttonTitle}</ButtonText>
                    </>
                }
                selecteOption={defaultOption ?? ""}
                tooltip={toolTip ?? "Add Functions or Handlers"}
                dropDownAlign="bottom"
                selectIconSx={{marginRight: enablePrimaryAction ? 10: 0}}
                buttonSx={{
                    appearance: 'none',
                    height: '28px',
                    minHeight: '28px',
                    cursor: enablePrimaryAction ? 'pointer' : 'default',
                    pointerEvents: enablePrimaryAction ? 'auto' : 'none'
                }}
                optionButtonSx={{
                    // The toolkit draws only the chevron's right edge; it takes the main button's border on its other sides.
                    border: "1px solid var(--vscode-button-border, transparent)",
                    borderLeft: "none",
                    boxSizing: "border-box",
                    height: '28px',
                    minHeight: '28px'
                }}
                dropdownSx={{
                    zIndex: 9999,
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                    border: '1px solid var(--vscode-dropdown-border)',
                    backgroundColor: 'var(--vscode-dropdown-background)',
                    minWidth: '280px',
                    position: 'absolute',
                    right: '0',
                    left: 'auto'
                }}
                onOptionChange={onOptionChange}
                onClick={() => {
                    if (enablePrimaryAction) {
                        onPrimaryAction();
                    }
                }}
                options={dropdownOptions}
            />
        </div>
    );
}

export interface DropdownOptionProps {
    title: string;
    description?: string;
    value: string;
    iconName?: string; // Used to be shown in the main panel when selected
    iconIsCodicon?: boolean;
}

function DropdownOption({ title, description }: Pick<DropdownOptionProps, 'title' | 'description'>) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div>
                <Typography variant="body2" sx={{ fontWeight: 'medium', lineHeight: 1 }}>{title}</Typography>
                {description && (
                    <Typography variant="body3" sx={{ color: 'var(--vscode-descriptionForeground)' }}>
                        {description}
                    </Typography>
                )}
            </div>
        </div>
    );
}
