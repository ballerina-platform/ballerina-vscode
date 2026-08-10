/**
 * @jest-environment jsdom
 */
/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 */

import React from "react";
import { render, screen } from "@testing-library/react";

import { DiffTooltip } from "../components/DiffTooltip";
import { DIFF_ADDED_COLOR, DIFF_MODIFIED_COLOR, DIFF_REMOVED_COLOR } from "../resources/constants";
import { getDiffContainerStyles, getDiffStatePresentation, getDiffStrokeDasharray } from "../utils/node";
import { FlowNode, FlowNodeDiffState, NodeKind } from "../utils/types";

function makeNode(diffState: FlowNodeDiffState, sourceCode = "doWork();"): FlowNode {
    return {
        id: `node-${diffState}`,
        metadata: { label: "Test", description: "Test node" },
        codedata: { node: "EXPRESSION" as NodeKind, sourceCode },
        branches: [],
        returning: false,
        diffState,
    };
}

describe("review diff presentation", () => {
    it.each([
        ["added", "+", "Added", "solid", undefined, DIFF_ADDED_COLOR],
        ["removed", "−", "Removed", "dashed", "6 4", DIFF_REMOVED_COLOR],
        ["modified", "~", "Modified", "dotted", "2 2", DIFF_MODIFIED_COLOR],
    ] as const)("presents %s without relying on color", (state, symbol, label, borderStyle, dasharray, color) => {
        const node = makeNode(state);

        expect(getDiffStatePresentation(state)).toEqual({ symbol, label, borderStyle, strokeDasharray: dasharray });
        expect(getDiffContainerStyles(node)).toMatchObject({
            borderColor: color,
            borderStyle,
            outline: "1px solid var(--vscode-contrastBorder, transparent)",
        });
        expect(getDiffStrokeDasharray(node)).toBe(dasharray);
    });

    it("keeps the modified fill transparent", () => {
        expect(getDiffContainerStyles(makeNode("modified"))).toMatchObject({ backgroundColor: "transparent" });
    });

    it.each([
        ["added", "Added", "+ Added"],
        ["removed", "Removed", "− Removed"],
        ["modified", "Modified", "~ Modified"],
    ] as const)("adds a visible and accessible %s marker", (state, label, marker) => {
        render(
            <DiffTooltip node={makeNode(state)}>
                <div>Diagram content</div>
            </DiffTooltip>
        );

        expect(screen.getByRole("group", { name: `${label} diagram node` })).toBeInTheDocument();
        expect(screen.getByText(marker)).toBeInTheDocument();
    });

    it("labels the old and new source in a modified-node tooltip", () => {
        const node = makeNode("modified", "doNewWork();");
        node.diffPreviousText = "doOldWork();";

        render(
            <DiffTooltip node={node}>
                <div>Diagram content</div>
            </DiffTooltip>
        );

        expect(screen.getByText("Old")).toBeInTheDocument();
        expect(screen.getByText("doOldWork();")).toBeInTheDocument();
        expect(screen.getByText("New")).toBeInTheDocument();
        expect(screen.getByText("doNewWork();")).toBeInTheDocument();
    });
});
