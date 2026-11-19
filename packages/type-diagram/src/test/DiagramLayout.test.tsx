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
import { act, render } from "@testing-library/react";
import { Type } from "@wso2/ballerina-core";
import { TypeDiagram } from "../Diagram";

// A stand-in for a node: its type's id and source range, and a position the layout or a refresh can set.
function mockNode(type: Type) {
    const position = { x: 0, y: 0 };
    return {
        lineRange: type.codedata?.lineRange,
        getID: () => type.name,
        getX: () => position.x,
        getY: () => position.y,
        setPosition: (x: number, y: number) => {
            position.x = x;
            position.y = y;
        },
    };
}

// A stand-in for a diagram model: enough of the API the diagram calls, an id to tell models apart, and a node for
// each type it was built from.
function mockModel(id: number, typeModel: Type[] = []) {
    const nodes = typeModel.map(mockNode);
    return {
        id,
        getNodes: () => nodes,
        getNode: (nodeId: string) => nodes.find((node) => node.getID() === nodeId),
        addLayer: jest.fn(),
        removeLayer: jest.fn(),
        getLayers: () => [] as unknown[],
        getZoomLevel: () => 100,
        setZoomLevel: jest.fn(),
        getOffsetX: () => 0,
        getOffsetY: () => 0,
        setOffset: jest.fn(),
    };
}

let mockModelCount = 0;
const mockEngine = {
    model: undefined as ReturnType<typeof mockModel> | undefined,
    setModel(model: ReturnType<typeof mockModel>) { this.model = model; },
    getModel() { return this.model; },
    repaintCanvas: jest.fn(),
    getCanvas: (): unknown => undefined,
    zoomToFitNodes: jest.fn(),
};
const mockRedistribute = jest.fn();

jest.mock("../utils", () => ({
    createEntitiesEngine: () => mockEngine,
    entityModeller: (typeModel: Type[]) => ({ model: mockModel(++mockModelCount, typeModel) }),
}));
jest.mock("../utils/model-mapper/entityModelMapper", () => ({ graphqlModeller: () => mockModel(++mockModelCount) }));
jest.mock("../utils/utils", () => ({ focusToNode: jest.fn() }));
jest.mock("../utils/CanvasStyles", () => ({ DiagramContainer: "div", useStyles: () => ({}) }));
jest.mock("../resources/constants", () => ({ dagreEngine: { redistribute: (model: unknown) => mockRedistribute(model) } }));
jest.mock("../resources/assets/font/fonts.css", () => ({}));
jest.mock("../components/common", () => ({ DesignDiagramContext: (props: { children: unknown }) => props.children }));
jest.mock("../components/Controls/DiagramControls", () => ({ DiagramControls: () => null }));
jest.mock("../components/OverlayLoader", () => ({ OverlayLayerModel: class {} }));
jest.mock("../components/FilteringInfoBanner", () => ({ FilteringInfoBanner: () => null }));
jest.mock("@wso2/ui-toolkit", () => ({
    NavigationWrapperCanvasWidget: () => null,
    ProgressRing: () => null,
    ThemeColors: {},
}));

const book = (line: number): Type => ({
    name: "Book",
    codedata: { node: "RECORD", lineRange: { fileName: "main.bal", startLine: { line, offset: 0 },
        endLine: { line: line + 3, offset: 1 } } },
    members: [],
} as unknown as Type);

function diagram(typeModel: Type[]) {
    return <TypeDiagram typeModel={typeModel} goToSource={jest.fn()} onTypeEdit={jest.fn()}
        onTypeDelete={jest.fn()} verifyTypeDelete={jest.fn()} />;
}

describe("TypeDiagram layout", () => {
    beforeEach(() => {
        jest.useFakeTimers();
        mockEngine.model = undefined;
        mockRedistribute.mockClear();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it("an update that only moves types while the first layout is pending leaves the latest model laid out", () => {
        const { rerender } = render(diagram([book(10)]));
        // An edit above the type moves it in source but changes nothing on the canvas, inside the layout's delay.
        rerender(diagram([book(14)]));
        const latest = mockEngine.getModel();
        act(() => {
            jest.runAllTimers();
        });
        expect(mockEngine.getModel()).toBe(latest);
        expect(mockRedistribute).toHaveBeenCalledTimes(1);
        expect(mockRedistribute).toHaveBeenCalledWith(latest);
    });

    it("an update after the layout has run refreshes in place, with no second layout", () => {
        const { rerender } = render(diagram([book(10)]));
        act(() => {
            jest.runAllTimers();
        });
        // Where the layout put the node.
        const laidOut = mockEngine.getModel();
        laidOut.getNode("Book").setPosition(40, 60);

        rerender(diagram([book(14)]));
        const refreshed = mockEngine.getModel();
        act(() => {
            jest.runAllTimers();
        });
        expect(mockEngine.getModel()).toBe(refreshed);
        expect(mockRedistribute).toHaveBeenCalledTimes(1);
        // A new model carries the moved source range, and the node stays where the layout put it.
        expect(refreshed).not.toBe(laidOut);
        const node = refreshed.getNode("Book");
        expect(node.lineRange.startLine.line).toBe(14);
        expect([node.getX(), node.getY()]).toEqual([40, 60]);
        expect(refreshed.setZoomLevel).toHaveBeenCalledWith(laidOut.getZoomLevel());
    });
});
