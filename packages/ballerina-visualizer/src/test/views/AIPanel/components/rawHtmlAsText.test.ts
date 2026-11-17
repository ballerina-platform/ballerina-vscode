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

import { remarkRawHtmlAsText } from "../../../../views/AIPanel/components/rawHtmlAsText";

// The tree remark builds; react-markdown is ESM-only and not transformed here.
const html = (value: string) => ({ type: "html", value });

it("shows a reply's raw tags as text and keeps our badge and error tags as HTML", () => {
    const tree: { type: string; children: Array<{ type: string; value?: string; children?: any[] }> } = {
        type: "root",
        children: [{
            type: "paragraph",
            children: [
                { type: "inlineCode", value: "error(\"'<id>'\")" },
                { type: "text", value: " for List" },
                html("<string>"),
                html("<b>"), { type: "text", value: "bold" }, html("</b>"),
                html("<badge data-type=\"x\">"), { type: "text", value: "Agent" }, html("</badge>"),
                html("<!-- note -->"),
            ],
        }, html("<error>\nfailed\n</error>"), html("<script>alert(1)</script>")],
    };
    remarkRawHtmlAsText()(tree);
    const types = (nodes: any[]): string[] => nodes.map((n) => `${n.type}:${n.value ?? ""}`);
    expect(types(tree.children[0].children!)).toEqual([
        "inlineCode:error(\"'<id>'\")",
        "text: for List",
        "text:<string>",
        "text:<b>", "text:bold", "text:</b>",
        "html:<badge data-type=\"x\">", "text:Agent", "html:</badge>",
        "text:<!-- note -->",
    ]);
    expect(types(tree.children.slice(1))).toEqual(["text:<error>\nfailed\n</error>", "text:<script>alert(1)</script>"]);
});

it("keeps a node as HTML only when it is exactly one badge or error tag", () => {
    const keep = [
        "<badge data-system=\"true\" data-auth=\"x\" data-type=\"command\" data-command=\"/help\">",
        "</badge>",
        "<error data-system=\"true\" data-auth=\"x\">",
        "</error>",
    ];
    const asText = [
        "<error>\n<iframe src=\"https://example.com\"></iframe>\n</error>",
        "<badge data-type=\"x\"><img src=x onerror=alert(1)>",
        "<!-- a --><img src=x onerror=alert(1)>",
        "<!-- a --><img src=x>-->",
        "<!--> <img src=x onerror=alert(1)> -->",
        "<!-- note -->",
        "<badges>",
        "<error data-x=\"a>b\">",
    ];
    const tree = { type: "root", children: [...keep, ...asText].map(html) };
    remarkRawHtmlAsText()(tree);
    expect(tree.children.map((n) => n.type)).toEqual([...keep.map(() => "html"), ...asText.map(() => "text")]);
});
