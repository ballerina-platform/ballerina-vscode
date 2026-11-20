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

export const CHIP_EXPRESSION_EDITOR_HEIGHT = 38;
// A container can round every field inside it, as the expanded editor does to match its larger panels.
export const FIELD_RADIUS = "var(--field-radius, var(--vscode-cornerRadius-medium, 6px))";

// The edge of every field and of the surfaces that sit beside fields.
export const FIELD_BORDER = "var(--vscode-dropdown-border)";

// The space between a field's label or description and its input, as the expression fields lay it out.
export const FIELD_INPUT_GAP = "8px";

// The space between form fields; popups set --form-field-gap to tighten their forms.
export const FORM_FIELD_GAP = "var(--form-field-gap, 24px)";

// A field docked under a toolbar squares its top edge; everywhere else the top matches the field.
export const FIELD_TOP_RADIUS = `var(--field-top-radius, ${FIELD_RADIUS})`;
export const EXPANDED_EDITOR_HEIGHT = 500;
export const HELPER_PANE_WIDTH = 300;

// Data attributes
export const DATA_CHIP_ATTRIBUTE = 'data-chip';
export const DATA_MENU_ATTRIBUTE = 'data-menu';
export const DATA_ELEMENT_ID_ATTRIBUTE = 'data-element-id';
export const ARIA_PRESSED_ATTRIBUTE = 'aria-pressed';

// Attribute values
export const CHIP_MENU_VALUE = 'chip-menu';
export const CHIP_TRUE_VALUE = 'true';

// Special text markers for expression changes
export const BACKSPACE_MARKER = '#$BACKSPACE';
export const DELETE_MARKER = '#$DELETE';
export const ARROW_RIGHT_MARKER = '#$ARROWRIGHT';
export const ARROW_LEFT_MARKER = '#$ARROWLEFT';
export const FOCUS_MARKER = '#$FOCUS';
export const COMPLETIONS_MARKER = '#$COMPLETIONS';
export const HELPER_MARKER = '#$HELPER';
