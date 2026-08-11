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

export type StreamItem =
    | { kind: "text"; text: string }
    | { kind: "tool_call"; toolCallId?: string; toolName?: string; toolInput?: any }
    | { kind: "tool_result"; toolCallId?: string; toolName?: string; toolOutput?: any; failed?: boolean }
    | { kind: "plan"; requestId: string; tasks: any[]; message?: string; approvalStatus?: "approved" | "revised"; approvalComment?: string }
    | { kind: "config"; data: Record<string, any> }
    | { kind: "connector"; data: Record<string, any> }
    | { kind: "ask"; data: Record<string, any> }
    | { kind: "skill_enable"; data: Record<string, any> }
    | { kind: "try_it"; toolCallId?: string; input?: any; output?: any }
    | { kind: "component"; id?: string; componentType: string; data: Record<string, any> }
    | { kind: "thinking"; id: string; text: string; done?: boolean; startedAt?: number; endedAt?: number };

export interface StreamEntry {
    /** Empty string = floating entry (no dot, no rail). Non-empty = named task with dot + collapsible events. */
    description: string;
    items: StreamItem[];
    /** Explicit status for named task entries. Omitted = inferred from items + loading state. */
    status?: "in_progress" | "completed";
}

export interface AgentStreamViewProps {
    stream: StreamEntry[];
    isLoading?: boolean;
    rpcClient?: any;
}
