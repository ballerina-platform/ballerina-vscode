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

import {
    StringLiteral,
    STNode,
    Visitor
} from "@wso2/syntax-tree";
import { Range } from "vscode";

export class SplitProviderVisitor implements Visitor {
    range: Range;
    validSplit: boolean = false;

    // The edited document's line ending, which need not be the operating system's.
    constructor(range: Range, private readonly eol: string) {
        this.range = range;
    }

    public beginVisitStringLiteral(node: StringLiteral, parent?: STNode) {
        if (node.position.startLine === this.range.start.line && node.position.startColumn <= this.range.start.character &&
            node.position.endLine === this.range.end.line && node.position.endColumn >= this.range.end.character) {
            if (node.position.endColumn === this.range.end.character &&
                (node.source.startsWith(`"${this.eol}`) || !node.source.endsWith(`"${this.eol}`))) {
                this.validSplit = true;
            }
        }
    }

    public isValidSplit(): boolean {
        return this.validSplit;
    }
}
