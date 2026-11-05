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

// A node stays HTML only when it is exactly one of our tags or one comment. Remark puts a whole
// HTML block in one node, so a block that only starts with an allowed tag is shown as text.
const OUR_TAG = /^<\/?(badge|error)(\s+[\w-]+(="[^"<>]*")?)*\s*>$/i;
const COMMENT = /^<!--(?:(?!-->)[\s\S])*-->$/;

interface MdNode {
    type: string;
    value?: string;
    children?: MdNode[];
}

/** Remark plugin: raw HTML in a reply becomes text after parsing, so code spans keep `<id>` as written. */
export function remarkRawHtmlAsText() {
    return (tree: MdNode): void => {
        const walk = (node: MdNode): void => {
            if (node.type === "html") {
                const value = (node.value ?? "").trim();
                if (!OUR_TAG.test(value) && !COMMENT.test(value)) {
                    node.type = "text";
                }
            }
            node.children?.forEach(walk);
        };
        walk(tree);
    };
}
