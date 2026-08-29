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

import { useCallback, useEffect, useState, useRef } from "react";
import styled from "@emotion/styled";
import { ConfigProperties, ConfigVariable, DIRECTORY_MAP, getPrimaryInputType, isSamePath, LineRange, ListenerModel, NodePosition, ProjectStructureArtifactResponse, PropertyModel, ServiceModel } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Button, Codicon, Icon, LinkButton, ProgressRing, SidePanelBody, SplitView, TabPanel, ThemeColors, TreeView, TreeViewItem, Typography, View, ViewContent } from "@wso2/ui-toolkit";
import { TopNavigationBar } from "../../../components/TopNavigationBar";
import { TitleBar } from "../../../components/TitleBar";
import ListenerConfigForm from "./Forms/ListenerConfigForm";
import { ServiceEditView } from "./ServiceEditView";
import { LoadingContainer } from "../../styles";
import { LoadingRing } from "../../../components/Loader";
import { getReadableListenerName } from "./utils";
import { POPUP_IDS, useModalStack } from "../../../Context";

const Container = styled.div`
    width: 100%;
    padding: 10px 0px 10px 8px;
    height: calc(100vh - 220px);
    overflow-y: auto;
`;


const TitleBoxShadow = styled.div`
    box-shadow: var(--vscode-scrollbar-shadow) 0 6px 6px -6px inset;
    height: 3px;
`;

const TitleContent = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
`;


const AccordionContainer = styled.div`
    width: 587px;
    margin-left: 16px;
    & h4 {
        margin: 7px 0px;
    }
    & .side-panel-body {
        padding: unset;
    }
`;

const ServiceConfigureListenerEditViewContainer = styled.div`
    display: "flex";
    flex-direction: "column";
    gap: 10;
    margin: 0 20px 20px 0;
`;

const ListenerConfigHeader = styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
    width: 568px;
`;


namespace S {
    export const Grid = styled.div<{ columns: number }>`
        display: grid;
        grid-template-columns: repeat(${({ columns }: { columns: number }) => columns}, minmax(0, 1fr));
        gap: 8px;
        width: 100%;
        margin-top: 8px;
        margin-bottom: 12px;
    `;
    export const Component = styled.div<{ enabled?: boolean }>`
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 5px;
        padding: 5px;
        border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
        border-radius: 5px;
        height: 36px;
        cursor: ${({ enabled }: { enabled?: boolean }) => (enabled ? "pointer" : "not-allowed")};
        font-size: 14px;
        min-width: 160px;
        max-width: 100%;
        ${({ enabled }: { enabled?: boolean }) => !enabled && "opacity: 0.5;"}
        &:hover {
            ${({ enabled }: { enabled?: boolean }) =>
            enabled &&
            `
                background-color: ${ThemeColors.PRIMARY_CONTAINER};
                border: 1px solid ${ThemeColors.HIGHLIGHT};
            `}
        }
    `;
    export const ComponentTitle = styled.div`
        white-space: nowrap;
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        display: block;
        word-break: break-word;
    `;
    export const IconContainer = styled.div`
        padding: 0 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        & svg {
            height: 16px;
            width: 16px;
        }
    `;
}
export interface ServiceConfigureProps {
    projectPath: string;
    filePath: string;
    position: NodePosition;
    listenerName?: string;
}
interface ChangeMap {
    data: ServiceModel | ListenerModel;
    isService: boolean;
    filePath: string;
}

function getDisplayServiceName(service?: ServiceModel): string {
    const serviceName = service?.name || "";
    if (!serviceName) {
        return serviceName;
    }
    if (service?.moduleName !== "ftp") {
        return serviceName;
    }
    return serviceName.replace(/\s*-\s*\/$/, "");
}

const Overlay = styled.div`
    position: fixed;
    width: 100vw;
    height: 100vh;
    background: var(--vscode-settings-rowHoverBackground);
    z-index: 1000;
`;

export function ServiceConfigureView(props: ServiceConfigureProps) {

    const { rpcClient } = useRpcContext();
    const [serviceModel, setServiceModel] = useState<ServiceModel>(undefined);
    const [listeners, setListeners] = useState<ProjectStructureArtifactResponse[]>([]);

    const [currentIdentifier, setCurrentIdentifier] = useState<string | null>(null);

    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [position, setPosition] = useState<NodePosition>(props.position);
    const [existingListenerType, setExistingListenerType] = useState<string>(""); // Example: "Listener", "CdcListener"

    const [selectedListener, setSelectedListener] = useState<string | null>(null);

    const [changeMap, setChangeMap] = useState<{ [key: string]: ChangeMap }>({});
    const [dirtyFormMap, setDirtyFormMap] = useState<{ [key: string]: boolean }>({});

    const { addModal, closeModal } = useModalStack()

    // Helper function to create key from filePath and position
    const getChangeKey = (filePath: string, position: NodePosition, isService: boolean) => {
        const modelType = isService ? "service" : "listener";
        return `${modelType}:${filePath}:${position.startLine}:${position.startColumn}:${position.endLine}:${position.endColumn}`;
    };
    // Helper function to add a change to the map
    const addChangeToMap = (filePath: string, position: NodePosition, data: ServiceModel | ListenerModel, isService: boolean) => {
        const key = getChangeKey(filePath, position, isService);
        setChangeMap(prev => ({ ...prev, [key]: { data, isService, filePath } }));
    };
    const removeChangeFromMap = (filePath: string, position: NodePosition, isService: boolean) => {
        const key = getChangeKey(filePath, position, isService);
        setChangeMap(prev => {
            if (!prev[key]) {
                return prev;
            }
            const next = { ...prev };
            delete next[key];
            return next;
        });
    };


    const [configTitle, setConfigTitle] = useState<string>("");
    const [visibleSection, setVisibleSection] = useState<string | null>("service"); // Track which section is visible

    // Create ref map for accordion containers
    const accordionRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

    // Create ref for service section
    const serviceRef = useRef<HTMLDivElement | null>(null);

    // Create ref for the scrollable container
    const containerRef = useRef<HTMLDivElement | null>(null);

    // Ref to track the current visible section to prevent unnecessary updates
    const visibleSectionRef = useRef<string | null>("service");

    // Ref for debounce timer
    const scrollTimerRef = useRef<number | null>(null);

    const [listenerType, setListenerType] = useState<"SINGLE" | "MULTIPLE">("MULTIPLE");
    const [haveServiceConfigs, setHaveServiceConfigs] = useState<boolean>(true);

    // Track validity of each form (service form + listener forms) to disable Save when diagnostics exist
    const [formValidityMap, setFormValidityMap] = useState<{ [key: string]: boolean }>({});
    const hasDiagnostics = Object.values(formValidityMap).some(isValid => !isValid);
    const hasDirtyChanges = Object.values(dirtyFormMap).some(isDirty => isDirty);

    const handleFormValidityChange = useCallback((formKey: string, isValid: boolean) => {
        setFormValidityMap(prev => {
            if (prev[formKey] === isValid) return prev;
            return { ...prev, [formKey]: isValid };
        });
    }, []);

    const handleFormDirtyChange = useCallback((filePath: string, position: NodePosition, isService: boolean, isDirty: boolean) => {
        const key = getChangeKey(filePath, position, isService);
        setDirtyFormMap(prev => {
            if (prev[key] === isDirty) {
                return prev;
            }
            return { ...prev, [key]: isDirty };
        });
        if (!isDirty) {
            removeChangeFromMap(filePath, position, isService);
        }
    }, []);

    useEffect(() => {
        fetchService(position);
    }, [position]);

    useEffect(() => {
        if (props.listenerName) {
            handleOnListenerClick(props.listenerName);
        }
    }, [props.listenerName]);

    // Sync the ref when visibleSection changes from external sources
    useEffect(() => {
        visibleSectionRef.current = visibleSection;
    }, [visibleSection]);

    // Set up Intersection Observer to track visible sections
    useEffect(() => {
        if (!containerRef.current) return;

        const observerOptions = {
            root: containerRef.current,
            threshold: Array.from({ length: 21 }, (_, i) => i * 0.05), // Check at 0%, 5%, 10%, ... 100% visibility
            rootMargin: '0px 0px 0px 0px', // Offset for the sticky header area
        };

        const topOffset = 10;
        const observerCallback = (entries: IntersectionObserverEntry[]) => {
            // Get all currently visible sections with their visibility ratios
            const visibleSections: Array<{ id: string; ratio: number; isService: boolean }> = [];

            // Check all observed elements, not just the ones in the current callback
            if (serviceRef.current) {
                const serviceRect = serviceRef.current.getBoundingClientRect();
                const containerRect = containerRef.current!.getBoundingClientRect();
                const effectiveTop = containerRect.top + 20; // Account for rootMargin

                if (serviceRect.bottom > effectiveTop && serviceRect.top < containerRect.bottom) {
                    const visibleHeight = Math.min(serviceRect.bottom, containerRect.bottom) - Math.max(serviceRect.top, effectiveTop);
                    const ratio = visibleHeight / serviceRect.height;
                    if (ratio > 0) {
                        visibleSections.push({ id: 'service', ratio, isService: true });
                    }
                }
            }

            // Check all listener sections
            Object.entries(accordionRefs.current).forEach(([id, ref]) => {
                if (ref) {
                    const rect = ref.getBoundingClientRect();
                    const containerRect = containerRef.current!.getBoundingClientRect();
                    const effectiveTop = containerRect.top + topOffset;

                    if (rect.bottom > effectiveTop && rect.top < containerRect.bottom) {
                        const visibleHeight = Math.min(rect.bottom, containerRect.bottom) - Math.max(rect.top, effectiveTop);
                        const ratio = visibleHeight / rect.height;
                        if (ratio > 0) {
                            visibleSections.push({ id, ratio, isService: false });
                        }
                    }
                }
            });

            // Determine which section should be shown
            let newVisibleSection: string | null = null;
            let newTitle: string | null = null;

            // Prioritize service if it's visible
            const serviceSection = visibleSections.find(s => s.isService);
            if (serviceSection && serviceSection.ratio > 0.05) {
                newVisibleSection = 'service';
                newTitle = `${getDisplayServiceName(serviceModel)} Configuration`;
            } else {
                // Get all visible listeners
                const visibleListenerIds = visibleSections
                    .filter(s => !s.isService && s.ratio > 0.01) // At least 1% visible
                    .map(s => s.id);

                if (visibleListenerIds.length > 0) {
                    // Find the first listener (topmost) that is visible
                    // We iterate through the listeners array which is in document order
                    const firstVisibleListener = listeners.find(l => visibleListenerIds.includes(l.id));

                    if (firstVisibleListener) {
                        newVisibleSection = firstVisibleListener.id;
                        const displayName = firstVisibleListener.name.includes(":")
                            ? getReadableListenerName(firstVisibleListener.name)
                            : firstVisibleListener.name;
                        newTitle = `Configuration for ${displayName}`;
                    }
                }
            }

            // Only update state if the section actually changed
            if (newVisibleSection && newVisibleSection !== visibleSectionRef.current) {
                visibleSectionRef.current = newVisibleSection;
                setVisibleSection(newVisibleSection);
                if (newTitle) {
                    setConfigTitle(newTitle);
                }

                // Update selectedListener to match the visible section
                // If it's the service, clear the selected listener, otherwise set it to the listener id
                if (newVisibleSection === 'service') {
                    setSelectedListener(null);
                } else {
                    setSelectedListener(newVisibleSection);
                }
            }
        };

        const observer = new IntersectionObserver(observerCallback, observerOptions);

        // Observe service section
        if (serviceRef.current) {
            observer.observe(serviceRef.current);
        }

        // Observe all listener sections
        Object.values(accordionRefs.current).forEach(ref => {
            if (ref) {
                observer.observe(ref);
            }
        });

        const SCROLL_THROTTLE_TIME = 100; // 100ms throttle - feels responsive but prevents excessive updates

        // Add a throttled scroll listener for responsive updates
        const handleScroll = () => {
            // Clear any existing timer
            if (scrollTimerRef.current !== null) {
                clearTimeout(scrollTimerRef.current);
            }

            // Set a new timer to call the observer callback after a short delay
            scrollTimerRef.current = window.setTimeout(() => {
                observerCallback([]);
            }, SCROLL_THROTTLE_TIME);
        };

        containerRef.current.addEventListener('scroll', handleScroll, { passive: true });

        return () => {
            observer.disconnect();
            if (scrollTimerRef.current) {
                clearTimeout(scrollTimerRef.current);
            }
            if (containerRef.current) {
                containerRef.current.removeEventListener('scroll', handleScroll);
            }
        };
    }, [listeners, serviceModel]);

    const handleOnServiceSelect = () => {
        // Clear selected listener when service is selected
        setSelectedListener(null);
        // Scroll to service section
        if (serviceRef.current) {
            serviceRef.current.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    };

    const fetchService = (targetPosition: NodePosition) => {
        const lineRange: LineRange = {
            startLine: { line: targetPosition.startLine, offset: targetPosition.startColumn },
            endLine: { line: targetPosition.endLine, offset: targetPosition.endColumn },
        };
        try {
            rpcClient
                .getServiceDesignerRpcClient()
                .getServiceModelFromCode({ filePath: props.filePath, codedata: { lineRange } })
                .then((res) => {
                    console.log("Service Model: ", res.service);
                    // Set the service model
                    setServiceModel(res.service);
                    setConfigTitle(`${getDisplayServiceName(res.service)} Configuration`);
                    // Set the current identifier from the service name
                    if (res.service.name && !currentIdentifier) {
                        setCurrentIdentifier(res.service.name);
                    }
                    // Set the service listeners
                    setServiceListeners(res.service);
                    // Find the listener type
                    findListenerType(res.service);
                    // Reset change state on load - Save button should be disabled until user makes changes
                    setChangeMap({});
                    setDirtyFormMap({});
                });
        } catch (error) {
            console.log("Error fetching service model: ", error);
        }
    };

    const findListenerType = (service: ServiceModel) => {
        let detectedType: "SINGLE" | "MULTIPLE" = "MULTIPLE";
        for (const key in service.properties) {
            const expression = service.properties[key];
            if (
                getPrimaryInputType(expression.types)?.fieldType === "MULTIPLE_SELECT_LISTENER" ||
                getPrimaryInputType(expression.types)?.fieldType === "SINGLE_SELECT_LISTENER"
            ) {
                detectedType = getPrimaryInputType(expression.types)?.fieldType === "SINGLE_SELECT_LISTENER" ? "SINGLE" : "MULTIPLE";
                // Check if only one property is enabled
                const enabledCount = Object.values(service.properties).filter((prop: any) => prop.enabled).length;
                if (enabledCount === 1) {
                    setHaveServiceConfigs(false);
                }
                break;
            }
        }
        console.log("Listener type: ", detectedType);
        setListenerType(detectedType);
    }

    const getAttachedListenerNames = (listenerProperty?: PropertyModel): string[] => {
        if (!listenerProperty) {
            return [];
        }
        const names: string[] = [];
        if (Array.isArray(listenerProperty.values)) {
            names.push(...listenerProperty.values.filter(Boolean));
        }
        if (listenerProperty.value && !names.includes(listenerProperty.value)) {
            names.unshift(listenerProperty.value);
        }
        return names;
    };

    const setServiceListeners = (service: ServiceModel) => {
        rpcClient.getVisualizerLocation().then((location) => {
            const projectPath = location.projectPath;
            rpcClient.getBIDiagramRpcClient().getProjectStructure().then((res) => {
                const project = res.projects.find(project => isSamePath(project.projectPath, projectPath));
                const projectListeners = project?.directoryMap[DIRECTORY_MAP.LISTENER] || [];
                const listenersToSet: ProjectStructureArtifactResponse[] = [];
                const listenerPropertyModel = service?.properties?.listener;
                if (!listenerPropertyModel) {
                    setListeners(listenersToSet);
                    return;
                }

                const attachedListenerNames = getAttachedListenerNames(listenerPropertyModel);
                const listenerProperties = listenerPropertyModel.properties || {};
                attachedListenerNames.forEach((listenerName) => {
                    const listenerItem = projectListeners.find((l) => l.name === listenerName);
                    if (listenerItem) {
                        listenersToSet.push(listenerItem);
                        return;
                    }

                    const property = listenerProperties[listenerName];
                    if (property?.codedata?.lineRange) {
                        listenersToSet.push({
                            id: listenerName,
                            name: listenerName,
                            path: props.filePath,
                            type: "TYPE",
                            position: {
                                startLine: property.codedata.lineRange.startLine.line,
                                startColumn: property.codedata.lineRange.startLine.offset,
                                endLine: property.codedata.lineRange.endLine.line,
                                endColumn: property.codedata.lineRange.endLine.offset,
                            },
                        });
                    } else {
                        listenersToSet.push({
                            id: listenerName,
                            name: listenerName,
                            path: props.filePath,
                            type: DIRECTORY_MAP.LISTENER,
                            position: {
                                startLine: props.position.startLine,
                                startColumn: props.position.startColumn,
                                endLine: props.position.endLine,
                                endColumn: props.position.endColumn,
                            },
                        });
                    }
                });

                setListeners(listenersToSet);
            });
        });
    };

    const handleOnAttachListener = async (listenerName: string) => {
        const listenerProperty = serviceModel?.properties?.listener;
        if (!listenerProperty) {
            return;
        }

        const existingNames = getAttachedListenerNames(listenerProperty);
        if (existingNames.includes(listenerName)) {
            closeModal(POPUP_IDS.ATTACH_LISTENER);
            return;
        }

        const updatedListeners = [...existingNames, listenerName];
        const updatedService = {
            ...serviceModel,
            properties: {
                ...serviceModel.properties,
                listener: {
                    ...listenerProperty,
                    values: updatedListeners,
                    value: updatedListeners[0] || listenerProperty.value || ""
                }
            }
        };

        setServiceModel(updatedService);
        const res = await rpcClient.getServiceDesignerRpcClient().updateServiceSourceCode({
            filePath: props.filePath,
            service: updatedService
        });
        const updatedArtifact = res.artifacts.at(0);
        if (!updatedArtifact) {
            console.error("No artifact returned after attaching listener");
            return;
        }
        setCurrentIdentifier(updatedArtifact.name);
        await fetchService(updatedArtifact.position);
        closeModal(POPUP_IDS.ATTACH_LISTENER);
        setChangeMap({});
        setDirtyFormMap({});
    }

    const handleOnDetachListener = async (listenerName: string) => {
        const listenerProperty = serviceModel?.properties?.listener;
        if (!listenerProperty) {
            return;
        }
        const existingNames = getAttachedListenerNames(listenerProperty);
        const updatedListeners = existingNames.filter(listener => listener !== listenerName);

        if (updatedListeners.length === 0) {
            return;
        }

        const updatedService = {
            ...serviceModel,
            properties: {
                ...serviceModel.properties,
                listener: {
                    ...listenerProperty,
                    values: updatedListeners,
                    value: updatedListeners[0]
                }
            }
        };

        setServiceModel(updatedService);
        const res = await rpcClient.getServiceDesignerRpcClient().updateServiceSourceCode({
            filePath: props.filePath,
            service: updatedService
        });
        const updatedArtifact = res.artifacts.at(0);
        if (!updatedArtifact) {
            console.error("No artifact returned after detaching listener");
            return;
        }
        setPosition(updatedArtifact.position);
        setCurrentIdentifier(updatedArtifact.name);
        await fetchService(updatedArtifact.position);
        setChangeMap({});
        setDirtyFormMap({});
    }

    const handleOnListenerClick = (listenerId: string) => {
        // Set the selected listener for highlighting
        setSelectedListener(listenerId);
        
        // Scroll to the corresponding accordion container
        setTimeout(() => {
            const accordionElement = accordionRefs.current[listenerId];
            if (accordionElement) {
                accordionElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        }, 100); // Small delay to ensure tab switch and DOM update
    }

    const handleListenerChange = async (data: ListenerModel, filePath: string, position: NodePosition) => {
        addChangeToMap(filePath, position, data, false);
        setIsSaving(false);
    }

    const handleServiceChange = async (data: ServiceModel, filePath: string, position: NodePosition) => {
        addChangeToMap(filePath, position, data, true);
        setIsSaving(false);
    }

    const handleSave = async () => {
        setIsSaving(true);
        const changes = Object.values(changeMap);
        const listenerChanges = changes.filter((c) => !c.isService);
        const serviceChanges = changes.filter((c) => c.isService);
        // Listeners first, then service last
        for (const change of listenerChanges) {
            const listnerResponse = await rpcClient.getServiceDesignerRpcClient().updateListenerSourceCode({ filePath: change.filePath, listener: change.data as ListenerModel });
            const updatedServiceArtifact = listnerResponse.artifacts.filter(artifact => artifact.name === currentIdentifier).at(0);
            if (!updatedServiceArtifact) {
                console.error("No service artifact returned after updating listener");
                continue;
            }
            setPosition(updatedServiceArtifact.position);
        }

        // Update service changes
        for (const change of serviceChanges) {
            // TODO: The backend needs to be refactored to support this types model
            const service = change.data as ServiceModel;
            const updatedService = {
                ...serviceModel,
                properties: {
                    ...service.properties,
                    listener: {
                        ...serviceModel.properties.listener,
                        value: service.properties.listener?.values[0] || service.properties.listener?.value || "",
                    }
                }
            };
            const res = await rpcClient.getServiceDesignerRpcClient().updateServiceSourceCode({ filePath: change.filePath, service: updatedService });
            const updatedArtifact = res.artifacts.at(0);
            if (!updatedArtifact) {
                console.error("No artifact returned after saving service changes");
                continue;
            }
            setCurrentIdentifier(updatedArtifact.name);
            setPosition(updatedArtifact.position);
            await fetchService(updatedArtifact.position);
        }
        setChangeMap({});
        setDirtyFormMap({});
        setIsSaving(false);
    }

    const handleSetListenerType = (type: string) => {
        if (!existingListenerType) {
            setExistingListenerType(type);
        }
    }

    const handleGoBack = () => {
        rpcClient.getVisualizerRpcClient().goBack({ identifier: currentIdentifier });
    }

    return (
        <View>
            <TopNavigationBar projectPath={props.projectPath} />
            {!serviceModel && (
                <LoadingContainer>
                    <LoadingRing message="Loading service..." />
                </LoadingContainer>
            )}
            {
                serviceModel && (
                    <>
                        <TitleBar title={`${getDisplayServiceName(serviceModel)} Configuration`} subtitle="Configure and manage service details" onBack={handleGoBack} />
                        <ViewContent padding>
                            <div style={{ height: 'calc(100vh - 220px)' }}>
                                <div style={{ width: "auto" }}>
                                    <SplitView defaultWidths={[20, 80]}>
                                        {/* Left side tree view */}
                                        <div id={`package-treeview`} style={{ padding: "10px 0 50px 0" }}>
                                            {haveServiceConfigs && (
                                                <TreeViewItem
                                                    id="service"
                                                    onSelect={handleOnServiceSelect}
                                                    selectedId={serviceModel.name}
                                                    sx={{
                                                        border: !selectedListener
                                                            ? '1px solid var(--vscode-focusBorder)'
                                                            : 'none'
                                                    }}
                                                >
                                                    <Typography
                                                        variant="body3"
                                                        sx={{
                                                            fontWeight: !selectedListener
                                                                ? 'bold' : 'normal'
                                                        }}
                                                    >{getDisplayServiceName(serviceModel)}</Typography>
                                                </TreeViewItem>
                                            )}

                                            {/* Group all the listeners under "Service listeners" */}
                                            {listeners.length > 0 && (
                                                <TreeView
                                                    rootTreeView
                                                    id="service-listeners"
                                                    expandByDefault={true}
                                                    content={
                                                        <div
                                                            style={{
                                                                display: 'flex',
                                                                height: '22px',
                                                                alignItems: 'center',
                                                            }}>
                                                            <Typography
                                                                variant="body3"
                                                                sx={{
                                                                    fontWeight: 'normal'
                                                                }}
                                                            >
                                                                Attached Listeners
                                                            </Typography>
                                                        </div>
                                                    }
                                                >
                                                    {/* Map all the listeners */}
                                                    {listeners
                                                        .map((listener, index) => (
                                                            <TreeViewItem
                                                                key={listener.id}
                                                                id={listener.id}
                                                                sx={{
                                                                    backgroundColor: 'transparent',
                                                                    paddingLeft: '35px',
                                                                    height: '25px',
                                                                    overflow: 'hidden',
                                                                    textOverflow: 'ellipsis',
                                                                    whiteSpace: 'nowrap',
                                                                    boxSizing: 'border-box',
                                                                    border: selectedListener === listener.id
                                                                        ? '1px solid var(--vscode-focusBorder)'
                                                                        : 'none'
                                                                }}
                                                                selectedId={listener.id}
                                                            >
                                                                <div
                                                                    style={{
                                                                        display: 'flex',
                                                                        height: '22px',
                                                                        alignItems: 'center',
                                                                        cursor: 'pointer'
                                                                    }}
                                                                    onClick={(e) => {
                                                                        handleOnListenerClick(listener.id);
                                                                    }}
                                                                >
                                                                    <Typography
                                                                        variant="body3"
                                                                        sx={{
                                                                            fontWeight: selectedListener === listener.id
                                                                                ? 'bold' : 'normal'
                                                                        }}
                                                                    >
                                                                        {listener.name.includes(":") ? getReadableListenerName(listener.name) : listener.name}
                                                                    </Typography>
                                                                </div>
                                                            </TreeViewItem>
                                                        ))}
                                                </TreeView>
                                            )}
                                        </div>
                                        {/* Right side view */}
                                        <div style={{ height: '100%' }}>
                                            <>
                                                <div
                                                    id="TitleDiv"
                                                    style={{
                                                        position: "sticky", top: 0, color: "var(--vscode-editor-foreground)",
                                                        backgroundColor: "var(--vscode-editor-background)"
                                                    }}>
                                                    <TitleContent>
                                                        <Typography
                                                            variant="h2"
                                                            sx={{
                                                                padding: "0px 0 0 20px",
                                                                margin: "10px 0px",
                                                                color: "var(--vscode-foreground)"
                                                            }}>
                                                            {configTitle}
                                                        </Typography>

                                                        <Button appearance="primary" onClick={handleSave} disabled={isSaving || !hasDirtyChanges || hasDiagnostics} id="save-changes-btn">
                                                            {isSaving ? <Typography variant="progress">Saving...</Typography> : <>Save Changes</>}
                                                        </Button>
                                                    </TitleContent>
                                                    <TitleBoxShadow />
                                                </div>
                                                <Container ref={containerRef}>
                                                    <>
                                                        {!serviceModel && (
                                                            <LoadingContainer>
                                                                <LoadingRing message="Loading service..." />
                                                            </LoadingContainer>
                                                        )}
                                                        {serviceModel && (
                                                            <div>
                                                                {haveServiceConfigs && (
                                                                    <div ref={serviceRef} data-section-id="service">
                                                                        <ServiceEditView
                                                                            filePath={props.filePath}
                                                                            position={props.position}
                                                                            onChange={handleServiceChange}
                                                                            onDirtyChange={(isDirty, filePath, position) => handleFormDirtyChange(filePath, position, true, isDirty)}
                                                                            onValidityChange={(isValid) => handleFormValidityChange('service', isValid)}
                                                                        />
                                                                    </div>
                                                                )}
                                                                {listeners.map((listener) => (
                                                                    <AccordionContainer
                                                                        key={listener.id}
                                                                        ref={(el) => {
                                                                            accordionRefs.current[listener.id] = el;

                                                                        }}
                                                                        data-section-id={listener.id}
                                                                    >
                                                                        <div>
                                                                            {/* Only show the listener header if it's not the currently visible section in the sticky title */}
                                                                            {visibleSection !== listener.id && (
                                                                                <ListenerConfigHeader>
                                                                                    <Typography variant="h2" sx={{ marginBottom: '10px', marginTop: '10px' }}>Configuration for {listener.name.includes(":") ? getReadableListenerName(listener.name) : listener.name} </Typography>
                                                                                    {/* Add detach button to the listener configuration only if there are more than one listener attached */}
                                                                                    {listeners.length > 1 && (
                                                                                        <Button appearance="secondary" onClick={() => {
                                                                                            handleOnDetachListener(listener.name);
                                                                                        }}> <Codicon name="trash" /></Button>
                                                                                    )}
                                                                                </ListenerConfigHeader>
                                                                            )}
                                                                            <ServiceConfigureListenerEditView
                                                                                filePath={listener.path}
                                                                                position={listener.position}
                                                                                onChange={handleListenerChange}
                                                                                onDirtyChange={(isDirty, filePath, position) => handleFormDirtyChange(filePath, position, false, isDirty)}
                                                                                setListenerType={handleSetListenerType}
                                                                                onValidityChange={(isValid) => handleFormValidityChange(listener.id, isValid)}
                                                                                isAttachedListener={listeners.indexOf(listener) > 0}
                                                                                listenerName={listener.name}
                                                                            />
                                                                        </div>
                                                                    </AccordionContainer>
                                                                ))}
                                                                {/* Add a button to attach a new listener and when clicked, open a new modal to select a listener if multiple listener are allowed */}
                                                                {listenerType === "MULTIPLE" && (
                                                                    <LinkButton sx={{ marginTop: '10px', marginLeft: '18px' }} onClick={() => {
                                                                        addModal(
                                                                            <AttachListenerModal
                                                                                filePath={props.filePath}
                                                                                orgName={serviceModel.orgName}
                                                                                packageName={serviceModel.packageName}
                                                                                version={serviceModel.version}
                                                                                moduleName={serviceModel.moduleName}
                                                                                type={existingListenerType}
                                                                                removeDeprecated={serviceModel.moduleName === "ftp" && !!serviceModel.properties?.annotServiceConfig}
                                                                                onAttachListener={handleOnAttachListener}
                                                                                attachedListeners={getAttachedListenerNames(serviceModel.properties?.listener)}
                                                                            />
                                                                            , POPUP_IDS.ATTACH_LISTENER, "Attach Listener", 600, 500);
                                                                    }}> <Codicon name="add" /> Attach Listener</LinkButton>
                                                                )}
                                                            </div>
                                                        )}
                                                    </>
                                                </Container >
                                            </>
                                        </div>
                                    </SplitView>
                                </div>
                            </div>
                        </ViewContent >
                    </>
                )}
        </View >
    );
}

export default ServiceConfigureView;


interface ServiceConfigureListenerEditViewProps {
    filePath: string;
    position: NodePosition;
    onChange?: (data: ListenerModel, filePath: string, position: NodePosition) => void;
    onDirtyChange?: (isDirty: boolean, filePath: string, position: NodePosition) => void;
    setListenerType?: (type: string) => void;
    onValidityChange?: (isValid: boolean) => void;
    isAttachedListener?: boolean; // True if this is an attached listener (not the first/primary one)
    listenerName?: string; // Name of the listener for display purposes
}

function ServiceConfigureListenerEditView(props: ServiceConfigureListenerEditViewProps) {
    const { filePath, position, onChange, onDirtyChange, setListenerType, onValidityChange, isAttachedListener = false, listenerName } = props;
    const { rpcClient } = useRpcContext();
    const [listenerModel, setListenerModel] = useState<ListenerModel>(undefined);

    const [saving, setSaving] = useState<boolean>(false);

    const [savingText, setSavingText] = useState<string>("Saving...");

    useEffect(() => {
        const lineRange: LineRange = { startLine: { line: position.startLine, offset: position.startColumn }, endLine: { line: position.endLine, offset: position.endColumn } };
        rpcClient.getServiceDesignerRpcClient().getListenerModelFromCode({ filePath, codedata: { lineRange } }).then(res => {
            console.log("Editing Listener Model: ", res.listener)
            setListenerModel(res.listener);
            setListenerTypeFromProperties(res.listener.properties);
        })
    }, [position]);

    const setListenerTypeFromProperties = (properties: ConfigProperties) => {
        // The canonical key for the listener type property in config is "listenerType"
        // Find the object key where the property is for listenerType or label "Listener Type"
        const listenerTypeKey = Object.keys(properties).find(
            key =>
                (properties[key] as any).name === "listenerType" ||
                (properties[key] as any).metadata?.label === "Listener Type"
        );
        if (listenerTypeKey && properties[listenerTypeKey]?.value && setListenerType) {
            setListenerType(properties[listenerTypeKey].value);
        }
    };

    const onSubmit = async (value: ListenerModel) => {
        setSaving(true);
        const res = await rpcClient.getServiceDesignerRpcClient().updateListenerSourceCode({ filePath, listener: value });
        setSavingText("Saved");
        setTimeout(() => {
            setSavingText("Save");
            setSaving(false);
        }, 1000);
    }

    const handleListenerChange = (data: ListenerModel) => {
        console.log("Listener change: ", data);
        onChange(data, filePath, position);
    }

    const handleListenerDirtyChange = (isDirty: boolean) => {
        onDirtyChange?.(isDirty, filePath, position);
    }

    return (
        <ServiceConfigureListenerEditViewContainer>
            {!listenerModel &&
                <LoadingContainer>
                    <ProgressRing />
                    <Typography variant="h3" sx={{ marginTop: '16px' }}>Loading...</Typography>
                </LoadingContainer>
            }
            {listenerModel &&
                <ListenerConfigForm
                    listenerModel={listenerModel}
                    filePath={filePath}
                    onSubmit={onSubmit}
                    formSubmitText={saving ? savingText : "Save"}
                    isSaving={saving}
                    onChange={handleListenerChange}
                    onDirtyChange={handleListenerDirtyChange}
                    onValidityChange={onValidityChange}
                />
            }
        </ServiceConfigureListenerEditViewContainer>
    );
};

// Minimal config component for attached listeners in new system (no folderPath in listener)
interface AttachedListenerMinimalConfigProps {
    listenerName?: string;
    onSave?: (value: ListenerModel) => void;
    isSaving?: boolean;
    savingText?: string;
}

function AttachedListenerMinimalConfig(props: AttachedListenerMinimalConfigProps) {
    const { listenerName } = props;

    return (
        <div style={{ padding: '16px 0' }}>
            <Typography variant="body2" sx={{ color: 'var(--vscode-descriptionForeground)' }}>
                This service is attached to the existing listener <strong>{listenerName}</strong>.
                The monitoring path is configured at the service level.
            </Typography>
        </div>
    );
}


namespace S {
    export const Container = styled(SidePanelBody)`
        display: flex;
        flex-direction: column;
        padding: 0px;
    `;

    export const TabContainer = styled.div`
        height: 100%;
        overflow: hidden;
        display: flex;
        flex-direction: column;
    `;

    export const LoadingContainer = styled.div`
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        width: 100%;
        padding: 10px;
    `;
}

interface AttachListenerModalProps {
    filePath: string;
    orgName: string;
    moduleName: string;
    packageName: string;
    version: string;
    type: string;
    removeDeprecated?: boolean;
    attachedListeners: string[];
    onAttachListener: (listenerName: string) => Promise<void>;
}

function AttachListenerModal(props: AttachListenerModalProps) {

    const [activeTab, setActiveTab] = useState<"existing" | "new">("existing");
    const { rpcClient } = useRpcContext();

    const [existingListeners, setExistingListeners] = useState<string[]>([]);

    const [isLoading, setIsLoading] = useState<boolean>(false);

    const [attachingListener, setAttachingListener] = useState<string | undefined>(undefined);


    const [listenerModel, setListenerModel] = useState<ListenerModel>(undefined);

    useEffect(() => {
        setIsLoading(true);
        rpcClient.getServiceDesignerRpcClient().getListeners({
            filePath: props.filePath,
            moduleName: props.moduleName,
            removeDeprecated: props.removeDeprecated
        }).then(res => {
            setExistingListeners(res.listeners.filter(listener => !props.attachedListeners.includes(listener)).filter(listener => !listener.includes("+")));
        }).finally(() => {
            setIsLoading(false);
        });
    }, [props.filePath, props.moduleName, props.removeDeprecated]);

    const handleTabChange = (tabId: string) => {
        setActiveTab(tabId as "existing" | "new");

        const payload = {
            codedata: {
                orgName: props.orgName,
                packageName: props.packageName,
                moduleName: props.moduleName,
                version: props.version,
                type: props.type,
            },
            filePath: props.filePath,
            removeDeprecated: props.removeDeprecated
        };

        if (tabId === "new") {
            setIsLoading(true);
            setListenerModel(undefined);
            rpcClient.getServiceDesignerRpcClient().getListenerModel(payload).then(res => {
                setListenerModel(res.listener);
            }).finally(() => {
                setIsLoading(false);
            });
        }
    }

    const handleListenerSelect = async (listenerName: string) => {
        setAttachingListener(listenerName);
        try {
            await props.onAttachListener(listenerName);
        } catch (error) {
            console.error("Failed to attach listener", error);
        } finally {
            setAttachingListener(undefined);
        }
    }

    const onCreateNewListener = async (value?: ListenerModel) => {
        if (!value) {
            return;
        }
        const listenerName = value.properties['variableNameKey'].value;
        setAttachingListener(listenerName);
        try {
            await rpcClient.getServiceDesignerRpcClient().addListenerSourceCode({ filePath: "", listener: value });
            await props.onAttachListener(listenerName);
        } catch (error) {
            console.error("Failed to create and attach listener", error);
        } finally {
            setAttachingListener(undefined);
        }
    };

    return (
        <>
            <TabPanel
                views={[
                    {
                        id: 'existing',
                        name: 'Existing Listeners',
                        icon: <Icon
                            name="radio-tower"
                            isCodicon={true}
                            sx={{ marginRight: '5px' }}
                            iconSx={{ fontSize: '15px', display: 'flex', alignItems: 'center' }}
                        />
                    },
                    {
                        id: 'new',
                        name: 'Create New Listener',
                        icon: <Icon
                            name="radio-tower"
                            isCodicon={true}
                            sx={{ marginRight: '5px' }}
                            iconSx={{ fontSize: '12px', display: 'flex', alignItems: 'center', paddingTop: '2px' }}
                        />
                    },
                ]}
                currentViewId={activeTab}
                onViewChange={handleTabChange}
                childrenSx={{ padding: '10px', height: '100%', overflow: 'hidden' }}
            >
                <S.TabContainer id="existing" data-testid="existing-tab">

                    {isLoading && (
                        <S.LoadingContainer>
                            <ProgressRing />
                            <Typography variant="h3" sx={{ marginTop: '16px' }}>Loading...</Typography>
                        </S.LoadingContainer>
                    )}


                    {!isLoading && existingListeners.length === 0 && (
                        <S.LoadingContainer>
                            <Typography variant="h4" sx={{ marginTop: '16px', textAlign: 'center' }}>No existing listeners found</Typography>
                            <LinkButton sx={{ marginTop: '10px' }} onClick={() => {
                                handleTabChange("new");
                            }}> <Codicon name="add" /> Create New Listener</LinkButton>
                        </S.LoadingContainer>
                    )}

                    {!isLoading && existingListeners.length > 0 && (
                        <S.Grid columns={1}>
                            {existingListeners.map((listener) => (
                                <S.Component
                                    key={listener}
                                    enabled={!attachingListener}
                                    onClick={() => {
                                        if (attachingListener) {
                                            return;
                                        }
                                        void handleListenerSelect(listener);
                                    }}
                                >
                                    <S.IconContainer>{<Icon name='radio-tower' isCodicon={true} />}</S.IconContainer>
                                    <S.ComponentTitle>
                                        {listener}
                                    </S.ComponentTitle>
                                    {attachingListener === listener && (
                                        <>
                                            <ProgressRing />
                                            <Typography variant="body3" sx={{ marginLeft: '10px', marginRight: '5px' }}>Attaching listener...</Typography>
                                        </>
                                    )}
                                </S.Component>
                            ))}
                        </S.Grid>
                    )}
                </S.TabContainer>
                <S.TabContainer id="new" data-testid="new-tab" style={{ overflow: 'auto' }}>
                    {isLoading && (
                        <S.LoadingContainer>
                            <ProgressRing />
                            <Typography variant="h3" sx={{ marginTop: '16px' }}>Loading...</Typography>
                        </S.LoadingContainer>
                    )}
                    {!isLoading && listenerModel && (
                        <ListenerConfigForm
                            listenerModel={listenerModel}
                            filePath={props.filePath}
                            onSubmit={onCreateNewListener}
                            formSubmitText={attachingListener ? "Saving..." : "Save"}
                            isSaving={!!attachingListener}
                        />
                    )}
                </S.TabContainer>
            </TabPanel>
        </>
    );
}
