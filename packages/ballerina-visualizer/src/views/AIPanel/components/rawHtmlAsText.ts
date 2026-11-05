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

// Our own tags and comments stay HTML for rehype-raw; any other tag in a reply is shown as written.
const KEEP_AS_HTML = /^<(\/?(badge|error)\b|!--)/i;

interface MdNode {
    type: string;
    value?: string;
    children?: MdNode[];
}

/**
 * Remark plugin: turns raw HTML nodes into text after parsing. Escaping the markdown string instead
 * left `&lt;id&gt;` on screen inside code, where markdown does not decode entities.
 */
export function remarkRawHtmlAsText() {
    return (tree: MdNode): void => {
        const walk = (node: MdNode): void => {
            if (node.type === "html" && !KEEP_AS_HTML.test((node.value ?? "").trim())) {
                node.type = "text";
            }
            node.children?.forEach(walk);
        };
        walk(tree);
    };
}
