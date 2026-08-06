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

import styled from "@emotion/styled";
import {
    DIRECTORY_MAP,
    EVENT_TYPE,
    FunctionModel,
    LineRange,
    MACHINE_VIEW,
    ProjectStructureArtifactResponse,
    ComponentInfo,
    ServiceModel,
    Protocol,
    SHARED_COMMANDS,
    ValidationResult,
    hasBlockingValidationErrors,
    isSamePath
} from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { PanelContainer } from "@wso2/ballerina-side-panel";
import { NodePosition } from "@wso2/syntax-tree";
import { Button, Codicon, Icon, TextField, Typography, View } from "@wso2/ui-toolkit";
import { useEffect, useRef, useState } from "react";
import { LoadingRing } from "../../../components/Loader";
import { TitleBar } from "../../../components/TitleBar";
import { TopNavigationBar } from "../../../components/TopNavigationBar";
import { isPositionChanged } from "../../../utils/utils";
import { AddServiceElementDropdown, DropdownOptionProps } from "./components/AddServiceElementDropdown";
import { MoreOptionsDropdown } from "./components/MoreOptionsDropdown";
import { ResourceAccordion } from "./components/ResourceAccordion";
import { ResourceAccordionV2 } from "./components/ResourceAccordionV2";
import { FunctionConfigForm } from "./Forms/FunctionConfigForm";
import { FunctionForm } from "./Forms/FunctionForm";
import { ResourceForm } from "./Forms/ResourceForm";
import { removeForwardSlashes, canDataBind, getReadableListenerName } from "./utils";
import { DatabindForm } from "./Forms/DatabindForm";
import { TriggerHandlerForm } from "./Forms/TriggerHandlerForm";
import TriggerHandlerConfigForm from "./Forms/TriggerHandlerForm/TriggerHandlerConfigForm";
import {
    catalogFunctionsOf,
    handlerGroupId,
    hasConfigurableFields,
    isSchemaTriggerService as checkSchemaTriggerService,
    isSoleRepeatableGroup,
} from "./Forms/TriggerHandlerForm/payloadComposer";
import { getTryItAIDefaultPromptService, getTryItDropdownOptions, TryItOptionValue, TryItQuickPickItem } from "../shared/tryIt";

const LoadingContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 80vh;
    flex-direction: column;
`;

const ServiceContainer = styled.div`
    padding-right: 10px;
    padding-left: 10px;
    flex-grow: 1;
    overflow-y: auto;
    height: 0; /* This forces the flex item to use available space */
`;

const FunctionsContainer = styled.div`
    max-height: 550px;
    overflow: auto;
    padding: 15px;
`;

const ButtonText = styled.span`
    @media (max-width: 768px) {
        display: none;
    }
    width: 100%;
`;

const HeaderContainer = styled.div`
    display: flex;
    padding: 0px 15px;
    align-items: center;
    justify-content: space-between;
`;

const ActionGroup = styled.div`
    display: flex;
    gap: 12px;
    align-items: center;
`;

const ServiceMetadataContainer = styled.div`
    padding: 12px 25px;
    border-bottom: 1px solid var(--vscode-editorWidget-border);
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: var(--vscode-editor-background);
`;

const MetadataRow = styled.div`
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
`;

const PropertyInline = styled.div`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 8px;
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-editorWidget-border);
    border-radius: 4px;
    font-size: 11px;
    height: 24px;
    pointer-events: none;
`;

const PropertyKey = styled.span`
    color: var(--vscode-descriptionForeground);
    font-weight: 500;
`;

const PropertyValue = styled.span`
    color: var(--vscode-input-foreground);
    font-family: var(--vscode-editor-font-family);
`;

const EmptyReadmeContainer = styled.div`
    display: flex;
    margin: 80px 0px;
    flex-direction: column;
    align-items: center;
    gap: 8px;
`;

const Description = styled(Typography)`
    color: var(--vscode-descriptionForeground);
`;

interface ServiceDesignerProps {
    projectPath: string;
    filePath: string;
    position: NodePosition;
    serviceIdentifier: string;
}

interface ReadonlyProperty {
    label: string;
    value: string | string[];
}

export const ADD_HANDLER = "add-handler";
export const ADD_INIT_FUNCTION = "add-init-function";
export const ADD_REUSABLE_FUNCTION = "add-reusable-function";
export const EXPORT_OAS = "export-oas";
export const ADD_HTTP_RESOURCE = "add-http-resource";

export function ServiceDesigner(props: ServiceDesignerProps) {
    const { projectPath, filePath, position, serviceIdentifier } = props;
    const { rpcClient } = useRpcContext();

    // ----- service/function model + save state -----
    const [serviceModel, setServiceModel] = useState<ServiceModel>(undefined);
    const [functionModel, setFunctionModel] = useState<FunctionModel>(undefined);
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [serverValidationErrors, setServerValidationErrors] = useState<ValidationResult[]>([]);

    // ----- add/edit panel flow state -----
    const [isNew, setIsNew] = useState<boolean>(false);
    const [showForm, setShowForm] = useState<boolean>(false);
    const [showFunctionConfigForm, setShowFunctionConfigForm] = useState<boolean>(false);
    const [selectedHandler, setSelectedHandler] = useState<FunctionModel>(undefined);
    const [initFunction, setInitFunction] = useState<FunctionModel>(undefined);
    const [selectedTriggerGroup, setSelectedTriggerGroup] = useState<string>(undefined);
    const [addMore, setAddMore] = useState<boolean>(false);

    // ----- service-type detection flags (drive which section/form this designer shows) -----
    const [isHttpService, setIsHttpService] = useState<boolean>(false);
    const [isMcpService, setIsMcpService] = useState<boolean>(false);
    const [isFtpService, setIsFtpService] = useState<boolean>(false);
    const [isCdcService, setIsCdcService] = useState<boolean>(false);

    // ----- handler/method/resource listings (populated by setServiceMetaInfo on each fetch) -----
    const [enabledHandlers, setEnabledHandlers] = useState<FunctionModel[]>([]);
    const [unusedHandlers, setUnusedHandlers] = useState<FunctionModel[]>([]);
    const [dropdownOptions, setDropdownOptions] = useState<DropdownOptionProps[]>([]);
    const [resources, setResources] = useState<ProjectStructureArtifactResponse[]>([]);
    const [listeners, setListeners] = useState<string[]>([]);
    const [readonlyProperties, setReadonlyProperties] = useState<Set<ReadonlyProperty>>(new Set());
    const [searchValue, setSearchValue] = useState<string>("");

    // ----- Try It state -----
    const [selectedTryItOption, setSelectedTryItOption] = useState<TryItOptionValue>(TryItOptionValue.TRY_IT);
    const [isTryItInProgress, setIsTryItInProgress] = useState<boolean>(false);

    // ----- refs (fetch/mount bookkeeping, not rendered) -----
    const prevPosition = useRef(position);
    const positionRef = useRef(position);
    const isMountedRef = useRef(true);

    // ----- init function panel -----
    const handleCloseInitFunction = () => {
        setInitFunction(undefined);
    };

    /** Shared by every save/delete handler below to re-locate the artifact a source edit just touched. */
    const findServiceArtifact = (
        artifacts: ProjectStructureArtifactResponse[],
        targetPosition: NodePosition = position
    ): ProjectStructureArtifactResponse | undefined => {
        const exactMatch = artifacts.find(artifact =>
            artifact.name === serviceIdentifier &&
            artifact.position.startLine === targetPosition.startLine &&
            artifact.position.startColumn === targetPosition.startColumn
        );

        if (exactMatch) {
            return exactMatch;
        }

        // Resource/function updates can introduce imports above a service and shift its start position.
        // Fall back to same service in the same file and pick the nearest start position.
        const serviceInSameFile = artifacts.filter(artifact => artifact.name === serviceIdentifier && artifact.path === filePath);
        if (serviceInSameFile.length === 0) {
            return undefined;
        }

        const closestService = serviceInSameFile.reduce((closest, current) => {
            const closestDistance = Math.abs(closest.position.startLine - targetPosition.startLine);
            const currentDistance = Math.abs(current.position.startLine - targetPosition.startLine);
            return currentDistance < closestDistance ? current : closest;
        });
        return closestService;
    };

    const handleInitFunctionSave = async (value: FunctionModel) => {
        setIsSaving(true);
        const lineRange: LineRange = {
            startLine: { line: position.startLine, offset: position.startColumn },
            endLine: { line: position.endLine, offset: position.endColumn },
        };
        const res = await rpcClient
            .getServiceDesignerRpcClient()
            .updateResourceSourceCode({ filePath, codedata: { lineRange }, function: value, artifactType: DIRECTORY_MAP.SERVICE });
        const serviceArtifact = findServiceArtifact(res.artifacts);
        if (serviceArtifact) {
            fetchService(serviceArtifact.position);
            await rpcClient.getVisualizerRpcClient().openView({ type: EVENT_TYPE.UPDATE_PROJECT_LOCATION, location: { documentUri: serviceArtifact.path, position: serviceArtifact.position } });
            setIsSaving(false);
            setInitFunction(undefined);
            return;
        }
    }

    // ----- lifecycle -----
    useEffect(() => {
        positionRef.current = position;
        isMountedRef.current = true;

        if (!serviceModel || isPositionChanged(prevPosition.current, position)) {
            fetchService(position);
            setAddMore(false);
        }

        rpcClient.onProjectContentUpdated(() => {
            if (!isMountedRef.current) return;
            fetchService(positionRef.current);
        });

        return () => {
            isMountedRef.current = false;
        };
    }, [position]);

    // Load persisted preferred Try It option on mount (if set)
    useEffect(() => {
        (async () => {
            try {
                const preferred = await rpcClient.getCommonRpcClient().getPreferredTryItOption();

                if (!isMountedRef.current) return;

                if (
                    preferred === TryItOptionValue.TRY_IT ||
                    preferred === TryItOptionValue.TRY_IT_WITH_AI
                ) {
                    setSelectedTryItOption(preferred as TryItOptionValue);
                }
            } catch (e) {
                // ignore
            }
        })();
    }, [rpcClient]);

    // ----- service model fetch -----
    const fetchService = (targetPosition: NodePosition) => {
        const lineRange: LineRange = {
            startLine: { line: targetPosition.startLine, offset: targetPosition.startColumn },
            endLine: { line: targetPosition.endLine, offset: targetPosition.endColumn },
        };
        try {
            rpcClient
                .getServiceDesignerRpcClient()
                .getServiceModelFromCode({ filePath, codedata: { lineRange } })
                .then((res) => {
                    if (!isMountedRef.current) return;
                    console.log("Service Model: ", res.service);
                    if (addMore) {
                        handleNewResourceFunction();
                    }
                    setServiceModel(res.service);
                    setServiceMetaInfo(res.service);
                    setIsSaving(false);
                    prevPosition.current = targetPosition;
                });
        } catch (error) {
            console.log("Error fetching service model: ", error);
        }
        getProjectListeners(targetPosition);
    };

    const setServiceMetaInfo = (service: ServiceModel) => {
        if (service?.properties?.listener) {
            const listenerProperty = service.properties.listener;
            if (listenerProperty.values && listenerProperty.values.length > 0) {
                setListeners(listenerProperty.values);
            } else if (listenerProperty.value) {
                setListeners([listenerProperty.value]);
            }
        }
        if (service?.properties) {
            // Extract readonly properties from readOnlyMetadata if available
            const readonlyProps: Set<ReadonlyProperty> = new Set();
            const readOnlyMetadata = service.properties.readOnlyMetadata;

            if (readOnlyMetadata?.enabled && readOnlyMetadata.value && typeof readOnlyMetadata.value === "object" && !Array.isArray(readOnlyMetadata.value)) {
                Object.entries(readOnlyMetadata.value).forEach(([label, values]) => {
                    if (Array.isArray(values) && values.length > 0) {
                        readonlyProps.add({
                            label,
                            value: values.length === 1 ? values[0] : values
                        });
                    }
                });
            }

            setReadonlyProperties(readonlyProps);
            setIsFtpService(service.moduleName === "ftp");
            setIsHttpService(service.moduleName === "http");
            setIsMcpService(service.moduleName === "mcp");
            setIsCdcService(service.moduleName === "mssql" || service.moduleName === "postgresql");
        }

        // Extract object methods if available (for service classes)
        const objectMethods: FunctionModel[] = [];
        const enabledHandlers: FunctionModel[] = [];
        const unusedHandlers: FunctionModel[] = [];

        let hasInitMethod = false;
        service.functions.forEach(func => {
            if (func.kind === "DEFAULT") {
                if (func.name?.value === "init") {
                    hasInitMethod = true;
                } else {
                    objectMethods.push(func);
                }
            }
            if (func.kind === "REMOTE" || func.kind === "RESOURCE") {
                if (func.enabled) {
                    enabledHandlers.push(func);
                } else {
                    unusedHandlers.push(func);
                }
            }
        });

        // Schema-driven triggers ship their addable handler catalog separately (`schemaFunctions`);
        // it feeds the same "+ Handler" affordance as disabled template functions.
        unusedHandlers.push(...(service.schemaFunctions ?? []));

        setEnabledHandlers(enabledHandlers);
        setUnusedHandlers(unusedHandlers);

        // Set dropdown options
        const options: DropdownOptionProps[] = [];

        if (service.moduleName === "http") {
            options.push({
                title: "Export OpenAPI Spec",
                value: EXPORT_OAS
            });
        }

        setDropdownOptions(options);
    }

    const getProjectListeners = (targetPosition: NodePosition) => {
        rpcClient.getVisualizerLocation().then((location) => {
            const projectPath = location.projectPath;
            rpcClient.getBIDiagramRpcClient().getProjectStructure().then((res) => {
                const project = res.projects.find(project => isSamePath(project.projectPath, projectPath));
                const listeners = project?.directoryMap[DIRECTORY_MAP.LISTENER];
                const services = project.directoryMap[DIRECTORY_MAP.SERVICE];
                if (services.length > 0) {
                    const selectedService = findServiceArtifact(services, targetPosition);
                    if (!selectedService) {
                        setResources([]);
                        return;
                    }
                    setResources(selectedService.resources);
                }
            });
        });
    };

    // ----- navigation (open an existing view) -----

    const handleOpenDiagram = async (resource: FunctionModel) => {
        const lineRange: LineRange = resource.codedata.lineRange;
        const nodePosition: NodePosition = {
            startLine: lineRange.startLine.line,
            startColumn: lineRange.startLine.offset,
            endLine: lineRange.endLine.line,
            endColumn: lineRange.endLine.offset,
        };
        await rpcClient
            .getVisualizerRpcClient()
            .openView({ type: EVENT_TYPE.OPEN_VIEW, location: { position: nodePosition, documentUri: filePath } });
    };

    const openInit = async (resource: ProjectStructureArtifactResponse) => {
        await rpcClient
            .getVisualizerRpcClient()
            .openView({ type: EVENT_TYPE.OPEN_VIEW, location: { position: resource.position, documentUri: resource.path } });
    };

    const handleServiceEdit = async () => {
        await rpcClient.getVisualizerRpcClient().openView({
            type: EVENT_TYPE.OPEN_VIEW,
            location: {
                view: MACHINE_VIEW.BIServiceConfigView,
                position: position,
                documentUri: filePath,
            },
        });
    };

    // ----- HTTP resource add -----
    const handleNewResourceFunction = () => {
        rpcClient
            .getServiceDesignerRpcClient()
            .getHttpResourceModel({ type: "http", functionName: "resource" })
            .then((res) => {
                console.log("New Function Model: ", res.function);
                setFunctionModel(res.function);
                setIsNew(true);
                setShowForm(true);
            });
    };

    // ----- handler add/edit/submit flow (schema-driven trigger handlers + generic handlers) -----
    // Schema-driven trigger (unified TriggerModel): it ships an addable handler catalog
    // (`schemaFunctions`) and/or functions carrying the catalog markers (`group`/`variantLabel`),
    // so the generic TriggerHandlerForm applies — no module gate.
    const isSchemaTriggerService = checkSchemaTriggerService(serviceModel);

    // A "file" kind trigger (ftp/file) surfaces File Handlers rather than Event Handlers; MCP
    // surfaces Tools. Otherwise a generic event handler.
    const isFileService = serviceModel?.moduleName === "ftp" || serviceModel?.moduleName === "file";
    const handlerNoun = isFileService ? "file" : isMcpService ? "tool" : "event";

    const handleNewTriggerHandler = (group: string) => {
        setSelectedTriggerGroup(group);
        setFunctionModel(undefined);
        setIsNew(true);
        setShowForm(true);
        setShowFunctionConfigForm(false);
        setIsSaving(false);
    };

    /** Adds a catalog handler straight away — used when it has nothing worth showing a form for. */
    const handleQuickAddTriggerHandler = (functionModel: FunctionModel) => {
        setShowFunctionConfigForm(false);
        handleFunctionSubmit(functionModel, false, true);
    };

    const getTriggerHandlerTitle = () => {
        const groupId = selectedTriggerGroup ?? (functionModel ? handlerGroupId(functionModel) : undefined);
        const groupMembers = [...(serviceModel ? catalogFunctionsOf(serviceModel) : []), ...(serviceModel?.functions ?? [])];
        const groupLabel = groupMembers.find(fn => handlerGroupId(fn) === groupId)?.metadata?.label
            ?? "Handler";
        return `${isNew ? "New " : ""}${groupLabel} Configuration`;
    };

    const handleNewObjectMethod = () => {
        rpcClient
            .getServiceDesignerRpcClient()
            .getFunctionModel({ type: "object", functionName: "default" })
            .then((res) => {
                console.log("New Function Model: ", res.function);
                setFunctionModel(res.function);
                setIsNew(true);
                setShowForm(true);
            });
    };

    const onSelectAddReusableFunction = () => {
        setIsNew(true);
        // setShowFunctionConfigForm(true);
        handleNewObjectMethod();
    };

    const onSelectAddHandler = () => {
        // A schema-driven catalog with exactly one always-addable (repeatable TRUE) group has nothing
        // to choose between — e.g. MCP's Tool. Skip the picker and go straight to its form, rather
        // than making the user click through a single-card list every time.
        if (isSchemaTriggerService && serviceModel) {
            const soleGroup = isSoleRepeatableGroup(serviceModel);
            if (soleGroup) {
                handleNewTriggerHandler(soleGroup.id);
                return;
            }
        }
        setIsNew(true);
        setShowFunctionConfigForm(true);
    };

    const onHandlerSelected = (handler: FunctionModel) => {
        // Check if this handler is databindable
        if (canDataBind(handler)) {
            // For databindable functions, show DatabindForm for configuration
            setSelectedHandler(handler);
            setFunctionModel(handler);
            setShowForm(true);
            // Close the FunctionConfigForm to show the DatabindForm instead
            setShowFunctionConfigForm(false);
        } else {
            // For regular functions, immediately add without showing a form
            handler.enabled = true;
            setShowFunctionConfigForm(false);
            handleFunctionSubmit(handler);
        }
    };

    const onSelectAddInitFunction = async () => {
        setIsNew(false);
        const lsResponse = await rpcClient.getServiceDesignerRpcClient().getFunctionModel({
            type: 'object',
            functionName: 'init'
        });
        if (lsResponse.function) {
            setInitFunction(lsResponse.function);
            console.log(`Adding init function`, lsResponse.function);
        }
    };

    const handleAddDropdownOption = (option: string) => {
        switch (option) {
            case ADD_REUSABLE_FUNCTION:
                onSelectAddReusableFunction();
                break;
            case ADD_INIT_FUNCTION:
                onSelectAddInitFunction();
                break;
            case ADD_HANDLER:
                onSelectAddHandler();
                break;
            case ADD_HTTP_RESOURCE:
                handleNewResourceFunction();
                break;
            case EXPORT_OAS:
                handleExportOAS();
                break;
        }
    };

    const handleNewFunctionClose = () => {
        setShowForm(false);
        setIsNew(false);
        setFunctionModel(undefined);
        setSelectedTriggerGroup(undefined);
        // If a handler was selected, also close the FunctionConfigForm
        if (selectedHandler) {
            setShowFunctionConfigForm(false);
            setSelectedHandler(undefined);
        }
    };

    const handleFunctionEdit = (value: FunctionModel) => {
        setFunctionModel(value);
        setIsNew(false);
        setShowForm(true);
    };

    const handleFunctionDelete = async (model: FunctionModel) => {
        console.log("Deleting Resource Model:", model);
        const component: ComponentInfo = {
            name: model.name.value,
            filePath: model.codedata.lineRange.fileName,
            startLine: model.codedata.lineRange.startLine.line,
            startColumn: model.codedata.lineRange.startLine.offset,
            endLine: model.codedata.lineRange.endLine.line,
            endColumn: model.codedata.lineRange.endLine.offset,
        };
        await rpcClient.getBIDiagramRpcClient().deleteByComponentInfo({ filePath, component });

        const context = await rpcClient.getVisualizerLocation();
        const projectPath = context.projectPath;
        const projectStructure = await rpcClient.getBIDiagramRpcClient().getProjectStructure();
        const project = projectStructure.projects.find(project => isSamePath(project.projectPath, projectPath));

        const serviceArtifact = findServiceArtifact(project.directoryMap[DIRECTORY_MAP.SERVICE]);
        if (serviceArtifact) {
            await rpcClient.getVisualizerRpcClient().openView({ type: EVENT_TYPE.UPDATE_PROJECT_LOCATION, location: { documentUri: serviceArtifact.path, position: serviceArtifact.position } });
            fetchService(serviceArtifact.position);
        }
    };

    const handleResourceSubmit = async (value: FunctionModel, openDiagram: boolean = false) => {
        setIsSaving(true);
        const lineRange: LineRange = {
            startLine: { line: position.startLine, offset: position.startColumn },
            endLine: { line: position.endLine, offset: position.endColumn },
        };
        let res = undefined;
        if (isNew) {
            res = await rpcClient
                .getServiceDesignerRpcClient()
                .addResourceSourceCode({ filePath, codedata: { lineRange }, function: value, artifactType: DIRECTORY_MAP.SERVICE });
            const serviceArtifact = findServiceArtifact(res.artifacts);
            if (serviceArtifact) {
                if (openDiagram) {
                    const accessor = value.accessor.value.toLowerCase();
                    const path = value.name.value;
                    const resourceIdentifier = `${accessor}#${path}`;
                    const resource = serviceArtifact.resources.find(res => res.id === resourceIdentifier);
                    if (resource) {
                        await rpcClient.getVisualizerRpcClient().openView({ type: EVENT_TYPE.OPEN_VIEW, location: { documentUri: resource.path, position: resource.position } });
                    } else {
                        setIsSaving(false);
                        handleNewFunctionClose();
                        return;
                    }
                } else {
                    await rpcClient.getVisualizerRpcClient().openView({ type: EVENT_TYPE.UPDATE_PROJECT_LOCATION, location: { documentUri: serviceArtifact.path, position: serviceArtifact.position } });
                    setAddMore(true);
                    fetchService(serviceArtifact.position);
                }
                setIsSaving(false);
                return;
            }
        } else {
            res = await rpcClient
                .getServiceDesignerRpcClient()
                .updateResourceSourceCode({ filePath, codedata: { lineRange }, function: value, artifactType: DIRECTORY_MAP.SERVICE });
            const serviceArtifact = findServiceArtifact(res.artifacts);
            if (serviceArtifact) {
                fetchService(serviceArtifact.position);
                await rpcClient.getVisualizerRpcClient().openView({ type: EVENT_TYPE.UPDATE_PROJECT_LOCATION, location: { documentUri: serviceArtifact.path, position: serviceArtifact.position } });
                setIsSaving(false);
                setShowForm(false);
                return;
            }
        }
    };

    /**
     * This function invokes when a new function is added using right panel form.
     *
     * @param value
     * @param openDiagram - Whether to open the flow diagram after saving
     */
    const handleFunctionSubmit = async (value: FunctionModel, openDiagram: boolean = false, forceNew?: boolean) => {
        setIsSaving(true);
        const lineRange: LineRange = {
            startLine: { line: position.startLine, offset: position.startColumn },
            endLine: { line: position.endLine, offset: position.endColumn },
        };
        // `forceNew` lets a caller bypass the `isNew` state (e.g. a quick-add from the catalog that
        // never goes through the usual open-form flow, so the state may be stale).
        const addingNew = forceNew ?? isNew;
        let res = undefined;
        if (addingNew) {
            res = await rpcClient
                .getServiceDesignerRpcClient()
                .addFunctionSourceCode({ filePath, codedata: { lineRange }, function: value, artifactType: DIRECTORY_MAP.SERVICE });
            // Refused by the save-time gate: nothing was written, so leave the form open with the
            // user's input intact rather than closing it as if the handler had been created.
            if (hasBlockingValidationErrors(res.validationErrors)) {
                setServerValidationErrors(res.validationErrors);
                setIsSaving(false);
                return;
            }
            setServerValidationErrors([]);
            const serviceArtifact = findServiceArtifact(res.artifacts);
            if (serviceArtifact) {
                if (openDiagram) {
                    // Navigate to flow diagram for the newly created handler
                    const handler = serviceArtifact.resources?.find(
                        r => r.name === value.name.value
                    );
                    if (handler) {
                        await rpcClient.getVisualizerRpcClient().openView({
                            type: EVENT_TYPE.OPEN_VIEW,
                            location: { documentUri: handler.path, position: handler.position }
                        });
                    }
                } else {
                    // Just update the project location
                    fetchService(serviceArtifact.position);
                    await rpcClient.getVisualizerRpcClient().openView({
                        type: EVENT_TYPE.UPDATE_PROJECT_LOCATION,
                        location: { documentUri: serviceArtifact.path, position: serviceArtifact.position }
                    });
                }
            }
        } else {
            res = await rpcClient
                .getServiceDesignerRpcClient()
                .updateResourceSourceCode({ filePath, codedata: { lineRange }, function: value, artifactType: DIRECTORY_MAP.SERVICE });
            if (hasBlockingValidationErrors(res.validationErrors)) {
                setServerValidationErrors(res.validationErrors);
                setIsSaving(false);
                return;
            }
            setServerValidationErrors([]);
            const serviceArtifact = findServiceArtifact(res.artifacts);
            if (serviceArtifact) {
                fetchService(serviceArtifact.position);
                await rpcClient.getVisualizerRpcClient().openView({ type: EVENT_TYPE.UPDATE_PROJECT_LOCATION, location: { documentUri: serviceArtifact.path, position: serviceArtifact.position } });
            }
        }
        setIsNew(false);
        handleNewFunctionClose();
        handleFunctionConfigClose();
        setIsSaving(false);
    };

    const handleFunctionConfigClose = () => {
        setShowFunctionConfigForm(false);
    };

    const handleInitFunctionClose = () => {
        setIsNew(false);
    };

    const handleAddHandleClose = () => {
        setIsNew(false);
    };

    // ----- Try It -----
    const handleServiceTryIt = async () => {
        const basePath = serviceModel.properties?.basePath?.value?.trim();
        const listenerProperty = serviceModel.properties?.listener;
        const listener = (listenerProperty?.value ?? listenerProperty?.values?.[0] ?? '').trim();

        await rpcClient.getCommonRpcClient().executeCommand({
            commands: ["ballerina.tryIt", false, undefined, { basePath, listener }]
        });
    }

    const handleServiceTryItWithAI = async () => {
        const basePath = serviceModel.properties?.basePath?.value?.trim();
        const serviceName = serviceModel.name || "Service";

        const prompt = getTryItAIDefaultPromptService(serviceName, basePath);

        await rpcClient.getCommonRpcClient().executeCommand({
            commands: [SHARED_COMMANDS.OPEN_AI_PANEL, prompt]
        });
    };

    const handleExportOAS = () => {
        rpcClient.getServiceDesignerRpcClient().exportOASFile({});
    };

    const handleTryItDropdownOption = async (option: string) => {
        if (isTryItInProgress) {
            return;
        }

        const selectedOption = option as TryItOptionValue;
        if (isMountedRef.current) {
            setSelectedTryItOption(selectedOption);
            setIsTryItInProgress(true);
        }
        await rpcClient.getCommonRpcClient().setPreferredTryItOption(selectedOption).catch((error: unknown) => {
            console.error("Error saving preferred Try It option:", error);
        });
        try {
            switch (selectedOption) {
                case TryItOptionValue.TRY_IT:
                    await handleServiceTryIt();
                    break;
                case TryItOptionValue.TRY_IT_WITH_AI:
                    await handleServiceTryItWithAI();
                    break;
            }
        } finally {
            if (isMountedRef.current) {
                setIsTryItInProgress(false);
            }
        }
    };

    const handleTryItPrimaryAction = async () => {
        if (isTryItInProgress) {
            return;
        }
        let optionToRun = selectedTryItOption;
        try {
            const preferredOption = await rpcClient.getCommonRpcClient().getPreferredTryItOption();
            if (preferredOption === TryItOptionValue.TRY_IT || preferredOption === TryItOptionValue.TRY_IT_WITH_AI) {
                optionToRun = preferredOption;
                if (isMountedRef.current) {
                    setSelectedTryItOption(optionToRun);
                }
            } else {
                const tryItOptions = getTryItDropdownOptions("service").map(option => ({
                    label: option.title,
                    description: `(${option.description})`,
                    value: option.value
                }));
                const selected: TryItQuickPickItem = await rpcClient.getCommonRpcClient().showQuickPick({
                    items: tryItOptions,
                    options: { title: "Choose how you want to try out your service", placeHolder: "Select an option" }
                }) as TryItQuickPickItem;

                if (!selected) {
                    return;
                }
                optionToRun = selected.value;
                if (isMountedRef.current) {
                    setSelectedTryItOption(optionToRun);
                }
                await rpcClient.getCommonRpcClient().setPreferredTryItOption(optionToRun);
            }
            await handleTryItDropdownOption(optionToRun);
        } catch (error) {
            console.error("Error handling Try It first-time flow:", error);
        }
    };

    // ----- not yet implemented (UI stubs, wired up but no-op) -----
    const handleAddListener = () => {
        // TODO: Implement add listener functionality
        console.log("Add listener clicked");
    };

    const handleFieldEdit = () => {
    };

    const handleFieldDelete = () => {
    };

    const handleAddServiceField = () => {
        // TODO: Implement add service field functionality
        console.log("Add service field clicked");
    };

    // ----- misc UI helpers -----
    const findIcon = (label: string) => {
        label = label.toLowerCase();
        switch (true) {
            case label.includes("listener"):
                return "bell";
            case label.includes("path") || label.includes("base"):
                return "link";
            case label.includes("port"):
                return "ports";
            case label.includes("host"):
                return "server";
            case label.includes("name") || label.includes("queue"):
                return "tag";
            case label.includes("timeout"):
                return "clock";
            case label.includes("ssl") || label.includes("secure"):
                return "lock";
            case label.includes("config"):
                return "gear";
            default:
                return "info";
        }
    };

    const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
        setSearchValue(event.target.value);
    };

    // ----- derived/computed values (used directly by the render below) -----
    const tryItDropdownOptions: DropdownOptionProps[] = getTryItDropdownOptions("service");
    const activeTryItOption =
        tryItDropdownOptions.find((option) => option.value === selectedTryItOption) ?? tryItDropdownOptions[0];

    const haveServiceTypeName = serviceModel?.properties["serviceTypeName"]?.value;
    const displayServiceName = isFtpService
        ? (serviceModel?.name || "").replace(/\s*-\s*\/$/, "")
        : serviceModel?.name;

    const resourcesCount = resources
        .filter((resource) => resource.type === DIRECTORY_MAP.RESOURCE)
        .filter((resource) => {
            const search = searchValue.toLowerCase();
            const nameMatch = resource.name && resource.name.toLowerCase().includes(search);
            const iconMatch = resource.icon && resource.icon.toLowerCase().includes(search);
            return nameMatch || iconMatch;
        })
        .length;

    // ----- render -----
    return (
        <View>
            <TopNavigationBar projectPath={projectPath} />
            {!serviceModel && (
                <LoadingContainer>
                    <LoadingRing message="Loading Service..." />
                </LoadingContainer>
            )}
            {
                serviceModel && (
                    <>
                        <TitleBar
                            title={displayServiceName}
                            subtitle={"Implement and configure your service"}
                            actions={
                                <>
                                    <Button appearance="secondary" tooltip="Edit Service" onClick={handleServiceEdit}>
                                        <Icon
                                            name="bi-settings"
                                            sx={{
                                                marginRight: 5,
                                                fontSize: "16px",
                                                width: "16px",
                                            }}
                                        /> Configure
                                    </Button>
                                    {
                                        serviceModel && (isHttpService) && (
                                            <>
                                                <AddServiceElementDropdown
                                                    buttonTitle={activeTryItOption?.title || "Try It"}
                                                    toolTip="Try Service"
                                                    defaultOption={selectedTryItOption}
                                                    onPrimaryAction={handleTryItPrimaryAction}
                                                    buttonIconName={isTryItInProgress ? "loading" : activeTryItOption?.iconName}
                                                    buttonIconIsCodicon={isTryItInProgress ? true : activeTryItOption?.iconIsCodicon}
                                                    showButtonSpinner={isTryItInProgress}
                                                    onOptionChange={handleTryItDropdownOption}
                                                    options={tryItDropdownOptions}
                                                />
                                            </>
                                        )
                                    }
                                    {
                                        serviceModel && (isMcpService) && (
                                            <>
                                                <Button appearance="secondary" tooltip="Try Service" onClick={handleServiceTryIt}>
                                                    <><Icon name="play" isCodicon={true} sx={{ marginRight: 8, fontSize: 16 }} /> <ButtonText>Try It</ButtonText></>
                                                </Button>
                                            </>
                                        )
                                    }
                                    {serviceModel && !isMcpService && dropdownOptions.length > 0 && (
                                        <MoreOptionsDropdown
                                            tooltip="More Options"
                                            defaultOption="reusable-function"
                                            onOptionChange={handleAddDropdownOption}
                                            options={dropdownOptions}
                                        />
                                    )}
                                </>
                            }
                        />

                        <ServiceContainer>
                            {/* Service Metadata - Compact View */}
                            {(listeners.length > 0 || readonlyProperties.size > 0) && (
                                <ServiceMetadataContainer>
                                    <MetadataRow>
                                        {listeners.length > 0 && (
                                            <>
                                                {listeners.map((listener, index) => (
                                                    <PropertyInline key={`${index}-listener`}>
                                                        <Icon name="radio-tower" isCodicon sx={{ fontSize: 12 }} />
                                                        <PropertyKey>Listener:</PropertyKey>
                                                        <PropertyValue>
                                                            {listener.includes(":") ? getReadableListenerName(listener) : listener}
                                                        </PropertyValue>
                                                    </PropertyInline>
                                                ))}
                                            </>
                                        )}
                                        {readonlyProperties.size > 0 && (
                                            <>
                                                {
                                                    Array.from(readonlyProperties).map(prop => (
                                                        <PropertyInline key={prop.label}>
                                                            <PropertyKey>{prop.label}:</PropertyKey>
                                                            <PropertyValue>
                                                                {Array.isArray(prop.value) ? prop.value.join(", ") : removeForwardSlashes(prop.value)}
                                                            </PropertyValue>
                                                        </PropertyInline>
                                                    ))
                                                }
                                            </>
                                        )}
                                    </MetadataRow>
                                </ServiceMetadataContainer>
                            )}


                            {resources.filter((resource) => resource.type === DIRECTORY_MAP.FUNCTION && resource.name === "init").length > 0 && (
                                <>
                                    <SectionHeader
                                        title="Initialization Function"
                                        subtitle={`Define the initialization logic for the service`}
                                    >
                                    </SectionHeader>
                                    <FunctionsContainer>
                                        {resources
                                            .filter((resource) => resource.type === DIRECTORY_MAP.FUNCTION && resource.name === "init")
                                            .map((resource, index) => (
                                                <ResourceAccordionV2
                                                    methodName="INIT"
                                                    key={`${index}-${resource.name}`}
                                                    resource={resource}
                                                    readOnly={serviceModel.properties.hasOwnProperty('serviceTypeName')}
                                                    onEditResource={null}
                                                    onDeleteResource={handleFunctionDelete}
                                                    onResourceImplement={() => { openInit(resource) }}
                                                    deletionTypeLabel="initialization function"
                                                />
                                            ))}
                                    </FunctionsContainer>

                                </>
                            )}


                            {/* Listing Resources in HTTP */}
                            {isHttpService && (
                                <>

                                    <>
                                        <SectionHeader
                                            title="Resources"
                                            subtitle={`${resourcesCount === 0 ? `` : 'Define how the service responds to HTTP requests'}`}
                                        >
                                            <ActionGroup>
                                                {resources.length > 10 && (
                                                    <TextField placeholder="Search..." sx={{ width: 200 }} onChange={handleSearch} value={searchValue} />
                                                )}
                                                {!haveServiceTypeName && resourcesCount > 0 && (
                                                    <Button appearance="primary" tooltip="Add Resource" onClick={handleNewResourceFunction}>
                                                        <Codicon name="add" sx={{ marginRight: 8 }} /> <ButtonText>Resource</ButtonText>
                                                    </Button>
                                                )}
                                            </ActionGroup>
                                        </SectionHeader>
                                        {resourcesCount > 0 && (
                                            <FunctionsContainer>
                                                {resources
                                                    .filter((resource) => {
                                                        const search = searchValue.toLowerCase();
                                                        const nameMatch = resource.name && resource.name.toLowerCase().includes(search);
                                                        const iconMatch = resource.icon && resource.icon.toLowerCase().includes(search);
                                                        return nameMatch || iconMatch;
                                                    })
                                                    .filter((resource) => resource.type === DIRECTORY_MAP.RESOURCE)
                                                    .sort((a, b) => a.position?.startLine - b.position?.startLine)
                                                    .map((resource, index) => (
                                                        <ResourceAccordionV2
                                                            key={`${index}-${resource.name}`}
                                                            resource={resource}
                                                            readOnly={serviceModel.properties.hasOwnProperty('serviceTypeName')}
                                                            onEditResource={handleFunctionEdit}
                                                            onDeleteResource={handleFunctionDelete}
                                                            onResourceImplement={handleOpenDiagram}
                                                            deletionTypeLabel="resource"
                                                        />
                                                    ))}
                                            </FunctionsContainer>
                                        )}
                                        {resourcesCount === 0 && (
                                            <EmptyReadmeContainer>
                                                <Description variant="body2">
                                                    No resources found. Add a new resource.
                                                </Description>
                                                <Button
                                                    appearance="primary"
                                                    onClick={handleNewResourceFunction}>
                                                    <Codicon name="add" sx={{ marginRight: 5 }} />
                                                    Add Resource
                                                </Button>
                                            </EmptyReadmeContainer>
                                        )}
                                    </>
                                </>
                            )}

                            {/* Listing service type bound functions (event/file handlers, MCP tools, ...) */}
                            {!isHttpService && (
                                <>
                                    <SectionHeader
                                        title={isFileService ? "File Handlers" : isMcpService ? "Tools" : "Event Handlers"}
                                        subtitle={enabledHandlers.length === 0 ? "" : isMcpService
                                            ? "Define how the mcp service responds to tool calls"
                                            : `Define how the service responds to events`}
                                    >
                                        <ActionGroup>
                                            {enabledHandlers.length !== 0 && unusedHandlers.length > 0 && (
                                                <Button
                                                    appearance="primary"
                                                    tooltip={isMcpService ? "Add Tool" : "Add Handler"}
                                                    onClick={onSelectAddHandler}
                                                >
                                                    <Codicon name="add" sx={{ marginRight: 8 }} />
                                                    <ButtonText>{isMcpService ? "Tool" : "Handler"}</ButtonText>
                                                </Button>
                                            )}
                                        </ActionGroup>
                                    </SectionHeader>
                                    <FunctionsContainer>
                                        {enabledHandlers.map((functionModel, index) => {
                                            // A schema-driven handler with nothing configurable (e.g.
                                            // kafka's onError) opens an empty form — gray out the edit button.
                                            const editDisabled = isSchemaTriggerService
                                                && !hasConfigurableFields(functionModel);
                                            return (
                                                <ResourceAccordion
                                                    key={`${index}-${functionModel.name.value}`}
                                                    functionModel={functionModel}
                                                    goToSource={() => { }}
                                                    onEditResource={handleFunctionEdit}
                                                    onDeleteResource={handleFunctionDelete}
                                                    onResourceImplement={handleOpenDiagram}
                                                    deletionTypeLabel={isMcpService ? "tool" : `${handlerNoun} handler`}
                                                    editDisabled={editDisabled}
                                                />
                                            );
                                        })}
                                    </FunctionsContainer>

                                    {enabledHandlers.length === 0 && (
                                        <EmptyReadmeContainer>
                                            <Description variant="body2">
                                                {isMcpService
                                                    ? "No tools found. Add a new tool."
                                                    : `No ${handlerNoun} handlers found. Add a new ${handlerNoun} handler.`}
                                            </Description>
                                            <Button
                                                appearance="primary"
                                                onClick={onSelectAddHandler}>
                                                <Codicon name="add" sx={{ marginRight: 5 }} />
                                                {isMcpService ? "Add Tool" : "Add Handler"}
                                            </Button>
                                        </EmptyReadmeContainer>
                                    )}
                                </>
                            )}


                            {resources.filter((resource) => resource.type === DIRECTORY_MAP.FUNCTION && resource.name !== "init").length > 0 && (
                                <>
                                    <SectionHeader
                                        title="Functions"
                                        subtitle="Reusable functions within the service"
                                    >
                                    </SectionHeader>
                                    <FunctionsContainer>
                                        {resources
                                            .filter((resource) => {
                                                const search = searchValue.toLowerCase();
                                                const nameMatch = resource.name && resource.name.toLowerCase().includes(search);
                                                const iconMatch = resource.icon && resource.icon.toLowerCase().includes(search);
                                                return nameMatch || iconMatch;
                                            })
                                            .filter((resource) => resource.type === DIRECTORY_MAP.FUNCTION && resource.name !== "init")
                                            .map((resource, index) => (
                                                <ResourceAccordionV2
                                                    methodName="FUNC"
                                                    key={`${index}-${resource.name}`}
                                                    resource={resource}
                                                    readOnly={serviceModel.properties.hasOwnProperty('serviceTypeName')}
                                                    onEditResource={handleFunctionEdit}
                                                    onDeleteResource={handleFunctionDelete}
                                                    onResourceImplement={handleOpenDiagram}
                                                    deletionTypeLabel="function"
                                                />
                                            ))}
                                    </FunctionsContainer>
                                </>
                            )}

                            {/* This is for adding a http resource */}
                            {functionModel && isHttpService && functionModel.kind === "RESOURCE" && isNew && (
                                <PanelContainer
                                    title={"Select HTTP Method to Add"}
                                    show={showForm}
                                    onClose={handleNewFunctionClose}
                                    width={400}
                                >
                                    <ResourceForm
                                        model={functionModel}
                                        isSaving={isSaving}
                                        onSave={handleResourceSubmit}
                                        onClose={handleNewFunctionClose}
                                        isNew={isNew}
                                        existingResources={resources}
                                        payloadContext={{
                                            protocol: Protocol.HTTP,
                                            serviceName: serviceModel.name || '',
                                            serviceBasePath: serviceModel.properties?.basePath?.value || '',
                                        }}
                                    />
                                </PanelContainer>
                            )}

                            {/* This is for editing a http resource */}
                            {functionModel && isHttpService && functionModel.kind === "RESOURCE" && !isNew && (
                                <PanelContainer
                                    title={"Resource Configuration"}
                                    show={showForm}
                                    onClose={handleNewFunctionClose}
                                    width={400}
                                >
                                    <ResourceForm
                                        model={functionModel}
                                        isSaving={isSaving}
                                        filePath={filePath}
                                        onSave={handleResourceSubmit}
                                        onClose={handleNewFunctionClose}
                                        existingResources={resources}
                                        payloadContext={{
                                            protocol: Protocol.HTTP,
                                            serviceName: serviceModel.name || '',
                                            serviceBasePath: serviceModel.properties?.basePath?.value || '',
                                        }}
                                    />
                                </PanelContainer>
                            )}

                            {/* This is for adding or editing functions with data binding */}
                            {functionModel && !isHttpService
                                && !isSchemaTriggerService && canDataBind(functionModel) && (
                                <PanelContainer
                                    title={"Message Handler Configuration"}
                                    show={showForm}
                                    onClose={handleNewFunctionClose}
                                    width={400}
                                >
                                    <DatabindForm
                                        model={functionModel}
                                        isSaving={isSaving}
                                        onSave={handleFunctionSubmit}
                                        onClose={handleNewFunctionClose}
                                        isNew={isNew}
                                        payloadContext={{
                                            protocol: isCdcService ? Protocol.CDC : Protocol.MESSAGE_BROKER,
                                            serviceName: serviceModel.name || '',
                                            messageDocumentation: functionModel?.metadata?.description || ''
                                        }}
                                        useInlineDataBinding={isCdcService}
                                        serviceProperties={serviceModel.properties}
                                        serviceModuleName={serviceModel.moduleName}
                                    />
                                </PanelContainer>
                            )}

                            {/* This is for adding or editing functions */}
                            {functionModel && !isHttpService
                                && !isSchemaTriggerService && !canDataBind(functionModel) && (
                                <PanelContainer
                                    title={"Function Configuration"}
                                    show={showForm}
                                    onClose={handleNewFunctionClose}
                                    width={600}
                                >
                                    <FunctionForm
                                        model={functionModel}
                                        onSave={handleFunctionSubmit}
                                        onClose={handleNewFunctionClose}
                                    />
                                </PanelContainer>
                            )}

                            {/* This is for adding a new handler to the service */}
                            {serviceModel && !isHttpService && !isSchemaTriggerService && (
                                <PanelContainer
                                    title={"Select Handler to Add"}
                                    show={showFunctionConfigForm}
                                    onClose={handleFunctionConfigClose}
                                >
                                    <FunctionConfigForm
                                        isSaving={isSaving}
                                        serviceModel={serviceModel}
                                        onSubmit={handleFunctionSubmit}
                                        onSelect={onHandlerSelected}
                                        onBack={handleFunctionConfigClose}
                                    />
                                </PanelContainer>
                            )}
                            {/* Schema-driven trigger: group catalog + generic handler form */}
                            {serviceModel && isSchemaTriggerService && (
                                <PanelContainer
                                    title={"Select Handler to Add"}
                                    show={showFunctionConfigForm}
                                    onClose={handleFunctionConfigClose}
                                >
                                    <TriggerHandlerConfigForm
                                        isSaving={isSaving}
                                        serviceModel={serviceModel}
                                        onSubmit={handleNewTriggerHandler}
                                        onQuickAdd={handleQuickAddTriggerHandler}
                                        onBack={handleFunctionConfigClose}
                                    />
                                </PanelContainer>
                            )}
                            {serviceModel && isSchemaTriggerService && (
                                <PanelContainer
                                    title={getTriggerHandlerTitle()}
                                    show={showForm}
                                    onClose={handleNewFunctionClose}
                                    width={400}
                                >
                                    {showForm && (
                                        <TriggerHandlerForm
                                            key={`${isNew ? "new" : "edit"}-${selectedTriggerGroup ?? functionModel?.name?.value ?? "handler"}`}
                                            functionModel={functionModel}
                                            serviceModel={serviceModel}
                                            isSaving={isSaving}
                                            filePath={filePath}
                                            onSave={handleFunctionSubmit}
                                            onClose={handleNewFunctionClose}
                                            isNew={isNew}
                                            selectedGroup={selectedTriggerGroup}
                                            serverValidationErrors={serverValidationErrors}
                                        />
                                    )}
                                </PanelContainer>
                            )}
                            {/* This is for adding a init function to the service */}
                            <PanelContainer
                                title={"Add Initialization Function"}
                                show={!!initFunction}
                                onClose={handleCloseInitFunction}
                                onBack={handleCloseInitFunction}
                                width={400}
                            >
                                <FunctionForm
                                    model={initFunction}
                                    onSave={handleInitFunctionSave}
                                    onClose={handleCloseInitFunction}
                                />
                            </PanelContainer>
                        </ServiceContainer>
                    </>
                )
            }
        </View>
    );
}

interface SectionHeaderProps {
    title: string;
    subtitle: string;
    children?: React.ReactNode;
}

function SectionHeader({ title, subtitle, children }: SectionHeaderProps) {
    return (
        <HeaderContainer>
            <div>
                <Typography
                    variant="h3"
                    sx={{ marginLeft: 10, fontWeight: 'bold', marginBottom: 4 }}
                >
                    {title}
                </Typography>
                <Typography
                    variant="body3"
                    sx={{ marginLeft: 10, color: 'var(--vscode-descriptionForeground)', marginBottom: 0 }}
                >
                    {subtitle}
                </Typography>
            </div>
            {children}
        </HeaderContainer>
    );
}
