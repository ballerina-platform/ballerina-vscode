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

import type { IconDescriptor } from "../interfaces/extended-lang-client";
import { isLightTheme } from "./theme-utils";

/** Matches the root `<svg>` start tag, with or without a namespace prefix (`<svg:svg ...>`). */
const SVG_ROOT_START = /^<(?:[A-Za-z_][\w.-]*:)?svg[\s/>]/i;

/**
 * Walks past one prologue construct at `start` — a comment, a processing instruction (the `<?xml?>`
 * declaration included) or a declaration such as `<!DOCTYPE>`, along with any leading whitespace —
 * and returns where it ends. Returns `start` when nothing there is prologue, and `-1` when the
 * construct is never closed.
 */
function skipPrologueConstruct(svg: string, start: number): number {
    let at = start;
    while (at < svg.length && /\s/.test(svg[at])) {
        at++; // leading whitespace, and the BOM, which `\s` covers
    }
    if (svg.startsWith("<!--", at)) {
        const end = svg.indexOf("-->", at + 4);
        return end < 0 ? -1 : end + 3;
    }
    if (svg.startsWith("<?", at)) {
        const end = svg.indexOf("?>", at + 2);
        return end < 0 ? -1 : end + 2;
    }
    if (svg.startsWith("<!", at)) {
        // A DOCTYPE may carry an internal subset, whose own ">" characters don't end the
        // declaration; skip to the "]" that closes the subset before looking for it.
        let end = svg.indexOf(">", at);
        const subsetStart = svg.indexOf("[", at);
        if (subsetStart >= 0 && end >= 0 && subsetStart < end) {
            const subsetEnd = svg.indexOf("]", subsetStart);
            end = subsetEnd < 0 ? -1 : svg.indexOf(">", subsetEnd);
        }
        return end < 0 ? -1 : end + 1;
    }
    return at;
}

/**
 * Trims an SVG document down to its root `<svg>` element, or returns `undefined` when the string
 * holds no SVG at all.
 *
 * The connector-authored SVGs that reach us through `trigger-ui-metadata` routinely carry a license
 * comment ahead of their `<?xml version="1.0"?>` declaration. XML allows the declaration only as the
 * very first thing in a document, so such a file is fatally ill-formed, and every strict consumer —
 * a browser decoding `image/svg+xml`, `DOMParser`, an XML-aware icon pipeline — discards the whole
 * image on the parse error, with no console trace to explain the blank that results.
 *
 * The prologue is stepped over construct by construct rather than searched for a `<svg` needle, so
 * any number of comments, processing instructions and declarations are handled in any order, and a
 * comment that merely quotes `<svg ...>` in its text cannot be mistaken for the root element. A
 * DOCTYPE is dropped with the rest of the prologue; an internal subset defining entities the body
 * then references would not survive, which no icon we ship does.
 */
export function normalizeSvgDocument(svg?: string): string | undefined {
    if (!svg) {
        return undefined;
    }
    let at = 0;
    for (;;) {
        const next = skipPrologueConstruct(svg, at);
        if (next < 0) {
            return undefined; // unterminated prologue: the document is beyond repair
        }
        if (next === at) {
            break;
        }
        at = next;
    }
    const root = svg.slice(at);
    return SVG_ROOT_START.test(root) ? root : undefined;
}

const SAFE_COLOR = /^(?:#[0-9a-f]{3,8}|[a-z]+)$/i;

/**
 * Returns the index just past the root element's start tag, or `-1` when it is never closed. Quoted
 * attribute values are stepped over, since XML permits a raw ">" inside one.
 */
function rootStartTagEnd(svg: string): number {
    let quote: string | undefined;
    for (let at = 0; at < svg.length; at++) {
        const char = svg[at];
        if (quote) {
            if (char === quote) {
                quote = undefined;
            }
        } else if (char === '"' || char === "'") {
            quote = char;
        } else if (char === ">") {
            return at + 1;
        }
    }
    return -1;
}

function tintSvg(root: string, color: string): string {
    const painted = root.replace(/currentColor/g, color);
    const contentStart = rootStartTagEnd(painted);
    if (contentStart < 0 || painted[contentStart - 2] === "/") {
        return painted; // an empty root: no element content to repaint
    }
    const style = `<style>*:not([fill="none"]){fill:${color} !important}</style>`;
    return painted.slice(0, contentStart) + style + painted.slice(contentStart);
}

/**
 * Turns an SVG document — an `IconDescriptor`'s `light`/`dark` member — into an `<img>`-ready data
 * URI, or `undefined` when there is no SVG to render.
 *
 * `color` repaints the mark in the connector's brand color. It is declared only for the monochrome
 * marks it makes sense for, so flattening the document to a single fill is the intended result.
 */
export function toSvgDataUri(svg?: string, color?: string): string | undefined {
    const root = normalizeSvgDocument(svg);
    if (!root) {
        return undefined;
    }
    const painted = color && SAFE_COLOR.test(color) ? tintSvg(root, color) : root;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(painted)}`;
}

/**
 * Picks the SVG a connector's {@link IconDescriptor} should render under the active VS Code theme
 * and returns it as an `<img>`-ready data URI, or `undefined` when the descriptor carries no usable
 * SVG.
 *
 * A connector may ship only one of the pair. The other theme's document is then used rather than
 * nothing: an icon drawn for the opposite background still reads as the connector's mark, which the
 * generic kind glyph that would otherwise appear does not.
 */
export function toThemedSvgDataUri(descriptor?: IconDescriptor): string | undefined {
    const preferred = isLightTheme() ? descriptor?.light : descriptor?.dark;
    const alternate = isLightTheme() ? descriptor?.dark : descriptor?.light;
    return toSvgDataUri(preferred ?? alternate, descriptor?.color);
}
