// Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com/) All Rights Reserved.

// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at

// http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.

import { tool } from 'ai';
import { z } from 'zod';
import { CopilotEventHandler } from '../../utils/events';
import { Task, TaskStatus, TaskTypes, Plan } from '@wso2/ballerina-core';
import { chatStateStorage } from '../../../../views/ai-panel/chatStateStorage';
import { approvalManager } from '../../state/ApprovalManager';

export const TASK_WRITE_TOOL_NAME = "TaskWrite";

export interface TaskWriteResult {
    success: boolean;
    message: string;
    tasks: Task[];
}

export const TaskInputSchema = z.object({
    description: z.string().min(1).describe("Clear, actionable description of the task to be implemented"),
    status: z.enum([TaskStatus.PENDING, TaskStatus.IN_PROGRESS, TaskStatus.COMPLETED]).describe("Current status of the task. Make sure mark it as completed only after the task is fully done and diagnostics are clean."),
    type: z.enum([TaskTypes.SERVICE_DESIGN, TaskTypes.IMPLEMENTATION, TaskTypes.EXECUTION]).describe("Type of the implementation task. service_design: creates the service contract only (no implementation). implementation: all other implementation tasks. execution: executing the implemented logic(run, try it, test) — include only if the user has explicitly asked for execution.")
});

const TaskWriteInputSchema = z.object({
    tasks: z.array(TaskInputSchema).min(1).describe("ALL TASKS - EVERY SINGLE ONE. This tool is stateless. Always send the COMPLETE list of tasks with their current statuses."),
    isPlanApproval: z.boolean().optional().describe(
        "Set to true when submitting the initial plan or a revised plan. " +
        "This shows the full task list to the user and waits for plan approval before execution begins. " +
        `Use this on the very first ${TASK_WRITE_TOOL_NAME} call, and again if the user requests plan changes.`
    ),
    requestReview: z.boolean().optional().describe(
        "Set to true after completing a meaningful milestone (e.g. finishing a logical unit of work) " +
        "when you want the user to review the current state before continuing. " +
        "Do NOT use after every single task — only at significant checkpoints."
    )
});

export type TaskWriteInput = z.infer<typeof TaskWriteInputSchema>;

export function createTaskWriteTool(
    eventHandler: CopilotEventHandler,
    _tempProjectPath: string,
    _modifiedFiles: string[] | undefined,
    projectRootPath: string,
    generationId: string,
    threadId: string = 'default'
) {
    return tool({
        description: `Create and update implementation tasks for the design plan.
## Task Ordering:
- Tasks should be ordered sequentially as they need to be executed.
- Prioritize service design, then implementation tasks.

## CRITICAL RULE - ALWAYS SEND ALL TASKS:
This tool is STATELESS. Every call MUST include ALL tasks.

**Why This Matters:**
The tool replaces the entire task list on each call. If you omit tasks, they will be permanently lost from the plan.

**Rules:**
- Have 5 tasks? Send all 5 EVERY time
- Updating 1 task? Send ALL tasks with the update
- NEVER omit completed tasks when moving to next task
- Think: You're replacing the entire list, not editing one item
- Tasks are identified by their description - keep descriptions consistent

**Validation:**
- Tool will ERROR if you're missing tasks from the previous plan
- Error message will list exactly which task descriptions are missing

**Example - Correct Behavior:**
If you have 5 tasks and updating task 3:
- WRONG: Send only task 3
- WRONG: Send only tasks 3, 4, 5 (missing completed tasks 1-2)
- CORRECT: Send all 5 tasks (tasks 1-2 as completed, task 3 as in_progress, tasks 4-5 as pending)

## USER APPROVAL REQUIRED:
1. **Plan Approval**: User approves/rejects initial task list
2. **Task Completion Approval**: User approves/rejects each completed task before moving to the next

## CREATING TASKS (First Call):
Send ALL tasks with status "pending".
Example:
[
  {"description": "Create the HTTP service contract", "status": "pending", "type": "service_design"},
  {"description": "Implement the resource functions", "status": "pending", "type": "implementation"}
]

## UPDATING TASKS (Every Other Call):
Send ALL tasks with updated statuses. Tasks are identified by their description.

Workflow per task (after plan approval):
1. Mark in_progress → Send ALL tasks
2. Do the work immediately
3. Mark completed → Send ALL tasks
4. Tool will request user approval (or auto-approve if enabled)
5. If approved → Tool returns tasks with 'completed' status, start next task (repeat from step 1)
6. If rejected → Tool returns task with 'completed' status and rejection comment, redo the task based on feedback

Example (3 tasks total):
Start task 1 - Send ALL:
[
  {"description": "Create the HTTP service contract", "status": "in_progress", "type": "service_design"},
  {"description": "Implement the resource functions", "status": "pending", "type": "implementation"}
]

Complete task 1 - Send ALL:
[
  {"description": "Create the HTTP service contract", "status": "completed", "type": "service_design"},
  {"description": "Implement the resource functions", "status": "pending", "type": "implementation"}
]

After approval, start task 2 - Send ALL:
[
  {"description": "Create the HTTP service contract", "status": "completed", "type": "service_design"},
  {"description": "Implement the resource functions", "status": "in_progress", "type": "implementation"}
]

Rules:
- Send ALL tasks on every call
- Only ONE task "in_progress" at a time
- Set isPlanApproval: true on the first call (and when revising the plan)
- Set requestReview: true only at meaningful milestones, not after every task
- After plan approval, start tasks immediately and continue autonomously unless requestReview is set`,
        inputSchema: TaskWriteInputSchema,
        execute: async (input: TaskWriteInput): Promise<TaskWriteResult> => {
            try {
                const allTasks = mapInputToTasks(input);

                console.log(`[TaskWrite Tool] Received ${allTasks.length} task(s), isPlanApproval=${input.isPlanApproval}, requestReview=${input.requestReview}`);

                const taskCategories = categorizeTasks(allTasks);

                let approvalResult: { approved: boolean; comment?: string; approvedTaskDescription?: string } | undefined;
                let approvalType: "plan" | "completion" | undefined;

                if (eventHandler) {
                    if (input.isPlanApproval === true) {
                        approvalType = "plan";
                        const autoApprove = !!(process.env.INITIAL_SCAFFOLD_PROMPT && process.env.INITIAL_SCAFFOLD_STEPS);
                        approvalResult = await handlePlanApproval(allTasks, eventHandler, projectRootPath, generationId, threadId, autoApprove);
                    } else if (input.requestReview === true) {
                        // TODO: Re-enable approval gate (handleTaskCompletion) when review flow is ready
                        // Skip review gate — mark as completed and continue autonomously
                        eventHandler({
                            type: "tool_result",
                            toolName: TASK_WRITE_TOOL_NAME,
                            toolOutput: {
                                success: true,
                                message: `Completed: ${taskCategories.completed[taskCategories.completed.length - 1]?.description ?? "tasks"}`,
                                tasks: allTasks
                            }
                        });
                    } else if (taskCategories.inProgress.length > 0) {
                        // Task started — emit progress event, no user gate
                        console.log(`[TaskWrite Tool] Task in progress: ${taskCategories.inProgress[0].description}`);
                        eventHandler({
                            type: "tool_result",
                            toolName: TASK_WRITE_TOOL_NAME,
                            toolOutput: {
                                success: true,
                                message: `Started working on: ${taskCategories.inProgress[0].description}`,
                                tasks: allTasks
                            }
                        });
                    } else if (taskCategories.completed.length > 0) {
                        // Task(s) completed without requestReview — integrate code silently, no user gate
                        // TODO: Re-enable workspace integration when ready
                        // if (tempProjectPath && modifiedFiles) {
                        //     const modifiedFilesSet = new Set(modifiedFiles);
                        //     const ctx = createExecutionContextFromStateMachine();
                        //     await integrateCodeToWorkspace(tempProjectPath, modifiedFilesSet, ctx);
                        // }
                        // Emit completion event so the visualizer knows execution is done
                        // and can render subsequent content (agent's closing text) normally
                        eventHandler({
                            type: "tool_result",
                            toolName: TASK_WRITE_TOOL_NAME,
                            toolOutput: {
                                success: true,
                                message: `Completed: ${taskCategories.completed[taskCategories.completed.length - 1].description}`,
                                tasks: allTasks
                            }
                        });
                    }
                }

                const message = generateResultMessage(
                    approvalResult,
                    approvalType,
                    approvalResult?.approvedTaskDescription,
                    allTasks,
                    taskCategories
                );

                console.log(`[TaskWrite Tool] Returning ${allTasks.length} tasks (${taskCategories.completed.length} completed, ${taskCategories.inProgress.length} in progress, ${taskCategories.pending.length} pending)`);

                return {
                    success: approvalResult ? approvalResult.approved : true,
                    message,
                    tasks: allTasks
                };
            } catch (error) {
                // Let an abort propagate as a tool-error instead of a raw "Failed to process tasks" message.
                if ((error as any)?.name === 'AbortError') {
                    throw error;
                }
                console.error("Error in TaskWrite tool:", error);
                return {
                    success: false,
                    message: `Failed to process tasks: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    tasks: []
                };
            }
        }
    });
}

function mapInputToTasks(input: TaskWriteInput): Task[] {
    return input.tasks.map(task => ({
        description: task.description,
        status: task.status as TaskStatus,
        type: task.type as TaskTypes
    }));
}

function categorizeTasks(allTasks: Task[]) {
    return {
        completed: allTasks.filter(t => t.status === TaskStatus.COMPLETED),
        inProgress: allTasks.filter(t => t.status === TaskStatus.IN_PROGRESS),
        pending: allTasks.filter(t => t.status === TaskStatus.PENDING)
    };
}


function createPlan(allTasks: Task[]): Plan {
    return {
        id: `plan-${Date.now()}`,
        tasks: allTasks,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
}

async function handlePlanApproval(
    allTasks: Task[],
    eventHandler: CopilotEventHandler,
    projectRootPath: string,
    generationId: string,
    threadId: string,
    autoApprove: boolean = false
): Promise<{ approved: boolean; comment?: string }> {
    console.log(`[TaskWrite Tool] Plan approval requested, autoApprove=${autoApprove}`);

    const plan = createPlan(allTasks);

    // Store plan in ChatStateStorage with the generation
    chatStateStorage.updateGeneration(projectRootPath, threadId, generationId, { plan });

    if (autoApprove) {
        // Emit event so the plan card renders in the UI, marked as auto-approved
        eventHandler({
            type: "task_approval_request",
            requestId: `plan-auto-${Date.now()}`,
            approvalType: "plan",
            tasks: allTasks,
            message: "Plan auto-approved",
            autoApproved: true,
        });
        return { approved: true };
    }

    // Use ApprovalManager for plan approval (replaces state machine subscription)
    const requestId = `plan-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

    const approvalPromise = approvalManager.requestPlanApproval(
        requestId,
        allTasks,
        eventHandler
    );

    return approvalPromise;
}

function generateResultMessage(
    approvalResult: { approved: boolean; comment?: string } | undefined,
    approvalType: "plan" | "completion" | undefined,
    approvedTaskDescription: string | undefined,
    allTasks: Task[],
    taskCategories: ReturnType<typeof categorizeTasks>
): string {
    if (approvalResult) {
        if (approvalResult.approved) {
            if (approvalType === "plan") {
                return `Plan approved! Ready to start execution. ${allTasks.length} tasks created.`;
            }
            return `Work approved! Task completed successfully. ${approvedTaskDescription ? `Task: ${approvedTaskDescription}` : ''}`;
        } else {
            const feedback = approvalResult.comment ? ` User comment: "${approvalResult.comment}"` : '';
            return approvalType === "plan"
                ? `Plan not approved. Please revise the plan based on feedback.${feedback}`
                : `Work not approved. Please redo the task based on feedback.${feedback}`;
        }
    }

    if (taskCategories.inProgress.length > 0) {
        return `Started working on: ${taskCategories.inProgress[0].description}`;
    }
    if (taskCategories.completed.length === allTasks.length) {
        return `All tasks completed!`;
    }
    if (taskCategories.completed.length > 0) {
        return `Completed: ${taskCategories.completed[taskCategories.completed.length - 1].description}`;
    }
    return `Successfully created ${allTasks.length} implementation tasks. Tasks are now ready for execution.`;
}
