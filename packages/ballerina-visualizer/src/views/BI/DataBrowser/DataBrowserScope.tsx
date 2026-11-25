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

import React, { useCallback, useMemo, useRef, useState } from "react";
import { Configurables, InsertTarget, InsertTargetContext, InsertTargetContextType, isSecretField } from "@wso2/ballerina-side-panel";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { InputType, LineRange } from "@wso2/ballerina-core";
import { ViewContent } from "@wso2/ui-toolkit";
import { DataBrowser, DataBrowserProps } from "./DataBrowser";
import { ValuePicker } from "./ValuePicker";
import { useDataTree } from "./useDataTree";
import { useCreateData } from "./useCreateData";
import { listConfigurables } from "../Forms/form-utils";
import { S } from "./styles";

interface DataBrowserScopeProps extends Omit<DataBrowserProps, "targetLineRange"> {
    targetLineRange?: LineRange;
    children: React.ReactNode;
    // Gives the form its own picker even inside another form's scope, as a modal over that form needs.
    isolated?: boolean;
    // Off for forms with nothing to fill from it, such as a name-and-type definition.
    enabled?: boolean;
}

// Fields that hold a value expression, including records whose fields do; names and type definitions do not.
const EXPRESSION_FIELDS = new Set(["EXPRESSION", "ACTION_OR_EXPRESSION", "ACTION_EXPRESSION", "EXPRESSION_SET", "RECORD_MAP_EXPRESSION", "CLAUSE_EXPRESSION"]);

interface TypedField {
    key?: string;
    label?: string;
    metadata?: { label?: string };
    types?: InputType[];
    advanceProps?: TypedField[];
    // Form fields list each option's fields; node properties key them.
    dynamicFormFields?: Record<string, TypedField[] | Record<string, TypedField>>;
    choices?: { properties?: Record<string, TypedField> }[];
    properties?: Record<string, TypedField>;
}

// A listener choice, its config record or a select's per-option fields hold expressions the top level does not show.
const nestedFields = (field: TypedField): TypedField[] => [
    ...(field.advanceProps ?? []),
    ...Object.values(field.properties ?? {}),
    ...Object.values(field.dynamicFormFields ?? {}).flatMap((option) => Object.values(option)),
    ...(field.choices ?? []).flatMap((choice) => Object.values(choice.properties ?? {})),
];

const anyField = (fields: TypedField[], matches: (field: TypedField) => boolean): boolean =>
    fields.some((field) => matches(field) || anyField(nestedFields(field), matches));

const anyType = (fields: TypedField[], matches: (type: InputType) => boolean): boolean =>
    anyField(fields, (field) => !!field.types?.some(matches));

// A secret field picks or creates a configurable, which the scope provides.
const isSecret = (field: TypedField) => isSecretField({ ...field, key: field.key ?? "", label: field.label ?? field.metadata?.label });

export const takesExpressions = (fields: TypedField[]) =>
    anyField(fields, (field) => isSecret(field) || !!field.types?.some((type) => EXPRESSION_FIELDS.has(type.fieldType)));

export const takesPrompts = (fields: TypedField[]) => anyType(fields, (type) => !!type.ballerinaType?.includes("ai:Prompt"));

/** Gives the form inside it a value picker, which each field opens under itself. */
export function DataBrowserScope({ children, isolated, enabled = true, targetLineRange, ...browserProps }: DataBrowserScopeProps) {
    const outer = React.useContext(InsertTargetContext);
    if ((outer && !isolated) || !enabled || !browserProps.fileName || !targetLineRange) {
        return <>{children}</>;
    }
    return <OwnScope browserProps={{ ...browserProps, targetLineRange }}>{children}</OwnScope>;
}

function OwnScope({ browserProps, children }: { browserProps: DataBrowserProps; children: React.ReactNode }) {
    const [target, setTarget] = useState<InsertTarget | null>(null);
    const { context, picker } = useValuePicker(browserProps, target, setTarget);
    return (
        <InsertTargetContext.Provider value={context}>
            {children}
            {picker}
        </InsertTargetContext.Provider>
    );
}

/**
 * The fields' insert context for one form, with the picker a field opens under itself: the field's button toggles it,
 * another field's moves it there. The form's values stay loaded while it is open, so reopening is instant.
 */
export function useValuePicker(
    browserProps: DataBrowserProps | undefined,
    target: InsertTarget | null,
    setTarget: InsertTargetContextType["setTarget"]
) {
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const [refresh, setRefresh] = useState(0);
    const tree = useDataTree(browserProps?.fileName, browserProps?.targetLineRange, browserProps?.codedata, refresh);
    const close = useCallback(() => setAnchor(null), []);
    const openPicker = useCallback((next: HTMLElement) => setAnchor((open) => (open === next ? null : next)), []);
    const loaded = browserProps && { ...browserProps, tree, onRefreshTree: () => setRefresh((count) => count + 1) };
    const configurables = useConfigurables(browserProps, () => setRefresh((count) => count + 1));
    const context: InsertTargetContextType = {
        target,
        setTarget,
        // The expanded editor shows the browser beside its larger editor.
        browser: loaded && <DataBrowser {...loaded} />,
        openPicker: loaded ? openPicker : undefined,
        pickerAnchor: target ? anchor : null,
        configurables,
    };
    const picker = loaded && anchor && target
        ? <ValuePicker {...loaded} anchor={anchor} context={context} target={target} onClose={close} />
        : null;
    return { context, picker };
}

// The project's configurables for the form's fields; stable across renders, so a field's list loads once.
function useConfigurables(browserProps: DataBrowserProps | undefined, onCreated: () => void): Configurables | undefined {
    const { rpcClient } = useRpcContext();
    const create = useCreateData(browserProps?.fileName ?? "", browserProps?.targetLineRange, browserProps?.onSubmitForm, onCreated);
    const createRef = useRef(create);
    createRef.current = create;
    const available = !!browserProps;
    return useMemo(() => available ? {
        list: (type: string) => listConfigurables(rpcClient, type),
        create: (seed, onSaved) => void createRef.current.configurable(seed, (name) => {
            onSaved(name);
            onCreated();
        }),
    } : undefined, [available, rpcClient]);
}

/** A page's content area, below its header. */
export function BrowserViewContent({ children, padding }: { children: React.ReactNode; padding?: boolean }) {
    return (
        <S.Page>
            <S.PageView>
                <ViewContent padding={padding}>{children}</ViewContent>
            </S.PageView>
        </S.Page>
    );
}
