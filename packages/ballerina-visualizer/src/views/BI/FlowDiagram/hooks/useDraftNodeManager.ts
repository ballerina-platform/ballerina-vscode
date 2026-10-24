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

import { useState, useCallback, useRef } from "react";
import { Flow, FlowNode, Branch, LineRange } from "@wso2/ballerina-core";
import { addDraftNodeToDiagram } from "../../../../utils/bi";

interface DraftNodeManagerState {
    originalModel?: Flow;
    hasDraft: boolean;
    draftParent?: FlowNode | Branch;
    draftTarget?: LineRange;
    isProcessing: boolean;
    description: string;
}

interface UseDraftNodeManagerReturn {
    addDraftNode: (parent: FlowNode | Branch, target: LineRange) => Flow;
    rebaseDraft: (model: Flow, parent: FlowNode | Branch, target: LineRange) => Flow;
    cancelDraft: () => Flow | undefined;
    savingDraft: () => void;
    completeDraft: () => void;
    setProcessing: (processing: boolean) => void;
    setDescription: (description: string) => void;
    hasDraft: boolean;
    isProcessing: boolean;
    description: string;
    draftParent?: FlowNode | Branch;
    draftTarget?: LineRange;
    originalModel?: Flow;
}

export function useDraftNodeManager(currentModel?: Flow): UseDraftNodeManagerReturn {
    const [draftState, setDraftState] = useState<DraftNodeManagerState>({
        hasDraft: false,
        isProcessing: false,
        description: "",
    });

    const addDraftNode = useCallback(
        (parent: FlowNode | Branch, target: LineRange): Flow => {
            const model = currentModel;
            if (!model) {
                console.error(">>> useDraftNodeManager: No current model to add draft node");
                return model;
            }

            // Save original state
            setDraftState({
                originalModel: model,
                hasDraft: true,
                isProcessing: false,
                description: "Select node from node panel.",
                draftParent: parent,
                draftTarget: target,
            });

            // Add draft node to model and return the updated model
            const modelWithDraft = addDraftNodeToDiagram(model, parent, target);
            return modelWithDraft;
        },
        [currentModel]
    );

    // Moves an open draft onto a newer model, which a cancel then restores instead of the one the draft started on.
    const rebaseDraft = useCallback((model: Flow, parent: FlowNode | Branch, target: LineRange): Flow => {
        setDraftState((prev) => ({ ...prev, originalModel: model, draftParent: parent, draftTarget: target }));
        return addDraftNodeToDiagram(model, parent, target);
    }, []);

    const cancelDraft = useCallback((): Flow | undefined => {
        const { originalModel } = draftState;

        // Clear draft state
        setDraftState({ hasDraft: false, isProcessing: false, description: "" });

        // Return original model to restore
        return originalModel;
    }, [draftState]);

    const savingDraft = useCallback(() => {
        // Clear draft state when draft is successfully saved
        setDraftState({ hasDraft: true, isProcessing: true, description: "Saving node..." });
    }, []);

    const completeDraft = useCallback(() => {
        // Clear draft state when draft is successfully saved
        setDraftState({ hasDraft: false, isProcessing: false, description: "" });
    }, []);

    const setProcessing = useCallback((processing: boolean) => {
        setDraftState((prev) => ({ ...prev, isProcessing: processing }));
    }, []);

    const setDescription = useCallback((description: string) => {
        setDraftState((prev) => ({ ...prev, description }));
    }, []);

    return {
        addDraftNode,
        rebaseDraft,
        cancelDraft,
        savingDraft,
        completeDraft,
        setProcessing,
        setDescription,
        hasDraft: draftState.hasDraft,
        isProcessing: draftState.isProcessing,
        description: draftState.description,
        draftParent: draftState.draftParent,
        draftTarget: draftState.draftTarget,
        originalModel: draftState.originalModel,
    };
}
