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

import React, { useEffect } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import hljs from "highlight.js";
import yaml from "highlight.js/lib/languages/yaml";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import Badge from "./ChatBadge";
// @ts-ignore
import ballerina from "../../../languages/ballerina.js";
import { SYSTEM_BADGE_SECRET, SYSTEM_ERROR_SECRET } from "./AIChatInput/constants";
import ErrorBox from "./ErrorBox";
import { ColorThemeKind } from "@wso2/ballerina-core";

// Register custom languages with highlight.js
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("ballerina", ballerina);

// Escapes HTML tags except our custom <badge> and <error> tags
// Uses context-aware detection to distinguish HTML tags from generic type parameters
const escapeHtmlForCustomTags = (markdown: string): string => {
    return markdown.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (match, tagName, offset, fullString) => {
        // Preserve our custom tags - they need to be processed by rehypeRaw
        if (tagName.toLowerCase() === 'badge' || tagName.toLowerCase() === 'error') {
            return match;
        }

        // Check character before '<' - if it's a word character, it's likely a generic type
        // Examples: "convert<ABCType>", "List<String>", "Map<int, string>"
        const charBefore = offset > 0 ? fullString[offset - 1] : '';
        if (/\w/.test(charBefore)) {
            return match; // Don't escape - likely generic type parameter
        }

        // Escape standalone HTML tags (preceded by space, newline, or start of string)
        // Examples: "<script>", "<div>", etc.
        return match.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    });
};


interface MarkdownRendererProps {
    markdownContent: string;
}

const markdownWrapperStyle: React.CSSProperties = {
    whiteSpace: "normal",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
};

const tableStyle: React.CSSProperties = {
    borderCollapse: "collapse",
    width: "100%",
    marginBottom: "8px",
    fontSize: "13px",
};

const thStyle: React.CSSProperties = {
    border: "1px solid var(--vscode-panel-border)",
    padding: "6px 10px",
    textAlign: "left",
    fontWeight: 600,
    backgroundColor: "var(--vscode-editor-inactiveSelectionBackground)",
    color: "var(--vscode-editor-foreground)",
};

const tdStyle: React.CSSProperties = {
    border: "1px solid var(--vscode-panel-border)",
    padding: "5px 10px",
    color: "var(--vscode-editor-foreground)",
};

const headingStyles: Record<"h1" | "h2" | "h3", React.CSSProperties> = {
    h1: {
        fontSize: "18px",
        lineHeight: "26px",
        margin: "14px 0 8px",
        fontWeight: 700,
    },
    h2: {
        fontSize: "16px",
        lineHeight: "24px",
        margin: "12px 0 8px",
        fontWeight: 700,
    },
    h3: {
        fontSize: "14px",
        lineHeight: "22px",
        margin: "10px 0 6px",
        fontWeight: 650,
    },
};

const paragraphStyle: React.CSSProperties = {
    margin: "8px 0",
};

const listStyle: React.CSSProperties = {
    margin: "8px 0",
};

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ markdownContent }) => {
    const { rpcClient } = useRpcContext();

    useEffect(() => {
        /**
         * Injects the appropriate highlight.js theme stylesheet based on the current theme.
         */
        const injectHighlightTheme = (theme: string) => {
            const existingTheme = document.getElementById("hljs-theme");
            if (existingTheme) existingTheme.remove();

            const themeLink = document.createElement("link");
            themeLink.id = "hljs-theme";
            themeLink.rel = "stylesheet";
            themeLink.href =
                theme === "light"
                    ? "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css"
                    : "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css";
            document.head.appendChild(themeLink);

            // Add background override once
            if (!document.getElementById("hljs-override")) {
                const overrideStyle = document.createElement("style");
                overrideStyle.id = "hljs-override";
                overrideStyle.innerHTML = `.hljs { background: var(--vscode-editor-background) !important; }`;
                document.head.appendChild(overrideStyle);
            }
        };

        /**
         * The theme class VS Code puts on `document.body`, as "light" or "dark".
         */
        const resolveThemeFromBodyClass = (): string =>
            document.body.classList.contains("vscode-light") ||
            document.body.classList.contains("vscode-high-contrast-light")
                ? "light"
                : "dark";

        /**
         * The current theme, as "light" or "dark".
         *
         * `useRpcContext` defaults `rpcClient` to null, so any host that renders this
         * outside a VisualizerContext provider gets null rather than a client — the
         * migration wizard's AI enhancement step reaches here through the federated
         * remote, which has no provider. Fall back to the body class instead of
         * dereferencing null, and likewise when the RPC round trip fails, so a rejected
         * `getThemeKind` still yields a usable theme rather than an unhandled rejection.
         */
        const resolveTheme = async (): Promise<string> => {
            if (!rpcClient) {
                return resolveThemeFromBodyClass();
            }
            let themeKind: ColorThemeKind;
            try {
                themeKind = await rpcClient.getVisualizerRpcClient().getThemeKind();
            } catch {
                return resolveThemeFromBodyClass();
            }
            switch (themeKind) {
                case ColorThemeKind.Light:
                case ColorThemeKind.HighContrastLight:
                    return "light";
                default:
                    return "dark";
            }
        };

        /**
         * Applies theme on initial load and theme changes.
         */
        const applyCurrentTheme = async () => {
            injectHighlightTheme(await resolveTheme());
        };

        void applyCurrentTheme();

        if (!rpcClient) {
            // No client means no `onProjectContentUpdated` to hang a theme change off, so
            // watch the class VS Code rewrites on <body> instead - otherwise the fallback
            // theme is applied once at mount and a later host theme switch is never picked up.
            const observer = new MutationObserver(() => {
                void applyCurrentTheme();
            });
            observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
            return () => observer.disconnect();
        }

        // Returns an unsubscribe; without calling it every mount of this renderer leaks a
        // listener, and a streaming agent view mounts one per markdown block.
        const unsubscribe = rpcClient.onProjectContentUpdated(() => {
            void applyCurrentTheme();
        });
        return () => unsubscribe?.();
    }, [rpcClient]);

    /**
     * Custom rendering for <code> blocks with syntax highlighting
     */
    const MarkdownCodeRenderer = {
        code({ inline, className, children }: { inline?: boolean; className?: string; children: React.ReactNode }) {
            const codeContent = (Array.isArray(children) ? children.join("") : children) ?? "";
            const match = /language-(\w+)/.exec(className || "");
            // react-markdown v10+ omits `inline`; infer block by language class or newline.
            const isBlock = !inline && (!!match || String(codeContent).includes("\n"));

            if (isBlock) {
                const language = match?.[1];

                // Apply syntax highlighting if language is registered
                if (language && hljs.getLanguage(language)) {
                    return (
                        <pre>
                            <code
                                className={`hljs ${language}`}
                                dangerouslySetInnerHTML={{
                                    __html: hljs.highlight(codeContent.toString(), { language }).value,
                                }}
                            />
                        </pre>
                    );
                }

                // Fallback: render as plain text
                return (
                    <pre>
                        <code className="hljs">{codeContent}</code>
                    </pre>
                );
            }

            // Inline code with word wrapping
            return (
                <code className={className} style={markdownWrapperStyle}>
                    {children}
                </code>
            );
        },
    };

    // Custom components for markdown elements
    const getMarkdownComponents = (markdownContent: string) => ({
        badge: ({ node, children }: any) => {
            const propsMap = node?.properties || {};
            const isSystemBadge = propsMap.dataSystem === "true" && propsMap.dataAuth === SYSTEM_BADGE_SECRET;
            const badgeType = propsMap.dataType;

            if (isSystemBadge) {
                return <Badge badgeType={badgeType}>{children}</Badge>;
            }

            const start = node?.position?.start?.offset;
            const end = node?.position?.end?.offset;

            if (typeof start === "number" && typeof end === "number") {
                const rawTag = markdownContent.slice(start, end);

                return rawTag;
            }

            // Fallback if position data is missing
            return `<badge>${children}</badge>`;
        },
        error: ({ node, children }: any) => {
            const propsMap = node?.properties || {};
            const isSystemError = propsMap.dataSystem === "true" && propsMap.dataAuth === SYSTEM_ERROR_SECRET;

            if (isSystemError) {
                return <ErrorBox>{children}</ErrorBox>;
            }

            const start = node?.position?.start?.offset;
            const end = node?.position?.end?.offset;

            if (typeof start === "number" && typeof end === "number") {
                const rawTag = markdownContent.slice(start, end);

                return rawTag;
            }

            // Fallback if position data is missing
            return `<error>${children}</error>`;
        },
    });

    // Escape HTML except <badge> tags
    const safeContent = escapeHtmlForCustomTags(markdownContent);

    return (
        <div style={markdownWrapperStyle}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
                components={{
                    ...MarkdownCodeRenderer,
                    ...getMarkdownComponents(markdownContent),
                    h1: ({ children }: { children?: React.ReactNode }) => <h1 style={headingStyles.h1}>{children}</h1>,
                    h2: ({ children }: { children?: React.ReactNode }) => <h2 style={headingStyles.h2}>{children}</h2>,
                    h3: ({ children }: { children?: React.ReactNode }) => <h3 style={headingStyles.h3}>{children}</h3>,
                    p: ({ children }: { children?: React.ReactNode }) => <p style={paragraphStyle}>{children}</p>,
                    ul: ({ children }: { children?: React.ReactNode }) => <ul style={listStyle}>{children}</ul>,
                    ol: ({ children }: { children?: React.ReactNode }) => <ol style={listStyle}>{children}</ol>,
                    table: ({ children }: { children?: React.ReactNode }) => (
                        <div style={{ overflowX: "auto", marginBottom: "8px" }}>
                            <table style={tableStyle}>{children}</table>
                        </div>
                    ),
                    th: ({ children }: { children?: React.ReactNode }) => <th style={thStyle}>{children}</th>,
                    td: ({ children }: { children?: React.ReactNode }) => <td style={tdStyle}>{children}</td>,
                } as any}
            >
                {safeContent}
            </ReactMarkdown>
        </div>
    );
};

export default MarkdownRenderer;
