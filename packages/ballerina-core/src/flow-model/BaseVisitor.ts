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

import { Branch, FlowNode } from "../interfaces/bi";

export interface BaseVisitor {
    skipChildren(): boolean;

    beginVisitNode?(node: FlowNode, parent?: FlowNode): void;
    endVisitNode?(node: FlowNode, parent?: FlowNode): void;

    beginVisitEventStart?(node: FlowNode, parent?: FlowNode): void;
    endVisitEventStart?(node: FlowNode, parent?: FlowNode): void;

    beginVisitErrorHandler?(node: FlowNode, parent?: FlowNode): void;
    endVisitErrorHandler?(node: FlowNode, parent?: FlowNode): void;

    beginVisitIf?(node: FlowNode, parent?: FlowNode): void;
    endVisitIf?(node: FlowNode, parent?: FlowNode): void;

    beginVisitMatch?(node: FlowNode, parent?: FlowNode): void;
    endVisitMatch?(node: FlowNode, parent?: FlowNode): void;

    beginVisitConditional?(node: Branch, parent?: FlowNode): void;
    endVisitConditional?(node: Branch, parent?: FlowNode): void;

    beginVisitBody?(node: Branch, parent?: FlowNode): void;
    endVisitBody?(node: Branch, parent?: FlowNode): void;

    beginVisitElse?(node: Branch, parent?: FlowNode): void;
    endVisitElse?(node: Branch, parent?: FlowNode): void;

    beginVisitWhile?(node: FlowNode, parent?: FlowNode): void;
    endVisitWhile?(node: FlowNode, parent?: FlowNode): void;

    beginVisitForeach?(node: FlowNode, parent?: FlowNode): void;
    endVisitForeach?(node: FlowNode, parent?: FlowNode): void;
    
    beginVisitBlock?(node: Branch, parent?: FlowNode): void;
    endVisitBlock?(node: Branch, parent?: FlowNode): void;

    beginVisitRemoteActionCall?(node: FlowNode, parent?: FlowNode): void;
    endVisitRemoteActionCall?(node: FlowNode, parent?: FlowNode): void;

    beginVisitResourceActionCall?(node: FlowNode, parent?: FlowNode): void;
    endVisitResourceActionCall?(node: FlowNode, parent?: FlowNode): void;

    beginVisitReturn?(node: FlowNode, parent?: FlowNode): void;
    endVisitReturn?(node: FlowNode, parent?: FlowNode): void;

    beginVisitEmpty?(node: FlowNode, parent?: FlowNode): void;
    endVisitEmpty?(node: FlowNode, parent?: FlowNode): void;

    beginVisitCodeBlock?(node: FlowNode, parent?: FlowNode): void;
    endVisitbeginVisitCodeBlock?(node: FlowNode, parent?: FlowNode): void;

    beginVisitDraft?(node: FlowNode, parent?: FlowNode): void;
    endVisitDraft?(node: FlowNode, parent?: FlowNode): void;

    beginVisitComment?(node: FlowNode, parent?: FlowNode): void;
    endVisitComment?(node: FlowNode, parent?: FlowNode): void;

    beginVisitErrorHandler?(node: FlowNode, parent?: FlowNode): void;
    endVisitErrorHandler?(node: FlowNode, parent?: FlowNode): void;

    beginVisitOnFailure?(node: Branch, parent?: FlowNode): void;
    endVisitOnFailure?(node: Branch, parent?: FlowNode): void;

    beginVisitFork?(node: FlowNode, parent?: FlowNode): void;
    endVisitFork?(node: FlowNode, parent?: FlowNode): void;

    beginVisitWorker?(node: Branch, parent?: FlowNode): void;
    endVisitWorker?(node: Branch, parent?: FlowNode): void;

    beginVisitAgentCall?(node: FlowNode, parent?: FlowNode): void;
    endVisitAgentCall?(node: FlowNode, parent?: FlowNode): void;

    beginVisitAgentRun?(node: FlowNode, parent?: FlowNode): void;
    endVisitAgentRun?(node: FlowNode, parent?: FlowNode): void;

    beginVisitAgentType?(node: FlowNode, parent?: FlowNode): void;
    endVisitAgentType?(node: FlowNode, parent?: FlowNode): void;

    beginVisitVectorKnowledgeBaseCall?(node: FlowNode, parent?: FlowNode): void;
    endVisitVectorKnowledgeBaseCall?(node: FlowNode, parent?: FlowNode): void;

    beginVisitParallelFlow?(node: FlowNode, parent?: FlowNode): void;
    endVisitParallelFlow?(node: FlowNode, parent?: FlowNode): void;

    beginVisitLock?(node: FlowNode, parent?: FlowNode): void;
    endVisitLock?(node: FlowNode, parent?: FlowNode): void;

    beginVisitVariable?(node: FlowNode, parent?: FlowNode): void;
    endVisitVariable?(node: FlowNode, parent?: FlowNode): void;

    beginVisitWorkflowRun?(node: FlowNode, parent?: FlowNode): void;
    endVisitWorkflowRun?(node: FlowNode, parent?: FlowNode): void;

    beginVisitActivityCall?(node: FlowNode, parent?: FlowNode): void;
    endVisitActivityCall?(node: FlowNode, parent?: FlowNode): void;

    beginVisitSendData?(node: FlowNode, parent?: FlowNode): void;
    endVisitSendData?(node: FlowNode, parent?: FlowNode): void;

    beginVisitWaitData?(node: FlowNode, parent?: FlowNode): void;
    endVisitWaitData?(node: FlowNode, parent?: FlowNode): void;
}
