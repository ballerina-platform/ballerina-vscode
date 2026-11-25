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
import { ExpressionProperty } from "@wso2/ballerina-core";
import { useFormContext } from "../../../context";
import { FormField } from "../../Form/types";
import { getPropertyFromFormField } from "../utils";
import { useAssistHost } from "./AssistHost";
import { SlotKind, slotType } from "./fieldKinds";

export type { SlotKind } from "./fieldKinds";

export function AssistSlot({ field, kind, onApply }: { field: FormField; kind: SlotKind; onApply?: (value: string) => void }) {
    const host = useAssistHost();
    const { form, partOfParentForm } = useFormContext();
    const latest = useRef(field);
    latest.current = field;
    const applyRef = useRef(onApply);
    applyRef.current = onApply;
    useEffect(() => {
        // A field of a nested form (a row's editor) is part of the field that holds it, which the form offers whole.
        if (!host || partOfParentForm || (field.editable === false && !onApply)) {
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
