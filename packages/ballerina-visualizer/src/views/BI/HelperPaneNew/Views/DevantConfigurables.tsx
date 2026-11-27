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

import { ConfigVariable } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { useState } from "react";
import { Button, CheckBox, TextField, Typography } from "@wso2/ui-toolkit";
import { POPUP_IDS, useModalStack } from "../../../../Context";
import { ExpressionEditorDevantProps } from "@wso2/ballerina-side-panel";
import { useMutation, useQuery } from "@tanstack/react-query";
import { usePlatformExtContext } from "../../../../providers/platform-ext-ctx-provider";
import { FooterContainer } from "../../Connection/styles";
import { FormStyles } from "../../Forms/styles";
import { Configurables, ConfigurablesPageProps } from "./Configurables";

interface DevantConfigurablesProps extends Omit<ConfigurablesPageProps, "excludedConfigs" | "onAddNewConfigurable"> {
    devantExpressionEditor?: ExpressionEditorDevantProps;
}

export const DevantConfigurables = (props: DevantConfigurablesProps) => {
    const { devantExpressionEditor, onClose } = props;
    const { rpcClient } = useRpcContext();
    const { addModal, closeModal } = useModalStack();

    const { data: existingConfigVariables = [] } = useQuery({
        queryFn: async () => {
            const visualizerLocation = await rpcClient.getVisualizerLocation();
            const data = await rpcClient.getBIDiagramRpcClient().getConfigVariablesV2({
                projectPath: visualizerLocation?.projectPath || "",
                includeLibraries: false,
            });
            const configNames: string[] = [];
            const projectToml = await rpcClient.getCommonRpcClient().getCurrentProjectTomlValues();
            const configVars = (data.configVariables as any)?.[
                `${projectToml?.package?.org}/${projectToml?.package?.name}`
            ]?.[""] as ConfigVariable[];
            configVars?.forEach((configVar) =>
                configNames.push(configVar?.properties?.variable?.value?.toString() || ""),
            );
            return configNames;
        },
        queryKey: ["config-variables"],
    });

    const onAddNewConfigurable = (refreshConfigVariables: () => Promise<void>) => {
        addModal(
            <DevantNewConfigurableForm
                onAddDevantConfig={devantExpressionEditor?.onAddDevantConfig}
                onSuccess={(name) => {
                    props.onChange(name, false);
                    closeModal(POPUP_IDS.CONFIGURABLES);
                    refreshConfigVariables();
                }}
                existingNames={[...existingConfigVariables, ...(devantExpressionEditor?.devantConfigs || [])]}
            />,
            POPUP_IDS.CONFIGURABLES,
            "New WSO2 Cloud Configurable",
            400,
        );

        if (onClose) {
            onClose();
        }
    };

    return (
        <Configurables
            {...props}
            excludedConfigs={existingConfigVariables?.filter(
                (config) => !(devantExpressionEditor?.devantConfigs || []).includes(config),
            )}
            onAddNewConfigurable={onAddNewConfigurable}
            showAddNew={!!devantExpressionEditor?.onAddDevantConfig}
        />
    );
};

interface DevantNewConfigurableData {
    name: string;
    value: string;
    isSecret: boolean;
}

interface DevantNewConfigurableFormProps {
    onAddDevantConfig?: (name: string, value: string, isSecret: boolean) => Promise<void>;
    onSuccess: (name: string) => void;
    existingNames?: string[];
}

const DevantNewConfigurableForm: React.FC<DevantNewConfigurableFormProps> = ({
    onAddDevantConfig,
    onSuccess,
    existingNames = [],
}) => {
    const [name, setName] = useState("");
    const [value, setValue] = useState("");
    const [isSecret, setIsSecret] = useState(false);
    const [errors, setErrors] = useState<{ name?: string; value?: string }>({});

    const { mutate, isPending } = useMutation({
        mutationFn: (data: DevantNewConfigurableData) => {
            if (onAddDevantConfig) {
                return onAddDevantConfig(data.name, data.value, data.isSecret);
            }
            return Promise.resolve();
        },
        onSuccess: () => {
            onSuccess(name);
        },
    });

    const validateName = (nameValue: string): string | undefined => {
        if (!nameValue.trim()) {
            return "Name is required";
        }
        // Name cannot have spaces or special characters, cannot start with a number
        const validNameRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
        if (!validNameRegex.test(nameValue)) {
            return "Name must start with a letter or underscore, and contain only letters, numbers, and underscores";
        }
        // Check for duplicates
        if (existingNames.some((existing) => existing.toLowerCase() === nameValue.toLowerCase())) {
            return "A configurable with this name already exists";
        }
        return undefined;
    };

    const validateValue = (valueStr: string): string | undefined => {
        if (!valueStr.trim()) {
            return "Value is required";
        }
        return undefined;
    };

    const handleNameChange = (newName: string) => {
        setName(newName);
        if (errors.name) {
            setErrors((prev) => ({ ...prev, name: undefined }));
        }
    };

    const handleValueChange = (newValue: string) => {
        setValue(newValue);
        if (errors.value) {
            setErrors((prev) => ({ ...prev, value: undefined }));
        }
    };

    const handleSave = () => {
        const nameError = validateName(name);
        const valueError = validateValue(value);

        if (nameError || valueError) {
            setErrors({ name: nameError, value: valueError });
            return;
        }

        mutate({
            name: name.trim(),
            value: value.trim(),
            isSecret,
        });
    };

    return (
        <FormStyles.Container style={{ padding: 16, height: "100%" }}>
            <Typography variant="body3">
                Create a new configurable that will be used when your integration is running in WSO2 Cloud
            </Typography>
            <FormStyles.Row>
                <TextField
                    value={name}
                    label="Name"
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="Enter configurable name"
                    errorMsg={errors.name}
                    sx={{ width: "100%" }}
                />
            </FormStyles.Row>

            <FormStyles.Row>
                <TextField
                    label="Value"
                    value={value}
                    onChange={(e) => handleValueChange(e.target.value)}
                    placeholder="Enter configurable value"
                    type={isSecret ? "password" : "text"}
                    errorMsg={errors.value}
                    sx={{ width: "100%" }}
                />
            </FormStyles.Row>

            <FormStyles.Row>
                <CheckBox label="Mark as secret" checked={isSecret} onChange={() => setIsSecret(!isSecret)} />
            </FormStyles.Row>

            <FooterContainer style={{ flex: 1, display: "flex", alignItems: "end", alignSelf: "end" }}>
                <Button appearance="primary" onClick={handleSave} disabled={isPending}>
                    {isPending ? "Saving..." : "Save"}
                </Button>
            </FooterContainer>
        </FormStyles.Container>
    );
};
