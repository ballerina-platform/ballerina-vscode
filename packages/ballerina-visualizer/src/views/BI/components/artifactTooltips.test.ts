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

import { markdownToPlainText, triggerTooltip, TriggerTooltipKind } from "./artifactTooltips";

const KINDS: TriggerTooltipKind[] = ["event", "file", "mcp"];

const trigger = (documentation?: string) => ({ name: "MCP Service", moduleName: "mcp", documentation });

describe("trigger card tooltips", () => {
    it.each(KINDS)("shows the connector's documentation when present (%s)", (kind) => {
        expect(triggerTooltip(trigger("Exposes tools to agents."), kind)).toBe("Exposes tools to agents.");
    });

    it.each(KINDS)("falls back to a sentence naming the trigger when documentation is missing or empty (%s)",
        (kind) => {
            const missing = triggerTooltip(trigger(), kind);
            expect(missing).not.toBe("");
            expect(triggerTooltip(trigger(""), kind)).toBe(missing);
        });

    it("gives each kind its own fallback", () => {
        const fallbacks = KINDS.map((kind) => triggerTooltip(trigger(), kind));
        expect(new Set(fallbacks).size).toBe(KINDS.length);
    });

    it("names the module, not the card title, in the MCP fallback", () => {
        expect(triggerTooltip(trigger(), "mcp")).toBe("An MCP tool provider service using the mcp module.");
    });

    it.each([["event", "A service triggered by MCP Service events."],
        ["file", "A service triggered by the availability of files via MCP Service."]] as const)(
        "names the card title in the %s fallback", (kind, expected) => {
            expect(triggerTooltip(trigger(), kind)).toBe(expected);
        });
});

describe("Markdown in tooltips", () => {
    it.each([
        // Central summaries quoted in review.
        ["listen to [Shopify webhook notifications](https://shopify.dev/apps/webhooks).",
            "listen to Shopify webhook notifications."],
        ["The `ballerinax/trigger.slack` module provides access to the [Slack Events API](https://api.slack.com).",
            "The ballerinax/trigger.slack module provides access to the Slack Events API."],
        ["## Overview\n\nA **fast** and *simple* client.", "Overview A fast and simple client."],
        ["- one\n- two\n1. three", "one two three"],
        ["> Quoted ![logo](logo.png) with [a ref][1]", "Quoted logo with a ref"],
        ["See <https://central.ballerina.io> or <b>bold</b>.", "See https://central.ballerina.io or bold."],
    ])("shows %j as plain text", (markdown, plain) => {
        expect(markdownToPlainText(markdown)).toBe(plain);
    });

    it.each(["Listens to file_created and file_deleted events.", "Retries 3 * 2 times.", "a < b and c > d"])(
        "leaves plain text alone: %j", (text) => {
            expect(markdownToPlainText(text)).toBe(text);
        });

    it.each([undefined, "", "  \n "])("gives an empty string for %j", (text) => {
        expect(markdownToPlainText(text)).toBe("");
    });

    it("strips Markdown from trigger documentation, falling back when nothing is left", () => {
        expect(triggerTooltip(trigger("Listens to [Kafka](https://kafka.apache.org) topics."), "event"))
            .toBe("Listens to Kafka topics.");
        expect(triggerTooltip(trigger("<br>"), "mcp")).toBe(triggerTooltip(trigger(), "mcp"));
    });
});
