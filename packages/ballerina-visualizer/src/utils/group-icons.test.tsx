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
    Codicon: (props: any) => ({ type: 'Codicon', props }),
    getAIModuleIcon: jest.fn((): undefined => undefined),
}), { virtual: true });

import { NodeIcon, ConnectorIcon, AIModelIcon } from "@wso2/bi-diagram";
import { Codicon } from "@wso2/ui-toolkit";
import {
    applyGroupedChildIcons,
    chunkerIconFactory,
    dataLoaderIconFactory,
    getPackageKeyFromIconUrl,
    findContextIconUrl,
    shouldUseClassIcon,
    subgroupIcon,
    vectorStoreIconFactory,
} from "./group-icons";

// Assertions inspect the returned element's `type`/`props` directly rather than rendering.

describe("shouldUseClassIcon", () => {
    it.each([
        ["class badges are off (data loader/chunker/vector store/knowledge base)", false, "https://icons/a.png", "https://icons/pkg.png", false],
        ["class badges are on (model/embedding provider) and child icon differs from package icon", true, "https://icons/a.png", "https://icons/pkg.png", true],
        ["class badges are on but child icon matches the package icon", true, "https://icons/pkg.png", "https://icons/pkg.png", false],
        ["class badges are on and the child has no icon", true, undefined, "https://icons/pkg.png", false],
    ])("%s", (_name, useClassBadges, childIconUrl, packageIconUrl, expected) => {
        expect(shouldUseClassIcon(useClassBadges, childIconUrl, packageIconUrl)).toBe(expected);
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

    it("gives a child its own class badge when class badges are on (model/embedding provider)", () => {
        const group: any = {
            title: "My Group",
            items: [
                {
                    id: "1",
                    metadata: { codedata: { module: "wso2/openai", object: "OpenAiProvider" }, metadata: { icon: "https://icons/openai.png" } },
                },
            ],
        };
        applyGroupedChildIcons(group, rawItems, undefined, true);
        const childIcon: any = group.items[0].icon;
        expect(childIcon.type).toBe(ConnectorIcon);
        expect(childIcon.props.url).toBe("https://icons/openai.png");
        expect(group.items[0].contextIcon).toBeUndefined();
    });

    it("gives every child the plain node icon when class badges are off (data loader/chunker/vector store/knowledge base)", () => {
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
        applyGroupedChildIcons(group, rawItems, undefined, true);
        const childIcon: any = group.items[0].icon;
        expect(childIcon.type).toBe(NodeIcon);
        expect(childIcon.props.type).toBe("CLASS_INIT");
    });

    it("recurses into subgroups, giving each its own icon", () => {
        const leaf = { id: "1", metadata: { codedata: { node: "MODEL_PROVIDER" }, metadata: { icon: "https://icons/pkg.png" } } };
        const group: any = { title: "AWS", items: [{ title: "Bedrock", items: [{ title: "Meta", items: [leaf] }] }] };
        const raw = [{
            metadata: { label: "AWS", icon: "https://icons/pkg.png" },
            items: [{
                metadata: { label: "Bedrock", icon: "https://icons/bedrock.png" },
                items: [{ metadata: { label: "Meta", icon: "https://icons/meta.png" }, items: [leaf] }],
            }],
        }];

        applyGroupedChildIcons(group, raw, undefined, true);

        const bedrock = group.items[0];
        expect(bedrock.icon.type).toBe(ConnectorIcon);
        expect(bedrock.icon.props.url).toBe("https://icons/bedrock.png");
        expect(bedrock.icon.props.fallbackIcon.props.url).toBe("https://icons/pkg.png");
        expect(bedrock.items[0].icon.props.url).toBe("https://icons/meta.png");
        expect(bedrock.items[0].items[0].icon.type).toBe(NodeIcon);
        expect(bedrock.items[0].items[0].contextIcon.props.url).toBe("https://icons/meta.png");
    });

    const nestedTree = (leafIconUrl: string) => ({
        group: {
            title: "AWS",
            items: [{
                title: "Bedrock",
                items: [{
                    title: "Anthropic",
                    items: [{ id: "1", metadata: { codedata: { node: "MODEL_PROVIDER" }, metadata: { icon: leafIconUrl } } }],
                }],
            }],
        } as any,
        raw: [{
            metadata: { label: "AWS", icon: "https://icons/pkg.png" },
            items: [{
                metadata: { label: "Bedrock", icon: "https://icons/bedrock.png" },
                items: [{ metadata: { label: "Anthropic", icon: "https://icons/anthropic.png" }, items: [] as any[] }],
            }],
        }],
    });

    it("uses the nearest group with a different icon as a nested leaf's main icon and its own icon as the badge", () => {
        const { group, raw } = nestedTree("https://icons/anthropic.png");
        applyGroupedChildIcons(group, raw, undefined, true);
        const leaf = group.items[0].items[0].items[0];
        expect(leaf.contextIcon.props.url).toBe("https://icons/bedrock.png");
        expect(leaf.icon.props.url).toBe("https://icons/anthropic.png");
    });

    it("keeps nested leaves on the node badge and the nearest group icon when class badges are off", () => {
        const { group, raw } = nestedTree("https://icons/anthropic.png");
        applyGroupedChildIcons(group, raw);
        const leaf = group.items[0].items[0].items[0];
        expect(leaf.contextIcon.props.url).toBe("https://icons/anthropic.png");
        expect(leaf.icon.type).toBe(NodeIcon);
    });
});

describe("findContextIconUrl", () => {
    it.each([
        ["nearest ancestor differs", ["pkg", "bedrock", "anthropic"], "meta", "anthropic"],
        ["skips an ancestor that matches the leaf", ["pkg", "bedrock", "anthropic"], "anthropic", "bedrock"],
        ["skips ancestors without an icon", ["pkg", undefined], "meta", "pkg"],
        ["no ancestor differs", ["meta", "meta"], "meta", undefined],
    ])("%s", (_name, ancestors, own, expected) => {
        expect(findContextIconUrl(ancestors as (string | undefined)[], own as string)).toBe(expected);
    });
});

describe("subgroupIcon", () => {
    it("falls back from the subgroup icon to the package icon to the generic group glyph", () => {
        const icon: any = subgroupIcon("https://icons/bedrock.png", "https://icons/pkg.png");
        expect(icon.props.url).toBe("https://icons/bedrock.png");
        expect(icon.props.fallbackIcon.props.url).toBe("https://icons/pkg.png");
        expect(icon.props.fallbackIcon.props.fallbackIcon.type).toBe(Codicon);
    });

    it("uses the generic group glyph when neither icon exists", () => {
        const icon: any = subgroupIcon(undefined, undefined);
        expect(icon.type).toBe(Codicon);
        expect(icon.props.name).toBe("layers");
    });

    it("does not repeat the package icon as its own fallback", () => {
        const icon: any = subgroupIcon("https://icons/pkg.png", "https://icons/pkg.png");
        expect(icon.props.fallbackIcon.type).toBe(Codicon);
    });
});
