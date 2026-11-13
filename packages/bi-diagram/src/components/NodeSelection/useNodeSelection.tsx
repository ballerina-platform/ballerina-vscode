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
import { DiagramEngine, DiagramModel } from "@projectstorm/react-diagrams";
import styled from "@emotion/styled";
import { Icon } from "@wso2/ui-toolkit";
import { Flow, FlowNode } from "../../utils/types";
import { canvasGesture, isCommandKey, isMac } from "../../utils/diagram";
import { CONTROLS_BG_COLOR, LINK_HOVERED_COLOR, NODE_BORDER_COLOR, NODE_ERROR_COLOR } from "../../resources/constants";
import { INTERACTIVE, isMovable, nodeElements, viewRect } from "../NodeDrag/useNodeDrag";
import { DropAnchor, outermost } from "../NodeDrag/flowMoves";
import { NodeLinkModel } from "../NodeLink";
import { EmptyNodeModel } from "../nodes/EmptyNode";

const CLICK_SLOP = 4;
// How long VS Code takes to send its own Select All back after a forwarded ⌘A.
const SELECT_ALL_ECHO_MS = 500;
const OUTLINE_GAP = 4;
// A paste goes into the "+" slot under the pointer only when the pointer is this close to one.
const PASTE_SNAP = 120;
// Outlines are re-measured until they hold still this many frames, then wait for the next pan, zoom or pointer event.
const SETTLE_FRAMES = 15;
const TOOLBAR_HEIGHT = 32;
const TOOLBAR_GAP = 10;

interface Box {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

interface Outline extends Box {
    id: string;
    round?: boolean;
}

const isEditable = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    (target.isContentEditable || !!target.closest("input, textarea, select, [contenteditable='true'], .cm-editor"));

const boxFrom = (x1: number, y1: number, x2: number, y2: number): Box => ({
    left: Math.min(x1, x2),
    top: Math.min(y1, y2),
    right: Math.max(x1, x2),
    bottom: Math.max(y1, y2),
});

// A node that draws its client beside it marks its own box, so the client is not part of what a marquee must cover.
const selectionBox = (element: HTMLElement) => element.querySelector<HTMLElement>("[data-selection-box]") ?? element;

const contains = (outer: Box, inner: DOMRect) =>
    inner.width > 0 && inner.left >= outer.left && inner.right <= outer.right && inner.top >= outer.top && inner.bottom <= outer.bottom;

const outlineOf = (id: string, element: Element, round = false): Outline | undefined => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 ? { id, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, round } : undefined;
};

const sameOutlines = (a: Outline[], b: Outline[]) =>
    a.length === b.length &&
    a.every((outline, index) => {
        const other = b[index];
        return outline.id === other.id && outline.left === other.left && outline.top === other.top &&
            outline.right === other.right && outline.bottom === other.bottom;
    });

const shortcut = (key: string) => (isMac ? `⌘${key}` : `Ctrl+${key}`);

const ToolbarIcon = styled.button<{ danger?: boolean }>`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: 12px;
    cursor: pointer;
    color: ${(props: { danger?: boolean }) => (props.danger ? NODE_ERROR_COLOR : "var(--vscode-foreground)")};
    background: transparent;
    &:hover {
        background: var(--vscode-toolbar-hoverBackground);
    }
`;

const toolbarButton = (color = "var(--vscode-foreground)"): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 4,
    border: "none",
    borderRadius: 12,
    padding: "4px 10px",
    cursor: "pointer",
    font: "inherit",
    color,
    background: "transparent",
});

// A block is selected with everything inside it, since that is what deleting or moving it takes along.
// Deleting an error handler keeps its body, so its body is not part of it.
function withInside(model: DiagramModel, id: string): string[] {
    const ids: string[] = [];
    const walk = (node: FlowNode) => {
        if (isMovable(model, node.id)) {
            ids.push(node.id);
        }
        if (node.codedata?.node !== "ERROR_HANDLER") {
            node.branches?.forEach((branch) => branch.children?.forEach(walk));
        }
    };
    const node = isMovable(model, id);
    if (node) {
        walk(node);
    }
    return ids;
}

// Without a slot near the pointer, a paste ends the main flow: inside a function-wide error handler, before a final return.
function flowEnd(flow: Flow): DropAnchor | undefined {
    const nodes = flow.nodes ?? [];
    const body = nodes[1]?.codedata?.node === "ERROR_HANDLER" ? nodes[1].branches?.find((branch) => branch.codedata?.node === "BODY") : undefined;
    const statements = (body ? body.children ?? [] : nodes.slice(1)).filter((node) => node.codedata?.lineRange && node.codedata.node !== "EMPTY");
    const last = statements[statements.length - 1];
    const end = last?.returning ? statements[statements.length - 2] : last;
    return end ?? body ?? nodes[0];
}

// Dropping a node from the selection drops what it contains, and the blocks around it that can no longer go whole.
function deselect(model: DiagramModel, selected: string[], id: string): string[] {
    const removed = new Set(withInside(model, id));
    const enclosing = selected.filter((other) => other !== id && withInside(model, other).includes(id));
    enclosing.forEach((other) => removed.add(other));
    return selected.filter((other) => !removed.has(other));
}

export interface NodeSelectionOptions {
    enabled: boolean;
    onDelete?: (nodes: FlowNode[]) => Promise<boolean>;
    onCopy?: (nodes: FlowNode[], cut: boolean) => Promise<unknown>;
    onPaste?: (anchor: DropAnchor) => void;
    canPaste?: boolean;
    checkPaste?: () => Promise<boolean>;
    flow?: Flow;
}

// Drag on empty canvas to select, Shift to add, Delete to remove, the command key with C/X/V to copy/cut/paste; Space, the held command key or the middle button pans.
export function useNodeSelection(
    engine: DiagramEngine,
    model: DiagramModel | null,
    rootRef: React.RefObject<HTMLDivElement>,
    { enabled, onDelete, onCopy, onPaste, canPaste, checkPaste, flow }: NodeSelectionOptions
) {
    const [selected, setSelected] = useState<string[]>([]);
    const selectedRef = useRef(selected);
    selectedRef.current = selected;
    // The box changes on every pointer move, so only the overlay renders it, not the whole diagram.
    const boxSink = useRef<(box: Box | null) => void>(() => undefined);
    const [cursor, setCursor] = useState<string>("default");
    const live = useRef({ engine, model, onDelete, onCopy, onPaste, canPaste, checkPaste, flow, enabled });
    live.current = { engine, model, onDelete, onCopy, onPaste, canPaste, checkPaste, flow, enabled };

    // Node ids follow source positions, so a redrawn flow starts with nothing selected.
    useEffect(() => {
        setSelected([]);
        setMenu(null);
    }, [model]);

    const [menu, setMenu] = useState<{ x: number; y: number; anchor: DropAnchor } | null>(null);
    const menuOpen = useRef(false);
    menuOpen.current = !!menu;

    const copySelected = useCallback((cut: boolean) => {
        const { model, onCopy } = live.current;
        const nodes = outermost(selectedRef.current.map((id) => model && isMovable(model, id)).filter((node): node is FlowNode => !!node));
        if (!nodes.length || !onCopy) {
            return;
        }
        if (cut) {
            setSelected([]);
        }
        void onCopy(nodes, cut);
    }, []);

    const deleteSelected = useCallback(async () => {
        const { model, onDelete } = live.current;
        const nodes = selectedRef.current.map((id) => model && isMovable(model, id)).filter((node): node is FlowNode => !!node);
        if (!nodes.length || !onDelete) {
            return;
        }
        setSelected([]);
        await onDelete(nodes);
    }, []);

    // The canvas mounts with the first model, so listeners attach then.
    const hasModel = !!model;
    useEffect(() => {
        const root = rootRef.current;
        if (!root) {
            return;
        }
        const gesture = canvasGesture(engine);
        let drag: { pointerId: number; x: number; y: number; moved: boolean; base: string[] } | null = null;
        // Keys on the body belong to the canvas: a flow just opened, or the last press landed on it.
        let pressedOnCanvas = true;
        // The selection toolbar and the Paste menu float outside the canvas but act on it.
        const inCanvas = (target: EventTarget | null) =>
            target instanceof Element ? root.contains(target) || !!target.closest("[data-canvas-chrome]") : target instanceof Node && root.contains(target);
        const onCanvas = (target: EventTarget | null) => (target === document.body ? pressedOnCanvas : inCanvas(target));
        const setBox = (area: Box | null) => boxSink.current(area);
        let pointer: { x: number; y: number } | undefined;

        const selectedNodes = () => {
            const { model } = live.current;
            return outermost(selectedRef.current.map((id) => model && isMovable(model, id)).filter((node): node is FlowNode => !!node));
        };

        // Paste goes after the selection, else into the "+" slot near the pointer, else at the end of the flow.
        const pasteAnchor = (): DropAnchor | undefined => {
            const selection = selectedNodes();
            if (selection.length) {
                return selection[selection.length - 1];
            }
            const { model, engine } = live.current;
            const canvas = engine.getCanvas()?.getBoundingClientRect();
            const fallback = live.current.flow && flowEnd(live.current.flow);
            const at = pointer;
            if (!model || !canvas || !at) {
                return fallback;
            }
            const zoom = model.getZoomLevel() / 100;
            let best: { anchor: DropAnchor; distance: number } | undefined;
            const consider = (anchor: DropAnchor | undefined, x: number, y: number) => {
                const distance = Math.hypot(x - at.x, y - at.y);
                if (anchor && (!best || distance < best.distance)) {
                    best = { anchor, distance };
                }
            };
            for (const link of model.getLinks()) {
                if (link instanceof NodeLinkModel && link.showAddButton && !link.disabled && link.getTarget()) {
                    const point = link.getAddButtonPosition();
                    consider(link.getTopNode(), canvas.left + model.getOffsetX() + point.x * zoom, canvas.top + model.getOffsetY() + point.y * zoom);
                }
            }
            // An empty branch shows its "+" on a placeholder node instead of a link.
            for (const element of nodeElements(root)) {
                const empty = model.getNode(element.dataset.nodeid);
                if (empty instanceof EmptyNodeModel && empty.showButton && empty.getTarget()) {
                    const rect = element.getBoundingClientRect();
                    consider(empty.getTopNode(), rect.left + rect.width / 2, rect.top + rect.height / 2);
                }
            }
            return best && best.distance <= PASTE_SNAP ? best.anchor : fallback ?? best?.anchor;
        };
        const panKeyCursor = () => setCursor(gesture.panning ? "grabbing" : gesture.panKey ? "grab" : "default");

        const select = (ids: string[]) => setSelected((current) => (current.join() === ids.join() ? current : ids));

        const hits = (area: Box, base: string[]) => {
            const { model } = live.current;
            const inside = nodeElements(root)
                .filter((element) => contains(area, selectionBox(element).getBoundingClientRect()))
                .map((element) => element.dataset.nodeid)
                .filter((id) => model && isMovable(model, id));
            return [...new Set([...base, ...inside.flatMap((id) => withInside(model, id))])];
        };

        const onWindowPointerDown = (event: PointerEvent) => {
            pressedOnCanvas = inCanvas(event.target);
        };

        const onPointerDown = (event: PointerEvent) => {
            const target = event.target as HTMLElement;
            // Without editing there is nothing to select, so a plain drag pans.
            const panButton = event.button === 1 || (event.button === 0 && !live.current.enabled);
            if (panButton || (event.button === 0 && gesture.panKey)) {
                gesture.panning = true;
                panKeyCursor();
                return;
            }
            if (event.button !== 0 || target.closest(INTERACTIVE) || target.closest(".node[data-nodeid]")) {
                return;
            }
            const additive = event.shiftKey;
            drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false, base: additive ? selectedRef.current : [] };
        };

        // The middle button would otherwise start the browser's own autoscroll; the pointer event must stay default so mouse events still follow.
        const onMouseDown = (event: MouseEvent) => {
            if (event.button === 1) {
                event.preventDefault();
            }
        };

        // A box drag would otherwise select the text it passes over; cancelling the selection keeps the mouse capture intact.
        const onSelectStart = (event: Event) => {
            if (drag) {
                event.preventDefault();
            }
        };

        const onPointerMove = (event: PointerEvent) => {
            if (event.target instanceof Node && root.contains(event.target)) {
                pointer = { x: event.clientX, y: event.clientY };
            }
            // A release outside the webview never arrives; the next move with no button down ends the gesture there.
            if (event.buttons === 0 && (drag || gesture.panning)) {
                onPointerUp(event);
                return;
            }
            if (!drag || event.pointerId !== drag.pointerId) {
                return;
            }
            if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < CLICK_SLOP) {
                return;
            }
            drag.moved = true;
            const area = boxFrom(drag.x, drag.y, event.clientX, event.clientY);
            setBox(area);
            select(hits(area, drag.base));
        };

        const onPointerUp = (event: PointerEvent) => {
            if (gesture.panning) {
                gesture.panning = false;
                panKeyCursor();
            }
            if (!drag || event.pointerId !== drag.pointerId) {
                return;
            }
            if (!drag.moved && !drag.base.length) {
                setSelected([]);
            }
            drag = null;
            setBox(null);
        };

        // Shift adds a node to the selection; the command key is left to open it.
        const onClick = (event: MouseEvent) => {
            const element = (event.target as HTMLElement).closest<HTMLElement>(".node[data-nodeid]");
            const { model } = live.current;
            if (!element || !model || !live.current.enabled || (event.target as HTMLElement).closest(INTERACTIVE)) {
                return;
            }
            const id = element.dataset.nodeid;
            if (event.shiftKey) {
                if (isMovable(model, id)) {
                    event.preventDefault();
                    event.stopPropagation();
                    const current = selectedRef.current;
                    setSelected(current.includes(id) ? deselect(model, current, id) : [...new Set([...current, ...withInside(model, id)])]);
                }
                return;
            }
            setSelected([]);
        };

        const onKeyDown = (event: KeyboardEvent) => {
            if (isEditable(event.target) || !onCanvas(event.target)) {
                return;
            }
            const command = isCommandKey(event);
            if (event.key === " " && event.target instanceof HTMLElement && event.target.closest(INTERACTIVE)) {
                return;
            }
            if (event.key === " " || (event.key === (isMac ? "Meta" : "Control"))) {
                if (event.key === " ") {
                    event.preventDefault();
                }
                gesture.panKey = true;
                panKeyCursor();
                return;
            }
            if (!live.current.enabled) {
                return;
            }
            if ((event.key === "Delete" || event.key === "Backspace") && selectedRef.current.length) {
                event.preventDefault();
                void deleteSelected();
            } else if (event.key === "Escape" && menuOpen.current) {
                setMenu(null);
            } else if (event.key === "Escape" && selectedRef.current.length) {
                setSelected([]);
            } else if (command && !event.shiftKey && !event.altKey && ["c", "x"].includes(event.key.toLowerCase())) {
                const nodes = selectedNodes();
                // Text the user selected on the page copies as text.
                if (!nodes.length || !live.current.onCopy || document.getSelection()?.toString()) {
                    return;
                }
                event.preventDefault();
                copySelected(event.key.toLowerCase() === "x");
            } else if (command && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "v" && live.current.onPaste) {
                const anchor = pasteAnchor();
                if (anchor) {
                    event.preventDefault();
                    live.current.onPaste(anchor);
                }
            } else if (command && event.key.toLowerCase() === "a") {
                const { model } = live.current;
                if (model) {
                    event.preventDefault();
                    select(nodeElements(root).map((element) => element.dataset.nodeid).filter((id) => isMovable(model, id)));
                    // VS Code forwards every key to its own Select All, which highlights the page text; undo that one.
                    const clear = () => document.getSelection()?.removeAllRanges();
                    document.addEventListener("selectionchange", clear, { once: true });
                    setTimeout(() => document.removeEventListener("selectionchange", clear), SELECT_ALL_ECHO_MS);
                }
            }
        };

        const onKeyUp = (event: KeyboardEvent) => {
            if (event.key === " " || event.key === "Meta" || event.key === "Control") {
                gesture.panKey = false;
                panKeyCursor();
            }
        };

        const onBlur = () => {
            gesture.panKey = false;
            gesture.panning = false;
            drag = null;
            setBox(null);
            panKeyCursor();
        };

        // On the document, after the nodes' own menus and before the webview's inert Cut/Copy/Paste menu on the window.
        const onContextMenu = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (event.defaultPrevented || !inCanvas(target)) {
                return;
            }
            event.preventDefault();
            if (!live.current.enabled || !live.current.onPaste || target.closest("[data-canvas-chrome]")) {
                return;
            }
            const { model } = live.current;
            const path = target.closest('g[data-testid^="diagram-link"]')?.querySelector<SVGPathElement>('path[id]:not([id$="-bg"])');
            const link = path && model?.getLink(path.id);
            const empty = model?.getNode(target.closest<HTMLElement>(".node[data-nodeid]")?.dataset.nodeid ?? "");
            pointer = { x: event.clientX, y: event.clientY };
            const anchor =
                link instanceof NodeLinkModel && link.showAddButton && !link.disabled && link.getTarget()
                    ? link.getTopNode()
                    : empty instanceof EmptyNodeModel && empty.showButton && empty.getTarget()
                      ? empty.getTopNode()
                      : pasteAnchor();
            if (!anchor) {
                return;
            }
            // The clipboard may have changed since the last check, so a fresh one decides.
            live.current.checkPaste?.().then((pasteable) => pasteable && setMenu({ x: event.clientX, y: event.clientY, anchor }));
        };
        const closeMenu = (event: Event) => {
            if (!(event.target instanceof Element && event.target.closest('[data-testid="canvas-context-menu"]'))) {
                setMenu(null);
            }
        };

        window.addEventListener("pointerdown", onWindowPointerDown, true);
        window.addEventListener("pointerdown", closeMenu, true);
        window.addEventListener("wheel", closeMenu, true);
        document.addEventListener("contextmenu", onContextMenu);
        root.addEventListener("pointerdown", onPointerDown, true);
        root.addEventListener("click", onClick, true);
        root.addEventListener("mousedown", onMouseDown, true);
        document.addEventListener("selectstart", onSelectStart, true);
        window.addEventListener("pointermove", onPointerMove, true);
        window.addEventListener("pointerup", onPointerUp, true);
        window.addEventListener("pointercancel", onPointerUp, true);
        window.addEventListener("keydown", onKeyDown, true);
        window.addEventListener("keyup", onKeyUp, true);
        window.addEventListener("blur", onBlur);
        return () => {
            window.removeEventListener("pointerdown", onWindowPointerDown, true);
            window.removeEventListener("pointerdown", closeMenu, true);
            window.removeEventListener("wheel", closeMenu, true);
            document.removeEventListener("contextmenu", onContextMenu);
            root.removeEventListener("pointerdown", onPointerDown, true);
            root.removeEventListener("click", onClick, true);
            root.removeEventListener("mousedown", onMouseDown, true);
            document.removeEventListener("selectstart", onSelectStart, true);
            window.removeEventListener("pointermove", onPointerMove, true);
            window.removeEventListener("pointerup", onPointerUp, true);
            window.removeEventListener("pointercancel", onPointerUp, true);
            window.removeEventListener("keydown", onKeyDown, true);
            window.removeEventListener("keyup", onKeyUp, true);
            window.removeEventListener("blur", onBlur);
            onBlur();
        };
    }, [engine, rootRef, deleteSelected, hasModel]);

    const overlay = (
        <SelectionOverlay
            engine={engine}
            rootRef={rootRef}
            selected={selected}
            boxSink={boxSink}
            onDelete={onDelete ? () => void deleteSelected() : undefined}
            onCopy={onCopy ? () => copySelected(false) : undefined}
            onCut={onCopy && onDelete ? () => copySelected(true) : undefined}
            menu={menu}
            onPasteMenu={() => {
                if (menu) {
                    setMenu(null);
                    live.current.onPaste?.(menu.anchor);
                }
            }}
        />
    );

    return { overlay, cursor, selected };
}

interface SelectionOverlayProps {
    engine: DiagramEngine;
    rootRef: React.RefObject<HTMLDivElement>;
    selected: string[];
    boxSink: React.MutableRefObject<(box: Box | null) => void>;
    onDelete?: () => void;
    onCopy?: () => void;
    onCut?: () => void;
    menu: { x: number; y: number } | null;
    onPasteMenu: () => void;
}

function SelectionOverlay({ engine, rootRef, selected, boxSink, onDelete, onCopy, onCut, menu, onPasteMenu }: SelectionOverlayProps) {
    const [box, setBox] = useState<Box | null>(null);
    const [outlines, setOutlines] = useState<Outline[]>([]);
    useEffect(() => {
        boxSink.current = setBox;
        return () => {
            boxSink.current = () => undefined;
        };
    }, [boxSink]);

    // Selected nodes move with pans, zooms and canvas transitions; their outlines follow until they settle.
    useEffect(() => {
        const root = rootRef.current;
        if (!root || !selected.length) {
            setOutlines([]);
            return;
        }
        const elements = new Map<string, HTMLElement | null>();
        const find = (id: string) => {
            let element = elements.get(id);
            if (!element?.isConnected) {
                element = root.querySelector<HTMLElement>(`.node[data-nodeid="${CSS.escape(id)}"]`);
                elements.set(id, element);
            }
            return element;
        };
        let last: Outline[] = [];
        let still = 0;
        let frame = 0;
        const measure = () => {
            const next = selected
                .flatMap((id) => {
                    const element = find(id);
                    if (!element) {
                        return [];
                    }
                    const satellites = [...element.querySelectorAll<Element>("[data-selection-satellite]")];
                    return [
                        outlineOf(id, selectionBox(element)),
                        ...satellites.map((satellite, index) =>
                            outlineOf(`${id}:${index}`, satellite, satellite.getAttribute("data-selection-satellite") === "circle")),
                    ];
                })
                .filter((outline): outline is Outline => !!outline);
            if (sameOutlines(last, next)) {
                still++;
            } else {
                still = 0;
                last = next;
                setOutlines(next);
            }
            frame = still < SETTLE_FRAMES ? requestAnimationFrame(measure) : 0;
        };
        const wake = () => {
            still = 0;
            if (!frame) {
                frame = requestAnimationFrame(measure);
            }
        };
        measure();
        const listener = engine.getModel()?.registerListener({ offsetUpdated: wake, zoomUpdated: wake });
        const events = ["pointerdown", "pointerup", "wheel", "resize"] as const;
        events.forEach((name) => window.addEventListener(name, wake, true));
        root.addEventListener("transitionrun", wake, true);
        return () => {
            cancelAnimationFrame(frame);
            listener?.deregister();
            events.forEach((name) => window.removeEventListener(name, wake, true));
            root.removeEventListener("transitionrun", wake, true);
        };
    }, [selected, rootRef, engine]);

    const bounds = outlines.length
        ? {
              left: Math.min(...outlines.map((outline) => outline.left)),
              right: Math.max(...outlines.map((outline) => outline.right)),
              top: Math.min(...outlines.map((outline) => outline.top)),
              bottom: Math.max(...outlines.map((outline) => outline.bottom)),
          }
        : undefined;

    const view = rootRef.current && (box || outlines.length) ? viewRect(rootRef.current) : undefined;
    // The toolbar sits above the selection, flips below it when the top is out of view, and otherwise pins to the canvas top.
    const toolbarTop =
        bounds && view
            ? bounds.top - OUTLINE_GAP - TOOLBAR_GAP - TOOLBAR_HEIGHT >= view.top
                ? bounds.top - OUTLINE_GAP - TOOLBAR_GAP - TOOLBAR_HEIGHT
                : bounds.bottom + OUTLINE_GAP + TOOLBAR_GAP + TOOLBAR_HEIGHT <= view.bottom
                  ? bounds.bottom + OUTLINE_GAP + TOOLBAR_GAP
                  : view.top + TOOLBAR_GAP
            : 0;

    const contextMenu = menu && (
        <div
            data-testid="canvas-context-menu"
            data-canvas-chrome
            style={{
                position: "fixed",
                left: menu.x,
                top: menu.y,
                zIndex: 2002,
                minWidth: 140,
                padding: 4,
                borderRadius: 6,
                fontSize: 12,
                color: "var(--vscode-menu-foreground, var(--vscode-foreground))",
                background: CONTROLS_BG_COLOR,
                border: `1px solid ${NODE_BORDER_COLOR}`,
                boxShadow: "0 2px 8px rgba(0, 0, 0, 0.2)",
                userSelect: "none",
            }}
        >
            <button
                data-testid="canvas-context-paste"
                onClick={onPasteMenu}
                style={{ ...toolbarButton(), width: "100%", justifyContent: "space-between", borderRadius: 4, padding: "4px 8px" }}
            >
                <span>Paste</span>
                <span style={{ opacity: 0.6 }}>{shortcut("V")}</span>
            </button>
        </div>
    );

    return view ? (
        <>
            <div
                style={{
                    position: "fixed",
                    left: view.left,
                    top: view.top,
                    width: view.right - view.left,
                    height: view.bottom - view.top,
                    overflow: "hidden",
                    zIndex: 1999,
                    pointerEvents: "none",
                }}
            >
                {box && (
                    <div
                        data-testid="node-selection-box"
                        style={{
                            position: "absolute",
                            left: box.left - view.left,
                            top: box.top - view.top,
                            width: box.right - box.left,
                            height: box.bottom - box.top,
                            borderRadius: 4,
                            border: `1px solid ${LINK_HOVERED_COLOR}`,
                            background: `color-mix(in srgb, ${LINK_HOVERED_COLOR} 8%, transparent)`,
                        }}
                    />
                )}
                {outlines.map((outline) => (
                    <div
                        key={outline.id}
                        data-testid="node-selection-outline"
                        style={{
                            position: "absolute",
                            left: outline.left - OUTLINE_GAP - view.left,
                            top: outline.top - OUTLINE_GAP - view.top,
                            width: outline.right - outline.left + OUTLINE_GAP * 2,
                            height: outline.bottom - outline.top + OUTLINE_GAP * 2,
                            borderRadius: outline.round ? "50%" : 10,
                            border: `2px solid ${LINK_HOVERED_COLOR}`,
                            boxSizing: "border-box",
                        }}
                    />
                ))}
            </div>
            {bounds && !box && onDelete && (
                <div
                    data-testid="node-selection-toolbar"
                    data-canvas-chrome
                    style={{
                        position: "fixed",
                        left: (bounds.left + bounds.right) / 2,
                        top: toolbarTop,
                        transform: "translateX(-50%)",
                        zIndex: 2001,
                        display: "flex",
                        alignItems: "center",
                        gap: 2,
                        height: TOOLBAR_HEIGHT,
                        boxSizing: "border-box",
                        padding: "0 4px 0 12px",
                        borderRadius: 16,
                        fontSize: 12,
                        whiteSpace: "nowrap",
                        color: "var(--vscode-foreground)",
                        background: CONTROLS_BG_COLOR,
                        border: `1px solid ${NODE_BORDER_COLOR}`,
                        userSelect: "none",
                        boxShadow: "0 1px 4px rgba(0, 0, 0, 0.12)",
                    }}
                >
                    <span style={{ marginRight: 4 }}>{selected.length === 1 ? "1 selected" : `${selected.length} selected`}</span>
                    {onCut && (
                        <ToolbarIcon data-testid="node-selection-cut" title={`Cut (${shortcut("X")})`} aria-label="Cut" onClick={onCut}>
                            <Icon name="bi-cut" sx={{ width: 14, height: 14, fontSize: 14, color: "inherit" }} />
                        </ToolbarIcon>
                    )}
                    {onCopy && (
                        <ToolbarIcon data-testid="node-selection-copy" title={`Copy (${shortcut("C")})`} aria-label="Copy" onClick={onCopy}>
                            <Icon name="bi-copy" sx={{ width: 14, height: 14, fontSize: 14, color: "inherit" }} />
                        </ToolbarIcon>
                    )}
                    <ToolbarIcon data-testid="node-selection-delete" title={`Delete (${isMac ? "⌫" : "Del"})`} aria-label="Delete" danger onClick={onDelete}>
                        <Icon name="bi-delete" sx={{ width: 14, height: 14, fontSize: 14, color: "inherit" }} />
                    </ToolbarIcon>
                </div>
            )}
            {contextMenu}
        </>
        ) : contextMenu;
}
