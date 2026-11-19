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

import React, { useEffect, useRef, useState } from "react";
import { useAssistHost } from "./AssistHost";
import { S } from "./styles";

/** Marks a field the form's Copilot changed, with what it was and a revert, until the user edits the field. */
export function AssistMark({ fieldKey }: { fieldKey: string }) {
    const host = useAssistHost();
    const mark = host?.applied?.marks[fieldKey];
    const ref = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    // Typing or picking in the field is an edit; the form's own updates after Apply fire no input events.
    useEffect(() => {
        const field = ref.current?.parentElement;
        if (!mark || !field) {
            return;
        }
        const edited = (event: Event) => !ref.current?.contains(event.target as Node) && host?.dropMark(fieldKey);
        field.addEventListener("input", edited, true);
        field.addEventListener("change", edited, true);
        return () => {
            field.removeEventListener("input", edited, true);
            field.removeEventListener("change", edited, true);
        };
    }, [mark, fieldKey]);
    if (!mark) {
        return null;
    }
    const revert = () => {
        mark.revert();
        host?.dropMark(fieldKey);
    };
    return (
        <S.MarkWrap ref={ref} onBlur={(event) => !event.currentTarget.contains(event.relatedTarget as Node) && setOpen(false)}>
            <S.Mark type="button" aria-expanded={open} onClick={() => setOpen(!open)}>Set by Copilot</S.Mark>
            {open && (
                <S.MarkCard role="dialog" aria-label="Copilot Change">
                    <S.Muted>Was</S.Muted><span>{mark.before || "Empty"}</span>
                    <S.Muted>Asked</S.Muted><span>{mark.request}</span>
                    {mark.source && <><S.Muted>From</S.Muted><span>{mark.source}</span></>}
                    <S.BarButton type="button" onClick={revert}>Revert This Field</S.BarButton>
                </S.MarkCard>
            )}
        </S.MarkWrap>
    );
}
