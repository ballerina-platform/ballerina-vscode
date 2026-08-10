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

import { ReactNode } from "react";
import { Icon } from "@wso2/ui-toolkit";
import {
    ProjectTypeContainer,
    ProjectTypeLabel,
    RadioGroup,
    RadioOption,
    RadioInput,
    RadioIcon,
    RadioContent,
    RadioTitle,
    RadioDescription,
    Note,
} from "../styles";

export interface ProjectTypeOption {
    value: string;
    title: string;
    description: string;
    /** Codicon name shown in the option's icon badge. */
    icon: string;
}

export interface ProjectTypeSelectorProps {
    /** The currently selected value */
    value: boolean;
    /** Callback when the selection changes */
    onChange: (isLibrary: boolean) => void;
    /** Optional note to display below the options */
    note?: ReactNode;
    /** Section label above the options. Defaults to "Type". */
    label?: string;
}

const PROJECT_TYPE_OPTIONS: ProjectTypeOption[] = [
    {
        value: "integration",
        title: "Create an integration",
        description: "Build APIs, automations, event-driven flows, AI integrations, and more.",
        icon: "circuit-board",
    },
    {
        value: "library",
        title: "Create a library",
        description: "Build reusable components and utilities that can be shared across integrations.",
        icon: "library",
    },
];

export function ProjectTypeSelector({
    value,
    onChange,
    note,
    label = "Type",
}: ProjectTypeSelectorProps) {
    return (
        <ProjectTypeContainer>
            <ProjectTypeLabel>{label}</ProjectTypeLabel>
            <RadioGroup>
                {PROJECT_TYPE_OPTIONS.map((option) => {
                    const isLibrary = option.value === "library";
                    const isSelected = value === isLibrary;

                    return (
                        <RadioOption key={option.value} isSelected={isSelected}>
                            <RadioInput
                                type="radio"
                                name="projectType"
                                value={option.value}
                                checked={isSelected}
                                onChange={() => onChange(isLibrary)}
                            />
                            <RadioIcon>
                                <Icon
                                    name={option.icon}
                                    isCodicon
                                    sx={{ width: "24px", height: "24px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                                    iconSx={{ fontSize: "24px", lineHeight: 1 }}
                                />
                            </RadioIcon>
                            <RadioContent>
                                <RadioTitle>{option.title}</RadioTitle>
                                <RadioDescription>{option.description}</RadioDescription>
                            </RadioContent>
                        </RadioOption>
                    );
                })}
            </RadioGroup>
            {note && <Note>{note}</Note>}
        </ProjectTypeContainer>
    );
}
