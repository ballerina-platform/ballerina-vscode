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
import createEngine, { DiagramEngine, DiagramModel, PortModel } from "@projectstorm/react-diagrams";
import { NodePortFactory, NodePortModel } from "../components/NodePort";
import {
    NodeLinkFactory,
    NodeLinkModel,
    NodeLinkModelOptions,
    Point2D,
    sampleBezierPath,
} from "../components/NodeLink";
import { OverlayLayerFactory } from "../components/OverlayLayer";
import { DagreEngine } from "../resources/dagre/DagreEngine";
import { NodeModel } from "./types";
import { EntryNodeFactory, EntryNodeModel } from "../components/nodes/EntryNode";
import { ConnectionNodeFactory } from "../components/nodes/ConnectionNode/ConnectionNodeFactory";
import { ListenerNodeFactory } from "../components/nodes/ListenerNode/ListenerNodeFactory";
import {
    LISTENER_NODE_WIDTH,
    NodeTypes,
    NODE_GAP_X,
    ENTRY_NODE_WIDTH,
    ENTRY_NODE_HEIGHT,
    NODE_GAP_Y,
    LISTENER_NODE_HEIGHT,
    CON_NODE_WIDTH,
    CON_NODE_HEIGHT,
    NODE_BORDER_WIDTH,
    NODE_PADDING,
    ENTRY_ROW_GAP,
    ENTRY_ROW_CONTENT_HEIGHT,
    ENTRY_HEADER_CONTENT_HEIGHT,
    WORKFLOW_PLAY_BUTTON_TOP,
    WORKFLOW_PLAY_BUTTON_SIZE,
} from "../resources/constants";
import { ListenerNodeModel } from "../components/nodes/ListenerNode";
import { ConnectionNodeModel } from "../components/nodes/ConnectionNode";
import {
    AI_CHAT_RESOURCE_NAME,
    AI_DECISION_RESOURCE_NAME,
    CDConnection,
    CDResourceFunction,
    CDFunction,
    CDModel,
    CDService,
    CDWorkflow,
    CDWorkflowEvent,
} from "@wso2/ballerina-core";
import {
    DEFAULT_GQL_STATE,
    GQLFuncListType,
    GQLState,
    GroupKey,
    PREVIEW_COUNT,
    SHOW_ALL_THRESHOLD,
} from "../components/Diagram";

export function generateEngine(): DiagramEngine {
    const engine = createEngine({
        registerDefaultDeleteItemsAction: false,
        registerDefaultZoomCanvasAction: false,
        registerDefaultPanAndZoomCanvasAction: false,
        // repaintDebounceMs: 100,
    });

    engine.getPortFactories().registerFactory(new NodePortFactory());
    engine.getLinkFactories().registerFactory(new NodeLinkFactory());

    engine.getNodeFactories().registerFactory(new ListenerNodeFactory());
    engine.getNodeFactories().registerFactory(new EntryNodeFactory());
    engine.getNodeFactories().registerFactory(new ConnectionNodeFactory());

    engine.getLayerFactories().registerFactory(new OverlayLayerFactory());

    // engine.getActionEventBus().registerAction(new VerticalScrollCanvasAction());
    return engine;
}

export function autoDistribute(engine: DiagramEngine) {
    const model = engine.getModel();

    // Get all nodes by type. Workflows are laid out in their own column so the edges from
    // their triggers (services/automation) flow left to right without crossing other nodes.
    const listenerNodes = model.getNodes().filter((node) => node.getType() === NodeTypes.LISTENER_NODE);
    const allEntryNodes = model.getNodes().filter((node) => node.getType() === NodeTypes.ENTRY_NODE);
    const entryNodes = allEntryNodes.filter((node) => (node as EntryNodeModel).type !== "workflow");
    const workflowNodes = allEntryNodes.filter((node) => (node as EntryNodeModel).type === "workflow");
    const connectionNodes = model.getNodes().filter((node) => node.getType() === NodeTypes.CONNECTION_NODE);

    // Set X positions for each column: listeners | entry points | workflows | connections.
    // The workflow column collapses when empty.
    const listenerX = 250;
    const entryX = listenerX + LISTENER_NODE_WIDTH + NODE_GAP_X;
    let nextX = entryX + ENTRY_NODE_WIDTH + NODE_GAP_X;
    const workflowX = nextX;
    if (workflowNodes.length > 0) {
        nextX += ENTRY_NODE_WIDTH + NODE_GAP_X;
    }
    const connectionX = nextX;

    // Separate listeners into connected and unconnected
    const connectedListeners: ListenerNodeModel[] = [];
    const unconnectedListeners: ListenerNodeModel[] = [];
    listenerNodes.forEach((node) => {
        const listenerNode = node as ListenerNodeModel;
        if (listenerNode.node.attachedServices.some((id) => entryNodes.some((n) => n.getID() === id))) {
            connectedListeners.push(listenerNode);
        } else {
            unconnectedListeners.push(listenerNode);
        }
    });

    // Update X positions for entry nodes while keeping their Y positions
    entryNodes.forEach((node) => {
        const entryNode = node as EntryNodeModel;
        entryNode.setPosition(entryX, entryNode.getY());
    });

    // Every real link in the model, bucketed once by endpoint (self-loops excluded, same as every
    // filter below used to apply inline) so positionColumnByIncomingLinks/refineNodesByAllLinks -
    // each called several times across both rounds - look a node's links up in O(1) instead of
    // re-scanning the full link array per node, per call.
    const links = model.getLinks().filter((linkModel): linkModel is NodeLinkModel => linkModel instanceof NodeLinkModel);
    const incomingLinksByNode = new Map<NodeModel, NodeLinkModel[]>();
    const outgoingLinksByNode = new Map<NodeModel, NodeLinkModel[]>();
    const addToBucket = (map: Map<NodeModel, NodeLinkModel[]>, node: NodeModel, link: NodeLinkModel) => {
        const bucket = map.get(node);
        if (bucket) {
            bucket.push(link);
        } else {
            map.set(node, [link]);
        }
    };
    links.forEach((link) => {
        if (!link.sourceNode || !link.targetNode || link.sourceNode === link.targetNode) {
            return;
        }
        addToBucket(outgoingLinksByNode, link.sourceNode, link);
        addToBucket(incomingLinksByNode, link.targetNode, link);
    });

    // Round 1: position everything downstream of entry nodes from their current (creation-order)
    // Y, exactly as before this round existed.
    connectedListeners.forEach((listenerNode) => positionConnectedListener(listenerNode, entryNodes as NodeModel[], listenerX));
    positionColumnByIncomingLinks(workflowNodes as NodeModel[], incomingLinksByNode, workflowX, ENTRY_NODE_HEIGHT);
    positionColumnByIncomingLinks(connectionNodes as NodeModel[], incomingLinksByNode, connectionX, CON_NODE_HEIGHT);

    // Round 2: entry and workflow nodes sit *between* two neighbors (a listener/entry node on one
    // side, a workflow/connection on the other) that round 1 only let pull on whichever side comes
    // later in the pass - a service could move to match its listener, but never the reverse, so a
    // listener sitting above a tall service's real center could only ever "win" one direction.
    // Refining both middle columns against everything now real on both sides, without either call
    // reordering beyond each column's own CURRENT vertical order - entry nodes' is still the source
    // file's (nothing before this point has touched their Y), while workflow nodes' is whatever
    // round 1's free reorder already settled it to - lets a plain, unbranched chain settle dead
    // straight end to end, and gives a branching one the smallest total disturbance instead of
    // always favoring whichever neighbor happened to move first.
    refineNodesByAllLinks(entryNodes as NodeModel[], incomingLinksByNode, outgoingLinksByNode);
    refineNodesByAllLinks(workflowNodes as NodeModel[], incomingLinksByNode, outgoingLinksByNode);
    connectedListeners.forEach((listenerNode) => positionConnectedListener(listenerNode, entryNodes as NodeModel[], listenerX));
    positionColumnByIncomingLinks(connectionNodes as NodeModel[], incomingLinksByNode, connectionX, CON_NODE_HEIGHT);

    // Position unconnected listeners below all other nodes
    if (unconnectedListeners.length > 0) {
        // Find the maximum Y position among all nodes
        const allNodes = [...connectedListeners, ...entryNodes, ...workflowNodes, ...connectionNodes];
        let maxY = 100; // Default starting position if no other nodes

        if (allNodes.length > 0) {
            maxY = Math.max(...allNodes.map(node => {
                const nodeHeight = node.height || LISTENER_NODE_HEIGHT;
                return node.getY() + nodeHeight;
            }));
        }

        // Position unconnected listeners below, with spacing
        unconnectedListeners.forEach((listenerNode, index) => {
            const yPosition = maxY + NODE_GAP_Y/2 + (index * (LISTENER_NODE_HEIGHT + NODE_GAP_Y/2));
            listenerNode.setPosition(listenerX, yPosition);
        });
    }

    avoidLinkObstructions(engine);

    engine.repaintCanvas();
}

/**
 * The `{ item, desiredCenter, height }` that `positionColumnByIncomingLinks` and
 * `refineNodesByAllLinks` both build for a node before handing it to `resolveMinGapPositions` -
 * factored out so their shared row-offset math (see the class doc below) only needs fixing in one
 * place; the two callers differ only in which links they consider "relevant" (incoming-only vs.
 * every link touching the node) and what they do with the result afterward.
 *
 * `node`'s desired center is the average, across `relevantLinks`, of the center that would put
 * *this* node's own end of that link exactly on the other end's real anchor - each computed via
 * its own row offset from `getPortAnchorY`, so a link landing on a specific row (not a generic
 * port) pulls correctly rather than assuming the node's plain center. A node nothing relevant
 * touches keeps its own current center.
 */
function computeDesiredCenterItem(
    node: NodeModel,
    relevantLinks: NodeLinkModel[],
    defaultHeight: number
): { item: NodeModel; desiredCenter: number; height: number } {
    const height = node.height || defaultHeight;
    // Both branches below derive "current center" from the same real box rather than one of them
    // reaching for `node.getY() + height / 2` directly - that only agreed with
    // `getNodeBoundingBox`'s own center because every caller's `defaultHeight` happens to match the
    // type-based default `getNodeBoundingBox` falls back to on its own; deriving both from the box
    // means they can't quietly diverge if that ever stops being true.
    const nodeBox = getNodeBoundingBox(node);
    const currentCenter = (nodeBox.top + nodeBox.bottom) / 2;
    if (relevantLinks.length === 0) {
        return { item: node, desiredCenter: currentCenter, height };
    }
    const desiredCenter =
        relevantLinks.reduce((sum, link) => {
            const isSource = link.sourceNode === node;
            const ownPort = isSource ? link.getSourcePort() : link.getTargetPort();
            const otherNode = isSource ? link.targetNode : link.sourceNode;
            const otherPort = isSource ? link.getTargetPort() : link.getSourcePort();
            // How far this link's own row sits from the node's current center - 0 for a generic
            // in/out port, some real row offset for a specific function/event port.
            const rowOffset = getPortAnchorY(node, ownPort, nodeBox) - currentCenter;
            // The center that would put *this* row exactly on the other end's anchor.
            return sum + (getPortAnchorY(otherNode, otherPort) - rowOffset);
        }, 0) / relevantLinks.length;
    return { item: node, desiredCenter, height };
}

/**
 * Centers every node in `nodes` on the average real anchor Y of whatever links target it (falling
 * back to its current center when nothing does), then stacks them downward wherever two desired
 * centers would otherwise overlap - the same technique `autoDistribute` already uses for
 * listeners, generalized to any column and to fan-in (a node reached by several links lands on
 * their combined average, same as `avgCenterY` does above for one link per node).
 *
 * Reading real anchors off the actual links - rather than, say, a workflow's own
 * `attachedServices`/`attachedFunctions` lists - is what makes this correct even when a link
 * attaches to a *specific* row port rather than a node's generic one (e.g. a single function
 * calling `workflow:run`, or a GraphQL group's own port): the position that matters is wherever
 * that particular link actually leaves its source, not the source node's center. The same goes
 * for where it *arrives*: a workflow with both a generic trigger (from automation, landing at its
 * center) and a specific event port (from another workflow's output, landing well below center)
 * has two incoming links that don't agree on what "this node's center" should even mean unless
 * each is first translated through its own arrival row's offset - averaging their raw source
 * anchors without that would silently target neither row correctly.
 *
 * Nodes with nothing pointing at them keep their existing center exactly. Siblings that end up
 * wanting the same (or too-close) center - e.g. two connections both fed solely by the same
 * automation node - settle symmetrically around that shared center rather than one keeping it
 * outright and the other being shoved aside; see `resolveMinGapPositions`.
 */
function positionColumnByIncomingLinks(
    nodes: NodeModel[],
    incomingLinksByNode: Map<NodeModel, NodeLinkModel[]>,
    x: number,
    defaultHeight: number
) {
    const items = nodes.map((node) => {
        const incomingLinks = incomingLinksByNode.get(node) ?? [];
        return computeDesiredCenterItem(node, incomingLinks, defaultHeight);
    });
    // Free to reorder: a workflow/connection's vertical sequence carries no meaning of its own,
    // so sorting by desired center first is what lets crossing-minimization actually happen (two
    // nodes trying to swap places to both go straight, rather than being forced to keep whichever
    // order they happened to be created in).
    items.sort((a, b) => a.desiredCenter - b.desiredCenter);
    const finalCenters = resolveMinGapPositions(items, NODE_GAP_Y / 2);
    items.forEach(({ item: node, height }) => {
        node.setPosition(x, finalCenters.get(node)! - height / 2);
    });
}

/**
 * Resolves final centers for `items` (each already carrying its own independently-desired center
 * and real height), processed in the given order, so that adjacent items end up at least `gap`
 * apart - via isotonic regression (the "pool adjacent violators" algorithm): whenever two
 * neighbors' desired centers are too close to fit `gap` between them, they merge into one block
 * sharing their (weighted) average desired center, which may then also violate distance from ITS
 * neighbor and merge further, repeating until every remaining block boundary is compliant. A
 * block's members are then packed tightly (own heights + gap) around that shared center, in the
 * same relative order they were given in.
 *
 * This is what makes colliding siblings settle SYMMETRICALLY around a shared desired center (two
 * items both wanting center 100, needing 50 between them, land at 75 and 125) instead of a naive
 * "stack downward from the first one" pass, which would leave the first exactly at 100 and push
 * the second down to 150 - silently favoring whichever item happens to come first in `items`.
 * Callers decide what "first" means: sorted by desired center (allowing reorder) or left in
 * existing order (preserving it) - this function only ever merges adjacent entries, never reorders.
 */
function resolveMinGapPositions<T>(items: Array<{ item: T; desiredCenter: number; height: number }>, gap: number): Map<T, number> {
    interface Block {
        sumDesired: number;
        count: number;
        members: Array<{ item: T; height: number }>;
        totalHeight: number;
        // Sum, over this block's members, of each one's own packed center as measured from the
        // block's own top edge (a lone member's is just its half-height; packing another member in
        // after it shifts that one's offset by "height + gap"). `sumOffset / count` is then the
        // block's real top extent - `totalHeight - that` its real bottom extent - which only equal
        // `totalHeight / 2` when every member in the block is the same height. Kept incrementally
        // through merges (rather than re-summed from scratch) so the merge test just below and the
        // final packing step always agree on the same real edges, instead of the merge test
        // assuming a symmetric block that the packing step (correctly) doesn't produce.
        sumOffset: number;
    }
    const blocks: Block[] = [];
    items.forEach(({ item, desiredCenter, height }) => {
        blocks.push({ sumDesired: desiredCenter, count: 1, members: [{ item, height }], totalHeight: height, sumOffset: height / 2 });
        while (blocks.length >= 2) {
            const curr = blocks[blocks.length - 1];
            const prev = blocks[blocks.length - 2];
            const prevBottomExtent = prev.totalHeight - prev.sumOffset / prev.count;
            const currTopExtent = curr.sumOffset / curr.count;
            const minDistance = prevBottomExtent + gap + currTopExtent;
            if (curr.sumDesired / curr.count - prev.sumDesired / prev.count >= minDistance) {
                break;
            }
            // curr's members end up packed right after prev's own extent plus this gap, so their
            // offsets (measured from curr's own top edge) shift by that same amount in the merged
            // block's frame.
            prev.sumOffset += curr.sumOffset + curr.count * (prev.totalHeight + gap);
            prev.sumDesired += curr.sumDesired;
            prev.count += curr.count;
            prev.totalHeight += curr.totalHeight + gap;
            prev.members.push(...curr.members);
            blocks.pop();
        }
    });

    const result = new Map<T, number>();
    blocks.forEach((block) => {
        const blockCenter = block.sumDesired / block.count;
        let cursor = blockCenter - block.sumOffset / block.count;
        block.members.forEach(({ item, height }) => {
            result.set(item, cursor + height / 2);
            cursor += height + gap;
        });
    });
    return result;
}

/**
 * Centers `listenerNode` on the average real in-port Y of its attached services (see
 * getPortAnchorY: their vertical center, since createNodesLink always attaches to a service's
 * generic "in" port) - not their box top. A listener with exactly one service then lands on a
 * dead-straight line instead of being offset by however far short of its center a tall service's
 * top happens to sit. No-ops if none of `entryNodes` match an attached service ID.
 */
function positionConnectedListener(listenerNode: ListenerNodeModel, entryNodes: NodeModel[], listenerX: number): void {
    const attachedServices = listenerNode.node.attachedServices;
    const serviceNodes = entryNodes.filter((n) => attachedServices.includes(n.getID()));
    if (serviceNodes.length === 0) {
        return;
    }
    const avgCenterY =
        serviceNodes.reduce((sum, n) => {
            const entryNode = n as EntryNodeModel;
            return sum + getPortAnchorY(entryNode, entryNode.getInPort());
        }, 0) / serviceNodes.length;
    const listenerHeight = listenerNode.height || LISTENER_NODE_HEIGHT;
    listenerNode.setPosition(listenerX, avgCenterY - listenerHeight / 2);
}

/**
 * Nudges every node in `nodes` toward the combined pull of *every* link touching it - both the
 * ones feeding into it and the ones it sends out - without changing their relative order (unlike
 * `positionColumnByIncomingLinks`, which is free to reorder since a workflow/connection's vertical
 * sequence carries no meaning of its own; reordering an entry or workflow node here, past whatever
 * order it already holds when this runs, would make it confusing for no benefit).
 *
 * A node linked from only one side (e.g. a service with no listener, or a connection with several
 * senders that already settled the service's other neighbor) is exactly
 * `positionColumnByIncomingLinks`'s one-sided average. What this adds is the *other* direction: a
 * link leaving from a specific row (say, a function two rows down) contributes the node-center
 * that would put *that row*, not the node's top or center, on the target's anchor - so a node
 * pulled from both sides settles wherever best serves both, not just whichever neighbor happened
 * to already have a real position when it was this node's turn.
 */
function refineNodesByAllLinks(
    nodes: NodeModel[],
    incomingLinksByNode: Map<NodeModel, NodeLinkModel[]>,
    outgoingLinksByNode: Map<NodeModel, NodeLinkModel[]>
): void {
    const items = nodes.map((node) => {
        const neighborLinks = [...(incomingLinksByNode.get(node) ?? []), ...(outgoingLinksByNode.get(node) ?? [])];
        return computeDesiredCenterItem(node, neighborLinks, ENTRY_NODE_HEIGHT);
    });

    // Kept in the nodes' EXISTING vertical order (not re-sorted by desiredCenter), so a node
    // never leapfrogs another - only its own Y shifts. Ordering by center (not `getY()`, the top
    // edge) matters once heights differ: two nodes can disagree on which one is "first" by top
    // edge alone while agreeing by center, and center is the space everything else here (desired
    // centers, resolveMinGapPositions) already works in.
    items.sort((a, b) => (a.item.getY() + a.height / 2) - (b.item.getY() + b.height / 2));
    const finalCenters = resolveMinGapPositions(items, NODE_GAP_Y / 2);
    items.forEach(({ item: node, height }) => {
        node.setPosition(node.getX(), finalCenters.get(node)! - height / 2);
    });
}

/** Minimum clearance kept between a rerouted link and the edge of the node it detours around. */
export const LINK_DETOUR_MARGIN = 16;

/**
 * Shared row metrics for the plain entry/workflow body layout: a fixed-height header block,
 * then a uniform-height row per function/event, optionally followed by a "view all" row (see
 * `Node`/`Box`/`FunctionBoxWrapper` in `nodes/EntryNode/components/styles.ts` and the row
 * components in `GeneralWidget.tsx`). `calculateEntryNodeHeight`/`calculateWorkflowNodeHeight`
 * (which size a node) and `getPortAnchorY` (which locates a specific row's port for link
 * routing) both derive from these same numbers so the two can't drift out of sync - as do
 * `calculateGraphQLNodeHeight`/`computeGraphQLPortOffsets` further down, since `GraphQLServiceWidget`
 * renders its function and "show more" rows with these exact same styled components (see the
 * comment above `GQL_BASE_HEIGHT`), not a GraphQL-specific size of its own.
 *
 * These are real rendered pixel measurements, not a "content + padding" guess - `ROW_PADDING`,
 * `ENTRY_HEADER_CONTENT_HEIGHT` and `ENTRY_ROW_CONTENT_HEIGHT` are themselves imported from
 * `resources/constants`, the same module `styles.ts` imports its `Box`/`ServiceBox`/
 * `StyledServiceBox` CSS values from, so the two can't drift apart the way a bare number (or the
 * same formula) restated in both places could. `Box` and `StyledServiceBox` are declared
 * `box-sizing: border-box`, so a row's declared height already includes its own border - it does
 * not add on top of it. Confirmed against the real production webview DOM (not jsdom, which never
 * lays out real pixel sizes).
 */
const ROW_PADDING = ENTRY_ROW_GAP; // gap between stacked rows - `Box`'s own `gap`
// `Box`'s own border + padding: the inset between a node's outer edge and its first/last row,
// counted once at the top and once at the bottom. Border-box sizing doesn't apply here since Box
// has no explicit width/height of its own (it's sized by its content), so this is added on top
// regardless.
const BOX_INSET = NODE_BORDER_WIDTH + NODE_PADDING; // 1.5 + 8 = 9.5
// Offset from a node's own top edge to the top of its first row: the node's own top inset, then
// the header, then the gap before row 0.
const ENTRY_HEADER_HEIGHT = BOX_INSET + ENTRY_HEADER_CONTENT_HEIGHT + ROW_PADDING; // 9.5+56+8=73.5
// Distance from one row's top to the next row's top (a row's own height plus the gap after it).
const ENTRY_ROW_HEIGHT = ROW_PADDING + ENTRY_ROW_CONTENT_HEIGHT; // 8+40=48
const ENTRY_VIEW_ALL_BUTTON_HEIGHT = 40; // ViewAllButton carries no border at rest - unchanged.

export interface BoundingBox {
    left: number;
    right: number;
    top: number;
    bottom: number;
}

/**
 * Returns a node's on-canvas box. Entry/workflow nodes always carry an explicit `.height`
 * (computed from their content - see calculateEntryNodeHeight/calculateWorkflowNodeHeight), but
 * connection and listener nodes never set the model's width/height fields (their box comes from
 * fixed CSS sizing instead), so those fall back to the matching size constants.
 */
export function getNodeBoundingBox(node: NodeModel): BoundingBox {
    const type = node.getType();
    const defaultWidth = type === NodeTypes.CONNECTION_NODE
        ? CON_NODE_WIDTH
        : type === NodeTypes.LISTENER_NODE
            ? LISTENER_NODE_WIDTH
            : ENTRY_NODE_WIDTH;
    const defaultHeight = type === NodeTypes.CONNECTION_NODE
        ? CON_NODE_HEIGHT
        : type === NodeTypes.LISTENER_NODE
            ? LISTENER_NODE_HEIGHT
            : ENTRY_NODE_HEIGHT;
    const width = node.width || defaultWidth;
    const height = node.height || defaultHeight;
    return {
        left: node.getX(),
        right: node.getX() + width,
        top: node.getY(),
        bottom: node.getY() + height,
    };
}

/**
 * Returns the Y coordinate a link actually leaves/enters a node at, based on the specific port
 * it's attached to - not just the node's box center.
 *
 * The generic in/out ports sit at the node's true vertical center, because `Node` is a flex *row*
 * with those ports as its first/last children (see `styles.ts`). But `GeneralServiceWidget` stacks
 * function rows and workflow event rows in a column *below* the header (`FunctionBox` /
 * `WorkflowEventBox`, each wrapped in a `FunctionBoxWrapper`), so a link attached to one of those
 * specific ports actually leaves from that row's own Y - which can be well below the node's center
 * for a short node with few rows. Treating it as centered is exactly what let a function-row link
 * cut through an unrelated node sitting below where the node's center happened to be.
 *
 * `GraphQLServiceWidget` groups functions under collapsible per-group headers, so a group's rows
 * only have a fixed offset once you know which groups are open - information this function, reached
 * from `autoDistribute(engine)` with only the model in hand, doesn't have. `buildDiagramData` does
 * (it's how `calculateGraphQLNodeHeight` sizes the node), so it stamps each GraphQL function/group
 * port's row offset onto the port itself (`NodePortModel.rowOffsetY`, via
 * `computeGraphQLPortOffsets`) once it lays the rows out; this function just reads that back.
 *
 * `box` lets a caller that already has the node's bounding box (e.g. `getLinkAnchors`, which needs
 * it for the port's X too) pass it in instead of having this function compute it again.
 */
export function getPortAnchorY(node: NodeModel, port: PortModel | null | undefined, box?: BoundingBox): number {
    box ??= getNodeBoundingBox(node);
    const center = (box.top + box.bottom) / 2;
    if (!port || !(node instanceof EntryNodeModel)) {
        return center;
    }

    if (node.type === "workflow" && port === node.getInPort()) {
        // Unlike other entry nodes, a workflow's "in" port renders inside its play button
        // (PlayButtonCircle), pinned near the header rather than centered on the box - so it
        // needs its own anchor instead of falling into the generic center case below.
        //
        // `top: WORKFLOW_PLAY_BUTTON_TOP` on PlayButtonCircle resolves against Box's PADDING edge
        // (Box is `position: relative`), so it lands one Box-border-width below `box.top`. And
        // PlayButtonCircle itself has no `box-sizing: border-box`, so its declared
        // WORKFLOW_PLAY_BUTTON_SIZE is content height, not the true (border-included) height its
        // own center sits at the middle of - add its own border-width once more to reach that
        // center. Both borders are the same NODE_BORDER_WIDTH.
        return box.top + NODE_BORDER_WIDTH + WORKFLOW_PLAY_BUTTON_TOP + NODE_BORDER_WIDTH + WORKFLOW_PLAY_BUTTON_SIZE / 2;
    }

    if (port === node.getInPort() || port === node.getOutPort()) {
        return center;
    }

    if (node.type === "workflow") {
        const events = (node.node as CDWorkflow).events ?? [];
        const eventIndex = events.findIndex((event) => node.getEventPort(event) === port);
        if (eventIndex === -1) {
            return center; // workflow nodes have no other row-level ports
        }
        return box.top + ENTRY_HEADER_HEIGHT + eventIndex * ENTRY_ROW_HEIGHT + ENTRY_ROW_CONTENT_HEIGHT / 2;
    }

    const service = node.node as CDService;
    if (service?.type === "graphql:Service") {
        const offset = (port as NodePortModel).rowOffsetY;
        if (offset === undefined) {
            // Only reachable if this port is anchored before buildDiagramData's
            // computeGraphQLPortOffsets step stamps it - e.g. a caller that builds nodes/links
            // directly instead of going through buildDiagramData. Falling back to center keeps
            // this from throwing, but it's exactly the "link cuts through a function row"
            // approximation this function otherwise exists to avoid, so surface it rather than
            // let it fail silently.
            console.warn(
                `getPortAnchorY: GraphQL port "${(port as NodePortModel).getOptions().name}" on node ` +
                `"${node.getID()}" has no rowOffsetY - falling back to the node's center. Anchor GraphQL ` +
                "ports via buildDiagramData (which stamps rowOffsetY) before calling getPortAnchorY."
            );
            return center;
        }
        return box.top + offset;
    }

    if (service?.type === "ai:Service") {
        // AIServiceWidget always renders the chat row above the decision row when both are
        // present (see its JSX), regardless of which one appears first in
        // `service.resourceFunctions` - unlike the generic fallback below, whose row index is
        // exactly the port's position in that array. Reusing that fallback here would anchor the
        // two ports at swapped rows whenever a service happens to declare `decision` before
        // `chat`.
        const resourceFunctions = service.resourceFunctions ?? [];
        const chatFunction = resourceFunctions.find((fn) => fn.path === AI_CHAT_RESOURCE_NAME);
        const decisionFunction = resourceFunctions.find((fn) => fn.path === AI_DECISION_RESOURCE_NAME);
        const rowIndex = chatFunction && port === node.getFunctionPort(chatFunction)
            ? 0
            : decisionFunction && port === node.getFunctionPort(decisionFunction)
                ? (chatFunction ? 1 : 0)
                : -1;
        return rowIndex === -1
            ? center
            : box.top + ENTRY_HEADER_HEIGHT + rowIndex * ENTRY_ROW_HEIGHT + ENTRY_ROW_CONTENT_HEIGHT / 2;
    }

    if (port === node.getViewAllResourcesPort()) {
        // Only ever linked while collapsed, in which case visibleRowCountWhenCollapsed() rows are
        // visible above it (see partitionRegularServiceFunctions, the count's actual source of truth).
        return box.top + ENTRY_HEADER_HEIGHT
            + visibleRowCountWhenCollapsed() * ENTRY_ROW_HEIGHT + ENTRY_VIEW_ALL_BUTTON_HEIGHT / 2;
    }

    // A specific function's own port. Ports are added in the same order functions are shown in
    // (see EntryNodeModel's constructor and partitionRegularServiceFunctions in Diagram.tsx),
    // and a function is only ever linked via its own port while visible, so its position among
    // the node's out-ports - after the leading generic "out" port - is exactly its row index.
    const rowIndex = node.getOutPorts().indexOf(port as NodePortModel) - 1;
    if (rowIndex >= 0) {
        return box.top + ENTRY_HEADER_HEIGHT + rowIndex * ENTRY_ROW_HEIGHT + ENTRY_ROW_CONTENT_HEIGHT / 2;
    }

    return center;
}

/**
 * Samples per bezier segment used when asking where a link actually runs. A segment spans a few
 * hundred px at most in this layout, so ~64 chords keep the polyline within a small fraction of a
 * pixel of the true curve - far finer than the node boxes (>= 64px tall) being tested against.
 */
const CURVE_SAMPLES_PER_SEGMENT = 64;

/**
 * Whether the segment `a`-`b` touches `box`, via Liang-Barsky parametric clipping: the segment is
 * inside the box's X slab over some range of `t`, inside its Y slab over another, and touches the
 * box exactly when those ranges still overlap inside `[0, 1]` after both are applied. A segment
 * running parallel to a slab (`delta === 0`) either lies within it for all `t` or misses entirely.
 */
function segmentIntersectsBox(a: Point2D, b: Point2D, box: BoundingBox): boolean {
    let enter = 0;
    let exit = 1;
    const clipAxis = (delta: number, origin: number, low: number, high: number) => {
        if (delta === 0) {
            return origin >= low && origin <= high;
        }
        const t1 = (low - origin) / delta;
        const t2 = (high - origin) / delta;
        enter = Math.max(enter, Math.min(t1, t2));
        exit = Math.min(exit, Math.max(t1, t2));
        return enter <= exit;
    };
    return (
        clipAxis(b.x - a.x, a.x, box.left, box.right) && clipAxis(b.y - a.y, a.y, box.top, box.bottom)
    );
}

/**
 * Whether a link's sampled curve (see `sampleBezierPath`) passes through `box`. Takes the sampled
 * polyline rather than the curve's control points so one link can be tested against many boxes
 * without re-sampling it for each.
 */
function polylineCrossesBox(polyline: Point2D[], box: BoundingBox): boolean {
    return polyline.slice(1).some((point, index) => segmentIntersectsBox(polyline[index], point, box));
}

/** A link's two endpoint anchors, in draw order. */
export interface LinkAnchors {
    source: Point2D;
    target: Point2D;
}

/**
 * Where a link's two ends actually attach: every node widget renders its "in" port's `PortWidget`
 * as the first child of a row layout and its "out"/function ports' as the last (see
 * ConnectionNodeWidget.tsx, ListenerNodeWidget.tsx, and the entry-node widgets in
 * `nodes/EntryNode/components`) - so a link's source always attaches
 * on its own node's right edge and its target always on its own node's left edge, regardless of
 * which of the two nodes happens to sit further left on canvas. Comparing box positions to decide
 * which edge to use would be wrong the moment a link ever ran against the layout's usual
 * left-to-right column order (autoDistribute keeps it that way today, but nothing here should
 * depend on that to stay correct).
 *
 * Returns null for a link that isn't routable geometry (either end missing, or both ends on the
 * same node). Shared with the whole-diagram overlap checker (see `checkNoLinkCrossesAnyNode` in
 * `test/linkOverlapChecker.ts`) so the check can't validate a curve different from the one this
 * pass routes - under jsdom the model's own endpoint points sit at the origin, so the checker has
 * to derive them the same way, and deriving them twice is how the two would drift apart.
 */
export function getLinkAnchors(link: NodeLinkModel): LinkAnchors | null {
    const { sourceNode, targetNode } = link;
    if (!sourceNode || !targetNode || sourceNode === targetNode) {
        return null;
    }
    const sourceBox = getNodeBoundingBox(sourceNode);
    const targetBox = getNodeBoundingBox(targetNode);
    return {
        source: {
            x: sourceBox.right,
            y: getPortAnchorY(sourceNode, link.getSourcePort(), sourceBox),
        },
        target: {
            x: targetBox.left,
            y: getPortAnchorY(targetNode, link.getTargetPort(), targetBox),
        },
    };
}

/**
 * autoDistribute() lays nodes out in fixed left-to-right columns. Whenever a link's endpoints sit
 * in non-adjacent columns - e.g. an automation or a service function linking straight to a
 * connection while the workflow column exists in between - the link can cut right through an
 * unrelated node occupying a column it skips over. This pass finds those links and adds two
 * waypoints that route them through the nearest free vertical gap in the offending column
 * instead - above or below whichever node(s) are in the way - rather than through it.
 *
 * The check is purely geometric - it doesn't know or care that the "workflow" column is the one
 * usually in the way - and it asks the question against the curve NodeLinkModel actually paints,
 * by sampling the very same bezier segments (see sampleBezierPath / getBezierSegments) rather
 * than against the straight chord between the link's endpoints.
 *
 * Testing the chord is what this pass used to do, and it is *not* a safe approximation: with a
 * horizontal tangent forced at both ends, a link deliberately bows away from its chord by up to
 * half the segment's height. A `GET /f` function row linking to the lower of two connections
 * passed 0.3px clear of a stacked workflow node's top edge as a chord while the drawn curve
 * entered that node by 4.4px - visible as a link clipping the box's corner, with this pass
 * reporting nothing wrong. Sampling the real curve removes that whole class of near-miss by
 * construction, instead of trying to cover the bow with a bigger clearance margin.
 *
 * Two known limits, both deliberate at this size of diagram:
 * - Every obstruction collapses into one `[columnLeft, columnRight]` hull, so the detour is shaped
 *   for a single contiguous band of obstructions - today's only case, since exactly one column can
 *   sit between two others. Two *disjoint* intervening columns would be routed as though the gap
 *   between them were blocked too; handling those needs one bend pair per contiguous X-cluster,
 *   which the N-point path builder already supports.
 * - Lanes are chosen per link against the nodes only, so two links passing the same column can be
 *   assigned the same lane Y and render collinear along it. Nothing is hidden (both still reach
 *   their endpoints), and separating them means feeding already-assigned lanes back into the
 *   blocked bands - a whole-diagram concern rather than a per-link one.
 */
export function avoidLinkObstructions(engine: DiagramEngine) {
    const model = engine.getModel();
    const allNodes = model.getNodes() as NodeModel[];
    const links = model.getLinks().filter((linkModel): linkModel is NodeLinkModel => linkModel instanceof NodeLinkModel);

    // Every node's box is fixed for the rest of this pass (autoDistribute finalizes positions
    // before calling this), so it's computed once per node here rather than once per (link, node)
    // pair below - the obstruction scan runs this for every node against every link otherwise.
    const nodeBoxes = new Map<NodeModel, BoundingBox>(allNodes.map((node) => [node, getNodeBoundingBox(node)]));

    links.forEach((link) => {
        // Every link starts life with exactly 2 points (see NodeLinkModel/DefaultLinkModel), but
        // guard against being run more than once over the same link.
        link.removeMiddlePoints();

        const anchors = getLinkAnchors(link);
        if (!anchors) {
            return;
        }

        // Left/right is read off the layout rather than assumed, so this stays correct for a link
        // ever drawn right-to-left. `sourceIsLeft` also drives which waypoint gets inserted next
        // to which endpoint below, so the point array - not just the obstruction math - stays
        // correct for that case too.
        const sourceIsLeft = anchors.source.x <= anchors.target.x;
        const [anchorLeft, anchorRight] = sourceIsLeft
            ? [anchors.source, anchors.target]
            : [anchors.target, anchors.source];
        if (anchorRight.x <= anchorLeft.x) {
            return; // same or overlapping columns - no horizontal span for anything to sit in
        }

        // Every node whose X-range overlaps the link's own horizontal span at all. Since a
        // segment's curve never leaves the span between its endpoints' X coordinates (see
        // getBezierSegments), no other node can possibly be crossed - and defining the set by
        // overlap rather than by "sits strictly between the two columns" is what makes the detour
        // construction below provably safe.
        const obstructions = allNodes
            .filter((node) => node !== link.sourceNode && node !== link.targetNode)
            .map((node) => nodeBoxes.get(node)!)
            .filter((box) => box.right > anchorLeft.x && box.left < anchorRight.x);
        if (obstructions.length === 0) {
            // The common case - most links span adjacent columns with nothing between them - so
            // this is checked before sampling the curve below, not just via `.some()` on an empty
            // array (which would short-circuit to the same result either way, but only after
            // paying for the sample).
            return;
        }

        // Sampled once and reused for every box below, and again for `naiveY` - it's the same
        // curve throughout, and sampling is the expensive part of this pass.
        const polyline = sampleBezierPath([anchorLeft, anchorRight], CURVE_SAMPLES_PER_SEGMENT);
        if (!obstructions.some((box) => polylineCrossesBox(polyline, box))) {
            return;
        }

        // Route around every overlapping node - not just the one(s) the curve happens to cross -
        // so the detour lane is guaranteed clear of all of their siblings too.
        const columnLeft = Math.min(...obstructions.map((box) => box.left));
        const columnRight = Math.max(...obstructions.map((box) => box.right));
        const detourX = NODE_GAP_X / 4;

        // The detour is only sound while both bend points land inside the link's own span and
        // outside every obstruction's X-range, which is what confines its outer segments to
        // obstruction-free horizontal bands (see the safety argument below). In the current
        // column layout that always holds for a real obstruction: columns are disjoint X-bands
        // separated by NODE_GAP_X, and this link's span runs from one column's right edge to
        // another's left edge, so an overlapping node's column is wholly inside the span with a
        // full NODE_GAP_X of slack at each end. Bailing out is still the right answer if that ever
        // stops being true - a bend point placed past its own endpoint would fold the link back on
        // itself, which reads far worse than the crossing it was trying to avoid.
        if (columnLeft - detourX <= anchorLeft.x || columnRight + detourX >= anchorRight.x) {
            return;
        }

        // Where the link currently runs as it passes the obstructing column - the lane closest to
        // this is the one that disturbs the link's shape least.
        const columnCenterX = (columnLeft + columnRight) / 2;
        const naiveY = polyline.reduce((closest, point) =>
            Math.abs(point.x - columnCenterX) < Math.abs(closest.x - columnCenterX) ? point : closest
        ).y;

        // Every Y band the lane must stay out of: each obstruction's box inflated by the clearance
        // margin, with overlapping bands merged. Merging - rather than assuming the boxes are
        // disjoint and more than 2x the margin apart - is what guarantees the chosen lane clears
        // *all* of them: two nodes sitting closer together than that (or overlapping outright, as
        // nodes in different columns caught by the span test may well do) collapse into a single
        // blocked band instead of leaving a phantom gap between them for the lane to land in.
        const blockedBands: Array<{ top: number; bottom: number }> = [];
        obstructions
            .map((box) => ({ top: box.top - LINK_DETOUR_MARGIN, bottom: box.bottom + LINK_DETOUR_MARGIN }))
            .sort((a, b) => a.top - b.top)
            .forEach((band) => {
                const previous = blockedBands[blockedBands.length - 1];
                if (previous && band.top <= previous.bottom) {
                    previous.bottom = Math.max(previous.bottom, band.bottom);
                } else {
                    blockedBands.push(band);
                }
            });

        // The free lanes between those bands. Merging leaves every interior lane with real room in
        // it, and the unbounded lanes at each end mean there is always at least one candidate.
        const lanes: Array<{ top: number; bottom: number }> = [];
        let cursor = -Infinity;
        blockedBands.forEach((band) => {
            lanes.push({ top: cursor, bottom: band.top });
            cursor = band.bottom;
        });
        lanes.push({ top: cursor, bottom: Infinity });

        // Pick whichever free lane requires the smallest detour from where the link runs now.
        let laneY = naiveY;
        let bestDistance = Infinity;
        lanes.forEach((lane) => {
            const candidateY = Math.min(Math.max(naiveY, lane.top), lane.bottom);
            const distance = Math.abs(candidateY - naiveY);
            if (distance < bestDistance) {
                bestDistance = distance;
                laneY = candidateY;
            }
        });

        // Why the resulting `source -> bend1 -> bend2 -> target` link is clear of every
        // obstruction, without needing to re-test the new curve:
        // - The middle segment is flat at laneY (its endpoints share that Y - see
        //   getBezierSegments), and laneY sits at least LINK_DETOUR_MARGIN clear of every
        //   obstruction's box by construction of the lanes above.
        // - The outer segments stay within their own endpoints' X spans, [anchorLeft.x, columnLeft
        //   - detourX] and [columnRight + detourX, anchorRight.x]. No obstruction reaches either
        //   band: columnLeft/columnRight are the extremes of the whole obstruction set, so every
        //   obstruction's box lies inside [columnLeft, columnRight]. And nothing outside that set
        //   can be crossed either, since the set already includes everything overlapping the
        //   link's span.
        //
        // That argument is about geometric position, but `link.point(x, y, index)` inserts by
        // array index - index 0 is always the link's own source point and the last index is
        // always its target point, whichever side of the layout each actually sits on. So the two
        // waypoints have to be assigned to array slots by which endpoint they sit next to, not by
        // left/right: when the source is the left anchor, slot 1 (next to the source) gets the
        // left waypoint and slot 2 (next to the target) gets the right one; when the layout is
        // ever reversed, that assignment flips too, so the array stays in the same left-to-right
        // order the curve is drawn in either way. Getting this wrong wouldn't just look worse -
        // it would silently invalidate the safety argument above, since an outer segment would
        // then run between a source/target point and a waypoint on the *wrong* side, spanning
        // back across the obstruction's own X-range instead of staying outside it.
        const leftWaypoint = { x: columnLeft - detourX, y: laneY };
        const rightWaypoint = { x: columnRight + detourX, y: laneY };
        const [sourceSideWaypoint, targetSideWaypoint] = sourceIsLeft
            ? [leftWaypoint, rightWaypoint]
            : [rightWaypoint, leftWaypoint];
        link.point(sourceSideWaypoint.x, sourceSideWaypoint.y, 1);
        link.point(targetSideWaypoint.x, targetSideWaypoint.y, 2);
    });
}

function getGraphQLGroupLabel(accessor?: string, name?: string): GroupKey | null {
    if (accessor === "get") return "Query";
    if (accessor === "subscribe") return "Subscription";
    if (!accessor && name) return "Mutation";
    return null;
}

/**
 * How many rows show above the "view all"/"show more" row for a collapsed, over-threshold
 * function list - both the plain-service case (`partitionRegularServiceFunctions`) and, per
 * group, the GraphQL case (`partitionGraphQLServiceFunctions`) slice their visible list to this
 * count. `calculateEntryNodeHeight` (sizing a plain node) and `getPortAnchorY`'s view-all-button
 * case (routing links to it) both need that same count too, so every one of these reads it from
 * here instead of separately hardcoding PREVIEW_COUNT - if this rule ever needs to vary (e.g. a
 * different preview count per node type), there's exactly one place to change it.
 */
function visibleRowCountWhenCollapsed(): number {
    return PREVIEW_COUNT;
}

function partitionRegularServiceFunctions(
    service: CDService,
    expandedNodes: Set<string>
): { visible: Array<CDFunction | CDResourceFunction>; hidden: Array<CDFunction | CDResourceFunction> } {
    const serviceFunctions: Array<CDFunction | CDResourceFunction> = [];
    if (service.remoteFunctions?.length) serviceFunctions.push(...service.remoteFunctions);
    if (service.resourceFunctions?.length) serviceFunctions.push(...service.resourceFunctions);

    const isExpanded = expandedNodes.has(service.uuid);
    if (serviceFunctions.length <= SHOW_ALL_THRESHOLD || isExpanded) {
        return { visible: serviceFunctions, hidden: [] };
    }
    const visibleCount = visibleRowCountWhenCollapsed();
    return { visible: serviceFunctions.slice(0, visibleCount), hidden: serviceFunctions.slice(visibleCount) };
}

function partitionGraphQLServiceFunctions(
    service: CDService,
    expandedNodes: Set<string>,
    groupOpen?: { Query: boolean; Subscription: boolean; Mutation: boolean; }
): { visible: GQLFuncListType; hidden: GQLFuncListType } {
    const serviceFunctions: Array<CDFunction | CDResourceFunction> = [];
    if (service.remoteFunctions?.length) serviceFunctions.push(...service.remoteFunctions);
    if (service.resourceFunctions?.length) serviceFunctions.push(...service.resourceFunctions);

    const grouped = serviceFunctions.reduce((acc, fn) => {
        const accessor = (fn as CDResourceFunction).accessor;
        const name = (fn as CDFunction).name;
        const group = getGraphQLGroupLabel(accessor, name);
        if (!group) return acc;
        (acc[group] ||= []).push(fn);
        return acc;
    }, {} as GQLFuncListType);

    const visible: GQLFuncListType = {
        Query: [],
        Subscription: [],
        Mutation: [],
    };
    const hidden: GQLFuncListType = {
        Query: [],
        Subscription: [],
        Mutation: [],
    };

    (Object.keys(grouped) as GroupKey[]).forEach((group) => {
        const items = grouped[group];
        const isOpen = groupOpen ? !!groupOpen[group] : true; // default open if not provided
        if (!isOpen) {
            hidden[group].push(...items);
            return;
        }
        const groupExpanded = expandedNodes.has(service.uuid + group);
        if (items.length <= SHOW_ALL_THRESHOLD || groupExpanded) {
            visible[group].push(...items);
        } else {
            const visibleCount = visibleRowCountWhenCollapsed();
            visible[group].push(...items.slice(0, visibleCount));
            hidden[group].push(...items.slice(visibleCount));
        }
    });

    return { visible, hidden };
}

function createFunctionConnections(
    funcs: Array<CDFunction | CDResourceFunction>,
    nodes: NodeModel[],
    node: EntryNodeModel,
    portGetter: (func: CDFunction | CDResourceFunction, group?: GroupKey) => any,
    links: NodeLinkModel[],
    group?: GroupKey
) {
    funcs.forEach((func) => {
        [...(func.connections ?? []), ...(func.workflows ?? [])].forEach((targetUuid) => {
            const targetNode = nodes.find((n) => n.getID() === targetUuid);
            if (targetNode) {
                const port = portGetter(func, group);
                if (port) {
                    const link = createPortNodeLink(node, port, targetNode);
                    if (link) {
                        links.push(link);
                    }
                }
            }
        });
        // link workflow:sendData calls to the specific data event of the workflow
        Object.entries(func.workflowSendData ?? {}).forEach(([workflowUuid, eventNames]) => {
            const workflowNode = nodes.find((n) => n.getID() === workflowUuid) as EntryNodeModel;
            if (!workflowNode) {
                return;
            }
            eventNames.forEach((eventName) => {
                const port = portGetter(func, group);
                if (!port) {
                    return;
                }
                const eventPort = workflowNode.getEventPortByName(eventName);
                if (eventPort) {
                    const link = createPortsLink(port, eventPort);
                    link.setSourceNode(node);
                    link.setTargetNode(workflowNode);
                    links.push(link);
                }
            });
        });
        // workflow:sendData calls whose data event cannot be matched are drawn as broken links
        func.invalidWorkflowSendData?.forEach((workflowUuid) => {
            const workflowNode = nodes.find((n) => n.getID() === workflowUuid);
            if (workflowNode) {
                const port = portGetter(func, group);
                if (port) {
                    const link = createPortNodeLink(node, port, workflowNode, { visible: true, broken: true });
                    if (link) {
                        links.push(link);
                    }
                }
            }
        });
    });
}

/**
 * Builds the full node/link graph for `project` - the same pipeline `Diagram.tsx` uses to feed
 * `drawDiagram`/`autoDistribute`, extracted as a pure, engine-independent function so it can be
 * driven directly by tests (see `checkNoLinkCrossesAnyNode` in `test/linkOverlapChecker.ts`)
 * without needing a React render. `Diagram.tsx` calls it with its own component state for
 * `expandedNodes`/`graphQLGroupOpen`.
 */
export function buildDiagramData(
    project: CDModel,
    expandedNodes: Set<string>,
    graphQLGroupOpen: Record<string, GQLState>
): { nodes: NodeModel[]; links: NodeLinkModel[] } {
    const nodes: NodeModel[] = [];
    const links: NodeLinkModel[] = [];

    // filtered autogenerated connections and connections with enableFlowModel as false
    const filteredConnections = project.connections?.filter((connection) =>
        !connection.symbol?.startsWith("_") && connection.enableFlowModel !== false
    );
    // Sort and create connections
    const sortedConnections = sortItems(filteredConnections || []) as CDConnection[];
    sortedConnections.forEach((connection, index) => {
        const node = new ConnectionNodeModel(connection);
        node.setPosition(0, 100 + index * 100);
        nodes.push(node);
    });

    let startY = 100;

    // Create workflow nodes first so service function rows can link to them.
    // Their edges are created after the services and the automation below.
    // Filter autogenerated workflows, mirroring the connection filtering above
    const filteredWorkflows = project.workflows?.filter(
        (workflow) => !workflow.symbol?.startsWith("_") && workflow.enableFlowModel !== false
    );
    const sortedWorkflows = sortItems(filteredWorkflows || []) as CDWorkflow[];
    let workflowStartY = 100;
    sortedWorkflows.forEach((workflow) => {
        const workflowNode = new EntryNodeModel(workflow, "workflow");
        const numRows = (workflow.events?.length ?? 0) + (workflow.humanTasks?.length ?? 0);
        const nodeHeight = calculateWorkflowNodeHeight(numRows);
        workflowNode.height = nodeHeight;
        workflowNode.setPosition(0, workflowStartY);
        nodes.push(workflowNode);
        workflowStartY += nodeHeight + 16;
    });

    // Sort services by sortText before creating nodes
    const sortedServices = sortItems(project.services || []) as CDService[];
    sortedServices.forEach((service) => {
        // Create entry node with calculated height
        const node = new EntryNodeModel(service, "service");

        const isGraphQL = service.type === "graphql:Service";
        if (isGraphQL) {
            const resolvedGroupOpen = graphQLGroupOpen[service.uuid] ?? DEFAULT_GQL_STATE;
            const { visible, hidden } = partitionGraphQLServiceFunctions(service, expandedNodes, resolvedGroupOpen);
            // Reusable function to create connections for a list of functions to a given port getter
            const nodeHeight = calculateGraphQLNodeHeight(visible, hidden, resolvedGroupOpen);

            node.height = nodeHeight;
            node.setPosition(0, startY);
            nodes.push(node);
            startY += nodeHeight + 16;

            // Stamp each visible row/group header's real Y offset onto its port so getPortAnchorY
            // can route links from it correctly instead of approximating with the node's center.
            const { functionOffsets, groupOffsets } = computeGraphQLPortOffsets(visible, hidden, resolvedGroupOpen);
            functionOffsets.forEach((offsetY, func) => {
                const port = node.getFunctionPort(func);
                if (port) {
                    port.rowOffsetY = offsetY;
                }
            });
            (Object.keys(groupOffsets) as GroupKey[]).forEach((group) => {
                const port = node.getGraphQLGroupPort(group);
                if (port) {
                    port.rowOffsetY = groupOffsets[group];
                }
            });

            // For GraphQL, handle visible and hidden per group
            (Object.keys(visible) as GroupKey[]).forEach((group) => {
                createFunctionConnections(
                    visible[group],
                    nodes,
                    node,
                    (func) => node.getFunctionPort(func),
                    links,
                    group
                );
            });

            (Object.keys(hidden) as GroupKey[]).forEach((group) => {
                createFunctionConnections(
                    hidden[group],
                    nodes,
                    node,
                    (_func, grp) => node.getGraphQLGroupPort(grp!),
                    links,
                    group
                );
            });

        } else {

            // Calculate height based on visible functions and expansion state
            const totalFunctions = service.remoteFunctions.length + service.resourceFunctions.length;
            const isExpanded = expandedNodes.has(service.uuid);
            const nodeHeight = calculateEntryNodeHeight(totalFunctions, isExpanded);
            node.height = nodeHeight;
            node.setPosition(0, startY);
            nodes.push(node);

            startY += nodeHeight + 16;

            const { hidden, visible } = partitionRegularServiceFunctions(service, expandedNodes);
            createFunctionConnections(
                visible,
                nodes,
                node,
                (func) => node.getFunctionPort(func),
                links
            );

            if (hidden.length > 0) {
                createFunctionConnections(
                    hidden,
                    nodes,
                    node,
                    () => node.getViewAllResourcesPort(),
                    links
                );
            }
        }
    });
    // create automation
    const automation = project.automation;
    if (automation) {
        const automationNode = new EntryNodeModel(automation, "automation");
        nodes.push(automationNode);
        // link connections
        automation.connections?.forEach((connectionUuid) => {
            const connectionNode = nodes.find((node) => node.getID() === connectionUuid);
            if (connectionNode) {
                const link = createNodesLink(automationNode, connectionNode);
                if (link) {
                    links.push(link);
                }
            }
        });
    }

    // create workflow edges
    sortedWorkflows.forEach((workflow) => {
        const workflowNode = nodes.find((node) => node.getID() === workflow.uuid) as EntryNodeModel;
        if (!workflowNode) {
            return;
        }

        // link the services that trigger this workflow via workflow:run. When a specific
        // function of the service runs the workflow, the link is already drawn from the
        // function row (createFunctionConnections); only fall back to a service-level edge
        const serviceFunctionLinksTo = (service: CDService, workflowUuid: string) =>
            [...(service.remoteFunctions ?? []), ...(service.resourceFunctions ?? [])].some((func) =>
                func.workflows?.includes(workflowUuid)
            );
        workflow.attachedServices?.forEach((serviceUuid) => {
            const service = project.services?.find((item) => item.uuid === serviceUuid);
            if (service && serviceFunctionLinksTo(service, workflow.uuid)) {
                return;
            }
            const triggerNode = nodes.find((node) => node.getID() === serviceUuid);
            if (triggerNode) {
                const link = createNodesLink(triggerNode, workflowNode);
                if (link) {
                    links.push(link);
                }
            }
        });

        // link the automation that triggers this workflow via workflow:run
        workflow.attachedFunctions?.forEach((triggerUuid) => {
            const triggerNode = nodes.find((node) => node.getID() === triggerUuid);
            if (triggerNode) {
                const link = createNodesLink(triggerNode, workflowNode);
                if (link) {
                    links.push(link);
                }
            }
        });

        // draw broken links for workflow:sendData calls whose data event cannot be matched.
        // Edges from a specific service function row are already drawn by createFunctionConnections
        const serviceFunctionInvalidSendsTo = (service: CDService, workflowUuid: string) =>
            [...(service.remoteFunctions ?? []), ...(service.resourceFunctions ?? [])].some((func) =>
                func.invalidWorkflowSendData?.includes(workflowUuid)
            );
        const invalidSenderUuids = [
            ...(workflow.invalidSendDataServices ?? []).filter((serviceUuid) => {
                const service = project.services?.find((item) => item.uuid === serviceUuid);
                return !(service && serviceFunctionInvalidSendsTo(service, workflow.uuid));
            }),
            ...(workflow.invalidSendDataFunctions ?? []),
        ];
        invalidSenderUuids.forEach((senderUuid) => {
            const senderNode = nodes.find((node) => node.getID() === senderUuid);
            if (senderNode) {
                const link = createNodesLink(senderNode, workflowNode, { visible: true, broken: true });
                if (link) {
                    links.push(link);
                }
            }
        });

        // link the entry points that send data to this workflow via workflow:sendData. Edges
        // from a specific service function row are already drawn by createFunctionConnections;
        // only fall back to a service-level edge when no function row carries the link
        const serviceFunctionSendsTo = (service: CDService, workflowUuid: string, eventName: string) =>
            [...(service.remoteFunctions ?? []), ...(service.resourceFunctions ?? [])].some((func) =>
                func.workflowSendData?.[workflowUuid]?.includes(eventName)
            );
        workflow.events?.forEach((event) => {
            const eventPort = workflowNode.getEventPort(event);
            if (!eventPort) {
                return;
            }
            const senderUuids = [
                ...(event.attachedServices ?? []).filter((serviceUuid) => {
                    const service = project.services?.find((item) => item.uuid === serviceUuid);
                    return !(service && serviceFunctionSendsTo(service, workflow.uuid, event.name));
                }),
                ...(event.attachedFunctions ?? []),
            ];
            senderUuids.forEach((senderUuid) => {
                const senderNode = nodes.find((node) => node.getID() === senderUuid);
                if (senderNode && senderNode.getOutPort()) {
                    const link = createPortsLink(senderNode.getOutPort(), eventPort);
                    link.setSourceNode(senderNode);
                    link.setTargetNode(workflowNode);
                    links.push(link);
                }
            });
        });

        // link this workflow to the connections used by its activities. Activities are not
        // rendered on the overview — only the derived workflow → connection edges are drawn.
        // Direct connections (e.g. a durable agent's model provider) are linked the same way.
        const linkedConnections = new Set<string>();
        workflow.connections?.forEach((connectionUuid) => {
            if (linkedConnections.has(connectionUuid)) {
                return;
            }
            linkedConnections.add(connectionUuid);
            const connectionNode = nodes.find((node) => node.getID() === connectionUuid);
            if (connectionNode) {
                const link = createNodesLink(workflowNode, connectionNode);
                if (link) {
                    links.push(link);
                }
            }
        });
        workflow.activities?.forEach((activityUuid) => {
            const activity = project.activities?.find((item) => item.uuid === activityUuid);
            activity?.connections?.forEach((connectionUuid) => {
                if (linkedConnections.has(connectionUuid)) {
                    return;
                }
                linkedConnections.add(connectionUuid);
                const connectionNode = nodes.find((node) => node.getID() === connectionUuid);
                if (connectionNode) {
                    const link = createNodesLink(workflowNode, connectionNode);
                    if (link) {
                        links.push(link);
                    }
                }
            });
        });
    });

    // create listeners
    project.listeners?.forEach((listener) => {
        const node = new ListenerNodeModel(listener);
        nodes.push(node);
        // link services
        listener.attachedServices.forEach((serviceUuid) => {
            const serviceNode = nodes.find((node) => node.getID() === serviceUuid);
            if (serviceNode) {
                const link = createNodesLink(node, serviceNode);
                if (link) {
                    links.push(link);
                }
            }
        });
    });

    return { nodes, links };
}

export function registerListeners(engine: DiagramEngine) {
    engine.getModel().registerListener({
        offsetUpdated: (event: any) => {
            saveDiagramZoomAndPosition(engine.getModel());
        },
    });
}

export function genDagreEngine() {
    return new DagreEngine({
        graph: {
            rankdir: "LR",
            nodesep: 120,
            ranksep: 400,
            marginx: 100,
            marginy: 100,
            // ranker: "longest-path",
        },
    });
}

export function sortItems<T extends { sortText?: string }>(items: T[]): T[] {
    return [...items].sort((a, b) => {
        if (!a.sortText && !b.sortText) return 0;
        if (!a.sortText) return 1;
        if (!b.sortText) return -1;

        // Split the sortText into filename and number parts
        const [aFile, aNum] = a.sortText.split(".bal");
        const [bFile, bNum] = b.sortText.split(".bal");

        // First compare filenames
        if (aFile !== bFile) {
            return aFile.localeCompare(bFile);
        }

        // If filenames are same, compare numbers
        const aNumber = parseInt(aNum || "0", 10);
        const bNumber = parseInt(bNum || "0", 10);
        return aNumber - bNumber;
    });
}

// create link between ports
export function createPortsLink(sourcePort: NodePortModel, targetPort: NodePortModel, options?: NodeLinkModelOptions) {
    const link = new NodeLinkModel(options);
    link.setSourcePort(sourcePort);
    link.setTargetPort(targetPort);
    sourcePort.addLink(link);
    return link;
}

// create link between nodes
export function createNodesLink(sourceNode: NodeModel, targetNode: NodeModel, options?: NodeLinkModelOptions) {
    const sourcePort = sourceNode.getOutPort();
    const targetPort = targetNode.getInPort();
    if (!sourcePort || !targetPort) {
        return null;
    }
    const link = createPortsLink(sourcePort, targetPort, options);
    link.setSourceNode(sourceNode);
    link.setTargetNode(targetNode);
    return link;
}

// create link between a specific port on `sourceNode` (e.g. one function's out-port) and `targetNode`'s in-port
export function createPortNodeLink(
    sourceNode: NodeModel,
    port: NodePortModel,
    targetNode: NodeModel,
    options?: NodeLinkModelOptions
) {
    const targetPort = targetNode.getInPort();
    if (!targetPort) {
        return null;
    }
    const link = createPortsLink(port, targetPort, options);
    link.setSourceNode(sourceNode);
    link.setTargetNode(targetNode);
    return link;
}

// save diagram zoom level and position to local storage
export const saveDiagramZoomAndPosition = (model: DiagramModel) => {
    const zoomLevel = model.getZoomLevel();
    const offsetX = model.getOffsetX();
    const offsetY = model.getOffsetY();

    // Store them in localStorage
    localStorage.setItem("diagram-zoom-level", JSON.stringify(zoomLevel));
    localStorage.setItem("diagram-offset-x", JSON.stringify(offsetX));
    localStorage.setItem("diagram-offset-y", JSON.stringify(offsetY));
};

// load diagram zoom level and position from local storage
export const loadDiagramZoomAndPosition = (engine: DiagramEngine) => {
    const zoomLevel = JSON.parse(localStorage.getItem("diagram-zoom-level") || "100");
    const offsetX = JSON.parse(localStorage.getItem("diagram-offset-x") || "0");
    const offsetY = JSON.parse(localStorage.getItem("diagram-offset-y") || "0");

    engine.getModel().setZoomLevel(zoomLevel);
    engine.getModel().setOffset(offsetX, offsetY);
};

// check local storage has zoom level and position
export const hasDiagramZoomAndPosition = (file: string) => {
    return localStorage.getItem("diagram-file-path") === file;
};

export const resetDiagramZoomAndPosition = (file?: string) => {
    if (file) {
        localStorage.setItem("diagram-file-path", file);
    }
    localStorage.setItem("diagram-zoom-level", "100");
    localStorage.setItem("diagram-offset-x", "0");
    localStorage.setItem("diagram-offset-y", "0");
};

export const centerDiagram = (engine: DiagramEngine) => {
    if (engine.getCanvas()?.getBoundingClientRect) {
        // zoom to fit nodes and center diagram
        engine.zoomToFitNodes({ margin: 40, maxZoom: 1 });
    }
};

export const getModelId = (nodeId: string) => {
    return nodeId.split("-").pop();
};

// calculate entry node height based on number of functions
export const calculateEntryNodeHeight = (numFunctions: number, isExpanded: boolean) => {
    // Every case is Box's own top+bottom inset, its header, then N rows - optionally followed by
    // one more "row" (the view-all button, plus the gap before it) when a button shows. Note this
    // is not `ENTRY_HEADER_HEIGHT + N*ENTRY_ROW_HEIGHT + ROW_PADDING`: that shape double-counts
    // Box's bottom inset once inside ENTRY_HEADER_HEIGHT's own gap-to-row-0 term and again here -
    // harmless while every row was assumed border-less, but not once ENTRY_ROW_HEIGHT accounts for
    // each row's own border too (see the comment above these constants).
    if (isExpanded) {
        return 2 * BOX_INSET + ENTRY_HEADER_CONTENT_HEIGHT + numFunctions * ENTRY_ROW_HEIGHT
            + ROW_PADDING + ENTRY_VIEW_ALL_BUTTON_HEIGHT;
    }

    // Matches GeneralWidget's own visibleFunctions/hasMoreFunctions split: at or under the
    // threshold every row shows with no button, same shape as the isExpanded case above.
    if (numFunctions <= SHOW_ALL_THRESHOLD) {
        return 2 * BOX_INSET + ENTRY_HEADER_CONTENT_HEIGHT + numFunctions * ENTRY_ROW_HEIGHT;
    }

    return 2 * BOX_INSET + ENTRY_HEADER_CONTENT_HEIGHT + visibleRowCountWhenCollapsed() * ENTRY_ROW_HEIGHT
        + ROW_PADDING + ENTRY_VIEW_ALL_BUTTON_HEIGHT;
};

/**
 * Sizing for the GraphQL body layout (see `GraphQLServiceWidget`/`GroupContainer` in
 * `GraphQLServiceWidget.tsx`): a service-header block, then per group a header row, optionally
 * followed by function rows and/or a "show more/fewer" row. The function/show-more rows are the
 * exact same `FunctionBoxWrapper`/`StyledServiceBox`/`ViewAllButton` components `GeneralWidget`
 * uses (GraphQLServiceWidget imports them directly), so their height is `ENTRY_ROW_HEIGHT`/
 * `ENTRY_VIEW_ALL_BUTTON_HEIGHT`, not a separate GraphQL-specific number - only the group header
 * row (45px tall, wider padding) has no entry-node equivalent and gets its own constant.
 * `calculateGraphQLNodeHeight` (which sizes the node) and `computeGraphQLPortOffsets` (which
 * locates each row's port for link routing) both derive from these same numbers so the two can't
 * drift out of sync.
 */
const GQL_BASE_HEIGHT = 64 + 2 * ROW_PADDING;
const GQL_HEADER_HEIGHT = 45 + 2 * ROW_PADDING;

/**
 * Group render order, top to bottom - must match `GraphQLServiceWidget`'s own `orderedGroups`,
 * since `computeGraphQLPortOffsets` walks groups in this order to accumulate each one's Y offset.
 */
const GQL_GROUP_ORDER: GroupKey[] = ["Query", "Mutation", "Subscription"];

export const calculateGraphQLNodeHeight = (
    visible: GQLFuncListType,
    hidden: GQLFuncListType,
    graphQLGroupOpen: GQLState
) => {
    let totalHeight = GQL_BASE_HEIGHT;

    Object.keys(visible).forEach((group) => {
        const visibleCount = visible[group].length;
        const hiddenCount = hidden[group].length;
        // Matches GraphQLServiceWidget's own canToggleItems (functions.length > SHOW_ALL_THRESHOLD,
        // over the group's full item count) - not visibleCount > PREVIEW_COUNT, which disagrees
        // with the widget for a group with exactly SHOW_ALL_THRESHOLD items (all shown as visible,
        // none hidden, so PREVIEW_COUNT < visibleCount <= SHOW_ALL_THRESHOLD can happen without a
        // button actually rendering).
        const hasShowML = visibleCount + hiddenCount > SHOW_ALL_THRESHOLD;
        const isCollapsed = !graphQLGroupOpen[group];
        const hasSection = visibleCount > 0 || hiddenCount > 0;
        const hasFunction = visibleCount > 0;

        let sectionHeight = 0;

        if (hasSection) {
            if (isCollapsed) {
                sectionHeight = GQL_HEADER_HEIGHT;
            } else {
                if (hasFunction) {
                    sectionHeight += GQL_HEADER_HEIGHT;
                    sectionHeight += visibleCount * ENTRY_ROW_HEIGHT;
                }
                if (hasShowML) {
                    sectionHeight += ENTRY_VIEW_ALL_BUTTON_HEIGHT;
                }
            }
        }

        totalHeight += sectionHeight;
    });

    return totalHeight;
};

/**
 * Computes the Y offset (from the node's top) of each visible GraphQL function row and each
 * group's header/"show more" row - whichever row a link attached to that group's header port
 * would actually leave from. Walks the same groups, in the same order and with the same
 * collapsed/expanded rules `GraphQLServiceWidget` renders them with, so a row's offset here always
 * matches where it actually draws.
 */
function computeGraphQLPortOffsets(
    visible: GQLFuncListType,
    hidden: GQLFuncListType,
    graphQLGroupOpen: GQLState
): { functionOffsets: Map<CDFunction | CDResourceFunction, number>; groupOffsets: Partial<Record<GroupKey, number>> } {
    const functionOffsets = new Map<CDFunction | CDResourceFunction, number>();
    const groupOffsets: Partial<Record<GroupKey, number>> = {};

    let offset = GQL_BASE_HEIGHT;
    GQL_GROUP_ORDER.forEach((group) => {
        const visibleItems = visible[group] ?? [];
        const hiddenItems = hidden[group] ?? [];
        if (visibleItems.length === 0 && hiddenItems.length === 0) {
            return;
        }

        if (!graphQLGroupOpen[group]) {
            groupOffsets[group] = offset + GQL_HEADER_HEIGHT / 2;
            offset += GQL_HEADER_HEIGHT;
            return;
        }

        if (visibleItems.length > 0) {
            offset += GQL_HEADER_HEIGHT;
            visibleItems.forEach((func, index) => {
                functionOffsets.set(func, offset + index * ENTRY_ROW_HEIGHT + ENTRY_ROW_CONTENT_HEIGHT / 2);
            });
            offset += visibleItems.length * ENTRY_ROW_HEIGHT;
        }

        // See the matching comment on hasShowML in calculateGraphQLNodeHeight above.
        if (visibleItems.length + hiddenItems.length > SHOW_ALL_THRESHOLD) {
            groupOffsets[group] = offset + ENTRY_VIEW_ALL_BUTTON_HEIGHT / 2;
            offset += ENTRY_VIEW_ALL_BUTTON_HEIGHT;
        }
    });

    return { functionOffsets, groupOffsets };
}

export const getEntryNodeFunctionPortName = (func: CDFunction | CDResourceFunction) => {
    if ((func as CDResourceFunction).accessor) {
        return (func as CDResourceFunction).accessor + "-" + (func as CDResourceFunction).path;
    }
    return (func as CDFunction).name;
};

export const getWorkflowEventPortNameByEventName = (eventName: string) => {
    return "event-" + eventName;
};

export const getWorkflowEventPortName = (event: CDWorkflowEvent) => {
    return getWorkflowEventPortNameByEventName(event.name);
};

// calculate workflow node height based on the number of event and human task rows
export const calculateWorkflowNodeHeight = (numRows: number) => {
    // Same shape as calculateEntryNodeHeight's no-button case (workflows never show a view-all
    // button) - naturally correct at numRows=0 too, with no special case needed.
    return 2 * BOX_INSET + ENTRY_HEADER_CONTENT_HEIGHT + numRows * ENTRY_ROW_HEIGHT;
};
