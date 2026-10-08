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

import styled from "@emotion/styled";
import { ThemeColors } from '@wso2/ui-toolkit';

interface LabelProps {
  active: boolean;
}

// Labels stay in flow so the switcher sizes from its text: the Slider lays them out in two
// equal columns as wide as the longer label, and the thumb covers exactly one column. A label
// wider than MAX_LABEL_WIDTH is ellipsized (the full name is in its title), so no mode name,
// however long, can overlap its neighbour or push the switcher out of the panel.
const MAX_LABEL_WIDTH = '96px';

const thumbOffset = (checked: boolean) => checked ? 'translateX(100%)' : 'translateX(0)';

export const Label = styled.span<LabelProps>`
  position: relative;
  z-index: 1;
  box-sizing: border-box;
  min-width: 0;
  max-width: ${MAX_LABEL_WIDTH};
  padding: 0 6px;
  text-align: center;
  font-size: 10px;
  transition: all 0.2s ease;
  color: ${props => props.active ? ThemeColors.ON_SURFACE : ThemeColors.ON_SURFACE_VARIANT};
  font-weight: ${props => props.active ? '600' : '500'};
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  /* The active label is bolder, so size every label for its bold text (via an invisible
     zero-height copy); otherwise the columns, and the whole switcher, resize on each toggle. */
  &::after {
    content: attr(data-text);
    display: block;
    height: 0;
    overflow: hidden;
    visibility: hidden;
    font-weight: 600;
  }
`;

export const Slider = styled.div<{ checked: boolean }>`
  position: relative;
  flex: 1;
  box-sizing: border-box;
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  align-items: center;
  background-color: ${ThemeColors.SURFACE_CONTAINER};
  color: ${ThemeColors.ON_SURFACE};
  font-weight: 500;
  border-radius: 2px;
  padding: 2px;
  transition: all 0.2s ease;
  border: 1px solid ${ThemeColors.OUTLINE_VARIANT};

  &:before {
    content: "";
    position: absolute;
    box-sizing: border-box;
    top: 2px;
    bottom: 2px;
    left: 2px;
    width: calc(50% - 2px);
    transform: ${props => thumbOffset(props.checked)};
    border-radius: 1px;
    background: ${ThemeColors.SURFACE_DIM};
    transition: all 0.25s cubic-bezier(0.4, 0.0, 0.2, 1);
    z-index: 0;
    border: 1px solid ${ThemeColors.OUTLINE};
  }

  &:active:before {
    background: ${ThemeColors.SURFACE_DIM};
    box-shadow: 
      0 1px 2px rgba(0, 0, 0, 0.3),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
    transform: ${props => thumbOffset(props.checked)} translateY(1px);
  }
`;

export const SwitchWrapper = styled.div`
  font-size: 12px;
  display: inline-flex;
  flex-shrink: 0;
  min-width: 112px;
  height: 24px;
  margin-top: 2px;
`;
