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

import { DefaultLinkModel } from "@projectstorm/react-diagrams";
import { ThemeColors } from "@wso2/ui-toolkit";
import { NODE_LINK } from "../../resources/constants";
import { NodeModel } from "../../utils/types";

export const LINK_BOTTOM_OFFSET = 30;

export interface Point2D {
    x: number;
    y: number;
}

/**
 * Fraction of a segment's horizontal span used as its bezier control-point offset - a "smooth"
 * edge style where a link always leaves/enters a point horizontally regardless of how much
 * vertical distance it covers. 0.5 (half the horizontal distance on each
 * end) reads as a clear, consistent S-curve at this diagram's scale (NODE_GAP_X=160,
 * ENTRY_NODE_WIDTH=240 - a typical inter-column segment is comfortably wider than the resulting
 * offset) without the curve looking over-bowed on longer segments.
 */
const LINK_CURVATURE = 0.5;

/**
 * Floor on the control-point offset so a short segment still reads as gently curved rather than
 * snapping to a straight line. See buildBezierSegment for how it interacts with the hard cap that
 * keeps a control point from overshooting the far endpoint.
 */
const LINK_MIN_CURVE_OFFSET = 20;

/** One cubic-bezier segment of a link's path, in draw order. */
interface BezierSegment {
    start: Point2D;
    control1: Point2D;
    control2: Point2D;
    end: Point2D;
}

/**
 * Builds one cubic-bezier segment from `p0` to `p1`, horizontal at both ends: its control points
 * are `p0`/`p1` pushed horizontally toward each other by the same offset.
 *
 * `offset` is clamped to `[LINK_MIN_CURVE_OFFSET, |p1.x-p0.x|]` around a preferred value of
 * `|p1.x-p0.x| * LINK_CURVATURE` - the upper bound is what stops a short segment's control point
 * from overshooting the far endpoint and folding the curve back on itself; when the segment is
 * shorter than LINK_MIN_CURVE_OFFSET, that upper bound (the segment's own span) wins over the
 * floor, which is exactly what should happen. For a purely vertical segment (p1.x === p0.x) the
 * offset collapses to 0 - there's no horizontal distance to bow across, so the "segment" is
 * drawn as a straight vertical cubic (a degenerate curve, still valid, matching the rule that a
 * link only ever curves horizontally).
 */
function buildBezierSegment(p0: Point2D, p1: Point2D): BezierSegment {
    const dx = p1.x - p0.x;
    const absDx = Math.abs(dx);
    const magnitude = Math.min(Math.max(absDx * LINK_CURVATURE, LINK_MIN_CURVE_OFFSET), absDx);
    const offset = Math.sign(dx) * magnitude;
    return {
        start: p0,
        control1: { x: p0.x + offset, y: p0.y },
        control2: { x: p1.x - offset, y: p1.y },
        end: p1,
    };
}

/**
 * The cubic-bezier segments a link through `points` (length >= 2) is drawn as - one per
 * consecutive pair. This is the single source of truth for a link's rendered shape: `buildBezierPath`
 * serializes exactly these segments, and `sampleBezierPath` samples exactly these segments, so
 * the layout pass that has to reason about where a link *actually* runs
 * (`avoidLinkObstructions` in utils/diagram.ts) can never drift out of sync with what's painted.
 *
 * Because each segment's control points are horizontal projections of its own endpoints,
 * consecutive segments meet at a shared point with matching (horizontal) tangent direction -
 * the whole chain reads as one seamless curve, with no visible kink at an old "corner" point.
 *
 * Two properties `avoidLinkObstructions` relies on, both direct consequences of that
 * construction:
 * - A segment's curve never leaves the horizontal span between its own two endpoints' X
 *   coordinates, since every control point's X lies between `p0.x` and `p1.x`. So a detour's
 *   outer segments cannot reach into the X-range its bend points were placed outside of.
 * - A segment whose endpoints share a Y is perfectly flat, since all four of its points then
 *   share that Y and the curve is their convex combination. So a detour's middle segment stays
 *   exactly on the computed lane Y, regardless of LINK_CURVATURE.
 *
 * What is emphatically *not* true - and what this API exists to stop callers from assuming - is
 * that a segment stays near the straight chord between its endpoints. With horizontal tangents at
 * both ends it deliberately bows away from that chord (that's the whole visual point), by up to
 * LINK_CURVATURE of the segment's height at the quarter points. See NodeLinkModel.test.ts for
 * numeric checks of all three claims.
 */
function getBezierSegments(points: Point2D[]): BezierSegment[] {
    return points.slice(1).map((point, index) => buildBezierSegment(points[index], point));
}

/**
 * Serializes `points` as an SVG path - `M` then one `C` per segment (see `getBezierSegments`) -
 * used uniformly for every link, whether it's a plain 2-point port-to-port link or a multi-point
 * detour `avoidLinkObstructions` (utils/diagram.ts) routed around an obstruction.
 */
export function buildBezierPath(points: Point2D[]): string {
    const commands = getBezierSegments(points).map(
        ({ control1, control2, end }) => `C ${control1.x} ${control1.y} ${control2.x} ${control2.y} ${end.x} ${end.y}`
    );
    return [`M ${points[0].x} ${points[0].y}`, ...commands].join(" ");
}

/** The point at parameter `t` (0..1) on one cubic-bezier segment. */
function pointOnSegment({ start, control1, control2, end }: BezierSegment, t: number): Point2D {
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const d = t * t * t;
    return {
        x: a * start.x + b * control1.x + c * control2.x + d * end.x,
        y: a * start.y + b * control1.y + c * control2.y + d * end.y,
    };
}

/**
 * Approximates the curve drawn through `points` as a polyline of `samplesPerSegment` chords per
 * bezier segment (so `samplesPerSegment + 1` sampled points per segment, sharing each interior
 * endpoint with the next segment).
 *
 * This is how callers ask "where does this link actually run?" without duplicating the bezier
 * math - see `avoidLinkObstructions` in utils/diagram.ts, which needs the answer to decide whether
 * a link crosses a node it should be routed around.
 */
export function sampleBezierPath(points: Point2D[], samplesPerSegment: number): Point2D[] {
    const samples: Point2D[] = [points[0]];
    getBezierSegments(points).forEach((segment) => {
        for (let step = 1; step <= samplesPerSegment; step++) {
            samples.push(pointOnSegment(segment, step / samplesPerSegment));
        }
    });
    return samples;
}

export interface NodeLinkModelOptions {
    label?: string;
    visible: boolean;
    broken?: boolean;
    // neutral dashed link (e.g. a read-only interaction with a durable agent)
    dashed?: boolean;
    onAddClick?: () => void;
}

export class NodeLinkModel extends DefaultLinkModel {
    sourceNode: NodeModel;
    targetNode: NodeModel;
    // options
    label: string;
    visible = true;
    // marks a link that cannot be resolved statically (e.g. a workflow:sendData call whose
    // data event name does not match any event declared by the workflow)
    broken = false;
    dashed = false;
    // call back
    onAddClick?: () => void;

    constructor(label?: string);
    constructor(options: NodeLinkModelOptions);
    constructor(options: NodeLinkModelOptions | string) {
        super({
            type: NODE_LINK,
            width: 10,
            color: ThemeColors.PRIMARY,
            selectedColor: ThemeColors.SECONDARY,
            curvyness: 0,
        });
        if (options) {
            if (typeof options === "string" && options.length > 0) {
                this.label = options;
            } else {
                if ((options as NodeLinkModelOptions).label) {
                    this.label = (options as NodeLinkModelOptions).label;
                }
                if ((options as NodeLinkModelOptions).visible === false) {
                    this.visible = (options as NodeLinkModelOptions).visible;
                }
                if ((options as NodeLinkModelOptions).broken) {
                    this.broken = true;
                }
                if ((options as NodeLinkModelOptions).dashed) {
                    this.dashed = true;
                }
            }
            if ((options as NodeLinkModelOptions).onAddClick) {
                this.onAddClick = (options as NodeLinkModelOptions).onAddClick;
            }
        }
    }

    setSourceNode(node: NodeModel) {
        this.sourceNode = node;
    }

    setTargetNode(node: NodeModel) {
        this.targetNode = node;
    }

    /**
     * DefaultLinkModel.getSVGPath() only knows how to draw a single bezier curve between
     * exactly 2 points, so it silently returns undefined for any link carrying extra waypoints.
     * Waypoints get added by avoidLinkObstructions() (see utils/diagram.ts) to route a link
     * around a node it would otherwise cut through.
     *
     * Every link - plain 2-point or multi-point detour alike - is drawn the same way: chained
     * cubic-bezier segments through every point (see buildBezierPath), for a consistent curvy
     * look across the whole diagram (a link always leaves/enters a point horizontally,
     * regardless of its overall angle).
     */
    getSVGPath(): string {
        return buildBezierPath(this.getPoints().map((point) => point.getPosition()));
    }
}
