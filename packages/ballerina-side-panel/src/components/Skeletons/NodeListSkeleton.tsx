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

import React from "react";
import styled from "@emotion/styled";
import { ThemeColors } from "@wso2/ui-toolkit";
import { SkeletonBase } from "./styles";

const CategorySection = styled.div`
    margin-bottom: 16px;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 5px;
`;

const CategoryHeaderSkeleton = styled.div`
    padding: 12px;
`;

const CategoryTitleSkeleton = styled(SkeletonBase)`
    width: 120px;
    height: 14px;
    border-radius: 2px;
`;

const GridPadding = styled.div`
    padding: 12px;
`;

const Grid = styled.div`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    width: 100%;
    margin-top: 8px;
    margin-bottom: 12px;
`;

const ItemSkeleton = styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 5px;
    padding: 5px;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 5px;
    height: 36px;
`;

const IconSkeleton = styled(SkeletonBase)`
    width: 16px;
    height: 16px;
    border-radius: 50%;
    margin: 0 4px;
    flex-shrink: 0;
`;

const TitleSkeleton = styled(SkeletonBase)<{ width?: string }>`
    width: ${({ width = "70%" }) => width};
    height: 12px;
    border-radius: 2px;
`;

const TITLE_WIDTHS = ["70%", "85%", "60%", "75%"];

export const NodeGridSkeleton = ({ startIndex = 0 }: { startIndex?: number }) => (
    <Grid>
        {Array.from({ length: 4 }).map((_, i) => (
            <ItemSkeleton key={i}>
                <IconSkeleton />
                <TitleSkeleton width={TITLE_WIDTHS[(startIndex + i) % TITLE_WIDTHS.length]} />
            </ItemSkeleton>
        ))}
    </Grid>
);

const CategorySkeleton = ({ startIndex }: { startIndex: number }) => (
    <CategorySection>
        <CategoryHeaderSkeleton>
            <CategoryTitleSkeleton />
        </CategoryHeaderSkeleton>
        <GridPadding>
            <NodeGridSkeleton startIndex={startIndex} />
        </GridPadding>
    </CategorySection>
);

export const NodeListSkeleton = () => (
    <>
        {Array.from({ length: 3 }).map((_, i) => (
            <CategorySkeleton key={i} startIndex={i} />
        ))}
    </>
);

export default NodeListSkeleton;
