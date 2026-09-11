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

import { NodeLinkModel, buildBezierPath, Point2D, sampleBezierPath } from "../components/NodeLink/NodeLinkModel";
import { ENTRY_NODE_WIDTH, NODE_GAP_X } from "../resources/constants";

interface Box {
    left: number;
    right: number;
    top: number;
    bottom: number;
}

/** Straight-line distance from a point to the nearest edge/corner of an axis-aligned box (0 if inside). Reimplemented independently of production code. */
function distanceToBox(p: Point2D, box: Box): number {
    const dx = Math.max(box.left - p.x, 0, p.x - box.right);
    const dy = Math.max(box.top - p.y, 0, p.y - box.bottom);
    return Math.hypot(dx, dy);
}

/** Evaluates a cubic Bezier (p0, c1, c2, p1) at t, reimplemented independently of production code. */
function cubicBezierAt(p0: Point2D, c1: Point2D, c2: Point2D, p1: Point2D, t: number): Point2D {
    const mt = 1 - t;
    const a = mt * mt * mt;
    const b = 3 * mt * mt * t;
    const c = 3 * mt * t * t;
    const d = t * t * t;
    return {
        x: a * p0.x + b * c1.x + c * c2.x + d * p1.x,
        y: a * p0.y + b * c1.y + c * c2.y + d * p1.y,
    };
}

/** The tangent (derivative) direction of the same cubic Bezier at t. */
function cubicBezierTangentAt(p0: Point2D, c1: Point2D, c2: Point2D, p1: Point2D, t: number): Point2D {
    const mt = 1 - t;
    const a = 3 * mt * mt;
    const b = 6 * mt * t;
    const c = 3 * t * t;
    return {
        x: a * (c1.x - p0.x) + b * (c2.x - c1.x) + c * (p1.x - c2.x),
        y: a * (c1.y - p0.y) + b * (c2.y - c1.y) + c * (p1.y - c2.y),
    };
}

function samples(count: number): number[] {
    const ts: number[] = [];
    for (let i = 0; i <= count; i++) {
        ts.push(i / count);
    }
    return ts;
}

/** Parses a path built by buildBezierPath back into its M-start and each segment's (c1, c2, end). */
function parseBezierPath(path: string): { start: Point2D; segments: Array<{ c1: Point2D; c2: Point2D; end: Point2D }> } {
    const mMatch = path.match(/^M ([\d.-]+) ([\d.-]+)/);
    const start = { x: Number(mMatch[1]), y: Number(mMatch[2]) };
    const segments = [...path.matchAll(/C ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+)/g)].map((m) => ({
        c1: { x: Number(m[1]), y: Number(m[2]) },
        c2: { x: Number(m[3]), y: Number(m[4]) },
        end: { x: Number(m[5]), y: Number(m[6]) },
    }));
    return { start, segments };
}

/** Builds a plain NodeLinkModel with exactly the given points (no ports attached). */
function buildLinkWithPoints(points: Point2D[]): NodeLinkModel {
    const link = new NodeLinkModel({ visible: true });
    link.getFirstPoint().setPosition(points[0].x, points[0].y);
    for (let i = 1; i < points.length - 1; i++) {
        link.point(points[i].x, points[i].y, i);
    }
    link.getLastPoint().setPosition(points[points.length - 1].x, points[points.length - 1].y);
    return link;
}

describe("NodeLinkModel.getSVGPath - single segment (plain 2-point link)", () => {
    test("draws one cubic bezier, horizontal at both ends, staying within the segment's own bounding box", () => {
        const link = buildLinkWithPoints([{ x: 240, y: 32 }, { x: 800, y: 232 }]);
        const { start, segments } = parseBezierPath(link.getSVGPath());
        expect(segments).toHaveLength(1);

        const { c1, c2, end } = segments[0];
        expect(start).toEqual({ x: 240, y: 32 });
        expect(end).toEqual({ x: 800, y: 232 });
        // Horizontal at both ends: control points share their endpoint's Y.
        expect(c1.y).toBe(start.y);
        expect(c2.y).toBe(end.y);
        // Control points sit strictly between the endpoints' X (never past either one).
        expect(c1.x).toBeGreaterThan(start.x);
        expect(c1.x).toBeLessThanOrEqual(end.x);
        expect(c2.x).toBeLessThan(end.x);
        expect(c2.x).toBeGreaterThanOrEqual(start.x);

        // The whole curve must stay inside the segment's own bounding box (a cubic bezier lies
        // within the convex hull of its 4 control points, and here all 4 X's are within
        // [start.x, end.x] and all 4 Y's are exactly start.y or end.y).
        samples(50).forEach((t) => {
            const p = cubicBezierAt(start, c1, c2, end, t);
            expect(p.x).toBeGreaterThanOrEqual(start.x - 1e-9);
            expect(p.x).toBeLessThanOrEqual(end.x + 1e-9);
            expect(p.y).toBeGreaterThanOrEqual(Math.min(start.y, end.y) - 1e-9);
            expect(p.y).toBeLessThanOrEqual(Math.max(start.y, end.y) + 1e-9);
        });
    });

    test("the arrowhead-relevant tangent at the very end of the path is purely horizontal", () => {
        // Whatever the link's overall angle, control point 2 shares the target's Y - so the
        // tangent SVG's marker orient="auto" would read at the end is always horizontal. This is
        // a deliberate consequence of this curve style, not a bug: verify it holds even for a
        // steep link.
        const link = buildLinkWithPoints([{ x: 0, y: 0 }, { x: 100, y: 500 }]);
        const { start, segments } = parseBezierPath(link.getSVGPath());
        const { c1, c2, end } = segments[0];
        const tangent = cubicBezierTangentAt(start, c1, c2, end, 1);
        expect(tangent.y).toBeCloseTo(0);
        expect(tangent.x).toBeGreaterThan(0); // pointing further right, i.e. "into" the target
    });

    test("a purely vertical segment collapses to a straight vertical curve, not a horizontal bow", () => {
        const link = buildLinkWithPoints([{ x: 50, y: 0 }, { x: 50, y: 300 }]);
        const { start, segments } = parseBezierPath(link.getSVGPath());
        const { c1, c2, end } = segments[0];
        expect(c1.x).toBe(50);
        expect(c2.x).toBe(50);
        samples(20).forEach((t) => {
            const p = cubicBezierAt(start, c1, c2, end, t);
            expect(p.x).toBeCloseTo(50);
        });
    });
});

describe("NodeLinkModel.getSVGPath - multi-segment detour path", () => {
    // Mirrors a real avoidLinkObstructions detour (see utils/diagram.ts): an entry node
    // (automation) linking to a connection, routed around a workflow-column obstruction using
    // this diagram's actual column-spacing constants. bend1.y === bend2.y always (both set to
    // the same computed laneY - see avoidLinkObstructions), which is the property the "stays
    // flat" test below depends on.
    const start: Point2D = { x: ENTRY_NODE_WIDTH, y: 32 };
    const bend1: Point2D = { x: ENTRY_NODE_WIDTH + NODE_GAP_X - NODE_GAP_X / 4, y: 84 };
    const bend2: Point2D = { x: ENTRY_NODE_WIDTH + NODE_GAP_X + ENTRY_NODE_WIDTH + NODE_GAP_X / 4, y: 84 };
    const end: Point2D = { x: 2 * (ENTRY_NODE_WIDTH + NODE_GAP_X) + ENTRY_NODE_WIDTH, y: 232 };
    // The obstruction column bend1/bend2 were routed around (with LINK_DETOUR_MARGIN=16 to
    // spare - see utils/diagram.ts), reconstructed from the same constants avoidLinkObstructions
    // uses: columnLeft/columnRight are the detourX (NODE_GAP_X/4) back from each bend.
    const obstruction: Box = {
        left: bend1.x + NODE_GAP_X / 4,
        right: bend2.x - NODE_GAP_X / 4,
        top: bend1.y + 16,
        bottom: bend1.y + 16 + ENTRY_NODE_WIDTH / 3, // an arbitrary but plausible workflow node height
    };

    test("produces 3 chained segments starting/ending at the exact source/target coordinates", () => {
        const link = buildLinkWithPoints([start, bend1, bend2, end]);
        const { start: parsedStart, segments } = parseBezierPath(link.getSVGPath());
        expect(parsedStart).toEqual(start);
        expect(segments).toHaveLength(3);
        expect(segments[0].end).toEqual(bend1);
        expect(segments[1].end).toEqual(bend2);
        expect(segments[2].end).toEqual(end);
    });

    test("the middle (bend1->bend2) segment stays exactly flat at the lane Y, regardless of curvature", () => {
        const link = buildLinkWithPoints([start, bend1, bend2, end]);
        const { segments } = parseBezierPath(link.getSVGPath());
        const middle = segments[1]; // bend1 -> bend2

        expect(middle.c1.y).toBe(bend1.y);
        expect(middle.c2.y).toBe(bend2.y);
        expect(bend1.y).toBe(bend2.y); // the precondition this flatness relies on

        samples(50).forEach((t) => {
            const p = cubicBezierAt(bend1, middle.c1, middle.c2, bend2, t);
            expect(p.y).toBeCloseTo(bend1.y);
        });
    });

    test("the outer segments' curves never enter the obstruction's X-range", () => {
        const link = buildLinkWithPoints([start, bend1, bend2, end]);
        const { start: parsedStart, segments } = parseBezierPath(link.getSVGPath());
        const [outerLeft, , outerRight] = segments; // start->bend1, bend1->bend2, bend2->end

        samples(50).forEach((t) => {
            const left = cubicBezierAt(parsedStart, outerLeft.c1, outerLeft.c2, outerLeft.end, t);
            const right = cubicBezierAt(bend2, outerRight.c1, outerRight.c2, outerRight.end, t);
            expect(left.x).toBeLessThanOrEqual(obstruction.left);
            expect(right.x).toBeGreaterThanOrEqual(obstruction.right);
        });
    });

    test("no visible kink at either bend: incoming and outgoing tangents point the same direction", () => {
        const link = buildLinkWithPoints([start, bend1, bend2, end]);
        const { start: parsedStart, segments } = parseBezierPath(link.getSVGPath());
        const [seg1, seg2, seg3] = segments;

        // At bend1: arriving tangent (end of seg1) vs departing tangent (start of seg2).
        const arrive1 = cubicBezierTangentAt(parsedStart, seg1.c1, seg1.c2, seg1.end, 1);
        const depart1 = cubicBezierTangentAt(seg1.end, seg2.c1, seg2.c2, seg2.end, 0);
        expect(arrive1.y).toBeCloseTo(0);
        expect(depart1.y).toBeCloseTo(0);
        expect(Math.sign(arrive1.x)).toBe(Math.sign(depart1.x)); // same direction, not just parallel

        // At bend2: arriving tangent (end of seg2) vs departing tangent (start of seg3).
        const arrive2 = cubicBezierTangentAt(seg1.end, seg2.c1, seg2.c2, seg2.end, 1);
        const depart2 = cubicBezierTangentAt(seg2.end, seg3.c1, seg3.c2, seg3.end, 0);
        expect(arrive2.y).toBeCloseTo(0);
        expect(depart2.y).toBeCloseTo(0);
        expect(Math.sign(arrive2.x)).toBe(Math.sign(depart2.x));
    });

    // Narrowly about THIS detour geometry, where the obstruction sits above/below the lane rather
    // than off one end: it is not a general claim that a curve stays no closer to a box than its
    // chord does. That emphatically does not hold for a plain 2-point link - see "bows away from
    // its chord" below, the near-miss avoidLinkObstructions now samples the real curve to catch.
    test("never gets closer to the obstruction than the straight-polyline geometry avoidLinkObstructions computed", () => {
        const link = buildLinkWithPoints([start, bend1, bend2, end]);
        const { start: parsedStart, segments } = parseBezierPath(link.getSVGPath());
        const rawPoints = [parsedStart, bend1, bend2, end];

        segments.forEach((segment, i) => {
            const p0 = rawPoints[i];
            const p1 = rawPoints[i + 1];
            const curveMinDistance = Math.min(
                ...samples(50).map((t) => distanceToBox(cubicBezierAt(p0, segment.c1, segment.c2, p1, t), obstruction))
            );
            const straightMinDistance = Math.min(
                ...samples(50).map((t) => distanceToBox({ x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t }, obstruction))
            );
            expect(curveMinDistance).toBeGreaterThanOrEqual(straightMinDistance - 1e-9);
        });
    });
});

describe("sampleBezierPath", () => {
    test("traces the same curve the path string describes, for a multi-segment detour", () => {
        const points: Point2D[] = [
            { x: 850, y: 196 },
            { x: 970, y: 206 },
            { x: 1290, y: 206 },
            { x: 1410, y: 232 },
        ];
        const samplesPerSegment = 8;
        const sampled = sampleBezierPath(points, samplesPerSegment);
        const { start, segments } = parseBezierPath(buildBezierPath(points));

        // One shared start point, then samplesPerSegment new points per segment.
        expect(sampled).toHaveLength(1 + segments.length * samplesPerSegment);
        expect(sampled[0]).toEqual(start);

        // Re-evaluate every sample independently of the sampler and compare.
        segments.forEach((segment, segmentIndex) => {
            const segmentStart = segmentIndex === 0 ? start : segments[segmentIndex - 1].end;
            for (let step = 1; step <= samplesPerSegment; step++) {
                const expected = cubicBezierAt(segmentStart, segment.c1, segment.c2, segment.end, step / samplesPerSegment);
                const actual = sampled[segmentIndex * samplesPerSegment + step];
                expect(actual.x).toBeCloseTo(expected.x);
                expect(actual.y).toBeCloseTo(expected.y);
            }
        });
    });

    test("a plain 2-point link bows away from its chord - a chord is NOT a safe proxy for the curve", () => {
        // The exact geometry behind the escalation this sampling was introduced for: a service's
        // `GET /f` function row (y=196) linking to the lower of two connections (y=232), passing
        // the second of two stacked workflow nodes whose box starts at y=222 and ends at x=1250.
        // The chord clears that box's top edge by a third of a pixel; the drawn curve does not.
        const source: Point2D = { x: 850, y: 196 };
        const target: Point2D = { x: 1410, y: 232 };
        const obstructionRight = 1250;
        const obstructionTop = 222;

        const chordYAt = (x: number) =>
            source.y + ((x - source.x) / (target.x - source.x)) * (target.y - source.y);
        expect(chordYAt(obstructionRight)).toBeLessThan(obstructionTop);

        const curveYAt = (x: number) => {
            const nearest = sampleBezierPath([source, target], 2000).reduce((closest, point) =>
                Math.abs(point.x - x) < Math.abs(closest.x - x) ? point : closest
            );
            return nearest.y;
        };
        expect(curveYAt(obstructionRight)).toBeGreaterThan(obstructionTop);
        // Roughly 5px of bow at this point - small in absolute terms, but several times the link's
        // own stroke width, so it reads as the link clipping the node's corner.
        expect(curveYAt(obstructionRight) - chordYAt(obstructionRight)).toBeGreaterThan(4);
    });
});

describe("buildBezierPath edge cases", () => {
    test("a very short segment still curves (floored offset) but never overshoots the far endpoint", () => {
        const path = buildBezierPath([{ x: 0, y: 0 }, { x: 5, y: 5 }]);
        const { start, segments } = parseBezierPath(path);
        const { c1, c2, end } = segments[0];
        // Segment span is only 5px - far below LINK_MIN_CURVE_OFFSET - so the hard cap (the
        // segment's own span) must win: control points land exactly at the far endpoint's X,
        // never past it.
        expect(c1.x).toBeLessThanOrEqual(end.x);
        expect(c2.x).toBeGreaterThanOrEqual(start.x);
    });

    test("a very narrow obstruction column (bend1 and bend2 close together) still produces a valid, non-overshooting middle segment", () => {
        const path = buildBezierPath([{ x: 0, y: 0 }, { x: 100, y: 50 }, { x: 106, y: 50 }, { x: 300, y: 200 }]);
        const { segments } = parseBezierPath(path);
        const middle = segments[1];
        expect(middle.c1.x).toBeGreaterThanOrEqual(100);
        expect(middle.c1.x).toBeLessThanOrEqual(106);
        expect(middle.c2.x).toBeLessThanOrEqual(106);
        expect(middle.c2.x).toBeGreaterThanOrEqual(100);
        // Still flat - the narrow-column case doesn't change the "shared Y" flatness guarantee.
        expect(middle.c1.y).toBe(50);
        expect(middle.c2.y).toBe(50);
    });
});
