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

import { useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import { Button, Codicon } from "@wso2/ui-toolkit";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { NodeList, Category as PanelCategory, FormField, FormValues } from "@wso2/ballerina-side-panel";
import {
    ActivityActionAnalysis,
    AvailableNode,
    Category,
    CodeData,
    DIRECTORY_MAP,
    EVENT_TYPE,
    FlowNode,
    InputType,
    MACHINE_VIEW,
    NodeProperties,
    ParentPopupData,
    Property,
    ToolParameters,
    ToolParametersValue,
} from "@wso2/ballerina-core";
import { cloneDeep } from "lodash";

import { convertBICategoriesToSidePanelCategories } from "../../../utils/bi";
import ArtifactForm from "../Forms/ArtifactForm";
import { RelativeLoader } from "../../../components/RelativeLoader";
import { createDefaultParameterValue, createToolParameters } from "../AIChatAgent/formUtils";
import { REMOTE_ACTION_CALL, RESOURCE_ACTION_CALL } from "../../../constants";

const LoaderContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
`;

const ImplementationBadge = styled.div`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background-color: var(--vscode-input-background);
    border: 1px solid var(--vscode-editorWidget-border);
    border-radius: 4px;
    padding: 6px 10px;
    font-size: 12px;
    color: var(--vscode-foreground);
    margin-bottom: 4px;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const HelpContainer = styled.div`
    margin: -4px 0 4px 0;
`;

const HelpTitle = styled.div`
    font-size: 13px;
    font-weight: 600;
    color: var(--vscode-foreground);
`;

const HelpDetail = styled.div`
    font-size: 12px;
    line-height: 1.5;
    color: var(--vscode-descriptionForeground);
    margin-top: 2px;
`;

const UnsupportedContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    font-size: 13px;
    line-height: 1.5;
    color: var(--vscode-foreground);
`;

const WarningBox = styled.div`
    display: flex;
    gap: 8px;
    background-color: var(--vscode-inputValidation-warningBackground);
    border: 1px solid var(--vscode-inputValidation-warningBorder);
    border-radius: 4px;
    padding: 10px;
`;

const ReasonList = styled.ul`
    margin: 4px 0 0 0;
    padding-left: 18px;
`;

enum PanelView {
    CONNECTION_LIST = "CONNECTION_LIST",
    ACTIVITY_FORM = "ACTIVITY_FORM",
    UNSUPPORTED = "UNSUPPORTED",
}

// The return-type field key. The action node's own `type` property key is also "type", so the derived
// value written on submit targets both this field and the flow node property.
const RETURN_TYPE_KEY = "type";
// Suffix for the inline value field shown when a parameter is not exposed as an activity parameter.
const DEFAULT_VALUE_SUFFIX = "__default";
// Key of the "expose the connection as a parameter" checkbox.
const CONNECTION_AS_PARAM_KEY = "connectionAsParam";
// Default type offered when the action's return type is inferred (dependently typed).
const DEFAULT_DEPENDENT_RETURN_TYPE = "json";

// Explains what the parameter form is for, shown after the Description field: a prominent title with a
// short secondary detail line.
const ACTIVITY_INPUT_TITLE = "Choose what the activity takes as input.";
const ACTIVITY_INPUT_HELP = "Check a parameter to make it an input; uncheck to give it a fixed value.";

// Capitalizes the first letter — used to derive a default activity name from the action symbol.
function capitalizeFirst(text: string): string {
    const trimmed = (text || "").trim();
    return trimmed ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1) : "";
}

// Derives a default activity name from the action: the module prefix followed by the capitalized action
// (e.g. http `post` -> "httpPost", mysql `query` -> "mysqlQuery"). Most modules expose a single client,
// so the client/object name is omitted. Falls back to the bare action when no module is known.
function defaultActivityName(codedata?: CodeData): string {
    const symbol = (codedata?.symbol || "").trim();
    if (!symbol) {
        return "";
    }
    // Use the last module segment (e.g. "googleapis.sheets" -> "sheets") as a short, identifier-safe prefix.
    const modulePrefix = (codedata?.module || "").split(/[./]/).pop()?.replace(/[^a-zA-Z0-9]/g, "") || "";
    return modulePrefix ? `${modulePrefix}${capitalizeFirst(symbol)}` : symbol;
}

// The narrowed primary input mode for a fixed-value field, keyed by the parameter's Ballerina type.
// A primitive gets a type-appropriate input (a string opens the text box, a number the numeric input),
// shown with the type as a pill; anything else falls back to the plain expression editor.
const NARROWED_VALUE_MODE: Record<string, string> = {
    string: "TEXT",
    int: "NUMBER",
    float: "NUMBER",
    decimal: "NUMBER",
};

// Builds the multi-mode input-type list for a fixed-value field so it shows the parameter's type as a
// pill and defaults to the type-appropriate input, while still offering the generic expression mode.
// Mirrors the shape the LS produces for typed fields: a narrowed primary mode (selected) plus an
// EXPRESSION entry carrying the full declared type. The narrowed modes serialize to valid Ballerina
// (the text mode quotes the value, e.g. `aa` -> `"aa"`), so the baked action-call argument is correct.
function valueFieldTypes(paramType: string): InputType[] {
    const ballerinaType = paramType?.trim() || "";
    const expression = { fieldType: "EXPRESSION", ballerinaType, selected: false } as InputType;
    const primaryFieldType = NARROWED_VALUE_MODE[ballerinaType];
    return primaryFieldType
        ? [{ fieldType: primaryFieldType, ballerinaType, selected: true } as InputType, expression]
        : [{ ...expression, selected: true }];
}

interface NewActivityFromConnectionProps {
    /** Path of the file the workflow diagram is rendered for. The activity is added to this file. */
    fileName: string;
    /** "Next": called after the activity is generated to proceed to the callActivity step (the caller
     * opens the call form for the new activity). */
    onActivityCreated: (activityName: string) => void;
    /** "Create Activity": called after the activity is generated to return to the activity selection
     * screen. Falls back to onActivityCreated when not provided. */
    onActivityCreatedReturnToList?: (activityName: string) => void;
    /** Navigate back to the activity list (from the connection list). */
    onBack?: () => void;
    /** Close the side panel. */
    onClose?: () => void;
}

/**
 * "Create new Activity from Action" wizard (step 1 and 2 of the select-action → create-activity →
 * call-activity flow). The user picks a connection (or creates one), selects one of its actions, and
 * gets a selection form driven by the LS signature analysis:
 *
 * <ul>
 *   <li>Each derived parameter is a checkbox. Checked, it becomes an activity parameter (the caller
 *       supplies the value at call time). Unchecked, an inline value field appears and that value is
 *       baked into the action call inside the activity — required parameters must then have a value,
 *       optional ones left empty are omitted (the action default applies).</li>
 *   <li>The derived return type is read-only, except for dependently-typed actions where the user
 *       provides the expected type T and the activity returns {@code T|error}.</li>
 * </ul>
 *
 * On create, the backend generates the `@workflow:Activity` passthrough wrapper (connection closed
 * over, stream returns collected into arrays), and the caller opens the normal callActivity form with
 * the new activity selected (step 3) where the workflow data is wired in.
 */
export function NewActivityFromConnection(props: NewActivityFromConnectionProps): JSX.Element {
    const { fileName, onActivityCreated, onActivityCreatedReturnToList, onBack, onClose } = props;
    const { rpcClient } = useRpcContext();

    const [panelView, setPanelView] = useState<PanelView>(PanelView.CONNECTION_LIST);
    const [categories, setCategories] = useState<PanelCategory[]>([]);
    const [fields, setFields] = useState<FormField[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [saving, setSaving] = useState<boolean>(false);
    const [unsupportedReasons, setUnsupportedReasons] = useState<string[]>([]);

    const flowNodeRef = useRef<FlowNode>(null);
    const selectedNodeRef = useRef<AvailableNode>(undefined);
    const analysisRef = useRef<ActivityActionAnalysis>(undefined);
    const isSelectingNodeRef = useRef<boolean>(false);
    // Which parameters are exposed as activity parameters (checkbox state), and the latest form
    // values — used to rebuild the field list on checkbox toggles without losing user input.
    const checkedParamsRef = useRef<Record<string, boolean>>({});
    const formValuesRef = useRef<FormValues>({});

    useEffect(() => {
        fetchConnections();
    }, []);

    // When the "Add Connection" wizard (launched from the connection list) finishes, a new global
    // connection has been written to connections.bal — refresh the list so it appears.
    useEffect(() => {
        rpcClient.onParentPopupSubmitted((parent: ParentPopupData) => {
            if (parent.artifactType === DIRECTORY_MAP.CONNECTION) {
                fetchConnections();
            }
        });
    }, [rpcClient]);

    // Launch the standard (global) connection-creation wizard, mirroring the AI agent tool flow.
    const handleAddConnection = () => {
        rpcClient.getVisualizerRpcClient().openView({
            type: EVENT_TYPE.OPEN_VIEW,
            location: {
                view: MACHINE_VIEW.AddConnectionWizard,
                documentUri: fileName,
            },
            isPopup: true,
        });
    };

    const fetchConnections = async () => {
        setLoading(true);
        try {
            const response = await rpcClient.getBIDiagramRpcClient().getAvailableNodes({
                position: { line: 0, offset: 0 },
                filePath: fileName,
            });
            if (!response.categories) {
                console.error(">>> Error getting available nodes", response);
                return;
            }
            const connectionsCategory = response.categories.filter(
                (item) => item.metadata.label === "Connections"
            ) as Category[];
            // remove connections which names start with _ underscore
            if (connectionsCategory.at(0)?.items) {
                connectionsCategory.at(0).items = connectionsCategory
                    .at(0)
                    .items.filter((item) => !item.metadata.label.startsWith("_"));
            }
            setCategories(convertBICategoriesToSidePanelCategories(connectionsCategory));
        } catch (error) {
            console.error(">>> Error fetching connections", { error });
            await rpcClient.getCommonRpcClient().showErrorMessage({
                message: "Failed to load connections.",
            });
        } finally {
            setLoading(false);
        }
    };

    const getImplementationString = (codeData: CodeData | undefined): string => {
        if (!codeData) {
            return "";
        }
        switch (codeData.node) {
            case RESOURCE_ACTION_CALL:
                return `${codeData.parentSymbol} -> ${codeData.symbol} ${codeData.resourcePath}`;
            case REMOTE_ACTION_CALL:
                return `${codeData.parentSymbol} -> ${codeData.symbol}`;
            default:
                return "";
        }
    };

    /**
     * Builds the wizard's field list for the current checkbox state, carrying over the given form
     * values so toggling a checkbox does not discard what the user has already entered.
     */
    const buildWizardFields = (
        analysis: ActivityActionAnalysis,
        checked: Record<string, boolean>,
        values: FormValues
    ): FormField[] => {
        const wizardFields: FormField[] = [
            {
                key: `name`,
                label: "Activity Name",
                type: "IDENTIFIER",
                optional: false,
                editable: true,
                documentation: "Enter a unique name for the activity.",
                value: values["name"] ?? "",
                types: [{ fieldType: "IDENTIFIER", scope: "Global", selected: false }],
                enabled: true,
            },
            {
                key: `description`,
                label: "Description",
                type: "TEXTAREA",
                optional: true,
                editable: true,
                documentation: "Describe what this activity does.",
                value: values["description"] ?? "",
                types: [{ fieldType: "STRING", selected: false }],
                enabled: true,
            },
        ];

        // Expose the connection on the activity signature (built-in activity style) instead of
        // closing over the module-level connection — useful when the caller supplies the connection.
        wizardFields.push({
            key: CONNECTION_AS_PARAM_KEY,
            label: "Connection as parameter",
            type: "FLAG",
            optional: true,
            editable: true,
            documentation:
                "Expose the connection as the activity's first parameter (like the built-in activities) instead of using the module-level connection.",
            value: values[CONNECTION_AS_PARAM_KEY] === true,
            types: [{ fieldType: "FLAG", selected: true }],
            enabled: true,
        });

        for (const param of analysis.params || []) {
            const isChecked = checked[param.name] === true;
            const descriptionPrefix = param.description ? `${param.description} — ` : "";
            if (param.required) {
                wizardFields.push({
                    key: param.name,
                    label: param.name,
                    type: "FLAG",
                    optional: true,
                    editable: true,
                    documentation: `${descriptionPrefix}${param.type} (required)`,
                    value: isChecked,
                    types: [{ fieldType: "FLAG", selected: true }],
                    enabled: true,
                });
                if (!isChecked) {
                    // A required parameter that is not exposed must get its value here — it is baked
                    // into the action call inside the activity. The field is a type-aware multi-mode
                    // input: it defaults to the parameter's type (a string opens the text box) shown as
                    // a type pill, while still letting the user switch to the generic expression mode.
                    // It is indented right under its checkbox and labelled "Value for '<param>'" so it
                    // reads as the value for the parameter just unchecked.
                    const valueTypes = valueFieldTypes(param.type);
                    wizardFields.push({
                        key: `${param.name}${DEFAULT_VALUE_SUFFIX}`,
                        label: `Value for '${param.name}'`,
                        type: valueTypes[0].fieldType,
                        optional: false,
                        editable: true,
                        indent: true,
                        documentation: `The fixed value used for '${param.name}' when the activity calls the action.`,
                        value: values[`${param.name}${DEFAULT_VALUE_SUFFIX}`] ?? "",
                        types: valueTypes,
                        enabled: true,
                    } as FormField);
                }
            } else {
                // Optional parameters live under the collapsed advanced section, unchecked by
                // default. Unchecked, the argument is omitted (the action default applies); the
                // generated activity can be edited manually for custom fixed values.
                wizardFields.push({
                    key: param.name,
                    label: param.name,
                    type: "FLAG",
                    optional: true,
                    editable: true,
                    advanced: true,
                    documentation: `${descriptionPrefix}${param.type} (optional)`,
                    value: isChecked,
                    types: [{ fieldType: "FLAG", selected: true }],
                    enabled: true,
                });
            }
        }

        if (analysis.dependentReturn) {
            wizardFields.push({
                key: RETURN_TYPE_KEY,
                label: "Return Type",
                type: "TYPE",
                optional: false,
                editable: true,
                documentation:
                    "The action's return type is inferred; provide the expected data type T. The activity returns T|error.",
                // The typedesc constraint (filtered to data types) is the suggested default.
                value: values[RETURN_TYPE_KEY] ?? (analysis.returnType || DEFAULT_DEPENDENT_RETURN_TYPE),
                types: [{ fieldType: "TYPE", selected: true }],
                enabled: true,
            });
        } else if (analysis.returnType) {
            // A derived union leaves the user a choice, so keep it editable (narrowing it is up to
            // them — an incompatible edit is theirs to fix). Single types stay read-only.
            const isUnion = analysis.returnType.includes("|");
            wizardFields.push({
                key: RETURN_TYPE_KEY,
                label: "Return Type",
                type: "TYPE",
                optional: false,
                editable: isUnion,
                documentation: analysis.streamElementType
                    ? "The action returns a stream; the activity collects it and returns an array."
                    : isUnion
                      ? "The action returns a union — narrow it to the type this activity should return."
                      : "The data type this activity returns.",
                value: values[RETURN_TYPE_KEY] ?? analysis.returnType,
                types: [{ fieldType: "TYPE", selected: true }],
                enabled: true,
            });
        }
        return wizardFields;
    };

    const handleOnSelectNode = async (nodeId: string, metadata?: any) => {
        if (isSelectingNodeRef.current) {
            return;
        }
        if (nodeId !== REMOTE_ACTION_CALL && nodeId !== RESOURCE_ACTION_CALL) {
            console.warn(">>> Only remote and resource actions can be wrapped as activities", { nodeId });
            return;
        }
        isSelectingNodeRef.current = true;
        setLoading(true);
        try {
            const node = metadata.node as AvailableNode;
            selectedNodeRef.current = node;

            // The LS derives the activity signature from the action (required/optional params with
            // data types, return type, stream collection) or reports why it can't be wrapped.
            const analysisResponse = await rpcClient.getBIDiagramRpcClient().analyzeActivityAction({
                filePath: fileName,
                connection: node.codedata?.parentSymbol || "",
                actionName: node.codedata?.symbol || "",
                nodeKind: nodeId,
            });
            if (analysisResponse.errorMsg || !analysisResponse.analysis) {
                console.error(">>> Error analyzing the action", analysisResponse);
                await rpcClient.getCommonRpcClient().showErrorMessage({
                    message: `Failed to analyze the action '${node.codedata?.symbol}'.`,
                });
                return;
            }
            const analysis = analysisResponse.analysis;
            analysisRef.current = analysis;

            if (!analysis.supported) {
                setUnsupportedReasons(analysis.reasons || []);
                setPanelView(PanelView.UNSUPPORTED);
                return;
            }

            // The action node template carries the action call shape (resource path, arg slots) used
            // by the activity generation.
            const nodeTemplate = await rpcClient.getBIDiagramRpcClient().getNodeTemplate({
                position: { line: 0, offset: 0 },
                filePath: fileName,
                id: node.codedata,
            });
            if (!nodeTemplate.flowNode) {
                console.error(">>> Node template flowNode not found");
                return;
            }
            flowNodeRef.current = nodeTemplate.flowNode;

            const templateDescription = (nodeTemplate.flowNode?.metadata?.description || "")
                .replace(/```[\s\S]*?```/g, "")
                .trim();

            // Required parameters are exposed as activity parameters by default (unchecking switches
            // them to a fixed value provided in the form); optional parameters start unchecked under
            // the advanced section (the action default applies).
            const checked: Record<string, boolean> = {};
            for (const param of analysis.params || []) {
                checked[param.name] = param.required;
            }
            checkedParamsRef.current = checked;
            // Pre-fill the activity name with the module prefix + capitalized action (e.g. "httpPost")
            // so the form opens with a specific, valid default instead of an empty, invalid name.
            formValuesRef.current = {
                name: defaultActivityName(node.codedata),
                description: templateDescription,
            };

            setFields(buildWizardFields(analysis, checked, formValuesRef.current));
            setPanelView(PanelView.ACTIVITY_FORM);
        } catch (error) {
            console.error(">>> Error preparing the create-activity form", error);
        } finally {
            setLoading(false);
            isSelectingNodeRef.current = false;
        }
    };

    const handleFormChange = (fieldKey: string, value: any, allValues: FormValues) => {
        formValuesRef.current = { ...formValuesRef.current, ...allValues, [fieldKey]: value };
        const analysis = analysisRef.current;
        if (!analysis) {
            return;
        }
        const param = (analysis.params || []).find((p) => p.name === fieldKey);
        if (!param) {
            return;
        }
        const checked = { ...checkedParamsRef.current, [fieldKey]: value === true };
        checkedParamsRef.current = checked;
        // A required parameter's checkbox toggles its inline value field: rebuild the field list,
        // carrying the latest values over. Optional checkboxes don't change the field structure.
        if (param.required) {
            setFields(buildWizardFields(analysis, checked, formValuesRef.current));
        }
    };

    // proceedToCall = true is the "Next" action (continue to the callActivity step); false is
    // "Create Activity" (create and return to the activity selection screen).
    const handleActivitySubmit = async (data: FormValues, proceedToCall: boolean) => {
        const name = data["name"] || "";
        const cleanName = name.trim().replace(/[^a-zA-Z0-9]/g, "") || "newActivity";
        if (data.description) {
            data.description = data.description.replace(/```[\s\S]*?```/g, "").replace(/\n/g, " ").trim();
        }
        const analysis = analysisRef.current;
        const clonedFlowNode = flowNodeRef.current ? cloneDeep(flowNodeRef.current) : null;
        if (!clonedFlowNode || !analysis) {
            console.error(">>> Node template or analysis not found");
            return;
        }

        // Checked parameters become the activity's parameters, passed straight through to the action
        // call. An unchecked required parameter gets its form-provided value baked into the call;
        // unchecked optional parameters are omitted so the action default applies.
        const checked = checkedParamsRef.current;
        const activityParameters: ToolParameters = createToolParameters();
        activityParameters.metadata = { label: "Parameters", description: "Activity function parameters" };
        const parametersValue = activityParameters.value as ToolParametersValue;
        const newProperties = { ...(clonedFlowNode.properties || {}) } as Record<string, Property>;
        for (const param of analysis.params || []) {
            const isChecked = checked[param.name] === true;
            if (isChecked) {
                parametersValue[param.name] = createDefaultParameterValue({
                    value: param.name,
                    type: param.type,
                    // Carried into the generated activity's parameter doc line.
                    parameterDescription: param.description,
                });
            }
            const property = newProperties[param.name];
            if (!property) {
                continue;
            }
            const value = isChecked
                ? param.name
                : param.required
                  ? String(data[`${param.name}${DEFAULT_VALUE_SUFFIX}`] ?? "")
                  : "";
            newProperties[param.name] = { ...property, value };
        }

        // Return type: for dependently-typed actions the user-provided T (activity returns T|error),
        // falling back to the typedesc-constraint default; otherwise the derived type — which the user
        // may have narrowed when it is a union. Drive both the result type and the databinding target.
        const returnType = analysis.dependentReturn
            ? String(data[RETURN_TYPE_KEY] || analysis.returnType || DEFAULT_DEPENDENT_RETURN_TYPE)
            : String(data[RETURN_TYPE_KEY] || analysis.returnType || "");
        if (returnType) {
            for (const key of ["type", "targetType"]) {
                if (newProperties[key]) {
                    newProperties[key] = { ...newProperties[key], value: returnType };
                }
            }
        }
        clonedFlowNode.properties = newProperties as NodeProperties;
        clonedFlowNode.codedata.isNew = true;
        clonedFlowNode.codedata.lineRange = {
            fileName: fileName.split(/[\\/]/).pop(),
            startLine: { line: 0, offset: 0 },
            endLine: { line: 0, offset: 0 },
        };

        setSaving(true);
        try {
            const response = await rpcClient.getBIDiagramRpcClient().genActivity({
                filePath: fileName,
                flowNode: clonedFlowNode,
                activityName: cleanName,
                description: data["description"] || "",
                connection: selectedNodeRef.current?.codedata?.parentSymbol || "",
                activityParameters,
                streamElementType: analysis.dependentReturn ? undefined : analysis.streamElementType,
                connectionAsParam: data[CONNECTION_AS_PARAM_KEY] === true,
            });
            if (response?.errorMsg) {
                console.error(">>> Error creating activity from connection", response);
                await rpcClient.getCommonRpcClient().showErrorMessage({
                    message: `Failed to create the activity '${cleanName}'. ${response.errorMsg}`,
                });
                setSaving(false);
                return;
            }
            // Keep the loader up (do not clear `saving`) so the panel shows the spinner through the
            // transition to the next screen instead of flashing this form again; this component
            // unmounts when the parent switches views. "Next" proceeds to the callActivity step;
            // "Create Activity" returns to the activity selection screen.
            if (proceedToCall || !onActivityCreatedReturnToList) {
                onActivityCreated(cleanName);
            } else {
                onActivityCreatedReturnToList(cleanName);
            }
        } catch (error) {
            console.error(">>> Error creating activity from connection", { error });
            await rpcClient.getCommonRpcClient().showErrorMessage({
                message: `Failed to create the activity '${cleanName}'.`,
            });
            setSaving(false);
        }
    };

    return (
        <>
            {(loading || saving) && (
                <LoaderContainer>
                    <RelativeLoader />
                </LoaderContainer>
            )}
            {!loading && !saving && panelView === PanelView.CONNECTION_LIST && (
                <NodeList
                    categories={categories}
                    onSelect={handleOnSelectNode}
                    onAddConnection={handleAddConnection}
                    onClose={onClose}
                    onBack={onBack}
                    title={"Connections"}
                    searchPlaceholder={"Search connections"}
                    panelBodySx={{ height: "calc(100vh - 140px)" }}
                />
            )}
            {!loading && !saving && panelView === PanelView.UNSUPPORTED && (
                <>
                    <UnsupportedContainer>
                        <WarningBox>
                            <Codicon name="warning" />
                            <div>
                                The selected action cannot be generated as an activity automatically.
                                <ReasonList>
                                    {unsupportedReasons.map((reason, index) => (
                                        <li key={index}>{reason}</li>
                                    ))}
                                </ReasonList>
                            </div>
                        </WarningBox>
                        <div>
                            To use this action in a workflow, create the activity manually:
                            <ReasonList>
                                <li>Create a new activity.</li>
                                <li>Configure the activity function signature (data types only).</li>
                                <li>Inside the activity, call the action with the parameters.</li>
                                <li>Return the result (anydata) as the activity output.</li>
                            </ReasonList>
                        </div>
                        <div>
                            <Button appearance="secondary" onClick={() => setPanelView(PanelView.CONNECTION_LIST)}>
                                Back
                            </Button>
                        </div>
                    </UnsupportedContainer>
                </>
            )}
            {!saving && panelView === PanelView.ACTIVITY_FORM && (
                <>
                    <ArtifactForm
                        preserveFieldOrder={true}
                        fileName={fileName}
                        targetLineRange={{ startLine: { line: 0, offset: 0 }, endLine: { line: 0, offset: 0 } }}
                        fields={fields}
                        onSubmit={(data) => handleActivitySubmit(data, false)}
                        onBack={() => setPanelView(PanelView.CONNECTION_LIST)}
                        submitText={"Create Activity"}
                        helperPaneSide="left"
                        onChange={handleFormChange}
                        injectedComponents={[
                            {
                                component: (
                                    <ImplementationBadge
                                        title={getImplementationString(selectedNodeRef.current?.codedata)}
                                    >
                                        {selectedNodeRef.current?.metadata?.icon && (
                                            <img
                                                src={selectedNodeRef.current.metadata.icon}
                                                style={{ width: 14, height: 14 }}
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).style.display = "none";
                                                }}
                                            />
                                        )}
                                        {getImplementationString(selectedNodeRef.current?.codedata)}
                                    </ImplementationBadge>
                                ),
                                index: 0,
                            },
                            {
                                // Shown after Name + Description, right before the parameter checkboxes
                                // it explains.
                                component: (
                                    <HelpContainer>
                                        <HelpTitle>{ACTIVITY_INPUT_TITLE}</HelpTitle>
                                        <HelpDetail>{ACTIVITY_INPUT_HELP}</HelpDetail>
                                    </HelpContainer>
                                ),
                                index: 2,
                            },
                        ]}
                    />
                </>
            )}
        </>
    );
}

export default NewActivityFromConnection;
