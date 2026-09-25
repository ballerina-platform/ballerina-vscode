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

import React, { useRef } from "react";
import styled from "@emotion/styled";
import Popup from "./index";
import { PopupFormBreadcrumb } from "./Form";
import { ModalStackItem, useModalStack } from "../../Context";

// Kept mounted so a parent form keeps its unsaved values.
const ModalLevel = styled.div<{ active: boolean }>`
    display: ${({ active }: { active: boolean }) => (active ? "contents" : "none")};
`;

const groupLevels = (stack: ModalStackItem[]): ModalStackItem[][] =>
    stack.reduce<ModalStackItem[][]>((groups, item) => {
        const open = groups[groups.length - 1];
        if (item.drillDown && open?.[open.length - 1].drillDown) {
            open.push(item);
        } else {
            groups.push([item]);
        }
        return groups;
    }, []);

export const ModalStack: React.FC = () => {
    const { modalStack, popModal, popToModal, clearModals } = useModalStack();
    const previousDepth = useRef(modalStack.length);
    const direction = useRef<"forward" | "back">("forward");

    // Latched on the depth change so later re-renders cannot flip it.
    if (modalStack.length !== previousDepth.current) {
        direction.current = modalStack.length < previousDepth.current ? "back" : "forward";
        previousDepth.current = modalStack.length;
    }

    if (modalStack.length === 0) {
        return null;
    }

    const groups = groupLevels(modalStack);

    return (
        <>
            {groups.map((group, groupIndex) => {
                const topIndex = group.length - 1;
                const top = group[topIndex];
                const below = groups[groupIndex - 1];

                const sizeOf = (pick: (item: ModalStackItem) => number | undefined) =>
                    pick(top) ?? (group.reduce((max, item) => Math.max(max, pick(item) ?? 0), 0) || undefined);

                const breadcrumbs: PopupFormBreadcrumb[] = group.map((item, index) => ({
                    id: item.id,
                    label: item.title,
                    onSelect: index < topIndex ? () => popToModal(item.id) : undefined,
                }));

                return (
                    <Popup
                        key={group[0].id}
                        title={top.title}
                        width={sizeOf((item) => item.width)}
                        height={sizeOf((item) => item.height)}
                        onClose={below ? () => popToModal(below[below.length - 1].id) : clearModals}
                        onBack={topIndex > 0 ? popModal : undefined}
                        breadcrumbs={breadcrumbs}
                        transitionKey={top.id}
                        transitionDirection={direction.current}
                    >
                        {group.map((item, index) => (
                            <ModalLevel key={item.id} active={index === topIndex}>
                                {item.modal}
                            </ModalLevel>
                        ))}
                    </Popup>
                );
            })}
        </>
    );
};

export default ModalStack;
