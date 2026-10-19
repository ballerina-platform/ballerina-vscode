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

/**
 * markdown-it core rule that wraps inline tokens inside table cells
 * with paragraph_open/paragraph_close tokens.
 *
 * markdown-it emits:   th_open → inline → th_close
 * ProseMirror needs:   th_open → paragraph_open → inline → paragraph_close → th_close
 *
 * Table cells with cellContent "paragraph+" require at least one paragraph.
 * Without this wrapper the inline content is rejected by the schema and
 * cells are silently dropped.
 */
export function registerTableCellParagraphRule(md: any): void {
    md.core.ruler.push("table_cell_paragraph_wrap", (state: any) => {
        const tokens = state.tokens;
        const result: any[] = [];

        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            const isCellOpen = token.type === "th_open" || token.type === "td_open";
            const nextIsInline = i + 1 < tokens.length && tokens[i + 1].type === "inline";
            const afterIsClose = i + 2 < tokens.length &&
                (tokens[i + 2].type === "th_close" || tokens[i + 2].type === "td_close");

            if (isCellOpen && nextIsInline && afterIsClose) {
                result.push(token);

                const pOpen = new state.Token("paragraph_open", "p", 1);
                pOpen.block = true;
                result.push(pOpen);

                result.push(tokens[i + 1]);

                const pClose = new state.Token("paragraph_close", "p", -1);
                pClose.block = true;
                result.push(pClose);

                result.push(tokens[i + 2]);
                i += 2;
            } else {
                result.push(token);
            }
        }

        state.tokens = result;
    });
}
