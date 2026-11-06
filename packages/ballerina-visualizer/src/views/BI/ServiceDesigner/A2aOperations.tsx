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

import styled from "@emotion/styled";
import { FunctionModel } from "@wso2/ballerina-core";
import { ResourceAccordion, getColorByMethod } from "./components/ResourceAccordion";
import { GROUP_ORDER, OTHER, describeA2aOperation } from "./a2aOperationNames";

const Groups = styled.div`
    padding-top: 14px;
    display: flex;
    flex-direction: column;
    gap: 18px;
`;

const GroupTitle = styled.div`
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 0 2px 6px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--vscode-descriptionForeground);
`;

const Count = styled.span`
    font-weight: 400;
    letter-spacing: 0;
`;

const Rows = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;
`;

interface A2aOperationsProps {
    handlers: FunctionModel[];
    onDeleteGroup: (models: FunctionModel[]) => void;
    onImplement: (model: FunctionModel) => void;
}

export function A2aOperations(props: A2aOperationsProps) {
    const { handlers, onDeleteGroup, onImplement } = props;
    const rows = handlers.map((model) => ({ model, ...describeA2aOperation(model.accessor?.value, model.name?.value) }));
    const groups = [...GROUP_ORDER, OTHER]
        .map((group) => ({ group, rows: rows.filter((row) => row.group === group).sort((a, b) => a.order - b.order) }))
        .filter((entry) => entry.rows.length > 0);

    return (
        <Groups>
            {groups.map(({ group, rows: inGroup }) => (
                <div key={group}>
                    <GroupTitle>{group}<Count>{inGroup.length}</Count></GroupTitle>
                    <Rows>
                        {inGroup.map(({ model, title, method, path, core }) => (
                            <ResourceAccordion
                                key={path + method}
                                functionModel={model}
                                method={method}
                                badgeColor={getColorByMethod(method)}
                                title={title}
                                subtitle={path}
                                goToSource={() => { }}
                                deletable
                                onDeleteResource={core ? undefined : () => onDeleteGroup(inGroup.map((row) => row.model))}
                                onResourceImplement={onImplement}
                                deletionTypeLabel={`"${group}" group (${inGroup.length} ${inGroup.length === 1 ? "operation" : "operations"})`}
                            />
                        ))}
                    </Rows>
                </div>
            ))}
        </Groups>
    );
}

export default A2aOperations;
