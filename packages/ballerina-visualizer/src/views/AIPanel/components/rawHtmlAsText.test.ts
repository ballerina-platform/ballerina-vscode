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

import { remarkRawHtmlAsText } from "./rawHtmlAsText";

// react-markdown is ESM-only and not transformed here, so the tree is the one remark builds for
// "Returns `error(\"'<id>'\")` for List<string>, <b>bold</b> and <badge data-type=\"x\">Agent</badge>".
const html = (value: string) => ({ type: "html", value });

it("shows a reply's raw tags as text and keeps our badge, error and comment tags as HTML", () => {
    const tree = {
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
        "html:<!-- note -->",
    ]);
    expect(types(tree.children.slice(1))).toEqual(["html:<error>\nfailed\n</error>", "text:<script>alert(1)</script>"]);
});
