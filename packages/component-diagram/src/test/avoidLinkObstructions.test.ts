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

import { DiagramModel } from "@projectstorm/react-diagrams";
import { CDAutomation, CDConnection, CDFunction, CDListener, CDLocation, CDModel, CDResourceFunction, CDService, CDWorkflow } from "@wso2/ballerina-core";
import {
    autoDistribute,
    avoidLinkObstructions,
    buildDiagramData,
    calculateEntryNodeHeight,
    calculateWorkflowNodeHeight,
    createNodesLink,
    createPortNodeLink,
    createPortsLink,
    generateEngine,
    getLinkAnchors,
    getNodeBoundingBox,
    getPortAnchorY,
    LINK_DETOUR_MARGIN,
} from "../utils/diagram";
import { EntryNodeModel } from "../components/nodes/EntryNode";
import { ConnectionNodeModel } from "../components/nodes/ConnectionNode";
import { ListenerNodeModel } from "../components/nodes/ListenerNode";
import { NodeLinkModel } from "../components/NodeLink";
import { CON_NODE_HEIGHT, ENTRY_NODE_WIDTH, LISTENER_NODE_HEIGHT, NODE_GAP_X, NODE_GAP_Y } from "../resources/constants";
import { GQLState } from "../components/Diagram";

// Reproduces PR #689's 4-column layout (listener | entry | workflow | connection): the entry
// and workflow columns are adjacent, so a fixed gap of NODE_GAP_X puts the connection column far
// enough right that a node can genuinely sit "in between" an entry node and a connection node.
const ENTRY_X = 0;
const WORKFLOW_X = ENTRY_X + ENTRY_NODE_WIDTH + NODE_GAP_X;
const CONNECTION_X = WORKFLOW_X + ENTRY_NODE_WIDTH + NODE_GAP_X;

const emptyLocation: CDLocation = {
    filePath: "",
    startLine: { line: 0, offset: 0 },
    endLine: { line: 0, offset: 0 },
};

function makeAutomation(uuid: string): CDAutomation {
    return { name: "automation", displayName: "Automation", location: emptyLocation, connections: [], uuid };
}

function makeConnection(uuid: string): CDConnection {
    return { symbol: "conn", location: emptyLocation, scope: "GLOBAL", uuid, enableFlowModel: true, sortText: "" };
}

function makeListener(uuid: string, attachedServices: string[]): CDListener {
    return {
        symbol: "l",
        location: emptyLocation,
        attachedServices,
        kind: "",
        type: "http:Listener",
        args: [],
        uuid,
        icon: "",
        enableFlowModel: true,
        sortText: "",
    };
}

function makeWorkflow(uuid: string): CDWorkflow {
    return {
        symbol: "workflow",
        location: emptyLocation,
        attachedServices: [],
        attachedFunctions: [],
        events: [],
        humanTasks: [],
        uuid,
        enableFlowModel: true,
        sortText: "",
    };
}

function makeResourceFunction(accessor: string, path: string): CDResourceFunction {
    return { accessor, path, location: emptyLocation, connections: [] };
}

function makeService(uuid: string, resourceFunctions: CDResourceFunction[], type = "http:Service"): CDService {
    return {
        location: emptyLocation,
        attachedListeners: [],
        connections: [],
        functions: [],
        remoteFunctions: [],
        resourceFunctions,
        absolutePath: "",
        type,
        icon: "",
        uuid,
        enableFlowModel: true,
        sortText: "",
    };
}

function makeRemoteFunction(name: string): CDFunction {
    return { name, location: emptyLocation, connections: [] };
}

/** A `graphql:Service` fixture, grouped by accessor exactly as `getGraphQLGroupLabel` does. */
function makeGraphQLService(
    uuid: string,
    groups: { queries?: CDResourceFunction[]; mutations?: CDFunction[]; subscriptions?: CDResourceFunction[] }
): CDService {
    return {
        location: emptyLocation,
        attachedListeners: [],
        connections: [],
        functions: [],
        remoteFunctions: groups.mutations ?? [],
        resourceFunctions: [...(groups.queries ?? []), ...(groups.subscriptions ?? [])],
        absolutePath: "",
        type: "graphql:Service",
        icon: "",
        uuid,
        enableFlowModel: true,
        sortText: "",
    };
}

function makeProject(service: CDService): CDModel {
    return { connections: [], listeners: [], services: [service], workflows: [] };
}

/** Builds a GraphQL node the same way `Diagram.tsx` does, at first-open state (see
 * `DEFAULT_GQL_STATE`: Query open, Mutation/Subscription collapsed) unless overridden. */
function buildGraphQLNode(service: CDService, graphQLGroupOpen: Record<string, GQLState> = {}): EntryNodeModel {
    const { nodes } = buildDiagramData(makeProject(service), new Set<string>(), graphQLGroupOpen);
    return nodes[0] as EntryNodeModel;
}

/** Builds a link between two nodes on a fresh engine/model and runs the pass under test. */
function runObstructionPass(nodes: Array<EntryNodeModel | ConnectionNodeModel>, link: NodeLinkModel) {
    const engine = generateEngine();
    const model = new DiagramModel();
    model.addAll(...nodes, link);
    engine.setModel(model);
    avoidLinkObstructions(engine);
    return link;
}

describe("avoidLinkObstructions", () => {
    test("routes a link around a workflow node sitting between its source and target columns", () => {
        const automationNode = new EntryNodeModel(makeAutomation("automation-1"), "automation");
        automationNode.setPosition(ENTRY_X, 0); // box: [0, 64]

        const workflowNode = new EntryNodeModel(makeWorkflow("workflow-1"), "workflow");
        workflowNode.height = calculateWorkflowNodeHeight(0);
        workflowNode.setPosition(WORKFLOW_X, 100); // box: [100, 172]

        const connectionNode = new ConnectionNodeModel(makeConnection("connection-1"));
        connectionNode.setPosition(CONNECTION_X, 200); // box: [200, 264]

        const link = createNodesLink(automationNode, connectionNode) as NodeLinkModel;
        expect(link.getPoints()).toHaveLength(2);

        runObstructionPass([automationNode, workflowNode, connectionNode], link);

        const points = link.getPoints();
        expect(points).toHaveLength(4);

        const [, bendA, bendB] = points;
        const laneY = bendA.getPosition().y;

        // Both bend points form one horizontal lane across the workflow column.
        expect(bendB.getPosition().y).toBeCloseTo(laneY);
        expect(bendA.getPosition().x).toBeLessThan(WORKFLOW_X);
        expect(bendB.getPosition().x).toBeGreaterThan(WORKFLOW_X + ENTRY_NODE_WIDTH);

        // The chosen lane must clear the workflow node's box (with margin), not cut through it.
        const workflowTop = 100;
        const workflowBottom = 172;
        const clearsAbove = laneY <= workflowTop - LINK_DETOUR_MARGIN;
        const clearsBelow = laneY >= workflowBottom + LINK_DETOUR_MARGIN;
        expect(clearsAbove || clearsBelow).toBe(true);
    });

    test("leaves a direct link untouched when nothing sits between its columns", () => {
        const automationNode = new EntryNodeModel(makeAutomation("automation-1"), "automation");
        automationNode.setPosition(ENTRY_X, 0);

        const connectionNode = new ConnectionNodeModel(makeConnection("connection-1"));
        connectionNode.setPosition(WORKFLOW_X, 0); // adjacent column, nothing in between

        const link = createNodesLink(automationNode, connectionNode) as NodeLinkModel;

        runObstructionPass([automationNode, connectionNode], link);

        expect(link.getPoints()).toHaveLength(2);
    });

    test("leaves a link untouched when an intermediate-column node doesn't lie on its path", () => {
        const automationNode = new EntryNodeModel(makeAutomation("automation-1"), "automation");
        automationNode.setPosition(ENTRY_X, 0); // box: [0, 64]

        const connectionNode = new ConnectionNodeModel(makeConnection("connection-1"));
        connectionNode.setPosition(CONNECTION_X, 0); // box: [0, 64] - same band as automation

        // Workflow sits far below the straight line between automation and the connection.
        const workflowNode = new EntryNodeModel(makeWorkflow("workflow-1"), "workflow");
        workflowNode.height = calculateWorkflowNodeHeight(0);
        workflowNode.setPosition(WORKFLOW_X, 1000);

        const link = createNodesLink(automationNode, connectionNode) as NodeLinkModel;

        runObstructionPass([automationNode, workflowNode, connectionNode], link);

        expect(link.getPoints()).toHaveLength(2);
    });

    test("clears every node in the column when multiple workflow nodes stack in the way", () => {
        const automationNode = new EntryNodeModel(makeAutomation("automation-1"), "automation");
        automationNode.setPosition(ENTRY_X, 0); // box: [0, 64]

        const workflowNodeA = new EntryNodeModel(makeWorkflow("workflow-1"), "workflow");
        workflowNodeA.height = calculateWorkflowNodeHeight(0);
        workflowNodeA.setPosition(WORKFLOW_X, 80); // box: [80, 152]

        const workflowNodeB = new EntryNodeModel(makeWorkflow("workflow-2"), "workflow");
        workflowNodeB.height = calculateWorkflowNodeHeight(0);
        workflowNodeB.setPosition(WORKFLOW_X, 168); // box: [168, 240], directly below A with only margin-sized gap

        const connectionNode = new ConnectionNodeModel(makeConnection("connection-1"));
        connectionNode.setPosition(CONNECTION_X, 300); // box: [300, 364]

        const link = createNodesLink(automationNode, connectionNode) as NodeLinkModel;

        runObstructionPass([automationNode, workflowNodeA, workflowNodeB, connectionNode], link);

        const points = link.getPoints();
        expect(points).toHaveLength(4);
        const laneY = points[1].getPosition().y;

        const clearsA = laneY <= 80 - LINK_DETOUR_MARGIN || laneY >= 152 + LINK_DETOUR_MARGIN;
        const clearsB = laneY <= 168 - LINK_DETOUR_MARGIN || laneY >= 240 + LINK_DETOUR_MARGIN;
        expect(clearsA).toBe(true);
        expect(clearsB).toBe(true);
    });

    test("clears both obstructions even when their boxes overlap vertically", () => {
        // Two obstructing nodes whose Y bands overlap - a tall one and a short one inside it.
        // Reading the free gaps straight off the boxes in top order leaves a phantom gap below the
        // *short* node (y >= 238) that is still deep inside the tall one, and that phantom gap is
        // the closest candidate to where this link runs, so it would be chosen. Blocked bands have
        // to be merged before the gaps between them mean anything.
        const automationNode = new EntryNodeModel(makeAutomation("automation-1"), "automation");
        automationNode.setPosition(ENTRY_X, 0); // box: [0, 64]

        const tallNode = new EntryNodeModel(makeWorkflow("workflow-1"), "workflow");
        tallNode.height = 200;
        tallNode.setPosition(WORKFLOW_X, 100); // box: [100, 300]

        const shortNode = new EntryNodeModel(makeWorkflow("workflow-2"), "workflow");
        shortNode.height = calculateWorkflowNodeHeight(0);
        shortNode.setPosition(WORKFLOW_X, 150); // box: [150, 222] - wholly inside the tall one

        const connectionNode = new ConnectionNodeModel(makeConnection("connection-1"));
        connectionNode.setPosition(CONNECTION_X, 300); // box: [300, 364]

        const link = createNodesLink(automationNode, connectionNode) as NodeLinkModel;

        runObstructionPass([automationNode, tallNode, shortNode, connectionNode], link);

        const points = link.getPoints();
        expect(points).toHaveLength(4);
        const laneY = points[1].getPosition().y;

        const clearsTall = laneY <= 100 - LINK_DETOUR_MARGIN || laneY >= 300 + LINK_DETOUR_MARGIN;
        const clearsShort = laneY <= 150 - LINK_DETOUR_MARGIN || laneY >= 222 + LINK_DETOUR_MARGIN;
        expect(clearsTall).toBe(true);
        expect(clearsShort).toBe(true);
    });
});

describe("autoDistribute positioning listeners", () => {
    test("centers a listener with one attached service on that service's real in-port Y, not its box top", () => {
        // A service much taller than the listener's own fixed height - averaging box tops (the
        // bug this regresses) would leave the listener well above the service's actual center,
        // rendering as a needlessly bent link even though nothing sits in the way.
        const service = new EntryNodeModel(makeService("service-1", [makeResourceFunction("get", "f")]), "service");
        service.height = 216;
        service.setPosition(ENTRY_X, 500); // box [500, 716], center 608

        const listener = new ListenerNodeModel(makeListener("listener-1", ["service-1"]));
        const link = createNodesLink(listener, service) as NodeLinkModel;

        const engine = generateEngine();
        const model = new DiagramModel();
        model.addAll(service, listener, link);
        engine.setModel(model);

        autoDistribute(engine);

        const listenerCenterY = listener.getY() + LISTENER_NODE_HEIGHT / 2;
        expect(listenerCenterY).toBeCloseTo(service.getY() + service.height / 2);

        // The link itself must render as a straight horizontal line - no vertical offset at all.
        const anchors = getLinkAnchors(link);
        expect(anchors.source.y).toBeCloseTo(anchors.target.y);
    });
});

describe("autoDistribute positioning workflows and connections", () => {
    test("centers a connection node on its single sender's real anchor Y", () => {
        const service = new EntryNodeModel(makeService("service-1", [makeResourceFunction("get", "f")]), "service");
        service.height = 219;
        service.setPosition(ENTRY_X, 300); // box [300, 519], center 409.5

        const connection = new ConnectionNodeModel(makeConnection("connection-1"));
        const link = createNodesLink(service, connection) as NodeLinkModel;

        const engine = generateEngine();
        const model = new DiagramModel();
        model.addAll(service, connection, link);
        engine.setModel(model);

        autoDistribute(engine);

        const connectionCenterY = connection.getY() + CON_NODE_HEIGHT / 2;
        expect(connectionCenterY).toBeCloseTo(service.getY() + service.height / 2);

        const anchors = getLinkAnchors(link);
        expect(anchors.source.y).toBeCloseTo(anchors.target.y);
    });

    test("centers a connection reached by two senders on their combined average, not either one alone", () => {
        const automationNode = new EntryNodeModel(makeAutomation("automation-1"), "automation");
        automationNode.setPosition(ENTRY_X, 0); // generic out port anchors at its own center

        const service = new EntryNodeModel(makeService("service-1", [makeResourceFunction("get", "f")]), "service");
        service.height = 219;
        service.setPosition(ENTRY_X, 300); // box [300, 519], center 409.5

        const connection = new ConnectionNodeModel(makeConnection("connection-1"));
        const linkA = createNodesLink(automationNode, connection) as NodeLinkModel;
        const linkB = createNodesLink(service, connection) as NodeLinkModel;

        const engine = generateEngine();
        const model = new DiagramModel();
        model.addAll(automationNode, service, connection, linkA, linkB);
        engine.setModel(model);

        autoDistribute(engine);

        const automationCenter = getPortAnchorY(automationNode, automationNode.getOutPort());
        const serviceCenter = getPortAnchorY(service, service.getOutPort());
        const connectionCenterY = connection.getY() + CON_NODE_HEIGHT / 2;
        expect(connectionCenterY).toBeCloseTo((automationCenter + serviceCenter) / 2);
        expect(connectionCenterY).not.toBeCloseTo(automationCenter);
        expect(connectionCenterY).not.toBeCloseTo(serviceCenter);
    });

    test("positions a workflow at the exact row Y of the specific function that triggers it, not the service's center", () => {
        // Two functions - only the second (row 1) actually calls workflow:run. Averaging the
        // service's box top/center (the bug this regresses) would miss this row entirely for a
        // service where the triggering row sits well off-center.
        const funcA = makeResourceFunction("get", "a");
        const funcB = makeResourceFunction("post", "b");
        const service = new EntryNodeModel(makeService("service-1", [funcA, funcB]), "service");
        service.height = calculateEntryNodeHeight(2, false);
        service.setPosition(ENTRY_X, 0);

        const workflow = new EntryNodeModel(makeWorkflow("workflow-1"), "workflow");
        const funcBPort = service.getFunctionPort(funcB);
        const link = createPortNodeLink(service, funcBPort, workflow) as NodeLinkModel;

        const engine = generateEngine();
        const model = new DiagramModel();
        model.addAll(service, workflow, link);
        engine.setModel(model);

        autoDistribute(engine);

        const rowBAnchorY = getPortAnchorY(service, funcBPort);
        // The workflow's own link anchor is its play button, not its box center (see
        // getPortAnchorY's workflow "in" port case) - that's the point this positioning aligns.
        const workflowInAnchorY = getPortAnchorY(workflow, workflow.getInPort());
        expect(workflowInAnchorY).toBeCloseTo(rowBAnchorY);

        const serviceCenterY = service.getY() + service.height / 2;
        expect(workflowInAnchorY).not.toBeCloseTo(serviceCenterY);
    });

    test("keeps two connections whose desired centers would otherwise collide apart, in creation order", () => {
        const senderA = new EntryNodeModel(makeAutomation("automation-a"), "automation");
        senderA.setPosition(ENTRY_X, 100);

        const senderB = new EntryNodeModel(makeService("service-b", [makeResourceFunction("get", "f")]), "service");
        senderB.setPosition(ENTRY_X, 100); // identical center to senderA - both connections want the same Y

        const connectionA = new ConnectionNodeModel(makeConnection("connection-a"));
        const connectionB = new ConnectionNodeModel(makeConnection("connection-b"));
        const linkA = createNodesLink(senderA, connectionA) as NodeLinkModel;
        const linkB = createNodesLink(senderB, connectionB) as NodeLinkModel;

        const engine = generateEngine();
        const model = new DiagramModel();
        model.addAll(senderA, senderB, connectionA, connectionB, linkA, linkB);
        engine.setModel(model);

        autoDistribute(engine);

        expect(Math.abs(connectionA.getY() - connectionB.getY())).toBeGreaterThanOrEqual(
            CON_NODE_HEIGHT + NODE_GAP_Y / 2
        );
    });

    test("packs three merged, unequal-height services without overlap - regression for a merge test that assumed a symmetric block", () => {
        // Heights 67/595/67 (a header-only service and an 11-row one, gap = NODE_GAP_Y/2 = 50 - the
        // real production values) with these exact desired centers (found by sweeping for the worst
        // case) force all three into one merged block whose real top/bottom extents are NOT
        // totalHeight/2 from its center, because the block's members merge in one at a time (67,
        // then 595, then 67) rather than all at once - so at the moment the third node's admission
        // is decided, the running block is still the asymmetric [67, 595] pair, not the eventually-
        // symmetric full trio. A merge test that assumed symmetry here admitted the third node too
        // close, producing over 100px of real overlap despite resolveMinGapPositions's own final
        // packing step already using the correct (asymmetric) extents.
        //
        // Each service links to its own dedicated connection and nothing else, so
        // refineNodesByAllLinks's desired center for it is exactly that connection's anchor - which
        // round 1 sets from this same service's own (still unmoved) center - making each service's
        // desired center in round 2 exactly its own starting center, a stable target to collide
        // against rather than one round 2 would otherwise still be free to move on its own.
        const serviceA = new EntryNodeModel(makeService("service-a", [makeResourceFunction("get", "f")]), "service");
        serviceA.height = 67;
        serviceA.setPosition(ENTRY_X, 271 - 67 / 2); // center 271

        const serviceB = new EntryNodeModel(makeService("service-b", [makeResourceFunction("get", "f")]), "service");
        serviceB.height = 595;
        serviceB.setPosition(ENTRY_X, 650 - 595 / 2); // center 650

        const serviceC = new EntryNodeModel(makeService("service-c", [makeResourceFunction("get", "f")]), "service");
        serviceC.height = 67;
        serviceC.setPosition(ENTRY_X, 900 - 67 / 2); // center 900

        const connectionA = new ConnectionNodeModel(makeConnection("connection-a"));
        const connectionB = new ConnectionNodeModel(makeConnection("connection-b"));
        const connectionC = new ConnectionNodeModel(makeConnection("connection-c"));
        const linkA = createNodesLink(serviceA, connectionA) as NodeLinkModel;
        const linkB = createNodesLink(serviceB, connectionB) as NodeLinkModel;
        const linkC = createNodesLink(serviceC, connectionC) as NodeLinkModel;

        const engine = generateEngine();
        const model = new DiagramModel();
        model.addAll(serviceA, serviceB, serviceC, connectionA, connectionB, connectionC, linkA, linkB, linkC);
        engine.setModel(model);

        autoDistribute(engine);

        const boxes = [serviceA, serviceB, serviceC]
            .map((n) => ({ top: n.getY(), bottom: n.getY() + n.height }))
            .sort((a, b) => a.top - b.top);
        for (let i = 0; i < boxes.length - 1; i++) {
            expect(boxes[i + 1].top - boxes[i].bottom).toBeGreaterThanOrEqual(NODE_GAP_Y / 2 - 1e-6);
        }
    });
});

describe("autoDistribute refining entry/workflow nodes toward both neighbors", () => {
    test("settles two far-apart services toward their shared workflow, instead of leaving them frozen at their listener's Y", () => {
        // Two services, each with their own listener, both feeding the SAME workflow - far enough
        // apart (0 vs 800) that centering the workflow between them (round 1) doesn't help their
        // own listeners' links, which stay bent unless the services themselves are free to move
        // toward the workflow too. Every node here uses a plain generic port (no row offset), so
        // the exact settle point can be hand-computed and pinned precisely.
        const listenerA = new ListenerNodeModel(makeListener("listener-a", ["service-a"]));
        const listenerB = new ListenerNodeModel(makeListener("listener-b", ["service-b"]));

        const serviceA = new EntryNodeModel(makeService("service-a", [makeResourceFunction("get", "f")]), "service");
        serviceA.height = 64;
        serviceA.setPosition(ENTRY_X, 0); // center 32

        const serviceB = new EntryNodeModel(makeService("service-b", [makeResourceFunction("get", "f")]), "service");
        serviceB.height = 64;
        serviceB.setPosition(ENTRY_X, 800); // center 832

        const workflow = new EntryNodeModel(makeWorkflow("workflow-1"), "workflow");
        workflow.height = 64;

        const linkListenerA = createNodesLink(listenerA, serviceA) as NodeLinkModel;
        const linkListenerB = createNodesLink(listenerB, serviceB) as NodeLinkModel;
        const linkAWorkflow = createNodesLink(serviceA, workflow) as NodeLinkModel;
        const linkBWorkflow = createNodesLink(serviceB, workflow) as NodeLinkModel;

        const engine = generateEngine();
        const model = new DiagramModel();
        model.addAll(
            listenerA, listenerB, serviceA, serviceB, workflow,
            linkListenerA, linkListenerB, linkAWorkflow, linkBWorkflow
        );
        engine.setModel(model);

        autoDistribute(engine);

        // Round 1 would put the workflow's real link anchor - its play button, 7px below its own
        // box center at this height (see getPortAnchorY's workflow "in" port case) - at the
        // (32+832)/2=432 midpoint, box center 425, and leave both services frozen at 32/832. Round
        // 2 lets each service settle halfway between its own listener (still matching its original
        // position at that point) and the workflow's anchor: serviceA -> (32+432)/2=232, serviceB ->
        // (832+432)/2=632 - and the workflow, re-averaging those two new centers, stays exactly at
        // anchor 432 / box center 425 by symmetry.
        expect(serviceA.getY() + serviceA.height / 2).toBeCloseTo(232);
        expect(serviceB.getY() + serviceB.height / 2).toBeCloseTo(632);
        expect(getPortAnchorY(workflow, workflow.getInPort())).toBeCloseTo(432);
        expect(workflow.getY() + workflow.height / 2).toBeCloseTo(425);

        // Each listener re-syncs to its service's FINAL (moved) center, not its original one.
        expect(listenerA.getY() + LISTENER_NODE_HEIGHT / 2).toBeCloseTo(232);
        expect(listenerB.getY() + LISTENER_NODE_HEIGHT / 2).toBeCloseTo(632);
    });

    test("leaves a plain 1:1:1 chain exactly as round 1 already settled it - nothing left to refine", () => {
        const listener = new ListenerNodeModel(makeListener("listener-1", ["service-1"]));
        const service = new EntryNodeModel(makeService("service-1", [makeResourceFunction("get", "f")]), "service");
        service.height = 219;
        service.setPosition(ENTRY_X, 500);

        const connection = new ConnectionNodeModel(makeConnection("connection-1"));
        const linkListener = createNodesLink(listener, service) as NodeLinkModel;
        const linkConnection = createNodesLink(service, connection) as NodeLinkModel;

        const engine = generateEngine();
        const model = new DiagramModel();
        model.addAll(listener, service, connection, linkListener, linkConnection);
        engine.setModel(model);

        autoDistribute(engine);

        // The service itself never had anywhere better to go - both its neighbors already agree
        // with its own original center by construction - so round 2 must leave it exactly there.
        expect(service.getY()).toBe(500);
        const listenerAnchors = getLinkAnchors(linkListener);
        const connectionAnchors = getLinkAnchors(linkConnection);
        expect(listenerAnchors.source.y).toBeCloseTo(listenerAnchors.target.y);
        expect(connectionAnchors.source.y).toBeCloseTo(connectionAnchors.target.y);
    });

    test("spreads two connections fed solely by the same sender SYMMETRICALLY around it, not one straight and one shoved aside", () => {
        // Regression for a real escalation: an automation linking to two connections it's the
        // ONLY sender for. Both connections start out wanting the exact same center (automation's
        // own), so a naive "sort then stack downward" pass would leave the first one exactly on
        // automation (a dead-straight line) and shove the second one a full gap further away (a
        // much more bent one) - purely because of which happened to sort first, not because either
        // link is any more "important". They should land equally spaced on either side instead.
        const automationNode = new EntryNodeModel(makeAutomation("automation-1"), "automation");
        automationNode.height = 64;
        automationNode.setPosition(ENTRY_X, 0); // center 32

        const connectionA = new ConnectionNodeModel(makeConnection("connection-a"));
        const connectionB = new ConnectionNodeModel(makeConnection("connection-b"));
        const linkA = createNodesLink(automationNode, connectionA) as NodeLinkModel;
        const linkB = createNodesLink(automationNode, connectionB) as NodeLinkModel;

        const engine = generateEngine();
        const model = new DiagramModel();
        model.addAll(automationNode, connectionA, connectionB, linkA, linkB);
        engine.setModel(model);

        autoDistribute(engine);

        const centerA = connectionA.getY() + CON_NODE_HEIGHT / 2;
        const centerB = connectionB.getY() + CON_NODE_HEIGHT / 2;
        const automationCenter = automationNode.getY() + automationNode.height / 2;

        // Automation itself doesn't need to move - both connections already average back to
        // exactly its own center.
        expect(automationCenter).toBeCloseTo(32);
        // The two connections are equally far from automation on either side...
        expect(Math.abs(centerA - automationCenter)).toBeCloseTo(Math.abs(centerB - automationCenter));
        // ...far enough apart to actually clear each other...
        expect(Math.abs(centerA - centerB)).toBeGreaterThanOrEqual(CON_NODE_HEIGHT + NODE_GAP_Y / 2);
        // ...and neither one sits exactly on automation - the old bug's tell-tale sign.
        expect(centerA).not.toBeCloseTo(automationCenter);
        expect(centerB).not.toBeCloseTo(automationCenter);
    });

    test("weighs a workflow's generic-port sender and its event-port sender by where each link actually lands, not both at the node's center", () => {
        // Regression for a real escalation: a workflow triggered generically by automation (its
        // "in" port, at the node's center) that ALSO has a data-event port fed by another service,
        // well below center. positionColumnByIncomingLinks previously averaged only where each
        // incoming link left its SENDER, silently assuming every one of them arrives at the
        // workflow's generic center - biasing the workflow's own settled position (and, once
        // automation/the service settle near enough to collide with each other and compromise
        // symmetrically around it - see "spreads two connections..." above - biasing that
        // compromise too, since neither sender can do better than the workflow it's centering on).
        //
        // These exact numbers come from actually running this fixture (not hand algebra through a
        // multi-round symmetric-collision resolution): with the fix, workflowA settles at 527.25;
        // with the row-offset dropped (reverting to a plain average of `getPortAnchorY(sender, ...)`
        // with no correction for the target's own port), it settles at 532 instead - a real,
        // verified difference this test would catch, even though neither sender's link ever becomes
        // perfectly straight here (automation and the service sit close enough to collide with each
        // other, so - as already covered above - they settle symmetrically around workflowA rather
        // than exactly on it, for a reason unrelated to this fix). workflowA's generic "in" port
        // itself anchors at its play button (see getPortAnchorY), well off its box center for a
        // workflow with an event row - which is why 527.25 lands off both senders' own average
        // (475+589)/2=532 instead of matching it.
        const event = { name: "dataReady", attachedServices: [], attachedFunctions: [] };
        const workflowData: CDWorkflow = { ...makeWorkflow("workflow-a"), events: [event] };
        const workflowA = new EntryNodeModel(workflowData, "workflow");
        workflowA.height = calculateWorkflowNodeHeight(1);

        const automationNode = new EntryNodeModel(makeAutomation("automation-1"), "automation");
        automationNode.height = 64;
        automationNode.setPosition(ENTRY_X, 0);

        const serviceNode = new EntryNodeModel(makeService("service-1", [makeResourceFunction("get", "f")]), "service");
        serviceNode.height = 64;
        serviceNode.setPosition(ENTRY_X, 1000);

        const linkAutomation = createNodesLink(automationNode, workflowA) as NodeLinkModel;
        const eventPort = workflowA.getEventPort(event);
        const linkService = createPortsLink(serviceNode.getOutPort(), eventPort) as NodeLinkModel;
        linkService.setSourceNode(serviceNode);
        linkService.setTargetNode(workflowA);

        const engine = generateEngine();
        const model = new DiagramModel();
        model.addAll(automationNode, serviceNode, workflowA, linkAutomation, linkService);
        engine.setModel(model);

        autoDistribute(engine);

        expect(workflowA.getY() + workflowA.height / 2).toBeCloseTo(527.25);
        expect(automationNode.getY() + 32).toBeCloseTo(475);
        expect(serviceNode.getY() + 32).toBeCloseTo(589);
    });
});

describe("calculateEntryNodeHeight", () => {
    test.each([
        [1, 123],
        [2, 171],
        [3, 219], // regression: was 216 (took the preview+button branch meant for > SHOW_ALL_THRESHOLD)
        [4, 219],
    ])("collapsed with %i function(s) is %ipx", (numFunctions, expectedHeight) => {
        expect(calculateEntryNodeHeight(numFunctions, false)).toBe(expectedHeight);
    });

    test("a 3-function service's bounding box matches its real rendered height, not the old undercount", () => {
        const funcs = [makeResourceFunction("get", "a"), makeResourceFunction("get", "b"), makeResourceFunction("get", "c")];
        const serviceNode = new EntryNodeModel(makeService("service-1", funcs), "service");
        serviceNode.height = calculateEntryNodeHeight(3, false);
        serviceNode.setPosition(0, 0);

        expect(getNodeBoundingBox(serviceNode).bottom).toBe(219);
    });
});

describe("getPortAnchorY", () => {
    test("anchors a plain function port at its own body row, not the node's center", () => {
        const func = makeResourceFunction("get", "f");
        const serviceNode = new EntryNodeModel(makeService("service-1", [func]), "service");
        serviceNode.height = calculateEntryNodeHeight(1, false); // 128
        serviceNode.setPosition(0, 0); // box: [0, 123], center: 61.5

        const functionPort = serviceNode.getFunctionPort(func);
        const rowAnchorY = getPortAnchorY(serviceNode, functionPort);

        // Header offset (73.5) + half of the first row's own real height (40/2=20) - see
        // ENTRY_HEADER_HEIGHT/ENTRY_ROW_CONTENT_HEIGHT in utils/diagram.ts, shared with
        // calculateEntryNodeHeight.
        expect(rowAnchorY).toBe(93.5);
        expect(rowAnchorY).not.toBe(61.5); // must not fall back to the node's vertical center
    });

    test("anchors the view-all-resources port right after the rows partitionRegularServiceFunctions actually leaves visible", () => {
        // 5 functions, collapsed, over SHOW_ALL_THRESHOLD (3): partitionRegularServiceFunctions
        // shows PREVIEW_COUNT (2) rows and hides the rest behind this port. Both the row count
        // used here and the one baked into the node's own height (calculateEntryNodeHeight) read
        // from the same visibleRowCountWhenCollapsed() - if that shared count ever desynced from
        // partitionRegularServiceFunctions' actual slice, this port would anchor at the wrong row
        // instead of just below the last visible one.
        const funcs = [1, 2, 3, 4, 5].map((n) => makeResourceFunction("get", `f${n}`));
        const serviceNode = new EntryNodeModel(makeService("service-1", funcs), "service");
        serviceNode.height = calculateEntryNodeHeight(funcs.length, false);
        serviceNode.setPosition(0, 0);

        const viewAllAnchorY = getPortAnchorY(serviceNode, serviceNode.getViewAllResourcesPort());

        // Header offset (73.5) + 2 row-to-row steps (48 each) + half the button's own height (40/2).
        expect(viewAllAnchorY).toBe(189.5);
    });

    test("anchors the generic in/out ports at the node's true vertical center", () => {
        const serviceNode = new EntryNodeModel(makeService("service-1", [makeResourceFunction("get", "f")]), "service");
        serviceNode.height = calculateEntryNodeHeight(1, false);
        serviceNode.setPosition(0, 0); // box: [0, 123], center: 61.5

        expect(getPortAnchorY(serviceNode, serviceNode.getInPort())).toBe(61.5);
        expect(getPortAnchorY(serviceNode, serviceNode.getOutPort())).toBe(61.5);
    });

    test("anchors a workflow event port at its own body row", () => {
        const event = { name: "dataReady", attachedServices: [], attachedFunctions: [] };
        const workflow: CDWorkflow = { ...makeWorkflow("workflow-1"), events: [event] };
        const workflowNode = new EntryNodeModel(workflow, "workflow");
        workflowNode.height = calculateWorkflowNodeHeight(1);
        workflowNode.setPosition(0, 0); // box top: 0

        const eventPort = workflowNode.getEventPort(event);
        expect(getPortAnchorY(workflowNode, eventPort)).toBe(93.5); // same row math as a function port
    });

    test("anchors GraphQL function-row and group-header ports at their real row Y, not the node's center", () => {
        // Query open (2 visible functions) with Mutation/Subscription collapsed - the reviewer's
        // example shape, and `DEFAULT_GQL_STATE`'s own first-open state.
        const q1 = makeResourceFunction("get", "q1");
        const q2 = makeResourceFunction("get", "q2");
        const service = makeGraphQLService("gql-1", {
            queries: [q1, q2],
            mutations: [makeRemoteFunction("m1")],
            subscriptions: [makeResourceFunction("subscribe", "s1")],
        });

        const gqlNode = buildGraphQLNode(service);
        gqlNode.setPosition(0, 0); // box top: 0

        expect(gqlNode.height).toBe(359); // service header (80) + Query section (61 + 2*48)
        const center = gqlNode.height / 2; // 179.5

        // Query's header (61) then each row centered in its own 40px-tall real row.
        expect(getPortAnchorY(gqlNode, gqlNode.getFunctionPort(q1))).toBe(161); // 80 + 61 + 20
        expect(getPortAnchorY(gqlNode, gqlNode.getFunctionPort(q2))).toBe(209); // 80 + 61 + 48 + 20

        // Mutation/Subscription are collapsed by default, so each anchors at its own header row -
        // one row apart, and neither at the node's center.
        const mutationAnchor = getPortAnchorY(gqlNode, gqlNode.getGraphQLGroupPort("Mutation"));
        const subscriptionAnchor = getPortAnchorY(gqlNode, gqlNode.getGraphQLGroupPort("Subscription"));
        expect(mutationAnchor).toBe(267.5); // 80 + 61 + 2*48 + 61/2
        expect(subscriptionAnchor).toBe(328.5); // mutationAnchor's section end (298) + 61/2

        [161, 209, 267.5, 328.5].forEach((anchor) => expect(anchor).not.toBe(center));
    });

    test("doesn't reserve a show-more row for a GraphQL group with exactly SHOW_ALL_THRESHOLD items", () => {
        // partitionGraphQLServiceFunctions shows a group's items with none hidden whenever the
        // group's total is <= SHOW_ALL_THRESHOLD (3) - so a 3-query group is fully visible, no
        // show-more button, matching GraphQLServiceWidget's own canToggleItems (gated on the
        // group's full item count, not just how many ended up visible). The previous formula
        // reserved a button row here anyway (visibleCount(3) > PREVIEW_COUNT(2)), shifting every
        // row/port after this group 40px too far down even though the widget never draws that row.
        const q1 = makeResourceFunction("get", "q1");
        const q2 = makeResourceFunction("get", "q2");
        const q3 = makeResourceFunction("get", "q3");
        const service = makeGraphQLService("gql-3", {
            queries: [q1, q2, q3],
            mutations: [makeRemoteFunction("m1")],
            subscriptions: [makeResourceFunction("subscribe", "s1")],
        });

        const gqlNode = buildGraphQLNode(service);
        gqlNode.setPosition(0, 0);

        // Service header (80) + Query section (61 header + 3*48 rows, no +40 button) + Mutation
        // and Subscription collapsed headers (61 each) - not 447, which is what the extra
        // (unrendered) button row would have added.
        expect(gqlNode.height).toBe(407);

        expect(getPortAnchorY(gqlNode, gqlNode.getFunctionPort(q1))).toBe(161);
        expect(getPortAnchorY(gqlNode, gqlNode.getFunctionPort(q2))).toBe(209);
        expect(getPortAnchorY(gqlNode, gqlNode.getFunctionPort(q3))).toBe(257);

        // Mutation/Subscription sit right after Query's 3 rows, not 40px further down.
        expect(getPortAnchorY(gqlNode, gqlNode.getGraphQLGroupPort("Mutation"))).toBe(315.5);
        expect(getPortAnchorY(gqlNode, gqlNode.getGraphQLGroupPort("Subscription"))).toBe(376.5);
    });

    test("warns and falls back to center for a GraphQL port anchored without going through buildDiagramData", () => {
        // buildGraphQLNode (used above) goes through the real buildDiagramData pipeline, which is
        // what stamps rowOffsetY via computeGraphQLPortOffsets. Building the node directly instead
        // - as a caller bypassing buildDiagramData would - never stamps it, so this reproduces
        // exactly the gap the fallback exists to cover: it shouldn't throw, but it also shouldn't
        // fail silently.
        const q1 = makeResourceFunction("get", "q1");
        const service = makeGraphQLService("gql-2", { queries: [q1], mutations: [], subscriptions: [] });
        const gqlNode = new EntryNodeModel(service, "service");
        gqlNode.height = 200;
        gqlNode.setPosition(0, 0); // center: 100

        const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
        try {
            const anchor = getPortAnchorY(gqlNode, gqlNode.getFunctionPort(q1));
            expect(anchor).toBe(100); // falls back to center, doesn't throw
            expect(warnSpy).toHaveBeenCalledTimes(1);
            expect(warnSpy.mock.calls[0][0]).toContain("getPortAnchorY");
        } finally {
            warnSpy.mockRestore();
        }
    });

    test("anchors an ai:Service's chat/decision ports by AIServiceWidget's fixed render order, not by resourceFunctions' array order", () => {
        // AIServiceWidget always renders the chat row above the decision row when both are
        // present, regardless of which one appears first in `resourceFunctions` - unlike a plain
        // service, where the generic fallback's row index is exactly the port's array position.
        // Declare decision before chat here specifically to catch that: if getPortAnchorY ever
        // regressed to the generic array-order fallback for ai:Service, this would anchor them
        // swapped (decision -> row 0, chat -> row 1) instead of matching what's actually drawn.
        const decisionFn = makeResourceFunction("post", "decision");
        const chatFn = makeResourceFunction("post", "chat");
        const aiNode = new EntryNodeModel(makeService("ai-1", [decisionFn, chatFn], "ai:Service"), "service");
        aiNode.height = calculateEntryNodeHeight(2, false);
        aiNode.setPosition(0, 0); // box top: 0

        expect(getPortAnchorY(aiNode, aiNode.getFunctionPort(chatFn))).toBe(93.5); // row 0
        expect(getPortAnchorY(aiNode, aiNode.getFunctionPort(decisionFn))).toBe(141.5); // row 1
    });

    test("anchors an ai:Service's decision port at row 0 when chat isn't present", () => {
        const decisionFn = makeResourceFunction("post", "decision");
        const aiNode = new EntryNodeModel(makeService("ai-2", [decisionFn], "ai:Service"), "service");
        aiNode.height = calculateEntryNodeHeight(1, false);
        aiNode.setPosition(0, 0);

        expect(getPortAnchorY(aiNode, aiNode.getFunctionPort(decisionFn))).toBe(93.5); // row 0
    });
});

describe("getLinkAnchors", () => {
    test("anchors a link by fixed port side, not by which node sits further left on canvas", () => {
        // Every node widget renders "in" as the first child of its row (so it's always on that
        // node's own left edge) and "out" as the last (always on its own right edge) - regardless
        // of where the node sits on the canvas. Position the automation (source) to the RIGHT of
        // the connection (target) here specifically to catch a regression back to picking the
        // anchor edge by relative box position: that would anchor source at its own LEFT edge and
        // target at its own RIGHT edge instead, the wrong sides for where the ports actually are.
        const automationNode = new EntryNodeModel(makeAutomation("automation-1"), "automation");
        automationNode.setPosition(500, 0); // box: [500, 740] - to the right of the connection

        const connectionNode = new ConnectionNodeModel(makeConnection("connection-1"));
        connectionNode.setPosition(0, 0); // box: [0, CON_NODE_HEIGHT]

        const link = createNodesLink(automationNode, connectionNode) as NodeLinkModel;
        const anchors = getLinkAnchors(link);

        expect(anchors.source.x).toBe(740); // automation's own right edge (its out port)
        expect(anchors.target.x).toBe(0); // connection's own left edge (its in port)
    });
});

describe("avoidLinkObstructions with a real function port (createPortNodeLink)", () => {
    test("routes a service function's link around a workflow node the node-center approximation would have missed", () => {
        // A single-function service's function row anchors well below its own center (see the
        // "anchors a plain function port" test above: row=96 vs center=64 for this exact shape).
        // Regression for the escalation where GET/f -> httpServiceClient visibly crossed a
        // workflow node even though the (old, node-center-based) obstruction check found nothing
        // wrong - because it looked at the wrong Y entirely, not because bending itself was broken.
        const func = makeResourceFunction("get", "f");
        const serviceNode = new EntryNodeModel(makeService("service-1", [func]), "service");
        serviceNode.height = calculateEntryNodeHeight(1, false); // 128
        serviceNode.setPosition(ENTRY_X, 0); // box: [0, 128], center: 64, function row: 96

        const connectionNode = new ConnectionNodeModel(makeConnection("connection-1"));
        connectionNode.setPosition(CONNECTION_X, 64); // box: [64, 128], center: 96

        // Deliberately thin, and positioned to straddle only the TRUE (row-based, flat at Y=96)
        // straight line - not the old center-based one (center=64 -> center=96 slopes upward,
        // crossing the workflow column at Y=~80, well outside this box). If this node were ever
        // wrongly treated as "not in the way", this test would catch it.
        const workflowNode = new EntryNodeModel(makeWorkflow("workflow-1"), "workflow");
        workflowNode.height = 16;
        workflowNode.setPosition(WORKFLOW_X, 88); // box: [88, 104] - contains 96, excludes ~80

        const functionPort = serviceNode.getFunctionPort(func);
        const link = createPortNodeLink(serviceNode, functionPort, connectionNode) as NodeLinkModel;
        expect(link.getPoints()).toHaveLength(2);

        // createPortNodeLink must wire sourceNode/targetNode to the actual owning nodes, not both
        // to the target - avoidLinkObstructions silently no-ops otherwise (sourceNode === targetNode).
        expect(link.sourceNode).toBe(serviceNode);
        expect(link.targetNode).toBe(connectionNode);

        runObstructionPass([serviceNode, workflowNode, connectionNode], link);

        const points = link.getPoints();
        expect(points).toHaveLength(4);
        const laneY = points[1].getPosition().y;
        const clearsWorkflow = laneY <= 88 - LINK_DETOUR_MARGIN || laneY >= 104 + LINK_DETOUR_MARGIN;
        expect(clearsWorkflow).toBe(true);
    });

    test("routes a GraphQL query link around a workflow node the node-center approximation would have missed", () => {
        // Same escalation shape as the plain-service test above, but for GraphQL: several visible
        // queries plus collapsed Mutation/Subscription groups (see the getPortAnchorY test above -
        // this exact fixture anchors q2's row at Y=213, well below the node's center at Y=179.5).
        // The old center-based check drew the obstruction test against a Y the link never actually
        // ran through, so it never saw this crossing.
        const q1 = makeResourceFunction("get", "q1");
        const q2 = makeResourceFunction("get", "q2");
        const service = makeGraphQLService("gql-1", {
            queries: [q1, q2],
            mutations: [makeRemoteFunction("m1")],
            subscriptions: [makeResourceFunction("subscribe", "s1")],
        });

        const gqlNode = buildGraphQLNode(service);
        gqlNode.setPosition(ENTRY_X, 0); // box: [0, 359], center: 179.5, q2's row: 213

        const connectionNode = new ConnectionNodeModel(makeConnection("connection-1"));
        connectionNode.setPosition(CONNECTION_X, 213 - CON_NODE_HEIGHT / 2); // center: 213, matches q2's row

        // Deliberately thin and narrow, and placed against the near (source-side) edge of the
        // workflow column. The TRUE curve leaves the GraphQL node flat at Y=213 (source row and
        // target center both 213), so it crosses this box at every X. The old center-based curve
        // leaves at Y=179.5 and only eases up towards 213 near the target end - by the time it
        // reaches this box's X range (the first 40px of the column) it's still only around Y=187,
        // well clear of [205, 221] - which is exactly how the old check missed this crossing.
        const workflowNode = new EntryNodeModel(makeWorkflow("workflow-1"), "workflow");
        workflowNode.width = 40;
        workflowNode.height = 16;
        workflowNode.setPosition(WORKFLOW_X, 205); // box: [400, 440] x [205, 221]

        const q2Port = gqlNode.getFunctionPort(q2);
        const link = createPortNodeLink(gqlNode, q2Port, connectionNode) as NodeLinkModel;
        expect(link.getPoints()).toHaveLength(2);
        expect(link.sourceNode).toBe(gqlNode);
        expect(link.targetNode).toBe(connectionNode);

        runObstructionPass([gqlNode, workflowNode, connectionNode], link);

        const points = link.getPoints();
        expect(points).toHaveLength(4);
        const laneY = points[1].getPosition().y;
        const clearsWorkflow = laneY <= 205 - LINK_DETOUR_MARGIN || laneY >= 221 + LINK_DETOUR_MARGIN;
        expect(clearsWorkflow).toBe(true);
    });

    test("reroutes a link whose chord clears an obstruction but whose drawn curve does not", () => {
        // Regression for the escalation where `GET /f` -> the lower of two connections visibly
        // clipped the corner of the second of two stacked workflow nodes. Reproduces that layout
        // exactly (autoDistribute's real column spacing, a single-function service whose row
        // anchors at y=196, workflows stacked at [100, 172] and [222, 294], the target connection
        // centered at y=232), which puts the link's straight chord a *third of a pixel* clear of
        // workflow2's top edge - so the old chord-based check found nothing wrong while the curve
        // NodeLinkModel actually draws entered that node by ~4.4px.
        const func = makeResourceFunction("get", "f");
        const serviceNode = new EntryNodeModel(makeService("service-1", [func]), "service");
        serviceNode.height = calculateEntryNodeHeight(1, false); // 128
        serviceNode.setPosition(ENTRY_X, 100); // box: [100, 228], function row: 196

        const workflowNodeA = new EntryNodeModel(makeWorkflow("workflow-1"), "workflow");
        workflowNodeA.height = calculateWorkflowNodeHeight(0);
        workflowNodeA.setPosition(WORKFLOW_X, 100); // box: [100, 172]

        const workflowNodeB = new EntryNodeModel(makeWorkflow("workflow-2"), "workflow");
        workflowNodeB.height = calculateWorkflowNodeHeight(0);
        workflowNodeB.setPosition(WORKFLOW_X, 222); // box: [222, 294]

        const connectionNode = new ConnectionNodeModel(makeConnection("connection-1"));
        connectionNode.setPosition(CONNECTION_X, 200); // box: [200, 264], in-port center: 232

        // The premise: the chord really does miss workflow2, so a pass reasoning about the chord
        // would (correctly, for the chord) leave this link alone.
        const chordYAt = (x: number) => 196 + ((x - ENTRY_NODE_WIDTH) / (CONNECTION_X - ENTRY_NODE_WIDTH)) * (232 - 196);
        expect(chordYAt(WORKFLOW_X + ENTRY_NODE_WIDTH)).toBeLessThan(222);

        const functionPort = serviceNode.getFunctionPort(func);
        const link = createPortNodeLink(serviceNode, functionPort, connectionNode) as NodeLinkModel;

        runObstructionPass([serviceNode, workflowNodeA, workflowNodeB, connectionNode], link);

        const points = link.getPoints();
        expect(points).toHaveLength(4);
        const laneY = points[1].getPosition().y;
        expect(points[2].getPosition().y).toBeCloseTo(laneY);

        // The lane must clear both stacked workflows, and land in the gap between them rather than
        // sweeping all the way above or below the pair - that gap is the smallest disturbance to
        // where the link already ran.
        expect(laneY).toBeGreaterThanOrEqual(172 + LINK_DETOUR_MARGIN);
        expect(laneY).toBeLessThanOrEqual(222 - LINK_DETOUR_MARGIN);
    });

    test("keeps its waypoints in geometric left-to-right order even when source sits on the right", () => {
        // Nothing in today's 4-column layout ever builds a link this way round (every link flows
        // listener -> entry -> workflow -> connection, left to right), but the obstruction/lane
        // math above is direction-agnostic by design, so the point array it hands back has to be
        // too. `link.point(x, y, index)` inserts by array index - index 0 is always the link's own
        // source point and the last index its target point, regardless of which side of the
        // layout each actually sits on - so this pins that the waypoint landing next to each
        // endpoint is the one on that endpoint's own geometric side, not just "whichever index
        // used to be right when source was always the left one".
        const automationNode = new EntryNodeModel(makeAutomation("automation-1"), "automation");
        automationNode.setPosition(CONNECTION_X, 0); // source, on the right: box [CONNECTION_X, +64]

        const workflowNode = new EntryNodeModel(makeWorkflow("workflow-1"), "workflow");
        workflowNode.height = calculateWorkflowNodeHeight(0);
        workflowNode.setPosition(WORKFLOW_X, 20); // obstruction, in between

        const connectionNode = new ConnectionNodeModel(makeConnection("connection-1"));
        connectionNode.setPosition(ENTRY_X, 0); // target, on the left

        const link = createNodesLink(automationNode, connectionNode) as NodeLinkModel;
        runObstructionPass([automationNode, workflowNode, connectionNode], link);

        const points = link.getPoints();
        expect(points).toHaveLength(4);

        // point[1] sits next to the source (automation, on the right) and point[2] next to the
        // target (the connection, on the left) - so point[1]'s X must be the larger of the two,
        // matching the source's own side, not the target's.
        const nearSourceX = points[1].getPosition().x;
        const nearTargetX = points[2].getPosition().x;
        expect(nearSourceX).toBeGreaterThan(nearTargetX);
    });
});
