/*
 *  Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com)
 *
 *  WSO2 LLC. licenses this file to you under the Apache License,
 *  Version 2.0 (the "License"); you may not use this file except
 *  in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing,
 *  software distributed under the License is distributed on an
 *  "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 *  KIND, either express or implied.  See the License for the
 *  specific language governing permissions and limitations
 *  under the License.
 */

import { toIconDescriptor } from "../interfaces/extended-lang-client";
import { normalizeSvgDocument, toSvgDataUri, toThemedSvgDataUri } from "../utils/icon-utils";

const decode = (dataUri: string | undefined) =>
    decodeURIComponent((dataUri ?? "").replace("data:image/svg+xml;charset=utf-8,", ""));

/** The shape every `trigger-ui-metadata` icon arrives in: a license comment ahead of the XML
 * declaration, which makes the document fatally ill-formed for an XML parser. */
const withPrologue = (body: string) => [
    "<!--",
    " ~ Copyright (c) 2026, WSO2 LLC. All Rights Reserved.",
    "-->",
    '<?xml version="1.0" encoding="UTF-8"?>',
    body,
].join("\n");

describe("normalizeSvgDocument", () => {
    const root = '<svg xmlns="http://www.w3.org/2000/svg" fill="black"/>';

    it.each([
        ["the real ftp payload: license comment ahead of the declaration", `<!--\n ~ Copyright (c) 2026, WSO2 LLC.\n-->\n<?xml version="1.0" encoding="UTF-8"?>\n${root}`],
        ["declaration first, comment after", `<?xml version="1.0"?>\n<!-- c -->\n${root}`],
        ["a public DOCTYPE", `<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "svg11.dtd">\n${root}`],
        ["a DOCTYPE whose internal subset contains '>'", `<!DOCTYPE svg [<!ENTITY a "b"> ]>\n${root}`],
        ["a byte-order mark and indentation", `\ufeff\n  ${root}`],
        ["comments and processing instructions interleaved", `<!--a--><!--b--><?xml version="1.0"?><?xml-stylesheet href="x"?><!--c-->${root}`],
        ["a comment that quotes an <svg ...> tag in its text", `<!-- e.g. <svg width="1"/> -->\n<?xml version="1.0"?>\n${root}`],
        ["no prologue at all", root],
    ])("strips %s", (_label, svg) => {
        expect(normalizeSvgDocument(svg)).toBe(root);
    });

    it("keeps a namespace-prefixed root element", () => {
        const prefixed = '<svg:svg xmlns:svg="http://www.w3.org/2000/svg"/>';

        expect(normalizeSvgDocument(`<!-- c -->\n${prefixed}`)).toBe(prefixed);
    });

    it.each([
        ["an unterminated comment", "<!-- oops\n<svg/>"],
        ["markup that is not an SVG", "<html><body/></html>"],
        ["an element merely starting with 'svg'", "<svgfoo/>"],
        ["a prologue with no root element", "<!-- just a comment -->"],
        ["whitespace only", "   \n  "],
        ["an empty string", ""],
        ["nothing", undefined],
    ])("returns undefined for %s", (_label, svg) => {
        expect(normalizeSvgDocument(svg)).toBeUndefined();
    });
});

describe("toSvgDataUri", () => {
    it("drops the prologue a connector SVG carries ahead of its root element", () => {
        const svg = withPrologue('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0,0"/></svg>');

        const decoded = decode(toSvgDataUri(svg));

        expect(decoded.startsWith("<svg ")).toBe(true);
        expect(decoded).not.toContain("<?xml");
        expect(decoded).not.toContain("Copyright");
    });

    it("keeps a well-formed SVG intact", () => {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0,0"/></svg>';

        expect(decode(toSvgDataUri(svg))).toBe(svg);
    });

    it("substitutes currentColor, which cannot resolve inside an <img>", () => {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" stroke="currentColor"/>';

        expect(decode(toSvgDataUri(svg, "#f60"))).toBe(
            '<svg xmlns="http://www.w3.org/2000/svg" fill="#f60" stroke="#f60"/>'
        );
    });

    it("repaints a mark that hardcodes its ink, as the generated aws.sqs icon does", () => {
        // The sqs pair states its ink literally — "#000000" light, "#FFFFFF" dark — so substituting
        // `currentColor` alone would leave the brand color unused and the node black.
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><path d="M0,0" fill="#000000"/></svg>';

        const decoded = decode(toSvgDataUri(svg, "#FF9900"));

        expect(decoded).toContain('<style>*:not([fill="none"]){fill:#FF9900 !important}</style>');
        expect(decoded.indexOf("<style>")).toBe(decoded.indexOf(">") + 1); // injected as the first child
        expect(decoded).toContain('<path d="M0,0" fill="#000000"/>'); // the mark itself is untouched
    });

    it("leaves the document alone when no color is declared", () => {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" fill="black"><path d="M0,0"/></svg>';

        expect(decode(toSvgDataUri(svg))).toBe(svg);
    });

    it("steps over a quoted '>' when finding the end of the root start tag", () => {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" aria-label="a > b"><path d="M0,0"/></svg>';

        expect(decode(toSvgDataUri(svg, "#f60"))).toBe(
            '<svg xmlns="http://www.w3.org/2000/svg" aria-label="a > b"><style>*:not([fill="none"]){fill:#f60 !important}</style><path d="M0,0"/></svg>'
        );
    });

    it("skips the stylesheet for an empty root, which has nothing to repaint", () => {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg"/>';

        expect(decode(toSvgDataUri(svg, "#f60"))).toBe(svg);
    });

    it("ignores a color that is not a plain hex or named value", () => {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0,0"/></svg>';

        expect(decode(toSvgDataUri(svg, '#f60"}</style><script/>'))).toBe(svg);
    });

    it("returns undefined when there is no SVG to render", () => {
        expect(toSvgDataUri(undefined)).toBeUndefined();
        expect(toSvgDataUri("")).toBeUndefined();
        expect(toSvgDataUri("not an svg at all")).toBeUndefined();
    });
});

describe("toThemedSvgDataUri", () => {
    const light = '<svg xmlns="http://www.w3.org/2000/svg" id="light"><path d="M0,0"/></svg>';
    const dark = '<svg xmlns="http://www.w3.org/2000/svg" id="dark"><path d="M0,0"/></svg>';

    /**
     * `isLightTheme` reads nothing but `document.body.classList`, and this package's suite runs in
     * jest's node environment, so a stand-in for that one call is enough to drive theme selection
     * without pulling jsdom into the package.
     */
    const setTheme = (themeClass: string) => {
        (globalThis as any).document = { body: { classList: { contains: (c: string) => c === themeClass } } };
    };

    afterEach(() => {
        delete (globalThis as any).document;
    });

    it.each([
        ["vscode-light", light],
        ["vscode-high-contrast-light", light],
        ["vscode-dark", dark],
        ["vscode-high-contrast", dark],
    ])("renders the %s document under that theme", (themeClass, expected) => {
        setTheme(themeClass);

        expect(decode(toThemedSvgDataUri({ light, dark }))).toBe(expected);
    });

    it("falls back to the other theme's document when the active one is missing", () => {
        // A connector shipping only `metadata/icons/light.svg` still shows its own mark in a dark
        // theme; the alternative is the generic kind glyph, which identifies nothing.
        setTheme("vscode-dark");

        expect(decode(toThemedSvgDataUri({ light }))).toBe(light);
    });

    it("tints the selected document with the descriptor's brand color", () => {
        setTheme("vscode-light");

        expect(decode(toThemedSvgDataUri({ light, dark, color: "#FF9900" })))
            .toContain('<style>*:not([fill="none"]){fill:#FF9900 !important}</style>');
    });

    it("normalizes a prologue the descriptor has not been through toIconDescriptor for", () => {
        setTheme("vscode-light");

        expect(decode(toThemedSvgDataUri({ light: withPrologue(light) }))).toBe(light);
    });

    it("returns undefined for a descriptor with no theme SVG, leaving url/glyph to take over", () => {
        setTheme("vscode-light");

        expect(toThemedSvgDataUri({ url: "https://example.com/ftp.png" })).toBeUndefined();
        expect(toThemedSvgDataUri(undefined)).toBeUndefined();
    });
});

describe("toIconDescriptor", () => {
    const light = '<svg xmlns="http://www.w3.org/2000/svg" fill="black"/>';
    const dark = '<svg xmlns="http://www.w3.org/2000/svg" fill="white"/>';

    it("normalizes the theme SVG pair so consumers never see the prologue", () => {
        const descriptor = toIconDescriptor({
            url: "https://example.com/ftp.png",
            source: "trigger-ui-metadata",
            light: withPrologue(light),
            dark: withPrologue(dark),
        });

        expect(descriptor).toEqual({
            url: "https://example.com/ftp.png",
            source: "trigger-ui-metadata",
            light,
            dark,
        });
    });

    describe.each(["light", "dark"] as const)("%s variant", (variant) => {
        it.each([undefined, "", "not an SVG", "<!-- unterminated"])(
            "preserves an unnormalizable value (%s) without losing the other theme",
            (svg) => {
                const icon = { light: withPrologue(light), dark: withPrologue(dark), [variant]: svg };
                const descriptor = toIconDescriptor(icon);

                expect(descriptor).toEqual({ light, dark, [variant]: svg });
            }
        );
    });

    it("reads a bare string as a legacy url", () => {
        expect(toIconDescriptor("https://example.com/ftp.png")).toEqual({ url: "https://example.com/ftp.png" });
    });

    it("passes a descriptor with no theme SVGs through untouched", () => {
        const descriptor = { glyph: "bi-ftp", color: "#f60" };

        expect(toIconDescriptor(descriptor)).toBe(descriptor);
    });

    it("returns undefined for a missing icon", () => {
        expect(toIconDescriptor(undefined)).toBeUndefined();
    });
});
