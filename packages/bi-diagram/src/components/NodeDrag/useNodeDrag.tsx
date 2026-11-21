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

import React, { useCallback, useEffect, useRef, useState } from "react";
import { DiagramEngine, DiagramModel, NodeModel, PortModel } from "@projectstorm/react-diagrams";
import { Codicon, Icon } from "@wso2/ui-toolkit";
import { FlowNode, LinePosition } from "../../utils/types";
import { NodeLinkModel } from "../NodeLink";
import { EmptyNodeModel } from "../nodes/EmptyNode";
import {
    ADD_BUTTON_BG_COLOR,
    CONTROLS_BG_COLOR,
    LINK_HOVERED_COLOR,
    NODE_BORDER_COLOR,
    NODE_ERROR_COLOR,
    NODE_WIDTH,
    NodeTypes,
} from "../../resources/constants";
import { countInside, DropAnchor, isNewElse, nodeSignature, outermost, targetAfter } from "./flowMoves";
import { canvasGesture, portOffset } from "../../utils/diagram";

export type MoveNodeHandler = (nodes: FlowNode[], target: LinePosition, newElse?: boolean) => Promise<boolean>;
export type DeleteNodeHandler = (node: FlowNode) => void | Promise<void>;
export type DeleteNodesHandler = (nodes: FlowNode[]) => Promise<boolean>;

export interface NodeDragActions {
    lift: (nodes: FlowNode[]) => void;
    drop: (nodes: FlowNode[], anchor: DropAnchor, target: LinePosition) => Promise<boolean>;
    cancel: () => void;
    remove?: (nodes: FlowNode[]) => Promise<boolean>;
}

const MOVABLE_TYPES = new Set<string>([
    NodeTypes.BASE_NODE,
    NodeTypes.IF_NODE,
    NodeTypes.WHILE_NODE,
    NodeTypes.ERROR_NODE,
    NodeTypes.API_CALL_NODE,
    NodeTypes.AGENT_CALL_NODE,
    NodeTypes.DURABLE_AGENT_RUN_NODE,
    NodeTypes.PROMPT_NODE,
    NodeTypes.WORKFLOW_RUN_NODE,
    NodeTypes.CALL_ACTIVITY_NODE,
    NodeTypes.SEND_DATA_NODE,
    NodeTypes.WAIT_DATA_NODE,
]);
const FIXED_KINDS = new Set(["EVENT_START"]);
const DRAG_THRESHOLD = 6;
const LABELLED_SLOT_OFFSET = 28;
const SCROLL_EDGE = 64;
const SCROLL_SPEED = 12;
const SNAP_DISTANCE = 90;
// Layout changes stay short so a quick edit never feels like waiting.
const SETTLE_MS = 160;
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
// Sits in the column of the zoom controls, where a centred flow rarely reaches.
const BIN_SIZE = 44;
const BIN_LEFT = 20;
// The bin answers to the card as well as the cursor, in an area wider than the button; once active it holds on a little longer.
const BIN_PAD = 28;
const BIN_HOLD = 36;
const BIN_PULL_SCALE = 0.6;
const PULL_MS = 180;
const TOAST_MS = 5000;
export const INTERACTIVE = "vscode-button, button, input, textarea, select, a, [role='menu'], [data-testid^='link-add-button']";

interface DropZone {
    key: string;
    x: number; // screen coordinates
    y: number;
    target: LinePosition;
    anchor: DropAnchor;
    linkId?: string;
}

interface DragSession {
    pointerId: number;
    startX: number;
    startY: number;
    element: HTMLElement;
    flowNode: FlowNode;
    started: boolean;
    grabX: number;
    grabY: number;
    cardWidth: number;
    cardHeight: number;
    pullUntil: number;
    zoom: number;
    zones: DropZone[];
    // The grabbed node, plus the rest of the selection when it was part of one, in source order.
    group: FlowNode[];
    homeKey?: string;
    ghost?: HTMLDivElement;
}

interface Bin {
    x: number; // screen coordinates of its centre
    y: number;
    label: string;
    hot: boolean;
}

interface Toast {
    text: string;
}

interface PendingSettle {
    positions: Map<string, { x: number; y: number }>;
    ghost?: HTMLDivElement;
    timer?: ReturnType<typeof setTimeout>;
}

interface Tween {
    node: NodeModel;
    x: number;
    y: number;
    dx: number;
    dy: number;
}

const slideIn = (bin: HTMLDivElement | null) =>
    bin?.animate([{ transform: "translateX(-24px)", opacity: 0 }, { transform: "translateX(0)", opacity: 1 }], { duration: 200, easing: EASE });

const popIn = (marker: HTMLDivElement | null) =>
    marker?.animate([{ transform: "scale(0.4)", opacity: 0 }, { transform: "scale(1)", opacity: 1 }], { duration: 180, easing: EASE });

const pulse = (ring: HTMLDivElement | null) =>
    ring?.animate([{ transform: "scale(1)", opacity: 0.6 }, { transform: "scale(2)", opacity: 0 }], {
        duration: 1100,
        easing: "ease-out",
        iterations: Infinity,
    });

// The canvas element runs past the bottom of the webview, so only the part on screen counts.
export function viewRect(root: HTMLElement) {
    const rect = root.getBoundingClientRect();
    const win = root.ownerDocument.defaultView;
    return {
        left: Math.max(rect.left, 0),
        top: Math.max(rect.top, 0),
        right: Math.min(rect.right, win?.innerWidth ?? rect.right),
        bottom: Math.min(rect.bottom, win?.innerHeight ?? rect.bottom),
    };
}

export const nodeElements = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>(".node[data-nodeid]")];

const flowNodeOf = (model: DiagramModel, id: string): FlowNode | undefined =>
    (model.getNode(id) as unknown as { node?: FlowNode })?.node;

// Node ids come from source positions, so nodes are matched across redraws by what they are, not by id.
function keyedNodes(nodes: NodeModel[]): [string, NodeModel][] {
    const seen = new Map<string, number>();
    const keyed: [string, NodeModel][] = [];
    for (const node of nodes) {
        const flow = node.getType() === NodeTypes.CODE_BLOCK_NODE ? undefined : (node as unknown as { node?: FlowNode }).node;
        if (!flow?.codedata) {
            continue;
        }
        const base = nodeSignature(flow);
        const count = (seen.get(base) ?? 0) + 1;
        seen.set(base, count);
        keyed.push([`${base}#${count}`, node]);
    }
    // Placeholders (branch ends, worker labels) are named after their owner, so they are matched through it.
    const owners = new Map(keyed.map(([key, node]) => [node.getID(), key]));
    for (const node of nodes) {
        const id = node.getID();
        const ownerId = id.split("-")[0];
        if (!owners.has(id) && ownerId !== id && owners.has(ownerId)) {
            keyed.push([`${owners.get(ownerId)}${id.slice(ownerId.length)}`, node]);
        }
    }
    return keyed;
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

function placePort(port: PortModel, offset: { x: number; y: number; width: number; height: number }) {
    const node = port.getParent();
    port.width = offset.width;
    port.height = offset.height;
    port.setPosition(node.getX() + offset.x, node.getY() + offset.y);
    port.reportPosition();
}

export function isMovable(model: DiagramModel, id: string): FlowNode | undefined {
    const nodeModel = model.getNode(id);
    const node = flowNodeOf(model, id);
    if (!nodeModel || !node?.codedata?.lineRange || !MOVABLE_TYPES.has(nodeModel.getType())) {
        return undefined;
    }
    // The handler that wraps the whole function body has nowhere else to go.
    return FIXED_KINDS.has(node.codedata.node) || node.viewState?.isTopLevel ? undefined : node;
}

const zoneKey = (target: LinePosition) => `${target.line}:${target.offset}`;

function collectZones(engine: DiagramEngine, model: DiagramModel, root: HTMLElement, session: DragSession): DropZone[] {
    const inside = (target: LinePosition) =>
        session.group.some(({ codedata: { lineRange } }) => target.line >= lineRange.startLine.line && target.line <= lineRange.endLine.line);
    const canvas = engine.getCanvas()?.getBoundingClientRect();
    const view = viewRect(root);
    const zoom = model.getZoomLevel() / 100;
    const zones = new Map<string, DropZone>();
    const visible = (x: number, y: number) => x >= view.left && x <= view.right && y >= view.top && y <= view.bottom;
    const add = (target: LinePosition | undefined, anchor: DropAnchor | undefined, x: number, y: number, linkId?: string) => {
        if (!target || !anchor || inside(target)) {
            return;
        }
        // A new else lands where the slot after the if does, so it needs a key of its own.
        const key = (isNewElse(anchor) ? "else:" : "") + zoneKey(target);
        zones.set(key, { key, x, y, target, anchor, linkId: linkId ?? zones.get(key)?.linkId });
    };

    for (const link of model.getLinks()) {
        if (!(link instanceof NodeLinkModel) || !link.showAddButton || link.disabled || !canvas) {
            continue;
        }
        const point = link.getAddButtonPosition();
        const x = canvas.left + model.getOffsetX() + point.x * zoom;
        // A branch's condition pill sits where its slot is, so the slot moves to the gap below the pill.
        const y = canvas.top + model.getOffsetY() + (point.y + (link.label ? LABELLED_SLOT_OFFSET : 0)) * zoom;
        if ((point.x || point.y) && visible(x, y)) {
            add(link.getTarget(), link.getTopNode(), x, y, link.getID());
        }
    }
    for (const element of nodeElements(root)) {
        const empty = model.getNode(element.dataset.nodeid);
        if (!(empty instanceof EmptyNodeModel)) {
            continue;
        }
        const top = empty.getTopNode();
        const newElse = !!top && isNewElse(top);
        if (empty.showButton || newElse) {
            const rect = element.getBoundingClientRect();
            if (rect.width > 0 && visible(rect.left, rect.top)) {
                add(newElse ? targetAfter(top) : empty.getTarget(), top, rect.left + rect.width / 2, rect.top + rect.height / 2);
            }
        }
    }
    return [...zones.values()];
}

// The slot a node already sits in: dropping there changes nothing.
function homeSlot(model: DiagramModel, element: HTMLElement): string | undefined {
    const id = element.dataset.nodeid;
    const link = model.getLinks().find((candidate) => candidate instanceof NodeLinkModel && candidate.targetNode?.getID() === id);
    const target = (link as NodeLinkModel | undefined)?.getTarget();
    return target ? zoneKey(target) : undefined;
}

function nearestZone(zones: DropZone[], x: number, y: number, zoom: number): DropZone | undefined {
    let best: DropZone | undefined;
    let bestDistance = SNAP_DISTANCE * Math.max(zoom, 0.6);
    for (const zone of zones) {
        // Width matters less than height: a node is wide, and the slots are stacked.
        const distance = Math.hypot((zone.x - x) * 0.4, zone.y - y);
        if (distance < bestDistance) {
            best = zone;
            bestDistance = distance;
        }
    }
    return best;
}

// Lights the link under the slot the way hovering it does.
function highlightLink(root: HTMLElement | null, zone: DropZone | undefined, on: boolean) {
    const path = zone?.linkId && root?.ownerDocument.getElementById(zone.linkId);
    if (path instanceof SVGElement) {
        path.style.stroke = on ? LINK_HOVERED_COLOR : "";
        path.style.filter = on ? `drop-shadow(0 0 3px ${LINK_HOVERED_COLOR})` : "";
    }
}

function liftGhost(element: HTMLElement, zoom: number, badgeText?: string): HTMLDivElement {
    const rect = element.getBoundingClientRect();
    const doc = element.ownerDocument;
    const ghost = doc.createElement("div");
    ghost.setAttribute("data-testid", "node-drag-ghost");
    Object.assign(ghost.style, {
        position: "fixed",
        left: "0",
        top: "0",
        zIndex: "2000",
        pointerEvents: "none",
        transform: `translate(${rect.left}px, ${rect.top}px)`,
        willChange: "transform",
    });
    const body = element.cloneNode(true) as HTMLElement;
    body.removeAttribute("data-nodeid");
    // A container draws its box from inside its head node; the card carries the head only.
    const originals = element.querySelectorAll("*");
    body.querySelectorAll<HTMLElement>("*").forEach((copy, index) => {
        const box = originals[index]?.getBoundingClientRect();
        if (box && (box.width > rect.width * 2 || box.height > rect.height * 2)) {
            copy.style.display = "none";
        }
    });
    Object.assign(body.style, {
        position: "static",
        transformOrigin: "0 0",
        transform: `scale(${zoom})`,
        transition: `transform 160ms ${EASE}, filter 160ms ${EASE}, opacity 160ms ${EASE}`,
        opacity: "0.96",
    });
    ghost.appendChild(body);
    // A block or a selection carries more than the card shows; the badge says how much.
    if (badgeText) {
        const badge = doc.createElement("div");
        badge.setAttribute("data-testid", "node-drag-badge");
        badge.textContent = badgeText;
        Object.assign(badge.style, {
            position: "absolute",
            left: `${rect.width - 6}px`,
            top: "-8px",
            padding: "1px 8px",
            borderRadius: "10px",
            fontSize: "11px",
            lineHeight: "16px",
            whiteSpace: "nowrap",
            color: "var(--vscode-foreground)",
            background: ADD_BUTTON_BG_COLOR,
            border: `1px solid ${LINK_HOVERED_COLOR}`,
        });
        badge.animate([{ transform: "scale(0.5)", opacity: 0 }, { transform: "scale(1)", opacity: 1 }], { duration: 180, easing: EASE });
        ghost.appendChild(badge);
    }
    doc.body.appendChild(ghost);
    requestAnimationFrame(() => {
        body.style.transform = `scale(${zoom * 1.03}) rotate(-0.6deg)`;
        body.style.filter = "drop-shadow(0 10px 18px rgba(0, 0, 0, 0.35))";
    });
    return ghost;
}

function nameOf(node: FlowNode): string {
    const variable = (node.properties as Record<string, { value?: unknown }> | undefined)?.variable?.value;
    return typeof variable === "string" && variable ? variable : node.metadata?.label ?? "node";
}

function deleteLabel(group: FlowNode[]): string {
    if (group.length > 1) {
        return `Release to delete ${group.length} nodes`;
    }
    const inside = countInside(group[0]);
    return inside > 0 ? `Delete ${nameOf(group[0])} and ${inside} inside` : `Release to delete ${nameOf(group[0])}`;
}

function badgeFor(group: FlowNode[]): string | undefined {
    if (group.length > 1) {
        return `${group.length} nodes`;
    }
    const inside = countInside(group[0]);
    return inside > 0 ? `${inside} inside` : undefined;
}

const outlines = new WeakMap<HTMLElement, { borderColor: string; boxShadow: string }>();

// The card keeps its hover outline from when it was grabbed; over the bin only the red glow should show.
function tintGhost(ghost: HTMLDivElement, zoom: number, on: boolean) {
    const body = ghost.firstElementChild as HTMLElement;
    body.querySelectorAll<HTMLElement>("*").forEach((element) => {
        const saved = outlines.get(element);
        if (!on) {
            if (saved) {
                element.style.borderColor = saved.borderColor;
                element.style.boxShadow = saved.boxShadow;
            }
            return;
        }
        const style = element.ownerDocument.defaultView.getComputedStyle(element);
        const bordered = parseFloat(style.borderTopWidth) > 0;
        if (bordered || style.boxShadow !== "none") {
            outlines.set(element, { borderColor: element.style.borderColor, boxShadow: element.style.boxShadow });
            if (bordered) {
                element.style.borderColor = NODE_BORDER_COLOR;
            }
            element.style.boxShadow = "none";
        }
    });
    body.style.transform = on ? `scale(${zoom * BIN_PULL_SCALE})` : `scale(${zoom * 1.03}) rotate(-0.6deg)`;
    const badge = ghost.querySelector<HTMLElement>("[data-testid='node-drag-badge']");
    if (badge) {
        badge.style.opacity = on ? "0" : "1";
    }
    body.style.opacity = on ? "0.7" : "0.96";
    body.style.filter = on
        ? `drop-shadow(0 0 6px ${NODE_ERROR_COLOR}) drop-shadow(0 10px 18px rgba(0, 0, 0, 0.35))`
        : "drop-shadow(0 10px 18px rgba(0, 0, 0, 0.35))";
}

// Pointer first, then a slot under the pointer, then the card's own rectangle, so where the card was grabbed does not matter.
function overBin(bin: Bin, x: number, y: number, left: number, top: number, width: number, height: number, nearSlot: boolean): boolean {
    const pad = BIN_PAD + (bin.hot ? BIN_HOLD : 0);
    const area = {
        left: bin.x - BIN_SIZE / 2 - pad,
        right: bin.x + BIN_SIZE / 2 + pad,
        top: bin.y - BIN_SIZE / 2 - pad,
        bottom: bin.y + BIN_SIZE / 2 + pad,
    };
    const pointer = x >= area.left && x <= area.right && y >= area.top && y <= area.bottom;
    const card = left < area.right && left + width > area.left && top < area.bottom && top + height > area.top;
    return pointer || (!nearSlot && card);
}

// The card shrinks into the bin's mouth.
function binGhost(ghost: HTMLDivElement, bin: Bin, zoom: number) {
    const body = ghost.firstElementChild as HTMLElement;
    const scale = zoom * 0.12;
    const width = body.offsetWidth * scale;
    const height = body.offsetHeight * scale;
    ghost.querySelector("[data-testid='node-drag-badge']")?.remove();
    ghost.style.transition = `transform 200ms ${EASE}`;
    ghost.style.transform = `translate(${bin.x - width / 2}px, ${bin.y - height / 2}px)`;
    body.style.transition = `transform 200ms ${EASE}, opacity 200ms ease-in`;
    body.style.transform = `scale(${scale})`;
    body.style.opacity = "0";
    setTimeout(() => ghost.remove(), 220);
}

function moveGhost(ghost: HTMLDivElement, x: number, y: number, animate = false) {
    ghost.style.transition = animate ? `transform 180ms ${EASE}` : "none";
    ghost.style.transform = `translate(${x}px, ${y}px)`;
}

function dropGhost(ghost: HTMLDivElement, zoom: number) {
    const body = ghost.firstElementChild as HTMLElement;
    body.style.transform = `scale(${zoom})`;
    body.style.filter = "none";
    ghost.querySelector("[data-testid='node-drag-badge']")?.remove();
}

function fadeOut(element: HTMLElement, ms = 140) {
    element.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: EASE }).onfinish = () => element.remove();
}

export function useNodeDrag(
    engine: DiagramEngine,
    model: DiagramModel | null,
    rootRef: React.RefObject<HTMLDivElement>,
    actions?: NodeDragActions,
    onUndo?: () => void,
    selection?: () => string[]
) {
    const sessionRef = useRef<DragSession | null>(null);
    const settleRef = useRef<PendingSettle | null>(null);
    const [zones, setZones] = useState<DropZone[]>([]);
    const [activeZone, setActiveZone] = useState<DropZone | undefined>();
    const activeRef = useRef<DropZone | undefined>();
    const [bin, setBin] = useState<Bin | undefined>();
    const binRef = useRef<Bin | undefined>();
    const [toast, setToast] = useState<Toast | undefined>();
    const toastTimer = useRef<ReturnType<typeof setTimeout>>();
    const live = useRef({ engine, model, actions, selection });
    live.current = { engine, model, actions, selection };
    const tweening = useRef(0);
    const glide = useRef(0);

    // Ports are measured from the DOM; once nothing moves, measure them all again so no mid-motion reading survives.
    const resyncPorts = useCallback(() => {
        const { engine, model } = live.current;
        if (tweening.current || !model || !engine.getCanvas()) {
            return;
        }
        model.getNodes().forEach((node) =>
            Object.values(node.getPorts()).forEach((port) => {
                const offset = portOffset(engine, port);
                if (offset) {
                    placePort(port, offset);
                }
            })
        );
        engine.repaintCanvas();
    }, []);
    const resyncWhenSettled = useCallback(() => requestAnimationFrame(() => requestAnimationFrame(resyncPorts)), [resyncPorts]);

    // The next redraw glides every node from its snapshot to where it lands; new ones grow out of the ghost.
    const expectRedraw = useCallback((ghost?: HTMLDivElement) => {
        const { model } = live.current;
        const root = rootRef.current;
        if (!model || !root) {
            return;
        }
        if (settleRef.current) {
            clearTimeout(settleRef.current.timer);
            if (settleRef.current.ghost && settleRef.current.ghost !== ghost) {
                fadeOut(settleRef.current.ghost, 90);
            }
        }
        const timer = setTimeout(() => {
            settleRef.current = null;
            if (ghost) {
                fadeOut(ghost, 100);
            }
        }, 3000);
        const positions = new Map(keyedNodes(model.getNodes()).map(([key, node]) => [key, { x: node.getX(), y: node.getY() }]));
        settleRef.current = { positions, ghost, timer };
    }, [rootRef]);

    const reset = useCallback(() => {
        sessionRef.current = null;
        activeRef.current = undefined;
        binRef.current = undefined;
        setBin(undefined);
        setZones([]);
        setActiveZone(undefined);
        document.body.style.cursor = "";
    }, []);

    const showToast = useCallback((next?: Toast) => {
        clearTimeout(toastTimer.current);
        setToast(next);
        if (next) {
            toastTimer.current = setTimeout(() => setToast(undefined), TOAST_MS);
        }
    }, []);
    useEffect(() => () => clearTimeout(toastTimer.current), []);
    const announceDelete = useCallback((nodes: FlowNode[]) =>
        showToast({ text: `Deleted ${nodes.length > 1 ? `${nodes.length} nodes` : nameOf(nodes[0])}` }), [showToast]);

    const hasModel = !!model;
    useEffect(() => {
        const root = rootRef.current;
        if (!root) {
            return;
        }
        let pointer = { x: 0, y: 0 };
        let scrollFrame = 0;

        const track = (zone: DropZone | undefined) => {
            if (zone?.key !== activeRef.current?.key) {
                highlightLink(root, activeRef.current, false);
                highlightLink(root, zone, true);
                activeRef.current = zone;
                setActiveZone(zone);
            }
        };

        // Near an edge the canvas pans toward the pointer, faster the closer it gets.
        const autoScroll = () => {
            const session = sessionRef.current;
            const { engine, model } = live.current;
            if (!session?.started || !model) {
                scrollFrame = 0;
                return;
            }
            if (binRef.current?.hot) {
                scrollFrame = requestAnimationFrame(autoScroll);
                return;
            }
            const view = viewRect(root);
            const pull = (near: number, far: number) =>
                near < SCROLL_EDGE ? SCROLL_SPEED * Math.min(1, (SCROLL_EDGE - near) / SCROLL_EDGE)
                    : far < SCROLL_EDGE ? -SCROLL_SPEED * Math.min(1, (SCROLL_EDGE - far) / SCROLL_EDGE) : 0;
            const pullX = pull(pointer.x - view.left, view.right - pointer.x);
            const pullY = pull(pointer.y - view.top, view.bottom - pointer.y);
            if (!pullX && !pullY) {
                scrollFrame = requestAnimationFrame(autoScroll);
                return;
            }
            // Stop once the flow's far end is in view, so the canvas never scrolls into emptiness.
            const bounds = nodeElements(root).map((element) => element.getBoundingClientRect()).filter((rect) => rect.width > 0);
            const top = Math.min(...bounds.map((rect) => rect.top));
            const bottom = Math.max(...bounds.map((rect) => rect.bottom));
            const left = Math.min(...bounds.map((rect) => rect.left));
            const right = Math.max(...bounds.map((rect) => rect.right));
            const clamp = (delta: number, lead: number, tail: number) =>
                delta > 0 ? Math.min(delta, Math.max(0, lead)) : Math.max(delta, -Math.max(0, tail));
            const dx = clamp(pullX, view.left + SCROLL_EDGE - left, right - view.right + SCROLL_EDGE);
            const dy = clamp(pullY, view.top + SCROLL_EDGE - top, bottom - view.bottom + SCROLL_EDGE);
            if (dx || dy) {
                model.setOffset(model.getOffsetX() + dx, model.getOffsetY() + dy);
                engine.repaintCanvas();
                session.zones = collectZones(engine, model, root, session);
                setZones(session.zones);
                track(nearestZone(session.zones, pointer.x, pointer.y, session.zoom));
            }
            scrollFrame = requestAnimationFrame(autoScroll);
        };

        const detach = () => {
            window.removeEventListener("pointermove", onPointerMove, true);
            window.removeEventListener("pointerup", onPointerUp, true);
            window.removeEventListener("pointercancel", onPointerUp, true);
            window.removeEventListener("keydown", onKeyDown, true);
            window.removeEventListener("blur", cancel);
            cancelAnimationFrame(scrollFrame);
            scrollFrame = 0;
            resyncWhenSettled();
        };

        // Puts a lifted node back where it was.
        const putBack = (session: DragSession) => {
            // Unmounted mid-drag: no redraw is coming to take the ghost away.
            if (!rootRef.current) {
                session.ghost?.remove();
            } else if (session.ghost) {
                dropGhost(session.ghost, session.zoom);
            }
            expectRedraw(session.ghost);
            live.current.actions?.cancel();
        };

        const cancel = () => {
            const session = sessionRef.current;
            detach();
            if (!session) {
                return;
            }
            highlightLink(root, activeRef.current, false);
            reset();
            if (session.started) {
                putBack(session);
            }
        };

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape" && sessionRef.current?.started) {
                event.stopPropagation();
                cancel();
            }
        };

        const begin = (session: DragSession) => {
            const { model } = live.current;
            const rect = session.element.getBoundingClientRect();
            session.started = true;
            session.grabX = session.startX - rect.left;
            session.grabY = session.startY - rect.top;
            session.zoom = model.getZoomLevel() / 100;
            const selected = live.current.selection?.() ?? [];
            const group = selected.includes(session.element.dataset.nodeid)
                ? selected.map((id) => isMovable(model, id)).filter((node): node is FlowNode => !!node)
                : [];
            const top = group.length > 1 ? outermost(group) : [];
            session.group = top.length ? top : [session.flowNode];
            session.homeKey = session.group.length === 1 ? homeSlot(model, session.element) : undefined;
            session.ghost = liftGhost(session.element, session.zoom, badgeFor(session.group));
            const body = session.ghost.firstElementChild as HTMLElement;
            session.cardWidth = body.offsetWidth * session.zoom;
            session.cardHeight = body.offsetHeight * session.zoom;
            document.body.style.cursor = "grabbing";
            showToast(undefined);
            if (live.current.actions?.remove) {
                const view = viewRect(root);
                binRef.current = {
                    x: view.left + BIN_LEFT + BIN_SIZE / 2,
                    y: (view.top + view.bottom) / 2,
                    label: deleteLabel(session.group),
                    hot: false,
                };
                setBin(binRef.current);
            }
            // Taking the node out closes its gap; the slots are read from that layout once it is drawn.
            expectRedraw();
            live.current.actions?.lift(session.group);
            scrollFrame = requestAnimationFrame(autoScroll);
        };

        const onPointerMove = (event: PointerEvent) => {
            const session = sessionRef.current;
            if (!session || event.pointerId !== session.pointerId) {
                return;
            }
            // A release outside the webview never arrives here, and where it landed is unknown.
            if (event.buttons === 0) {
                cancel();
                return;
            }
            pointer = { x: event.clientX, y: event.clientY };
            if (!session.started) {
                if (Math.hypot(event.clientX - session.startX, event.clientY - session.startY) < DRAG_THRESHOLD) {
                    return;
                }
                begin(session);
            }
            event.preventDefault();
            event.stopPropagation();
            const left = event.clientX - session.grabX;
            const top = event.clientY - session.grabY;
            const current = binRef.current;
            const zone = nearestZone(session.zones, event.clientX, event.clientY, session.zoom);
            const hot = !!current && overBin(current, event.clientX, event.clientY, left, top, session.cardWidth, session.cardHeight, !!zone);
            if (current && hot !== current.hot) {
                binRef.current = { ...current, hot };
                setBin(binRef.current);
                tintGhost(session.ghost, session.zoom, hot);
                session.pullUntil = performance.now() + PULL_MS;
            }
            // Over the bin the card is drawn in, shrunk, to sit just above it.
            const at = hot
                ? { x: current.x - BIN_SIZE / 2, y: current.y - BIN_SIZE / 2 - 8 - session.cardHeight * BIN_PULL_SCALE }
                : { x: left, y: top };
            moveGhost(session.ghost, at.x, at.y, performance.now() < session.pullUntil);
            track(hot ? undefined : zone);
        };

        const onPointerUp = (event: PointerEvent) => {
            const session = sessionRef.current;
            if (!session || event.pointerId !== session.pointerId) {
                return;
            }
            detach();
            if (!session.started) {
                sessionRef.current = null;
                return;
            }
            // The release ends a drag, so it must not also open the node's form.
            const swallowClick = (click: MouseEvent) => {
                click.stopPropagation();
                click.preventDefault();
            };
            window.addEventListener("click", swallowClick, { capture: true, once: true });
            setTimeout(() => window.removeEventListener("click", swallowClick, true), 0);

            const zone = activeRef.current;
            const ghost = session.ghost;
            const binned = binRef.current?.hot && event.type !== "pointercancel" ? binRef.current : undefined;
            highlightLink(root, zone, false);
            reset();
            if (binned) {
                binGhost(ghost, binned, session.zoom);
                const name = session.group.length > 1 ? `${session.group.length} nodes` : nameOf(session.flowNode);
                live.current.actions
                    ?.remove?.(session.group)
                    .then((removed) => removed && showToast({ text: `Deleted ${name}` }))
                    .catch(() => undefined);
                return;
            }
            if (!zone || event.type === "pointercancel" || zone.key === session.homeKey) {
                putBack(session);
                return;
            }
            const width = (ghost.firstElementChild as HTMLElement).getBoundingClientRect().width / 1.03;
            dropGhost(ghost, session.zoom);
            moveGhost(ghost, zone.x - Math.min(width, NODE_WIDTH * session.zoom) / 2, zone.y - session.grabY / 2, true);
            expectRedraw(ghost);
            live.current.actions?.drop(session.group, zone.anchor, zone.target).catch(() => undefined);
        };

        const onPointerDown = (event: PointerEvent) => {
            const { model, actions } = live.current;
            if (event.button !== 0 || sessionRef.current || !model || !actions || canvasGesture(live.current.engine).panKey) {
                return;
            }
            const target = event.target as HTMLElement;
            if (target.closest(INTERACTIVE)) {
                return;
            }
            const element = target.closest<HTMLElement>(".node[data-nodeid]");
            const flowNode = element && isMovable(model, element.dataset.nodeid);
            if (!flowNode) {
                return;
            }
            sessionRef.current = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                element,
                flowNode,
                started: false,
                grabX: 0,
                grabY: 0,
                zoom: 1,
                cardWidth: 0,
                cardHeight: 0,
                pullUntil: 0,
                zones: [],
                group: [flowNode],
            };
            window.addEventListener("pointermove", onPointerMove, true);
            window.addEventListener("pointerup", onPointerUp, true);
            window.addEventListener("pointercancel", onPointerUp, true);
            window.addEventListener("keydown", onKeyDown, true);
            window.addEventListener("blur", cancel);
        };

        root.addEventListener("pointerdown", onPointerDown, true);
        return () => {
            root.removeEventListener("pointerdown", onPointerDown, true);
            cancel();
        };
    }, [hasModel, rootRef, reset, expectRedraw, resyncWhenSettled, showToast]);

    // Call with a new layout's nodes before it is drawn; moving them in the model keeps their links attached.
    const prepare = useCallback((nodes: NodeModel[]) => {
        const { engine, model } = live.current;
        let pending = settleRef.current;
        // A layout that lands mid-glide carries on from where the nodes are now, rather than cutting to the end.
        if (!pending && tweening.current && model) {
            const now = keyedNodes(model.getNodes()).map(([key, node]) => [key, { x: node.getX(), y: node.getY() }] as const);
            pending = { positions: new Map(now) };
        }
        // A fresh model's ports are unplaced until they mount, so lines would flash; start them where they were.
        if (model) {
            const previous = new Map(keyedNodes(model.getNodes()));
            for (const [key, node] of keyedNodes(nodes)) {
                const before = previous.get(key);
                Object.values(before?.getPorts() ?? {}).forEach((old) => {
                    const port = node.getPort(old.getName());
                    if (port && old.reportedPosition) {
                        port.width = old.width;
                        port.height = old.height;
                        port.setPosition(node.getX() + old.getX() - before.getX(), node.getY() + old.getY() - before.getY());
                        port.reportPosition();
                    }
                });
            }
        }
        if (!pending) {
            return;
        }
        clearTimeout(pending.timer);
        settleRef.current = null;
        const generation = ++glide.current;
        let ghostPoint: { x: number; y: number } | undefined;
        if (pending.ghost && engine.getCanvas()) {
            const rect = (pending.ghost.firstElementChild as HTMLElement).getBoundingClientRect();
            const point = engine.getRelativeMousePoint({ clientX: rect.left, clientY: rect.top } as MouseEvent);
            ghostPoint = { x: point.x, y: point.y };
        }
        const deltas = new Map<string, { dx: number; dy: number }>();
        const grown: string[] = [];
        let growDelta: { dx: number; dy: number } | undefined;
        for (const [key, node] of keyedNodes(nodes)) {
            const from = pending.positions.get(key);
            if (from) {
                deltas.set(node.getID(), { dx: from.x - node.getX(), dy: from.y - node.getY() });
            } else if (ghostPoint) {
                // Everything the move brings in arrives together, from where the card was let go.
                growDelta ??= { dx: ghostPoint.x - node.getX(), dy: ghostPoint.y - node.getY() };
                deltas.set(node.getID(), growDelta);
                grown.push(node.getID());
            }
        }
        // Placeholders inside a block (worker labels, end markers) travel with the block they belong to.
        for (const node of nodes) {
            const owner = deltas.get(node.getID().split("-")[0]);
            if (!deltas.has(node.getID()) && owner) {
                deltas.set(node.getID(), owner);
            }
        }
        // Only the vertical move is animated: columns snap into place, so links between stacked nodes stay straight.
        const tweens: Tween[] = [];
        for (const node of nodes) {
            const delta = deltas.get(node.getID());
            if (delta && Math.abs(delta.dy) > 0.5) {
                tweens.push({ node, x: node.getX(), y: node.getY(), dx: 0, dy: delta.dy });
                node.setPosition(node.getX(), node.getY() + delta.dy);
            }
        }
        // A resize mid-tween reports ports from a frame behind the model; measure them again once the nodes are at rest.
        // Slots sit on links, so they follow the nodes while they move.
        const refreshZones = () => {
            const root = rootRef.current;
            const { engine, model } = live.current;
            const session = sessionRef.current;
            if (root && model && session?.started) {
                session.zones = collectZones(engine, model, root, session);
                setZones(session.zones);
            }
        };
        const ghost = pending.ghost;
        // Ports are measured from the DOM, which trails the model by a frame while nodes move; pin each one to its node.
        type Offset = NonNullable<ReturnType<typeof portOffset>>;
        const pins = new Map<PortModel, { offset: Offset; measure: PortModel["updateCoords"] }>();
        const pin = (port: PortModel) => {
            const at = pins.get(port);
            if (at) {
                placePort(port, at.offset);
            }
        };
        const capturePins = (force: boolean) => {
            const { engine } = live.current;
            const ports = tweens.flatMap((tween) => Object.values(tween.node.getPorts()));
            const offsets = ports.map((port) => [port, portOffset(engine, port)] as const);
            if (!force && offsets.some(([, offset]) => !offset)) {
                return false;
            }
            for (const [port, offset] of offsets) {
                if (!offset) {
                    continue;
                }
                const measure = port.updateCoords;
                pins.set(port, { offset, measure });
                port.updateCoords = (coords) => {
                    measure.call(port, coords);
                    pin(port);
                };
            }
            return true;
        };
        const release = () => {
            pins.forEach((at, port) => {
                port.updateCoords = at.measure;
            });
            pins.clear();
        };
        let start = 0;
        let waited = 0;
        const step = (now: number) => {
            if (generation !== glide.current) {
                release();
                if (start) {
                    tweening.current--;
                }
                return;
            }
            // Hold the start pose until the new layout has mounted and reported its ports.
            if (!start) {
                if (!capturePins(waited >= 10) && waited++ < 10) {
                    requestAnimationFrame(step);
                    return;
                }
                start = now;
                tweening.current++;
            }
            const t = Math.min(1, (now - start) / SETTLE_MS);
            const remaining = 1 - easeOut(t);
            tweens.forEach((tween) => tween.node.setPosition(tween.x + tween.dx * remaining, tween.y + tween.dy * remaining));
            pins.forEach((_, port) => pin(port));
            live.current.engine.repaintCanvas();
            refreshZones();
            if (t < 1) {
                requestAnimationFrame(step);
            } else {
                release();
                tweening.current--;
                requestAnimationFrame(() => requestAnimationFrame(() => {
                    resyncPorts();
                    refreshZones();
                }));
            }
        };
        requestAnimationFrame(() => {
            const root = rootRef.current;
            grown.forEach((id) =>
                root?.querySelector(`.node[data-nodeid="${CSS.escape(id)}"]`)?.animate([{ opacity: 0.4 }, { opacity: 1 }], {
                    duration: SETTLE_MS,
                    easing: EASE,
                })
            );
            if (ghost) {
                fadeOut(ghost, 90);
            }
            requestAnimationFrame(step);
        });
    }, [rootRef, resyncPorts]);

    // Call once a redrawn model is on screen.
    const onRedraw = useCallback(() => {
        const root = rootRef.current;
        const { engine, model } = live.current;
        const session = sessionRef.current;
        resyncWhenSettled();
        if (root && model && session?.started) {
            session.zones = collectZones(engine, model, root, session);
            setZones(session.zones);
        }
    }, [rootRef, resyncWhenSettled]);

    const slots =
        zones.length > 0 ? (
            <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 2001 }} data-testid="node-drop-zones">
                {zones.map((zone) => {
                    const active = zone.key === activeZone?.key;
                    return (
                        <div
                            key={zone.key}
                            data-testid={active ? "node-drop-zone-active" : "node-drop-zone"}
                            data-target={zone.key}
                            style={{
                                position: "absolute",
                                left: zone.x - 5,
                                top: zone.y - 5,
                                width: 10,
                                height: 10,
                                borderRadius: "50%",
                                background: LINK_HOVERED_COLOR,
                                opacity: active ? 0 : 0.45,
                                transform: `scale(${active ? 0.4 : 1})`,
                                transition: `opacity 150ms ${EASE}, transform 150ms ${EASE}`,
                            }}
                        />
                    );
                })}
                {activeZone && (
                    <div
                        key={activeZone.key}
                        ref={popIn}
                        data-testid="node-drop-target"
                        style={{ position: "absolute", left: activeZone.x - 12, top: activeZone.y - 12, width: 24, height: 24 }}
                    >
                        <div
                            ref={pulse}
                            style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `2px solid ${LINK_HOVERED_COLOR}` }}
                        />
                        <div
                            style={{
                                position: "absolute",
                                inset: 0,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                borderRadius: "50%",
                                background: ADD_BUTTON_BG_COLOR,
                                border: `2px solid ${LINK_HOVERED_COLOR}`,
                                boxSizing: "border-box",
                            }}
                        >
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: LINK_HOVERED_COLOR }} />
                        </div>
                    </div>
                )}
            </div>
        ) : null;

    const panel: React.CSSProperties = {
        position: "fixed",
        zIndex: 2001,
        display: "flex",
        alignItems: "center",
        gap: 8,
        height: BIN_SIZE,
        boxSizing: "border-box",
        borderRadius: BIN_SIZE / 2,
        fontSize: 12,
        whiteSpace: "nowrap",
        color: "var(--vscode-foreground)",
        background: CONTROLS_BG_COLOR,
        userSelect: "none",
        boxShadow: "0 1px 4px rgba(0, 0, 0, 0.12)",
    };

    const binView = bin && (
        <div
            ref={slideIn}
            data-testid={bin.hot ? "node-delete-bin-active" : "node-delete-bin"}
            style={{
                ...panel,
                left: bin.x - BIN_SIZE / 2,
                top: bin.y - BIN_SIZE / 2,
                pointerEvents: "none",
                minWidth: BIN_SIZE,
                justifyContent: "center",
                padding: bin.hot ? "0 16px 0 13px" : 0,
                color: bin.hot ? NODE_ERROR_COLOR : "var(--vscode-foreground)",
                transform: `scale(${bin.hot ? 1.04 : 1})`,
                transformOrigin: "left center",
                transition: `transform 150ms ${EASE}, color 150ms ${EASE}`,
            }}
        >
            <Icon name="bi-delete" sx={{ width: 16, height: 16, fontSize: 16, color: "inherit" }} />
            {bin.hot && <span>{bin.label}</span>}
        </div>
    );

    const toastArea = toast && rootRef.current ? viewRect(rootRef.current) : undefined;
    // Anchored to the canvas's bottom centre, away from the nodes it reports on.
    const toastView = toast && toastArea && (
        <div
            data-testid="node-delete-toast"
            style={{
                ...panel,
                left: (toastArea.left + toastArea.right) / 2,
                top: toastArea.bottom - BIN_SIZE - 16,
                transform: "translateX(-50%)",
                gap: 4,
                padding: "0 6px 0 14px",
            }}
        >
            <span>{toast.text}</span>
            {onUndo && (
                <button
                    data-testid="node-delete-undo"
                    onClick={() => {
                        showToast(undefined);
                        onUndo();
                    }}
                    style={{
                        border: "none",
                        borderRadius: 12,
                        padding: "3px 10px",
                        cursor: "pointer",
                        font: "inherit",
                        color: "var(--vscode-textLink-foreground)",
                        background: "transparent",
                    }}
                >
                    Undo
                </button>
            )}
            <button
                data-testid="node-delete-toast-dismiss"
                aria-label="Dismiss"
                title="Dismiss"
                onClick={() => showToast(undefined)}
                style={{
                    display: "flex",
                    border: "none",
                    borderRadius: 12,
                    padding: 4,
                    cursor: "pointer",
                    color: "var(--vscode-foreground)",
                    background: "transparent",
                }}
            >
                <Codicon name="close" />
            </button>
        </div>
    );

    const overlay = (
        <>
            {slots}
            {binView}
            {toastView}
        </>
    );

    return { overlay, onRedraw, prepare, expectRedraw, announceDelete };
}
