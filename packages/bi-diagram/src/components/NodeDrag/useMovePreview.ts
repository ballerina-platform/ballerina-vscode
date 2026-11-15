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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Flow, FlowNode, LinePosition } from "../../utils/types";
import { deletionOrder, DropAnchor, isNewElse, moveInFlow, outermost, removeAllFromFlow, resolveAnchor, resolveMove, resolveNodes, targetAfter } from "./flowMoves";
import { DeleteNodeHandler, DeleteNodesHandler, MoveNodeHandler, NodeDragActions } from "./useNodeDrag";

const MODEL_WAIT_MS = 5000;

// Shows lifts, moves and deletes at once and sends them one at a time, each against the flow its predecessor produced.
export function useMovePreview(
    model: Flow,
    onMoveNode?: MoveNodeHandler,
    onDeleteNode?: DeleteNodeHandler,
    onDeleteNodes?: DeleteNodesHandler,
    enabled = true
) {
    const [preview, setPreview] = useState<Flow | null>(null);
    const previewRef = useRef<Flow | null>(null);
    previewRef.current = preview;
    const modelRef = useRef(model);
    modelRef.current = model;
    const liftBase = useRef<Flow | null>(null);
    const pending = useRef(0);
    const dragging = useRef(false);
    const waiters = useRef<Array<() => void>>([]);
    const queue = useRef<Promise<unknown>>(Promise.resolve());
    const handler = useRef(onMoveNode);
    handler.current = onMoveNode;
    const deleter = useRef(onDeleteNode);
    deleter.current = onDeleteNode;
    const canDelete = !!onDeleteNode || !!onDeleteNodes;
    const manyDeleter = useRef(onDeleteNodes);
    manyDeleter.current = onDeleteNodes;
    const deferred = useRef<{ view: Flow; anchor: DropAnchor; run: (fresh: DropAnchor) => void } | null>(null);

    const runDeferred = useCallback(() => {
        const job = deferred.current;
        deferred.current = null;
        const fresh = job && resolveAnchor(job.view, modelRef.current, job.anchor);
        if (fresh) {
            job.run(fresh);
        }
    }, []);

    // The preview's nodes still carry the source ranges from before the move, so acting on one waits for the flow the move produced.
    const afterMoves = useCallback(<T extends DropAnchor>(anchor: T, run: (fresh: T) => void) => {
        const view = previewRef.current;
        if (!pending.current || !view) {
            run(anchor);
            return;
        }
        deferred.current = { view, anchor, run: run as (fresh: DropAnchor) => void };
    }, []);

    useEffect(() => {
        waiters.current.splice(0).forEach((resolve) => resolve());
        if (!pending.current && !dragging.current) {
            setPreview(null);
        }
    }, [model]);

    const actions = useMemo<NodeDragActions | undefined>(() => {
        if (!onMoveNode || !enabled) {
            return undefined;
        }
        // Handlers request the flow they produced as their last step; flows that refresh while they run are intermediate.
        const landing = () =>
            new Promise<void>((resolve) => {
                waiters.current.push(resolve);
                setTimeout(resolve, MODEL_WAIT_MS);
            });
        const send = async (view: Flow, nodes: FlowNode[], anchor: DropAnchor, target: LinePosition) => {
            const fresh = modelRef.current;
            let move = { nodes, target, anchor };
            if (view !== fresh) {
                const resolved = resolveMove(view, fresh, nodes, anchor);
                const freshTarget = resolved && targetAfter(resolved.anchor);
                if (!freshTarget) {
                    return false;
                }
                move = { nodes: resolved.nodes, target: freshTarget, anchor: resolved.anchor };
            }
            const moved = await handler.current(move.nodes, move.target, isNewElse(move.anchor));
            if (moved) {
                await landing();
            }
            return moved;
        };
        const erase = async (view: Flow, nodes: FlowNode[]) => {
            const fresh = modelRef.current;
            const targets = view === fresh ? nodes : resolveNodes(view, fresh, nodes);
            if (!targets) {
                return false;
            }
            if (manyDeleter.current) {
                if (!(await manyDeleter.current(deletionOrder(targets)))) {
                    return false;
                }
            } else if (targets.length === 1 && deleter.current) {
                await deleter.current(targets[0]);
            } else {
                return false;
            }
            await landing();
            return true;
        };
        // Runs one change after the others and keeps its preview on screen until the flow it produced arrives.
        const enqueue = async (job: () => Promise<boolean>) => {
            pending.current++;
            const result = queue.current.then(job, job);
            queue.current = result.catch(() => undefined);
            let done = false;
            try {
                done = await result;
            } catch (error) {
                console.error(">>> Node change failed", error);
            } finally {
                pending.current--;
            }
            if (!pending.current && !dragging.current) {
                setPreview(null);
            }
            if (!pending.current) {
                runDeferred();
            }
            return done;
        };
        return {
            lift: (nodes) => {
                dragging.current = true;
                const base = previewRef.current ?? modelRef.current;
                liftBase.current = base;
                setPreview(removeAllFromFlow(base, nodes) ?? base);
            },
            cancel: () => {
                dragging.current = false;
                setPreview(pending.current ? liftBase.current : null);
            },
            drop: async (nodes, anchor, target) => {
                dragging.current = false;
                const base = liftBase.current ?? modelRef.current;
                const next = moveInFlow(base, nodes, anchor);
                if (!next) {
                    setPreview(pending.current ? base : null);
                    return false;
                }
                setPreview(next);
                return enqueue(() => send(base, nodes, anchor, target));
            },
            remove: canDelete
                ? async (nodes) => {
                      const base = dragging.current ? liftBase.current ?? modelRef.current : previewRef.current ?? modelRef.current;
                      dragging.current = false;
                      const top = outermost(nodes);
                      if (top.length > 1 && !manyDeleter.current) {
                          setPreview(pending.current ? base : null);
                          return false;
                      }
                      setPreview(removeAllFromFlow(base, top, true) ?? base);
                      return enqueue(() => erase(base, top));
                  }
                : undefined,
        };
    }, [onMoveNode, canDelete, enabled]);

    return { flow: preview ?? model, actions, afterMoves };
}
