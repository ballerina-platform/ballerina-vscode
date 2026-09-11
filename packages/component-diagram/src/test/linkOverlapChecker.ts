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

/**
 * A systematic, whole-diagram check for the "a link visibly cuts through an unrelated node" class
 * of bug, replacing eyeballing screenshots one layout at a time.
 *
 * It drives the *production* pipeline end to end - `buildDiagramData` (the same graph
 * `Diagram.tsx` builds) -> `autoDistribute` (which positions every column and internally runs
 * `avoidLinkObstructions`) -> the real bezier geometry every link is painted from - then samples
 * each link's curve and tests it against every *other* node's real bounding box.
 *
 * Nothing here re-derives layout or path math: node boxes come from `getNodeBoundingBox`, endpoint
 * anchors from the shared `getLinkAnchors`, and the curve from `sampleBezierPath` - the same
 * function `avoidLinkObstructions` routes with, and (via `getBezierSegments`) the same geometry
 * `getSVGPath` serializes. `assertPathMatchesGeometry` pins that last equivalence per link so the
 * points sampled here are provably the ones the widget draws.
 *
 * What is deliberately *not* shared is the collision test. Production asks "does this curve touch
 * the box at all" to decide whether to reroute; this file asks "how far inside the box does it
 * get" with its own point-in-box math, so a passing suite means something independent of the
 * predicate the pass makes its decision with.
 */

import { DiagramModel } from "@projectstorm/react-diagrams";
import { CDModel } from "@wso2/ballerina-core";
import {
    autoDistribute,
    buildDiagramData,
    BoundingBox,
    generateEngine,
    getLinkAnchors,
    getNodeBoundingBox,
} from "../utils/diagram";
import { buildBezierPath, NodeLinkModel, Point2D, sampleBezierPath } from "../components/NodeLink";
import { NodeModel } from "../utils/types";
import { EntryNodeModel } from "../components/nodes/EntryNode";
import { ConnectionNodeModel } from "../components/nodes/ConnectionNode";
import { ListenerNodeModel } from "../components/nodes/ListenerNode";
import { GQLState } from "../components/Diagram";

/**
 * Samples taken along each cubic segment of a link's path. A segment spans at most a few hundred
 * px here, so ~200 samples put consecutive samples well under a pixel apart - fine enough that a
 * curve can't slip through a node box (tens of px tall) between two samples.
 */
const SAMPLES_PER_SEGMENT = 200;

/**
 * How far inside a node's box a sample must fall before it counts as a real crossing. A curve that
 * merely grazes a border (sub-pixel) is visually indistinguishable from one running alongside it,
 * and reporting those would make the check noisy without describing anything a user can see.
 */
const CROSSING_TOLERANCE = 0.5;

interface LinkCrossing {
    /** e.g. `entry "/f" [get-f] -> connection "ftpClient" [in]` */
    link: string;
    /** the unrelated node the link's curve enters, e.g. `entry "workflow2" (workflow)` */
    node: string;
    nodeBox: BoundingBox;
    /** deepest distance (px) the curve reaches inside `nodeBox`, measured from its nearest edge */
    penetration: number;
    /** the sampled point at which that deepest penetration occurs */
    deepestPoint: Point2D;
    /** the link's full geometry: endpoint anchors plus any detour waypoints */
    linkPoints: Point2D[];
}

/**
 * Runs the production build + layout pipeline for `project`, with no React render involved:
 * `buildDiagramData` -> `DiagramModel` -> `autoDistribute` (which runs `avoidLinkObstructions`).
 *
 * `expandedNodes` and `graphQLGroupOpen` are both empty, which reproduces the layout a user sees on
 * first open - `buildDiagramData` falls back to `DEFAULT_GQL_STATE` per service exactly as
 * `Diagram.tsx` seeds its own state with, and that first-open state is the one every overlap
 * reported so far has been in.
 */
function layoutProject(project: CDModel): { nodes: NodeModel[]; links: NodeLinkModel[] } {
    const engine = generateEngine();
    const { nodes, links } = buildDiagramData(project, new Set<string>(), {} as Record<string, GQLState>);

    const model = new DiagramModel();
    model.addAll(...nodes, ...links);
    engine.setModel(model);

    autoDistribute(engine);

    return { nodes, links };
}

/**
 * The full point list a link is drawn through: its two endpoint anchors (from the shared
 * `getLinkAnchors`, since under jsdom every element measures 0x0 and the model's own endpoint
 * points never leave the origin) plus every detour waypoint `avoidLinkObstructions` added in
 * between - those the model *does* carry in canvas coordinates, the layout pass having set them
 * directly.
 */
function getLinkGeometry(link: NodeLinkModel): Point2D[] | null {
    const anchors = getLinkAnchors(link);
    if (!anchors) {
        return null;
    }
    const waypoints = link
        .getPoints()
        .slice(1, -1)
        .map((point) => {
            const { x, y } = point.getPosition();
            return { x, y };
        });
    return [anchors.source, ...waypoints, anchors.target];
}

/**
 * Asserts that the path the widget would render for `link` is the one built from `points`, by
 * moving the link's endpoint points onto their anchors (what a browser's port measurements would
 * have done) and comparing `getSVGPath()` against the same points serialized.
 *
 * This is what lets the sampling below use `points` directly instead of re-parsing the `d` string:
 * it proves per link that the two describe the same curve, rather than assuming it.
 */
function assertPathMatchesGeometry(link: NodeLinkModel, points: Point2D[]): void {
    const linkPoints = link.getPoints();
    linkPoints[0].setPosition(points[0].x, points[0].y);
    linkPoints[linkPoints.length - 1].setPosition(points[points.length - 1].x, points[points.length - 1].y);

    const rendered = link.getSVGPath();
    const expected = buildBezierPath(points);
    if (rendered !== expected) {
        throw new Error(
            `Link's rendered path does not match its geometry.\n  rendered: ${rendered}\n  expected: ${expected}`
        );
    }
}

/** How far inside `box` a point lies (0 when on or outside the boundary). */
function penetrationDepth(point: Point2D, box: BoundingBox): number {
    return Math.max(
        0,
        Math.min(point.x - box.left, box.right - point.x, point.y - box.top, box.bottom - point.y)
    );
}

function describeNode(node: NodeModel): string {
    if (node instanceof EntryNodeModel) {
        const entryPoint = node.node as { symbol?: string; name?: string; absolutePath?: string };
        const label = entryPoint.symbol ?? entryPoint.name ?? entryPoint.absolutePath ?? node.getID();
        return `entry "${label}" (${node.type})`;
    }
    if (node instanceof ConnectionNodeModel) {
        return `connection "${node.node.symbol}"`;
    }
    if (node instanceof ListenerNodeModel) {
        return `listener "${node.node.symbol}"`;
    }
    return `node "${(node as NodeModel).getID()}"`;
}

function describeLink(link: NodeLinkModel): string {
    const sourcePort = link.getSourcePort()?.getOptions().name;
    const targetPort = link.getTargetPort()?.getOptions().name;
    return (
        `${describeNode(link.sourceNode)} [${sourcePort ?? "?"}]` +
        ` -> ${describeNode(link.targetNode)} [${targetPort ?? "?"}]`
    );
}

/**
 * Samples every link's rendered curve against every node that isn't one of its own endpoints, and
 * returns the deepest crossing found per (link, node) pair, worst first.
 */
function findLinkNodeCrossings(project: CDModel): LinkCrossing[] {
    const { nodes, links } = layoutProject(project);
    const boxes = new Map<NodeModel, BoundingBox>(nodes.map((node) => [node, getNodeBoundingBox(node)]));
    const crossings: LinkCrossing[] = [];

    links.forEach((link) => {
        const points = getLinkGeometry(link);
        if (!points) {
            return;
        }
        assertPathMatchesGeometry(link, points);
        const samples = sampleBezierPath(points, SAMPLES_PER_SEGMENT);

        boxes.forEach((box, node) => {
            if (node === link.sourceNode || node === link.targetNode) {
                return;
            }
            let worstDepth = 0;
            let worstPoint: Point2D = { x: 0, y: 0 };
            samples.forEach((sample) => {
                const depth = penetrationDepth(sample, box);
                if (depth > worstDepth) {
                    worstDepth = depth;
                    worstPoint = sample;
                }
            });
            if (worstDepth > CROSSING_TOLERANCE) {
                crossings.push({
                    link: describeLink(link),
                    node: describeNode(node),
                    nodeBox: box,
                    penetration: worstDepth,
                    deepestPoint: worstPoint,
                    linkPoints: points,
                });
            }
        });
    });

    return crossings.sort((a, b) => b.penetration - a.penetration);
}

const round = (value: number) => Math.round(value * 100) / 100;

/** Renders crossings as a readable report - used as the assertion message below. */
function formatCrossings(crossings: LinkCrossing[]): string {
    return crossings
        .map((crossing) => {
            const box = crossing.nodeBox;
            const geometry = crossing.linkPoints.map((point) => `(${round(point.x)}, ${round(point.y)})`).join(" -> ");
            return [
                `${crossing.link}`,
                `  crosses ${crossing.node}`,
                `    node box: x [${round(box.left)}, ${round(box.right)}], y [${round(box.top)}, ${round(box.bottom)}]`,
                `    deepest point: (${round(crossing.deepestPoint.x)}, ${round(crossing.deepestPoint.y)})` +
                    `, ${round(crossing.penetration)}px inside`,
                `    link geometry: ${geometry}`,
            ].join("\n");
        })
        .join("\n");
}

/**
 * Asserts that no link in `project`'s laid-out diagram crosses any node other than its own
 * endpoints. On failure the message lists every offending link/node pair with real coordinates and
 * penetration depths, so a regression can be diagnosed from the output alone.
 */
export function checkNoLinkCrossesAnyNode(project: CDModel, fixtureName: string): void {
    const crossings = findLinkNodeCrossings(project);
    if (crossings.length > 0) {
        throw new Error(
            `${fixtureName}: ${crossings.length} link/node crossing(s) found\n${formatCrossings(crossings)}`
        );
    }
}
