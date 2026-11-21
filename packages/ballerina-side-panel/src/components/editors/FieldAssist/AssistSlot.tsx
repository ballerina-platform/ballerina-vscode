/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { useEffect, useRef } from "react";
import { ExpressionProperty, InputType } from "@wso2/ballerina-core";
import { useFormContext } from "../../../context";
import { FormField } from "../../Form/types";
import { getPropertyFromFormField } from "../utils";
import { useAssistHost } from "./AssistHost";

// How the form Copilot fills a field whose editor is not an expression editor: STRING is plain text kept as typed.
// VALUE keeps the field's own property, for a field whose editor is not mounted.
export type SlotKind = "STRING" | "SINGLE_SELECT" | "FLAG" | "TYPE" | "IDENTIFIER" | "NUMBER" | "VALUE";

const option = (value: unknown, label?: unknown) => ({ value: String(value), label: String(label ?? value) });

// Each choice with the label the dropdown shows, so a change reads as the user picked it.
const fieldOptions = (field: FormField): { label: string; value: string }[] =>
    field.itemOptions?.map(({ value, content }) => option(value, content))
    ?? (field.items ?? []).map((item: unknown) => {
        const { value, label } = (typeof item === "object" && item ? item : { value: item }) as { value: unknown; label?: unknown };
        return option(value, label);
    });

const ballerinaTypeOf = (field: FormField): string | undefined =>
    (field.types?.find((type) => type.selected) ?? field.types?.[0])?.ballerinaType;

function slotType(field: FormField, kind: Exclude<SlotKind, "VALUE">): InputType {
    if (kind === "SINGLE_SELECT") {
        return { fieldType: kind, selected: true, options: fieldOptions(field) };
    }
    if (kind === "NUMBER") {
        return { fieldType: "EXPRESSION", ballerinaType: ballerinaTypeOf(field) || "int", selected: true };
    }
    return { fieldType: kind, ballerinaType: ballerinaTypeOf(field), selected: true };
}

/** Lets the form's Copilot read and fill a field that has no Copilot of its own. */
export function AssistSlot({ field, kind, onApply }: { field: FormField; kind: SlotKind; onApply?: (value: string) => void }) {
    const host = useAssistHost();
    const { form } = useFormContext();
    const latest = useRef(field);
    latest.current = field;
    const applyRef = useRef(onApply);
    applyRef.current = onApply;
    useEffect(() => {
        if (!host || (field.editable === false && !onApply)) {
            return;
        }
        return host.registerField(field.key, {
            label: field.label,
            description: field.documentation,
            property: (): ExpressionProperty => kind === "VALUE"
                ? getPropertyFromFormField(latest.current)
                : { ...getPropertyFromFormField(latest.current), types: [slotType(latest.current, kind)] },
            value: () => String(form.getValues(field.key) ?? ""),
            apply: (value) => {
                if (applyRef.current) {
                    applyRef.current(value);
                    return;
                }
                const next = kind === "FLAG" ? value === "true" : value;
                form.setValue(field.key, next, { shouldDirty: true, shouldValidate: true });
                latest.current.onValueChange?.(next);
            },
        });
    }, [host?.registerField, field.key, field.editable, kind]);
    return null;
}
