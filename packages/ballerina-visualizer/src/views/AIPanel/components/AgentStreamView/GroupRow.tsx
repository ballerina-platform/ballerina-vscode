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

import React, { useState } from "react";
import styled from "@emotion/styled";
import { ExpandIcon, ItemDetail, ItemLabel, ItemMeta, ItemRow, ItemsArea, ItemsInner, ToolIcon } from "./styles";
import { GroupSummary, ROW_GROUPS, RowGroupId } from "./rowGroups";

const GroupHeader = styled(ItemRow.withComponent("button"))`
    cursor: pointer;
    user-select: none;
    background: none;
    border: none;
    font: inherit;
    color: inherit;
    text-align: left;
    width: 100%;
`;

const GroupBody = styled.div`
    margin-left: 17px;
`;

interface GroupRowProps {
    group: RowGroupId;
    summary: GroupSummary;
    children: React.ReactNode;
}

const GroupRow: React.FC<GroupRowProps> = ({ group, summary, children }) => {
    const [expanded, setExpanded] = useState(false);
    return (
        <div>
            <GroupHeader type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
                <ToolIcon loading={summary.running}>
                    <span className={`codicon ${ROW_GROUPS[group].icon}`} />
                </ToolIcon>
                <ItemLabel loading={summary.running}>
                    {summary.label}{summary.detail && <ItemDetail>· {summary.detail}</ItemDetail>}
                </ItemLabel>
                {summary.meta && <ItemMeta>· {summary.meta}</ItemMeta>}
                <ExpandIcon expanded={expanded} className="codicon codicon-ellipsis" />
            </GroupHeader>
            <ItemsArea expanded={expanded}>
                <ItemsInner>
                    <GroupBody>{children}</GroupBody>
                </ItemsInner>
            </ItemsArea>
        </div>
    );
};

export default GroupRow;
