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


import React, { useContext, useEffect, useRef, useState } from "react";
import { FlowNode, LineRange, VisibleType } from "@wso2/ballerina-core";
import { ExpressionEditorDevantProps, InsertTarget, useInsertTargetContext } from "@wso2/ballerina-side-panel";
import { Codicon, Icon, SearchBox } from "@wso2/ui-toolkit";
import { HelperPaneIconType, getHelperPaneIcon } from "../HelperPaneNew/utils/iconUtils";
import { baseType, canCompare, canExpand, DataItem, hintFor, RecordStarter, useAllowedValues, useDataSearch, useDataTree, useExpectedRecords, useSuggestions } from "./useDataTree";
import { S } from "./styles";
import { CreateData, SubmitForm, useCreateData } from "./useCreateData";
import { Arrow, CanOpen, DataNode, InGroup, SearchQuery, Section, treeKeyDown } from "./tree";
import { OPERATOR_DESCRIPTIONS, OperatorsSection } from "./OperatorsSection";
import { DocumentsSection } from "./DocumentsSection";
import { FunctionCard, FunctionEntry, FunctionsSection, HoverCard, useHoverCard } from "./FunctionsSection";

interface CreateAction {
    label: string;
    run: () => void;
    title?: string;
    // Opens a view inside the picker, which stays open for it.
    inPicker?: boolean;
}

export interface DataSection {
    title: string;
    icon: HelperPaneIconType;
    roots: DataItem[];
    create?: CreateAction;
    // Opens as its own group from the start view, which holds its create action; a search still reaches its rows.
    grouped?: boolean;
}

// The flow's own values, which suggestions are drawn from.
const OWN_SECTIONS = ["Inputs", "Variables"];
const FUNCTIONS = "Functions";
const NEW_RECORD = "New Record";
// More records than this share one button that opens a list of them, so the footer never crowds out the values.
const RECORD_BUTTON_LIMIT = 3;

const shortName = (type: string) => type.split(":").pop();

// The value sections in order; WSO2 Cloud configs move out of Configurables when the form deploys there.
export const useSections = (
    rootsOf: (categories: string[]) => DataItem[],
    create: CreateData,
    canCreateVariable: boolean,
    expectedType?: string,
    cloud?: ExpressionEditorDevantProps
): DataSection[] => {
    const configurables = rootsOf(["Configurable Variables"]);
    const isCloud = (item: DataItem) => !!cloud?.devantConfigs?.includes(item.name);
    const cloudSection: DataSection = {
        title: "WSO2 Cloud Configs",
        icon: HelperPaneIconType.CONFIGURABLE,
        roots: configurables.filter(isCloud),
        create: cloud?.onAddDevantConfig && {
            label: "New WSO2 Cloud Configurable",
            run: () => create.cloudConfigurable(cloud, configurables.map((item) => item.name)),
        },
        grouped: true,
    };
    return [
        { title: "Inputs", icon: HelperPaneIconType.INPUT, roots: rootsOf(["Parameters", "Path Parameters"]) },
        {
            title: "Variables",
            icon: HelperPaneIconType.VARIABLE,
            roots: rootsOf(["Local Variables"]),
            // A variable is written through the flow's own submit, so forms outside a flow cannot add one.
            create: canCreateVariable ? { label: "New Variable", run: () => create.variable(expectedType) } : undefined,
            grouped: true,
        },
        // Module-level values are mostly constants and agents; New Variable adds to the flow, so they stay apart.
        { title: "Module Variables", icon: HelperPaneIconType.VARIABLE, roots: rootsOf(["Module Variables"]), grouped: true },
        {
            title: "Configurables",
            icon: HelperPaneIconType.CONFIGURABLE,
            roots: configurables.filter((item) => !isCloud(item)),
            create: { label: "New Configurable", run: () => create.configurable() },
            grouped: true,
        },
        ...(cloud ? [cloudSection] : []),
    ];
};

// The host's values when it looked them up already, else the browser's own lookup.
function useBrowserTree(props: DataBrowserProps) {
    const [refresh, setRefresh] = useState(0);
    const own = useDataTree(props.tree ? undefined : props.fileName, props.targetLineRange, props.codedata, refresh);
    return { tree: props.tree ?? own, refreshTree: props.onRefreshTree ?? (() => setRefresh((count) => count + 1)) };
}

// The list waits for suggestions and allowed values, so they never push it down while someone moves through it.
const isLoaded = (categories: VisibleType[] | undefined, query: string, suggestions: DataItem[] | undefined, allowed: DataItem[] | undefined) =>
    !!categories && allowed !== undefined && (!!query || suggestions !== undefined);

// In a condition, a value's enum members and strings open as comparisons with it.
const rowsFor = (tree: ReturnType<typeof useDataTree>, expectedType: string | undefined) =>
    baseType(expectedType ?? "") === "boolean" ? { canOpen: canCompare, children: tree.comparisonsOf } : { canOpen: canExpand, children: tree.childrenOf };

const allowedSection = (allowed: DataItem[] | undefined): DataSection[] =>
    allowed?.length ? [{ title: "Allowed Values", icon: HelperPaneIconType.VALUE, roots: allowed }] : [];

// Up to five of the flow's own values that fit the focused field and are named like it.
const useFieldSuggestions = (
    target: InsertTarget | null | undefined,
    sections: DataSection[],
    childrenOf: (parent: DataItem) => Promise<DataItem[]>,
    categories: VisibleType[] | undefined
) => {
    const ownRoots = sections.filter((section) => OWN_SECTIONS.includes(section.title)).flatMap((section) => section.roots);
    return useSuggestions(target?.expectedType, hintFor(target?.nameHint, target?.label ?? ""), ownRoots, childrenOf, categories);
};

function SuggestedSection({ items, onInsert, fetchFields }: { items?: DataItem[]; onInsert?: (value: string) => void; fetchFields: (parent: DataItem) => Promise<DataItem[]> }) {
    if (!items?.length) {
        return null;
    }
    return (
        <Section title="Suggested">
            {items.map((item) => (
                <DataNode key={item.path} item={{ ...item, name: item.path }} depth={0} onInsert={onInsert} fetchFields={fetchFields} />
            ))}
        </Section>
    );
}

interface ValueSectionProps {
    section: DataSection;
    items: DataItem[];
    onInsert?: (value: string) => void;
    fetchFields: (parent: DataItem) => Promise<DataItem[]>;
    onRun?: () => void;
}

// Names in a sentence are lower case, except acronyms such as WSO2.
const inSentence = (title: string) => title.replace(/\b[A-Z][a-z]/g, (start) => start.toLowerCase());

function ValueSection({ section, items, onInsert, fetchFields, onRun }: ValueSectionProps) {
    const inGroup = useContext(InGroup);
    if (items.length === 0) {
        return inGroup ? (
            <S.Empty>
                {`No ${inSentence(section.title)} found`}
                {section.create && <CreateLink action={section.create} onRun={onRun} />}
            </S.Empty>
        ) : null;
    }
    return (
        <Section title={section.title}>
            {items.map((item) => (
                <DataNode key={item.path} item={item} depth={0} onInsert={onInsert} fetchFields={fetchFields} />
            ))}
        </Section>
    );
}

// A create action opens a modal or fills the field, so the picker closes first instead of covering it.
function CreateLink({ action, onRun }: { action: CreateAction; onRun?: () => void }) {
    return (
        <S.Link
            title={action.title}
            onClick={() => {
                if (!action.inPicker) {
                    onRun?.();
                }
                action.run();
            }}
        >
            <Icon name="bi-plus" sx={{ width: "16px", height: "16px" }} iconSx={{ fontSize: "16px" }} />
            {action.label}
            {action.inPicker && <S.LinkChevron><Arrow direction="right" /></S.LinkChevron>}
        </S.Link>
    );
}

// The view's create actions: an opened group's, or on the start view a record of the type the field expects.
const footerActions = (query: string, group: string | undefined, sections: DataSection[], newFunction: CreateAction, newRecords: CreateAction[]) => {
    if (query) {
        return [];
    }
    if (!group) {
        return newRecords;
    }
    // An empty group offers its create action in its empty state instead.
    const listed = sections.filter((section) => section.roots.length > 0);
    return [...listed.map((section) => section.create), group === FUNCTIONS ? newFunction : undefined];
};

// A button per record the field can start from, each filling the record's required fields; past the limit, one for all.
const recordActions = (records: RecordStarter[], insert: ((value: string) => void) | undefined, openList: () => void): CreateAction[] =>
    records.length > RECORD_BUTTON_LIMIT
        ? [{ label: NEW_RECORD, run: openList, inPicker: true }]
        : records.map((record) => ({ label: `New ${shortName(record.name)} Record`, title: record.template, run: () => insert?.(record.template) }));

// The records a field can start from, one row each, with a preview of what the row inserts.
function RecordList({ records, onInsert }: { records: RecordStarter[]; onInsert?: (value: string) => void }) {
    return (
        <S.Section>
            {records.map((record) => (
                <S.Row key={record.name} role="treeitem" tabIndex={-1} depth={0} title={record.template} onClick={() => onInsert?.(record.template)}>
                    <S.Chevron />
                    <S.Name style={{ flex: "none" }}>{shortName(record.name)}</S.Name>
                    <S.Type>{record.template}</S.Type>
                </S.Row>
            ))}
        </S.Section>
    );
}

// Create actions stay at the bottom, in reach however long the list is.
function CreateFooter({ actions, onRun }: { actions: (CreateAction | undefined)[]; onRun?: () => void }) {
    const shown = actions.filter(Boolean);
    if (shown.length === 0) {
        return null;
    }
    return (
        <S.Footer>
            {shown.map((action) => <CreateLink key={action.label} action={action} onRun={onRun} />)}
        </S.Footer>
    );
}

// One row per group, with its count, below the flow's own values.
function GroupList({ sections, onOpen }: { sections: DataSection[]; onOpen: (title: string) => void }) {
    const groups = [
        ...sections
            .filter((section) => section.grouped && (section.roots.length > 0 || section.create))
            .map((section) => ({ title: section.title, icon: section.icon, count: section.roots.length })),
        { title: FUNCTIONS, icon: HelperPaneIconType.FUNCTION, count: undefined },
    ];
    return (
        <S.Groups>
            {groups.map((group) => (
                <S.Row
                    key={group.title}
                    role="treeitem"
                    tabIndex={-1}
                    aria-expanded={false}
                    depth={0}
                    data-group={group.title}
                    onClick={() => onOpen(group.title)}
                >
                    {getHelperPaneIcon(group.icon, "16px")}
                    <S.Name>{group.title}</S.Name>
                    {group.count !== undefined && <S.Count>{group.count}</S.Count>}
                    <S.Chevron><Arrow direction="right" /></S.Chevron>
                </S.Row>
            ))}
        </S.Groups>
    );
}

// Opening a group moves to its first row and going back returns to the group's row, so the keyboard keeps its place.
function useGroup(treeRef: React.RefObject<HTMLElement>, focusSearch: () => void) {
    const [group, setGroup] = useState<string>();
    const focusNext = useRef<string>();
    useEffect(() => {
        if (focusNext.current) {
            const row = treeRef.current?.querySelector<HTMLElement>(focusNext.current);
            if (row) {
                row.focus();
            } else {
                focusSearch();
            }
        }
        focusNext.current = undefined;
    }, [group]);
    const open = (title: string) => {
        focusNext.current = "[role=treeitem]";
        setGroup(title);
    };
    const back = (refocus = true) => {
        focusNext.current = refocus ? `[data-group="${group}"]` : undefined;
        setGroup(undefined);
    };
    return { group, open, back };
}

interface SearchHeaderProps {
    searchRef: React.RefObject<HTMLDivElement>;
    query: string;
    onQuery: (query: string) => void;
    onKeyDown: (event: React.KeyboardEvent) => void;
}

function SearchHeader({ searchRef, query, onQuery, onKeyDown }: SearchHeaderProps) {
    return (
        <S.Header>
            <S.Search ref={searchRef} onKeyDown={onKeyDown}>
                <SearchBox sx={{ width: "100%" }} placeholder="Search Values and Functions" value={query} onChange={onQuery} />
                {query && (
                    <S.Clear aria-label="Clear Search" title="Clear Search" onClick={() => onQuery("")}>
                        <Codicon name="close" />
                    </S.Clear>
                )}
            </S.Search>
        </S.Header>
    );
}

interface PreviewCardProps {
    shown?: { entry: FunctionEntry | string; anchor: DOMRect };
    fileName: string;
    targetLineRange: LineRange;
    codedata?: FlowNode["codedata"];
}

// Operators preview their meaning; functions preview their signature and docs.
function PreviewCard({ shown, fileName, targetLineRange, codedata }: PreviewCardProps) {
    if (!shown) {
        return null;
    }
    return typeof shown.entry === "string" ? (
        <HoverCard anchor={shown.anchor} label={shown.entry} description={OPERATOR_DESCRIPTIONS[shown.entry]} />
    ) : (
        <FunctionCard entry={shown.entry} anchor={shown.anchor} fileName={fileName} targetLineRange={targetLineRange} codedata={codedata} />
    );
}

function LoadNote({ loaded, failed, onRetry }: { loaded: boolean; failed: boolean; onRetry: () => void }) {
    if (failed) {
        return (
            <S.Note depth={0} role="alert">
                Couldn't load this flow's values.
                <S.Retry onClick={onRetry}>Retry</S.Retry>
            </S.Note>
        );
    }
    return loaded ? null : <S.Note depth={0}>Loading…</S.Note>;
}

export interface DataBrowserProps {
    fileName: string;
    targetLineRange: LineRange;
    codedata?: FlowNode["codedata"];
    onSubmitForm?: SubmitForm;
    cloud?: ExpressionEditorDevantProps;
    // The form has a field typed ai:Prompt, so documents are offered before a field is chosen.
    takesPrompts?: boolean;
    // Closes the browser; the picker passes it so running a create action closes the picker.
    onHide?: () => void;
    // Hands a search that matched nothing to the field's Copilot.
    onAskCopilot?: (draft: string) => void;
    // Values the host already looked up for this form, so opening the browser again shows them at once.
    tree?: ReturnType<typeof useDataTree>;
    // Asks the host to look the values up again, after a value is created or a lookup failed.
    onRefreshTree?: () => void;
}

const askCopilotFor = (query: string, valuesMatch: boolean, ask?: (draft: string) => void) =>
    query && !valuesMatch && ask ? () => ask(query) : undefined;

export function DataBrowser(props: DataBrowserProps) {
    const { fileName, targetLineRange, codedata, onSubmitForm, cloud } = props;
    const target = useInsertTargetContext()?.target;
    const [query, setQuery] = useState("");
    const card = useHoverCard<FunctionEntry | string>();
    const { tree, refreshTree } = useBrowserTree(props);
    const create = useCreateData(fileName, targetLineRange, onSubmitForm, (name) => {
        target?.insert(name);
        refreshTree();
    });

    const { categories, failed, childrenOf, rootsOf, recordStarters, valuesOf } = tree;
    const insert = target?.insert;
    const expectedType = target?.expectedType;
    const records = useExpectedRecords(expectedType, recordStarters);
    const allowed = useAllowedValues(expectedType, valuesOf);
    const sections = [...allowedSection(allowed), ...useSections(rootsOf, create, !!onSubmitForm, expectedType, cloud)];
    const suggestions = useFieldSuggestions(target, sections, childrenOf, categories);
    const results = useDataSearch(query, sections, childrenOf, categories);
    const loaded = isLoaded(categories, query, suggestions, allowed);
    const rows = rowsFor(tree, expectedType);
    // Nested matches name their whole path, so `email` reads as order.customer.email.
    const itemsOf = (section: DataSection): DataItem[] =>
        query ? (results?.[section.title] ?? []).map((item) => (item.enumMember ? item : { ...item, name: item.path })) : section.roots;

    const searchRef = useRef<HTMLDivElement>(null);
    const treeRef = useRef<HTMLDivElement>(null);
    const focusSearch = () => searchRef.current?.querySelector<HTMLElement>("vscode-text-field, input")?.focus();
    const { group, open, back } = useGroup(treeRef, focusSearch);
    // A search covers every group; clearing it returns to the view it started from.
    const atStart = !query && !group;
    const inGroup = !query && !!group;
    const shownSections = sections.filter((section) => query || (group ? section.title === group : !section.grouped));
    const valuesMatch = !loaded || shownSections.some((section) => itemsOf(section).length > 0);
    const askCopilot = askCopilotFor(query, valuesMatch, props.onAskCopilot);
    const newFunction = { label: "New Function", run: () => create.function(expectedType) };
    const newRecords = recordActions(records, insert, () => open(NEW_RECORD));

    useEffect(() => card.hide(true), [query, group]);

    const onSearchKey = (event: React.KeyboardEvent) => {
        if (event.key === "Escape" && query) {
            event.preventDefault();
            setQuery("");
        } else if (event.key === "ArrowDown") {
            event.preventDefault();
            treeRef.current?.querySelector<HTMLElement>("[role=treeitem]")?.focus();
        } else if (event.key === "Backspace" && inGroup) {
            back(false);
        }
    };

    return (
        <S.Container>
            <SearchQuery.Provider value={query}>
                <SearchHeader searchRef={searchRef} query={query} onQuery={setQuery} onKeyDown={onSearchKey} />
                {inGroup && (
                    <S.GroupHeader>
                        <S.Back aria-label="Back" title="Back" onClick={() => back()}>
                            <Icon name="bi-arrow-back" sx={{ width: "16px", height: "16px" }} iconSx={{ fontSize: "16px" }} />
                        </S.Back>
                        {group}
                    </S.GroupHeader>
                )}
                <CanOpen.Provider value={rows.canOpen}>
                    <S.Tree
                        ref={treeRef}
                        role="tree"
                        onScroll={() => card.hide(true)}
                        onKeyDown={treeKeyDown(focusSearch, inGroup ? back : undefined)}
                    >
                        <LoadNote loaded={loaded} failed={failed} onRetry={refreshTree} />
                        {atStart && loaded && <SuggestedSection items={suggestions} onInsert={insert} fetchFields={rows.children} />}
                        {inGroup && group === NEW_RECORD && <RecordList records={records} onInsert={insert} />}
                        <InGroup.Provider value={inGroup}>
                            {loaded &&
                                shownSections.map((section) => (
                                    <ValueSection
                                        key={section.title}
                                        section={section}
                                        items={itemsOf(section)}
                                        onInsert={insert}
                                        fetchFields={rows.children}
                                        onRun={props.onHide}
                                    />
                                ))}
                        </InGroup.Provider>
                        {atStart && (
                            <>
                                <OperatorsSection target={target} onPreview={card} />
                                <DocumentsSection
                                    target={target}
                                    formTakesPrompts={!!props.takesPrompts}
                                    roots={sections.flatMap((section) => section.roots)}
                                    childrenOf={childrenOf}
                                />
                                <GroupList sections={loaded ? sections : []} onOpen={open} />
                            </>
                        )}
                        {/* Stays mounted while hidden, so the group opens on functions already looked up. */}
                        <S.Section hidden={!query && group !== FUNCTIONS}>
                            <InGroup.Provider value={inGroup}>
                                <FunctionsSection
                                    fileName={fileName}
                                    targetLineRange={targetLineRange}
                                    codedata={codedata}
                                    query={query}
                                    target={target}
                                    onPreview={card}
                                    onAskCopilot={askCopilot}
                                />
                            </InGroup.Provider>
                        </S.Section>
                    </S.Tree>
                </CanOpen.Provider>
                <CreateFooter
                    actions={footerActions(query, group, shownSections, newFunction, newRecords)}
                    onRun={props.onHide}
                />
                <PreviewCard shown={card.shown} fileName={fileName} targetLineRange={targetLineRange} codedata={codedata} />
            </SearchQuery.Provider>
        </S.Container>
    );
}
