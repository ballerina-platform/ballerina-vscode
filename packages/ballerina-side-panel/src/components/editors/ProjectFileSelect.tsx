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

import React from "react";

import { LocationSelector } from "@wso2/ui-toolkit";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { getPrimaryInputType } from "@wso2/ballerina-core";

import { FormField } from "../Form/types";
import { buildRequiredRule } from "./utils";
import { useFormContext } from "../../context";
import { Controller } from "react-hook-form";

interface DropdownEditorProps {
    field: FormField;
}

/**
 * A FILE_SELECT sibling for fields that must resolve to a path relative to the current
 * integration (e.g. platform-dependency JARs) — a file picked from outside the integration is
 * copied into it (under `libs/` by default) rather than merely validated. Kept as its own
 * component, deliberately not a shared refactor of {@link FileSelect}: that component's
 * `selectFileOrDirPath` RPC is also used by OpenAPI-spec import and MCP cert/keystore pickers,
 * none of which want copy-into-project semantics.
 */
export function ProjectFileSelect(props: DropdownEditorProps) {
    const { field } = props;
    const { form } = useFormContext();
    const { setValue, setError, control } = form;

    const { rpcClient } = useRpcContext();

    const handleFileSelect = async () => {
        try {
            const extensions = getPrimaryInputType(field.types)?.extensions;
            const filters = extensions?.length ? { [field.label]: extensions } : undefined;
            const selection = await rpcClient.getCommonRpcClient().selectProjectRelativeFile({ filters });
            // A dismissed dialog (and a host that rejected the selection) comes back
            // with an empty path — keep any earlier pick rather than clearing it.
            if (selection?.path) {
                setValue(field.key, selection.path, { shouldValidate: true });
            }
        } catch (error) {
            console.error(">>> Error selecting the file", error);
            setError(field.key, { type: "file_select_failed", message: `Failed to select ${field.label}. Please try again.` });
        }
    };

    return (
        <Controller
            control={control}
            name={field.key}
            rules={{ required: buildRequiredRule({ isRequired: !field.optional, label: field.label }) }}
            render={({ field: { value }, fieldState: { error } }) => (
                <LocationSelector
                    label={`Select ${field.label} File`}
                    btnText="Select File"
                    selectedFile={value}
                    required={!field.optional}
                    errorMsg={error?.message}
                    onSelect={handleFileSelect}
                />
            )}
        />
    );
}
