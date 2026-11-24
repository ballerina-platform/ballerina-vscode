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

import React from "react";
import { useFormContext } from "../../context";
import { ContextAwareExpressionEditorProps, ExpressionEditor } from "./ExpressionEditor";
import { getPrimaryInputType, InputType } from "@wso2/ballerina-core";

interface TemplateConfig {
    prefix: string;
    suffix: string;
}

const TEMPLATE_CONFIGS: Record<string, TemplateConfig> = {
    "ai:Prompt": {
        prefix: "`",
        suffix: "`"
    },
    "string": {
        prefix: "string `",
        suffix: "`"
    }
};

const getTemplateConfig = (inputTypes?: InputType[]): TemplateConfig => {
    if (!inputTypes) {
        return { prefix: "`", suffix: "`" };
    }
    const constraint = getPrimaryInputType(inputTypes)?.ballerinaType;
    return TEMPLATE_CONFIGS[constraint] || { prefix: "`", suffix: "`" };
};

const STRING_TEMPLATE = /^string\s*`([\s\S]*)`$/;
const DOCUMENT_INTERPOLATION = /\$\{\s*<\s*ai:\w*Document\s*>/;

export const takesPrompt = (types: InputType[]) => types.some(type => type.ballerinaType?.split("|").includes("ai:Prompt"));

// A string template cannot hold a document, so a string prompt becomes an ai:Prompt once one is added, where the field takes both.
const asPromptTemplate = (types: InputType[], value: string): string => {
    const prompt = getPrimaryInputType(types);
    const template = STRING_TEMPLATE.exec(value);
    if (prompt?.fieldType !== "PROMPT" || !template) {
        return value;
    }
    if (prompt.ballerinaType === "string" && takesPrompt(types) && DOCUMENT_INTERPOLATION.test(value)) {
        prompt.ballerinaType = "ai:Prompt";
    }
    return prompt.ballerinaType === "ai:Prompt" ? `\`${template[1]}\`` : value;
};

export const ContextAwareRawExpressionEditor = (props: ContextAwareExpressionEditorProps) => {
    const { form, expressionEditor, targetLineRange, fileName } = useFormContext();
    const templateConfig = getTemplateConfig(props.field.types);

    const getSanitizedExp = (value: string) => {
        if (!value) {
            return value;
        }
        const { prefix, suffix } = templateConfig;
        if (value.startsWith(prefix) && value.endsWith(suffix)) {
            return value.slice(prefix.length, -suffix.length);
        }
        return value;
    };

    const getRawExp = (value: string) => {
        if (!value) {
            return value;
        }
        const { prefix, suffix } = templateConfig;
        if (!value.startsWith(prefix) && !value.endsWith(suffix)) {
            return `${prefix}${value}${suffix}`;
        }
        return value;
    };

    return (
        <ExpressionEditor
            fileName={fileName}
            targetLineRange={targetLineRange}
            helperPaneZIndex={props.helperPaneZIndex}
            {...form}
            {...expressionEditor}
            {...props}
            rawExpression={(value: string) => asPromptTemplate(props.field.types, getRawExp(value))}
            sanitizedExpression={getSanitizedExp}
        />
    );
};
