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

import { DropdownButton, Typography } from "@wso2/ui-toolkit";
import { DropdownOptionProps } from "./AddServiceElementDropdown";

interface MoreOptionsDropdownProps {
    tooltip?: string;
    defaultOption?: string;
    onOptionChange: (option: string) => void;
    options: DropdownOptionProps[];
}

export function MoreOptionsDropdown(props: MoreOptionsDropdownProps) {
    const { tooltip, defaultOption, onOptionChange, options } = props;

    const dropdownOptions = options.map((option) => ({
        content: <MoreDropdownOption title={option.title} description={option.description} />,
        value: option.value,
    }));

    return (
        <div style={{ position: 'relative', zIndex: 1000 }}>
            <DropdownButton
                buttonContent={null}
                selecteOption={defaultOption ?? ""}
                dropDownAlign="bottom"
                iconName="kebab-vertical"
                optionButtonTooltip={tooltip ?? "More Options"}
                buttonSx={{ display: 'none' }}
                optionButtonSx={{
                    // Stands alone, so it takes the button border on every side; the toolkit draws only the right one.
                    border: '1px solid var(--vscode-button-border, transparent)',
                    boxSizing: 'border-box',
                    borderTopLeftRadius: '4px',
                    borderBottomLeftRadius: '4px',
                    height: '28px',
                    minHeight: '28px',
                    cursor: 'pointer',
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
                options={dropdownOptions}
            />
        </div>
    );
}

function MoreDropdownOption({ title, description }: Pick<DropdownOptionProps, 'title' | 'description'>) {
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
