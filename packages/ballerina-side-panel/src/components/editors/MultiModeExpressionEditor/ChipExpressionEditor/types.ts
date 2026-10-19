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

export enum InputMode {
  TEXT = "Text",
  EXP = "Expression",
  RECORD = "Record",
  TEMPLATE = "Template",
  NUMBER = "Number",
  BOOLEAN = "Boolean",
  SQL = "SQL",
  SELECT = "Select",
  ARRAY = "Array",
  TEXT_ARRAY = "Text Array",
  PROMPT = "Prompt",
  MAP = "Map",
  SIMPLE_TEXT = "Info"
};

// Display names for the mode switcher. An InputMode value is an identifier and must stay
// unique, so wording that differs from it (or would collide with another mode) goes here.
const INPUT_MODE_LABELS: Partial<Record<InputMode, string>> = {
  [InputMode.TEXT_ARRAY]: "Array"
};

export const getInputModeLabel = (mode: InputMode): string => INPUT_MODE_LABELS[mode] ?? mode;

export const INPUT_MODE_MAP = {
  string: InputMode.TEXT,
  int: InputMode.NUMBER,
  boolean: InputMode.BOOLEAN,
  "sql:ParameterizedQuery": InputMode.SQL,
  "io:Printable": InputMode.TEXT,
  "ai:Prompt": InputMode.PROMPT
};

export enum TokenType {
  LITERAL = "literal",
  VARIABLE = "variable",
  FUNCTION = "function",
  PARAMETER = "parameter",
  START_EVENT = "start_event",
  END_EVENT = "end_event",
  TYPE_CAST = "type_cast",
  VALUE = "value",
  DOCUMENT = "document",
  PROPERTY = "property"
}

export type ExpressionColumnOffset = {
  startColumn: number;
  endColumn: number;
}

export type ExpressionTokenPosition = {
  lineNumber: number;
  column: ExpressionColumnOffset;
}

export type Token = {
  line: number;
  column: number;
  length: number;
  tokenType: 'variable'
}

export type DocumentType = 'ImageDocument' | 'FileDocument' | 'AudioDocument';

export type TokenMetadata = {
  content: string;
  fullValue: string;
  documentType?: DocumentType; // Present only for document tokens
  fields?: Record<string, string>;
};

export type ExpressionModel = {
  id: string
  value: string,
  isToken: boolean,
  startColumn: number,
  startLine: number,
  length: number,
  type: TokenType,
  isFocused?: boolean
  focusOffsetStart?: number,
  focusOffsetEnd?: number
  metadata?: TokenMetadata; // Present when type is 'document' or 'variable' with interpolation
}

export type CursorPosition = {
  start: number;
  end: number;
}

// Compound token sequence detected from multiple tokens
export type CompoundTokenSequence = {
  startIndex: number;
  endIndex: number;
  tokenType: TokenType.VARIABLE | TokenType.DOCUMENT;
  displayText: string;
  metadata: TokenMetadata;
  start: number;
  end: number;
};

// Token pattern configuration for detecting compound token sequences
export type TokenPatternExtractor =
  (tokens: any[], startIndex: number, endIndex: number, docText: string) => TokenMetadata | null;

export type TokenPattern =
  | {
    kind: 'fixed';
    name: TokenType.VARIABLE | TokenType.DOCUMENT;
    sequence: readonly TokenType[];
    extractor: TokenPatternExtractor;
    priority: number;
  }
  | {
    kind: 'anchored';
    name: TokenType.VARIABLE | TokenType.DOCUMENT;
    startSequence: readonly TokenType[];
    endType: TokenType;
    extractor: TokenPatternExtractor;
    priority: number;
  };

// Helper pane state management
export type HelperPaneState = {
  isOpen: boolean;
  top: number;
  left: number;
  isFlipped?: boolean;
  clickedChipPos?: number;
  clickedChipNode?: any;
};
