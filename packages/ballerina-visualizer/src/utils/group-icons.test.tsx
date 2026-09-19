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

// @wso2/bi-diagram and @wso2/ui-toolkit build to ESM, which jest can't parse here; stub with prop-echoing stand-ins.
jest.mock('@wso2/bi-diagram', () => ({
    NodeIcon: (props: any) => ({ type: 'NodeIcon', props }),
    ConnectorIcon: (props: any) => ({ type: 'ConnectorIcon', props }),
    AIModelIcon: (props: any) => ({ type: 'AIModelIcon', props }),
}), { virtual: true });
jest.mock('@wso2/ui-toolkit', () => ({
    getAIModuleIcon: jest.fn((): undefined => undefined),
}), { virtual: true });

import { NodeIcon, ConnectorIcon, AIModelIcon } from "@wso2/bi-diagram";
import {
    applyGroupedChildIcons,
    chunkerIconFactory,
    dataLoaderIconFactory,
    getPackageKeyFromIconUrl,
    shouldUseClassIcon,
    vectorStoreIconFactory,
} from "./group-icons";

// Assertions inspect the returned element's `type`/`props` directly rather than rendering.

describe("shouldUseClassIcon", () => {
    it.each([
        ["group has an icon factory (data loader/chunker/vector store/knowledge base)", true, "https://icons/a.png", "https://icons/pkg.png", false],
        ["group has no icon factory (model/embedding provider) and child icon differs from package icon", false, "https://icons/a.png", "https://icons/pkg.png", true],
        ["group has no icon factory but child icon matches the package icon", false, "https://icons/pkg.png", "https://icons/pkg.png", false],
        ["group has no icon factory and the child has no icon", false, undefined, "https://icons/pkg.png", false],
    ])("%s", (_name, hasGroupIconFactory, childIconUrl, packageIconUrl, expected) => {
        expect(shouldUseClassIcon(hasGroupIconFactory, childIconUrl, packageIconUrl)).toBe(expected);
    });
});

describe("getPackageKeyFromIconUrl", () => {
    it.each([
        ["well-formed central icon URL", "https://cdn/icons/wso2_ai.openai_1.2.0.png", "ai.openai"],
        ["URL missing the version segment", "https://cdn/icons/wso2_ai.png", undefined],
        ["undefined URL", undefined, undefined],
    ])("%s", (_name, iconUrl, expected) => {
        expect(getPackageKeyFromIconUrl(iconUrl)).toBe(expected);
    });
});

describe("dataLoaderIconFactory", () => {
    it("renders the package icon for a published data loader with an icon URL", () => {
        const el: any = dataLoaderIconFactory({ module: "wso2/loader" }, "https://icons/loader.png");
        expect(el.type).toBe("img");
        expect(el.props.src).toBe("https://icons/loader.png");
    });

    it("falls back to the DATA_LOADER node icon for the built-in ai module", () => {
        const el: any = dataLoaderIconFactory({ module: "ai" }, "https://icons/loader.png");
        expect(el.type).toBe(NodeIcon);
        expect(el.props.type).toBe("DATA_LOADER");
    });

    it("falls back to the DATA_LOADER node icon for the built-in ai.devant module", () => {
        const el: any = dataLoaderIconFactory({ module: "ai.devant" }, "https://icons/loader.png");
        expect(el.type).toBe(NodeIcon);
        expect(el.props.type).toBe("DATA_LOADER");
    });

    it("falls back to the DATA_LOADER node icon when there is no icon URL", () => {
        const el: any = dataLoaderIconFactory({ module: "wso2/loader" }, undefined);
        expect(el.type).toBe(NodeIcon);
        expect(el.props.type).toBe("DATA_LOADER");
    });
});

describe("chunkerIconFactory", () => {
    it("renders the package icon for a published chunker with an icon URL", () => {
        const el: any = chunkerIconFactory({ module: "wso2/chunker" }, "https://icons/chunker.png");
        expect(el.type).toBe("img");
        expect(el.props.src).toBe("https://icons/chunker.png");
    });

    it("falls back to the CHUNKER node icon for the built-in ai module", () => {
        const el: any = chunkerIconFactory({ module: "ai" }, "https://icons/chunker.png");
        expect(el.type).toBe(NodeIcon);
        expect(el.props.type).toBe("CHUNKER");
    });

    it("falls back to the CHUNKER node icon for the built-in ai.devant module", () => {
        const el: any = chunkerIconFactory({ module: "ai.devant" }, "https://icons/chunker.png");
        expect(el.type).toBe(NodeIcon);
        expect(el.props.type).toBe("CHUNKER");
    });

    it("falls back to the CHUNKER node icon when there is no icon URL", () => {
        const el: any = chunkerIconFactory({ module: "wso2/chunker" }, undefined);
        expect(el.type).toBe(NodeIcon);
        expect(el.props.type).toBe("CHUNKER");
    });
});

describe("vectorStoreIconFactory", () => {
    it("uses the VECTOR_STORE node icon for the built-in ai module", () => {
        const el: any = vectorStoreIconFactory({ module: "ai" }, "https://icons/store.png");
        expect(el.type).toBe(NodeIcon);
        expect(el.props.type).toBe("VECTOR_STORE");
    });

    it("uses the per-class AI model icon for a non-built-in vector store", () => {
        const el: any = vectorStoreIconFactory({ module: "wso2/pinecone" }, "https://icons/store.png");
        expect(el.type).toBe(AIModelIcon);
        expect(el.props.type).toBe("wso2/pinecone");
    });
});

describe("applyGroupedChildIcons", () => {
    const rawItems = [
        { metadata: { label: "My Group", icon: "https://icons/pkg.png" } },
    ];

    it("gives the group its package icon when the catalog entry carries one", () => {
        const group: any = { title: "My Group", items: [] };
        applyGroupedChildIcons(group, rawItems);
        expect(group.icon.type).toBe(ConnectorIcon);
        expect(group.icon.props.url).toBe("https://icons/pkg.png");
    });

    it("falls back to the group icon factory when the catalog carries no package icon", () => {
        const group: any = {
            title: "My Group",
            items: [{ id: "1", metadata: { codedata: { module: "ai" }, metadata: {} } }],
        };
        applyGroupedChildIcons(group, [{ metadata: { label: "My Group" } }], vectorStoreIconFactory);
        expect(group.icon.type).toBe(NodeIcon);
        expect(group.icon.props.type).toBe("VECTOR_STORE");
    });

    it("leaves the group icon unset when there is neither a package icon nor a group icon factory", () => {
        const group: any = { title: "My Group", items: [] };
        applyGroupedChildIcons(group, [{ metadata: { label: "My Group" } }]);
        expect(group.icon).toBeUndefined();
    });

    it("gives a child its own class badge when the group has no icon factory (model/embedding provider)", () => {
        const group: any = {
            title: "My Group",
            items: [
                {
                    id: "1",
                    metadata: { codedata: { module: "wso2/openai", object: "OpenAiProvider" }, metadata: { icon: "https://icons/openai.png" } },
                },
            ],
        };
        applyGroupedChildIcons(group, rawItems);
        const childIcon: any = group.items[0].icon;
        expect(childIcon.type).toBe(ConnectorIcon);
        expect(childIcon.props.url).toBe("https://icons/openai.png");
    });

    it("gives every child the plain node icon when the group has an icon factory (data loader/chunker/vector store/knowledge base)", () => {
        const group: any = {
            title: "My Group",
            items: [
                {
                    id: "1",
                    metadata: { codedata: { module: "wso2/loader", node: "DATA_LOADER_CALL" }, metadata: { icon: "https://icons/loader.png" } },
                },
            ],
        };
        applyGroupedChildIcons(group, rawItems, dataLoaderIconFactory);
        const childIcon: any = group.items[0].icon;
        expect(childIcon.type).toBe(NodeIcon);
        expect(childIcon.props.type).toBe("DATA_LOADER_CALL");
    });

    it("gives a child the plain node icon when its icon URL matches the group's package icon", () => {
        const group: any = {
            title: "My Group",
            items: [
                {
                    id: "1",
                    metadata: { codedata: { module: "wso2/openai", node: "CLASS_INIT" }, metadata: { icon: "https://icons/pkg.png" } },
                },
            ],
        };
        applyGroupedChildIcons(group, rawItems);
        const childIcon: any = group.items[0].icon;
        expect(childIcon.type).toBe(NodeIcon);
        expect(childIcon.props.type).toBe("CLASS_INIT");
    });
});
