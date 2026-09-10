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

import { ARRIVAL_BOW_PX } from "../../resources/constants";
import { TopologyLinkModel } from "./TopologyLinkModel";

export interface Point {
    x: number;
    y: number;
}

const CORNER_RADIUS = 10;
// Estimated card heights put ports a few px off; that close, the edge is drawn dead straight.
const STRAIGHT_TOLERANCE = 8;

export interface Route {
    points: Point[];
    // The leg chips sit on: the last one into the target, or the first one out of the source when the route heads back.
    run: [Point, Point];
}

function toPoint(main: number, cross: number, vertical: boolean): Point {
    return vertical ? { x: cross, y: main } : { x: main, y: cross };
}

// Flow axis to the bend, across, flow axis into the target; the bow moves only the leg into the target.
// A layout that hands over several vias (a back edge wrapping around the cards, a long edge detouring) is
// drawn through all of them; a wrap's chips label the leg leaving the source, since its last leg shares the
// target's port with the forward arrivals.
export function route(source: Point, target: Point, via: Point[], bow: number, vertical: boolean): Route {
    const main = (point: Point) => (vertical ? point.y : point.x);
    const cross = (point: Point) => (vertical ? point.x : point.y);
    if (via.length >= 2) {
        const first = toPoint(main(via[0]), cross(source), vertical);
        const last = toPoint(main(via[via.length - 1]), cross(target) + bow, vertical);
        const finish = toPoint(main(target), cross(target) + bow, vertical);
        const points = [source, first, ...via.slice(1, -1), last, finish];
        return { points, run: main(target) < main(source) ? [source, first] : [last, finish] };
    }
    const bend = via.length ? main(via[0]) : (main(source) + main(target)) / 2;
    const start = toPoint(main(source), cross(source), vertical);
    if (Math.abs(cross(target) + bow - cross(source)) < STRAIGHT_TOLERANCE) {
        const finish = toPoint(main(target), cross(source), vertical);
        return { points: [start, finish], run: [toPoint(bend, cross(source), vertical), finish] };
    }
    const finish = toPoint(main(target), cross(target) + bow, vertical);
    const runStart = toPoint(bend, cross(target) + bow, vertical);
    return { points: [start, toPoint(bend, cross(source), vertical), runStart, finish], run: [runStart, finish] };
}

function distance(a: Point, b: Point): number {
    return Math.hypot(b.x - a.x, b.y - a.y);
}

function towards(from: Point, to: Point, length: number): Point {
    const k = length / distance(from, to);
    return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
}

export function midpoint(a: Point, b: Point): Point {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function roundedPath(points: Point[]): string {
    const [first, ...rest] = points;
    const last = points[points.length - 1];
    let path = `M ${first.x} ${first.y}`;
    rest.slice(0, -1).forEach((corner, index) => {
        const previous = points[index];
        const next = points[index + 2];
        const r = Math.min(CORNER_RADIUS, distance(previous, corner) / 2, distance(corner, next) / 2);
        if (r === 0) {
            path += ` L ${corner.x} ${corner.y}`;
            return;
        }
        const a = towards(corner, previous, r);
        const b = towards(corner, next, r);
        path += ` L ${a.x} ${a.y} Q ${corner.x} ${corner.y} ${b.x} ${b.y}`;
    });
    return `${path} L ${last.x} ${last.y}`;
}

export interface LinkChips {
    // Sequence numbers sit at the middle of the final run; pills too, staggered along a vertical run when edges are bowed apart.
    chipPoint: Point;
    pillPoint: Point;
}

export function linkRoute(link: TopologyLinkModel): Route & LinkChips {
    const bow = link.bow * ARRIVAL_BOW_PX;
    const drawn = route(link.start ?? link.getFirstPoint().getPosition(), link.getLastPoint().getPosition(), link.via, bow, link.vertical);
    const chipPoint = midpoint(drawn.run[0], drawn.run[1]);
    const pillPoint = link.vertical ? { x: chipPoint.x, y: chipPoint.y + bow } : chipPoint;
    return { ...drawn, chipPoint, pillPoint };
}
