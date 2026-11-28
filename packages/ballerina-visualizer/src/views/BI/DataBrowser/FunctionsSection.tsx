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


import React, { useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import { Category, CompletionInsertText, FlowNode, FunctionKind, Imports, LineRange } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { HelperPaneCompletionItem, HelperPaneFunctionCategory, HighlightedText, InsertTarget, TypePill } from "@wso2/ballerina-side-panel";
import { Codicon, Icon } from "@wso2/ui-toolkit";
import { convertToHelperPaneFunction, extractFunctionInsertText } from "../../../utils/bi";
import { HelperPaneIconType, getHelperPaneIcon } from "../HelperPaneNew/utils/iconUtils";
import { PROBE_PROPERTY } from "./useDataTree";
import { CARD_WIDTH, S } from "./styles";
import { placeCard } from "./placement";
import { Arrow, SearchQuery, Section, dragProps } from "./tree";

export interface FunctionEntry {
    name: string;
    type?: string;
    module?: string;
    library?: string;
    keywords?: string[];
    // A call the language server can describe: the qualified name with its open parenthesis, and its imports.
    probe: { expression: string; imports?: Imports };
    // Inserts into the given field, or the focused one.
    insert: (target?: InsertTarget) => Promise<void> | void;
}

interface CommonFunction {
    name: string;
    type: string;
    imports?: Imports;
    // Words people search for that the Ballerina name does not contain ("contains" for includes).
    keywords?: string[];
}

// A short, task-grouped set; everything else is one search or the function browser away.
// Unlike string, int and float, these langlib prefixes are not predeclared.
const ARRAY: Imports = { array: "ballerina/lang.array" };
const VALUE: Imports = { value: "ballerina/lang.value" };

const COMMON_FUNCTIONS: { group: string; items: CommonFunction[] }[] = [
    {
        group: "Text",
        items: [
            { name: "string:trim", type: "string" },
            { name: "string:toUpperAscii", type: "string", keywords: ["uppercase", "capitalize"] },
            { name: "string:toLowerAscii", type: "string", keywords: ["lowercase"] },
            { name: "string:length", type: "int" },
            { name: "string:includes", type: "boolean", keywords: ["contains", "has"] },
            { name: "string:substring", type: "string" },
        ],
    },
    {
        group: "Number",
        items: [
            { name: "int:fromString", type: "int|error", keywords: ["parse", "convert"] },
            { name: "float:fromString", type: "float|error", keywords: ["parse", "convert"] },
            { name: "int:abs", type: "int" },
            { name: "float:round", type: "float" },
            { name: "int:max", type: "int" },
            { name: "int:min", type: "int" },
        ],
    },
    {
        group: "Date & Time",
        items: [
            { name: "time:utcNow", type: "time:Utc", imports: { time: "ballerina/time" }, keywords: ["now", "current", "today", "date", "timestamp"] },
            { name: "time:utcToString", type: "string", imports: { time: "ballerina/time" }, keywords: ["date", "format"] },
            { name: "time:utcFromString", type: "time:Utc|time:Error", imports: { time: "ballerina/time" }, keywords: ["date", "parse"] },
        ],
    },
    {
        group: "List",
        items: [
            { name: "array:length", imports: ARRAY, type: "int" },
            { name: "array:indexOf", imports: ARRAY, type: "int?" },
            { name: "array:reverse", imports: ARRAY, type: "any[]" },
            { name: "array:slice", imports: ARRAY, type: "any[]" },
        ],
    },
    {
        group: "JSON",
        items: [
            { name: "value:toJsonString", imports: VALUE, type: "string", keywords: ["stringify", "serialize"] },
            { name: "value:fromJsonString", imports: VALUE, type: "json|error", keywords: ["parse", "deserialize"] },
            { name: "value:toString", imports: VALUE, type: "string" },
        ],
    },
];

// Common functions are written with their langlib prefix; search rows name the module instead.
const PREFIX_MODULES: Record<string, string> = {
    string: "lang.string", int: "lang.int", float: "lang.float", array: "lang.array", value: "lang.value",
};

type InsertText = (value: string, imports?: Imports) => FunctionEntry["insert"];

const commonEntry = (fn: CommonFunction, insert: InsertText) => ({
    probe: { expression: `${fn.name}(`, imports: fn.imports },
    insert: insert(`${fn.name}()`, fn.imports),
});

// Curated functions join search when their name starts with the query or a keyword is the query.
const commonMatches = (query: string, insert: InsertText): FunctionEntry[] => {
    const q = query.trim().toLowerCase();
    return COMMON_FUNCTIONS.flatMap((group) => group.items)
        .filter((fn) => fn.name.split(":")[1].toLowerCase().startsWith(q) || fn.keywords?.includes(q))
        .map((fn) => {
            const [prefix, name] = fn.name.split(":");
            return {
                ...commonEntry(fn, insert),
                name,
                type: fn.type,
                module: PREFIX_MODULES[prefix] ?? prefix,
                library: "Standard Library",
                keywords: fn.keywords,
            };
        });
};

const SEARCH_LIMIT = 20;
const CENTRAL_DEBOUNCE_MS = 250;
const AGENT_TOOLS = "Agent Tools";

const collectLabels = (items?: any[]): string[] =>
    (items ?? []).flatMap((item) => ("items" in item ? collectLabels(item.items) : [item.metadata?.label]));

// A return type fits when it is, or is a union member equal to, the field's expected type.
const fitsType = (returnType: string | undefined, expected: string | undefined): boolean => {
    if (!returnType || !expected || expected === "any") {
        return false;
    }
    const normalise = (type: string) => type.replace(/\s/g, "").replace(/\?$/, "");
    return returnType.split("|").map(normalise).includes(normalise(expected));
};

const rankByType = (entries: FunctionEntry[], expected?: string): FunctionEntry[] =>
    [...entries].sort((a, b) => Number(fitsType(b.type, expected)) - Number(fitsType(a.type, expected)));

interface FunctionsSectionProps {
    fileName: string;
    targetLineRange: LineRange;
    codedata?: FlowNode["codedata"];
    query: string;
    target?: InsertTarget | null;
    onPreview: Preview;
    // Set when no value matches either; an empty result then offers Copilot instead of a bare note.
    onAskCopilot?: () => void;
}

export function FunctionsSection(props: FunctionsSectionProps) {
    const { fileName, targetLineRange, codedata, query, target, onPreview, onAskCopilot } = props;
    const { rpcClient } = useRpcContext();
    const [group, setGroup] = useState(COMMON_FUNCTIONS[0].group);
    const [projectFunctions, setProjectFunctions] = useState<{ name: string; type?: string; tool: boolean }[]>([]);
    const [pages, setPages] = useState(1);
    const [pinned, setPinned] = useState<string[]>([]);
    // One page beyond what is shown is always fetched, so Show More reveals rows at once instead of waiting.
    const { local, central, centralPending } = useFunctionSearch(fileName, targetLineRange, query, SEARCH_LIMIT * (pages + 1));

    useEffect(() => {
        setPages(1);
        setPinned([]);
    }, [query]);

    const insertText: InsertText = (value, imports) => (into = target) => {
        if (imports) {
            into?.addImports(imports);
        }
        into?.insert(value);
    };

    // Agent tools and the function being edited stay out of the default list; search still finds the tools.
    useEffect(() => {
        let current = true;
        const diagram = rpcClient.getBIDiagramRpcClient();
        // The language server can refuse completion where a form's code does not exist yet; the list then stays empty.
        Promise.all([
            diagram.getExpressionCompletionsNow({
                filePath: fileName,
                context: { expression: "", startLine: targetLineRange.startLine, lineOffset: 0, offset: 0, codedata, property: PROBE_PROPERTY },
                completionContext: { triggerKind: 1 },
            }).catch((): undefined => undefined),
            diagram.search({
                position: targetLineRange,
                filePath: fileName,
                queryMap: { q: "", limit: SEARCH_LIMIT, offset: 0, includeAvailableFunctions: "true", excludeLibrary: "true" },
                searchKind: "FUNCTION",
            }).catch((): undefined => undefined),
            rpcClient.getVisualizerLocation(),
        ]).then(([completions, search, location]) => {
            if (!current) {
                return;
            }
            const agentTools = new Set(collectLabels(search?.categories?.find((c) => c.metadata?.label === AGENT_TOOLS)?.items));
            setProjectFunctions(
                (completions ?? [])
                    .filter((item) => item.kind === 3)
                    .map((item) => ({ name: item.filterText ?? item.label.split("(")[0], type: item.detail }))
                    .filter((fn) => fn.name !== location?.identifier)
                    .map((fn) => ({ ...fn, tool: agentTools.has(fn.name) }))
            );
        });
        return () => {
            current = false;
        };
    }, [fileName, targetLineRange.startLine.line, targetLineRange.startLine.offset]);

    const addLibraryFunction = async (item: HelperPaneCompletionItem, into: InsertTarget | null): Promise<CompletionInsertText> => {
        const response = await rpcClient.getBIDiagramRpcClient().addFunction({
            filePath: fileName,
            codedata: item.codedata,
            kind: item.kind as FunctionKind,
            searchKind: "FUNCTION",
        });
        if (!response) {
            return { value: "" };
        }
        if (response.prefix && response.moduleId) {
            into?.addImports({ [response.prefix]: response.moduleId });
        }
        return extractFunctionInsertText(response.template);
    };

    const expected = target?.expectedType;
    const projectEntries: FunctionEntry[] = projectFunctions.map((fn) => ({
        name: fn.name,
        type: fn.type,
        module: fn.tool ? "Agent Tool" : undefined,
        library: "Current Integration",
        probe: { expression: `${fn.name}(` },
        insert: insertText(`${fn.name}()`),
    }));
    const project = projectEntries.filter((entry) => !entry.module);
    const common: FunctionEntry[] = (COMMON_FUNCTIONS.find((g) => g.group === group)?.items ?? []).map((fn) => ({
        ...commonEntry(fn, insertText),
        name: fn.name,
        type: fn.type,
    }));
    const insertSearchResult = (item: HelperPaneCompletionItem) => async (into = target) =>
        into?.insert((await addLibraryFunction(item, into)).value);
    // The index lists the integration's functions under the package name; the completion copies above carry types.
    const indexed = flattenSearch(local ?? [], insertSearchResult)
        .filter((entry) => !(/Current Integration/.test(`${entry.library} ${entry.module}`) && projectFunctions.some((fn) => fn.name === entry.name)));
    const searchResults = mergeEntries(
        rankByRelevance(mergeEntries([...projectEntries, ...commonMatches(query, insertText)], indexed), query),
        rankByRelevance(flattenSearch(central ?? [], insertSearchResult), query)
    );

    const ranked = pinFirst(rankByType(searchResults, expected), pinned);
    const shown = ranked.slice(0, SEARCH_LIMIT * pages);
    // Rows already on screen keep their places; the next page only adds below them.
    const showMore = () => {
        setPinned(shown.map(entryKey));
        setPages(pages + 1);
    };

    if (onAskCopilot && local !== undefined && !centralPending && shown.length === 0) {
        return <AskCopilot query={query} onAsk={onAskCopilot} />;
    }

    return (
        <Section title="Functions">
            {/* The default lists stay up until the first local results land, so the first keystroke never blanks the panel. */}
            {query && local !== undefined ? (
                <>
                    <FunctionList
                        entries={shown}
                        onPreview={onPreview}
                        empty={centralPending ? "Searching…" : "No functions match."}
                    />
                    {ranked.length > shown.length && (
                        <S.Link onClick={showMore}>
                            <Arrow direction="down" />
                            Show More
                        </S.Link>
                    )}
                    {centralPending && central === undefined && searchResults.length > 0 && (
                        <S.Note depth={0}>
                            <S.Spinner><Codicon name="loading" /></S.Spinner>
                            Searching Ballerina Central…
                        </S.Note>
                    )}
                </>
            ) : (
                <>
                    {project.length > 0 && <S.Group>This Integration</S.Group>}
                    <FunctionList entries={rankByType(project, expected)} onPreview={onPreview} />
                    <S.Group>Common</S.Group>
                    <S.Chips>
                        {COMMON_FUNCTIONS.map((g) => (
                            <S.Chip key={g.group} active={g.group === group} onClick={() => setGroup(g.group)}>
                                {g.group}
                            </S.Chip>
                        ))}
                    </S.Chips>
                    <FunctionList entries={rankByType(common, expected)} onPreview={onPreview} />
                </>
            )}
        </Section>
    );
}

// Search results arrive grouped by library and module; the browser shows them as one list with the module as a tag.
const flattenSearch = (
    categories: HelperPaneFunctionCategory[],
    onInsert: (item: HelperPaneCompletionItem) => FunctionEntry["insert"],
    library?: string
): FunctionEntry[] =>
    categories.flatMap((category) => [
        ...(category.items ?? []).map((item) => ({
            name: item.label,
            type: item.type,
            module: category.label,
            library: library ?? category.label,
            probe: probeOf(item),
            insert: onInsert(item),
        })),
        ...flattenSearch(category.subCategory ?? [], onInsert, library ?? category.label),
    ]);

const probeOf = (item: HelperPaneCompletionItem): FunctionEntry["probe"] => {
    const { org, module } = item.codedata ?? {};
    if (!org || !module) {
        return { expression: `${item.label}(` };
    }
    const prefix = module.split(".").pop();
    return { expression: `${prefix}:${item.label}(`, imports: { [prefix]: `${org}/${module}` } };
};

function AskCopilot({ query, onAsk }: { query: string; onAsk: () => void }) {
    return (
        <S.Empty>
            {`Nothing matches “${query}”.`}
            <S.Link onClick={onAsk}>
                <Icon name="bi-ai-chat" sx={{ width: "16px", height: "16px" }} iconSx={{ fontSize: "16px" }} />
                Ask Copilot
            </S.Link>
        </S.Empty>
    );
}

interface FunctionListProps {
    entries: FunctionEntry[];
    empty?: string;
    onPreview: Preview;
}

function FunctionList({ entries, empty, onPreview }: FunctionListProps) {
    const query = useContext(SearchQuery);
    if (entries.length === 0) {
        return empty ? <S.Note depth={0}>{empty}</S.Note> : null;
    }
    return (
        <>
            {entries.map((entry) => (
                <S.Row
                    key={entryKey(entry)}
                    role="treeitem"
                    tabIndex={-1}
                    depth={0}
                    onClick={() => {
                        onPreview.hide(true);
                        entry.insert();
                    }}
                    {...dragProps(callText(entry), (target) => entry.insert(target), () => onPreview.hide(true))}
                    onMouseEnter={(event) => onPreview.show(entry, event.currentTarget.getBoundingClientRect())}
                    onMouseLeave={() => onPreview.hide()}
                    onFocus={(event) => onPreview.show(entry, event.currentTarget.getBoundingClientRect(), true)}
                    onBlur={() => onPreview.hide(true)}
                >
                    {getHelperPaneIcon(HelperPaneIconType.FUNCTION, "16px")}
                    <S.Name>
                        <HighlightedText text={callText(entry)} query={query} />
                        {entry.module && <S.Module>{entry.module}</S.Module>}
                    </S.Name>
                    {entry.type && <S.Type title={entry.type}>{entry.type}</S.Type>}
                </S.Row>
            ))}
        </>
    );
}

interface FunctionDoc {
    label?: string;
    description: string;
}

// Descriptions never change within a session, and the language server answers each in a few hundred milliseconds.
const functionDocs = new Map<string, FunctionDoc>();

// The language server's markdown opens with a "Description" heading and ends with code examples; only the prose is kept.
const descriptionOf = (markdown = "") => markdown.replace(/\*\*Description\*\*/i, "").split("```")[0].trim();

// Long enough that sweeping the pointer across the list opens nothing; once a card is open, others open at once.
const HOVER_DELAY_MS = 400;
const LEAVE_GRACE_MS = 100;

interface ShownCard<T = FunctionEntry> {
    entry: T;
    anchor: DOMRect;
}

export interface Preview<T = FunctionEntry> {
    show: (entry: T, anchor: DOMRect, now?: boolean) => void;
    hide: (now?: boolean) => void;
}

export function useHoverCard<T>(): Preview<T> & { shown?: ShownCard<T> } {
    const [shown, setShown] = useState<ShownCard<T>>();
    const timer = useRef<ReturnType<typeof setTimeout>>();
    const open = useRef(false);
    useEffect(() => () => clearTimeout(timer.current), []);

    const set = (card?: ShownCard<T>) => {
        open.current = !!card;
        setShown(card);
    };
    return {
        shown,
        show: (entry, anchor, now) => {
            clearTimeout(timer.current);
            const reveal = () => set({ entry, anchor });
            if (now || open.current) {
                reveal();
            } else {
                timer.current = setTimeout(reveal, HOVER_DELAY_MS);
            }
        },
        hide: (now) => {
            clearTimeout(timer.current);
            if (now) {
                set(undefined);
            } else {
                timer.current = setTimeout(() => set(undefined), LEAVE_GRACE_MS);
            }
        },
    };
}

interface FunctionCardProps extends ShownCard {
    fileName: string;
    targetLineRange: LineRange;
    codedata?: FlowNode["codedata"];
}

export function FunctionCard({ entry, anchor, fileName, targetLineRange, codedata }: FunctionCardProps) {
    const { rpcClient } = useRpcContext();
    const key = `${entry.probe.expression}:${JSON.stringify(entry.probe.imports ?? {})}`;
    const [doc, setDoc] = useState<FunctionDoc | undefined>(functionDocs.get(key));

    useEffect(() => {
        setDoc(functionDocs.get(key));
        if (functionDocs.has(key)) {
            return;
        }
        let current = true;
        const { expression, imports } = entry.probe;
        rpcClient
            .getBIDiagramRpcClient()
            .getSignatureHelp({
                filePath: fileName,
                context: {
                    expression,
                    startLine: targetLineRange.startLine,
                    lineOffset: 0,
                    offset: expression.length,
                    codedata,
                    property: { ...PROBE_PROPERTY, imports },
                },
                signatureHelpContext: { isRetrigger: false, triggerKind: 1 },
            })
            .then((help) => {
                const signature = help?.signatures?.[0];
                const fetched = { label: signature?.label, description: descriptionOf(signature?.documentation?.value) };
                functionDocs.set(key, fetched);
                if (current) {
                    setDoc(fetched);
                }
            })
            // A newer request supersedes this one in the server's debounce; the row asks again when hovered next.
            .catch((): void => undefined);
        return () => {
            current = false;
        };
    }, [key]);

    return (
        <HoverCard
            anchor={anchor}
            label={doc?.label ?? callText(entry)}
            type={entry.type}
            description={doc && (doc.description || "No description available.")}
        />
    );
}

interface HoverCardProps {
    anchor: DOMRect;
    label: string;
    type?: string;
    description?: string;
}

const cardAt = (anchor: DOMRect, height: number) =>
    placeCard(anchor, { width: CARD_WIDTH, height }, { width: window.innerWidth, height: window.innerHeight });

// Beside the browser over the canvas, top-aligned with the row; under or over the row when neither side has room.
export function HoverCard({ anchor, label, type, description }: HoverCardProps) {
    const ref = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState(() => cardAt(anchor, 0));

    useLayoutEffect(() => {
        setPosition(cardAt(anchor, ref.current?.offsetHeight ?? 0));
    }, [anchor, description]);

    return createPortal(
        <S.Card ref={ref} role="tooltip" style={position}>
            <S.CardSignature>
                <span>{label}</span>
                {type && <TypePill type={type} />}
            </S.CardSignature>
            {description && (
                <S.CardText>
                    <ReactMarkdown>{description}</ReactMarkdown>
                </S.CardText>
            )}
        </S.Card>,
        document.body
    );
}

interface FunctionSearchState {
    // The query the rows answer, so a larger page for the same query keeps Central's rows while it loads.
    query?: string;
    local?: HelperPaneFunctionCategory[];
    central?: HelperPaneFunctionCategory[];
    centralPending: boolean;
}

// Each result replaces the previous query's rows only when it lands, so typing never flashes an empty list.
function useFunctionSearch(fileName: string, targetLineRange: LineRange, query: string, limit: number): FunctionSearchState {
    const { rpcClient } = useRpcContext();
    const [state, setState] = useState<FunctionSearchState>({ centralPending: false });

    useEffect(() => {
        if (!query) {
            setState({ centralPending: false });
            return;
        }
        let current = true;
        const search = (functionSource: "index" | "central") =>
            rpcClient.getBIDiagramRpcClient().search({
                position: targetLineRange,
                filePath: fileName,
                queryMap: { q: query, limit, offset: 0, includeAvailableFunctions: "true", functionSource },
                searchKind: "FUNCTION",
            }).then((response) => convertToHelperPaneFunction((response?.categories ?? []) as Category[]).category);
        setState((prev) => ({ ...prev, centralPending: true }));
        // The index is fast enough for every keystroke; only the network call waits for typing to pause.
        search("index")
            .then((local) => current && setState((prev) => ({
                ...prev,
                local,
                query,
                central: prev.query === query ? prev.central : undefined,
            })))
            .catch(() => current && setState((prev) => ({ ...prev, local: [] })));
        const timer = setTimeout(() => {
            search("central")
                .then((central) => current && setState((prev) => ({ ...prev, central, centralPending: false })))
                .catch(() => current && setState((prev) => ({ ...prev, centralPending: false })));
        }, CENTRAL_DEBOUNCE_MS);
        return () => {
            current = false;
            clearTimeout(timer);
        };
    }, [query, fileName, limit]);

    return state;
}

// Keyword-named functions arrive quoted ('join); the quote is syntax, not part of the name people search for.
const displayName = (name: string) => name.replace(/^'/, "");

const callText = (entry: FunctionEntry) => `${displayName(entry.name)}()`;

// The LS also matches descriptions; a match inside a word (KNOWledge for "now") counts as no match.
const nameScore = (name: string, q: string): number => {
    const lower = name.toLowerCase();
    const at = lower.indexOf(q);
    if (lower === q) {
        return 4;
    }
    if (at === 0) {
        return 3;
    }
    return at > 0 && name[at] !== lower[at] ? 2 : 0;
};

// Searching a module's name ("uuid", "random") is asking for that module's functions.
const moduleScore = (module: string | undefined, q: string): number => {
    const segments = (module ?? "").toLowerCase().split(".");
    if (segments[segments.length - 1] === q) {
        return 3.5;
    }
    return segments.some((segment) => segment.startsWith(q)) ? 1.5 : 0;
};

// On equal relevance, general-purpose functions beat industry packages.
const LIBRARY_RANK: Record<string, number> = {
    "Current Integration": 0,
    [AGENT_TOOLS]: 0,
    "Imported Functions": 1,
    "Standard Library": 2,
    "Extended Library": 3,
};
const sourceRank = (entry: FunctionEntry) =>
    (LIBRARY_RANK[entry.library ?? ""] ?? 4) * 2 + (entry.module?.startsWith("lang.") ? 0 : 1);

// Packages for tests, internals and specific industries rarely belong in an integration's expressions.
const NICHE_MODULE = /^(test|health\.|edi|ai\.eval)|\.(internal|management)$/;

// Results that match only on their description are dropped: `email` should not list maskSensitiveData().
const rankByRelevance = (entries: FunctionEntry[], query: string): FunctionEntry[] => {
    const q = query.trim().toLowerCase();
    const relevance = (entry: FunctionEntry) => (entry.keywords?.includes(q) ? 4.5 : 0)
        + nameScore(displayName(entry.name), q) + moduleScore(entry.module, q);
    const score = (entry: FunctionEntry) => relevance(entry)
        - (entry.library === "Extended Library" ? 1.5 : 0)
        - (NICHE_MODULE.test(entry.module ?? "") && moduleScore(entry.module, q) === 0 ? 2 : 0);
    return entries
        .filter((entry) => relevance(entry) > 0)
        .sort((a, b) => score(b) - score(a) || a.name.length - b.name.length || sourceRank(a) - sourceRank(b));
};

// Central rows that the index already returned are dropped, and new ones go after, so visible rows never move.
const entryKey = (entry: FunctionEntry) => `${entry.module ?? ""}:${entry.name}`;

const mergeEntries = (local: FunctionEntry[], central: FunctionEntry[]): FunctionEntry[] => {
    const seen = new Set(local.map(entryKey));
    return [...local, ...central.filter((entry) => !seen.has(entryKey(entry)))];
};

const pinFirst = (entries: FunctionEntry[], keys: string[]): FunctionEntry[] => {
    const byKey = new Map(entries.map((entry) => [entryKey(entry), entry]));
    const first = keys.map((key) => byKey.get(key)).filter(Boolean);
    return [...first, ...entries.filter((entry) => !keys.includes(entryKey(entry)))];
};
