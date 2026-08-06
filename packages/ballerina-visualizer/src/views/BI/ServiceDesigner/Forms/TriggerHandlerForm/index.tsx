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

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import styled from "@emotion/styled";
import {
    ActionButtons,
    CheckBox,
    CheckBoxGroup,
    Codicon,
    Divider,
    Dropdown,
    ErrorBanner,
    LinkButton,
    ProgressIndicator,
    SidePanelBody,
    Tooltip,
    Typography,
} from "@wso2/ui-toolkit";
import {
    Diagnostic,
    FunctionModel,
    GeneralPayloadContext,
    getPrimaryInputType,
    Imports,
    LineRange,
    ParameterModel,
    PropertyModel,
    ServiceModel,
    Type,
    ValidationResult,
} from "@wso2/ballerina-core";
import { cloneDeep } from "lodash";
import WarningPopup from "@wso2/ballerina-side-panel/lib/components/WarningPopup";
import { FormField, FormValues, MarkdownDescription, ParamConfig, Parameter as SidePanelParameter } from "@wso2/ballerina-side-panel";
import { useRpcContext } from "@wso2/ballerina-rpc-client";

import { EntryPointTypeCreator } from "../../../../../components/EntryPointTypeCreator";
import { Parameters } from "./Parameters/Parameters";
import { ParamEditor as HeaderParamEditor } from "../ResourceForm/Parameters/ParamEditor";
import { ParamItem as HeaderParamItem } from "../ResourceForm/Parameters/ParamItem";
import ArtifactForm from "../../../Forms/ArtifactForm";
import { AnnotationExpressionFieldHandle } from "./AnnotationExpressionField";
import { AnnotationConfigSection } from "./AnnotationConfigSection";
import {
    addedParametersOf,
    CODEDATA_ANNOTATION_ATTACHMENT,
    CODEDATA_COMPLEX_ANNOTATION,
    CODEDATA_METADATA_FLAG,
    CODEDATA_PAYLOAD_MODIFIER,
    CODEDATA_PAYLOAD_TYPE_INCLUDED_RECORD,
    addableCatalogOf,
    composePayloadType,
    decomposePayloadType,
    functionSignatureKey,
    handlerGroupId,
    hasDefaultPayload,
    isModifierActive,
    isPayloadParameter,
    payloadParametersOf,
    propertiesOfRole,
    withAddedParameters,
} from "./payloadComposer";

const SIGNATURE_CHANGE_BODY_WARNING =
    "This edit will change the handler signature. Nodes in the function body may be broken due to this change. Continue?";

const EditorContentColumn = styled.div`
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding-bottom: 20px;
    gap: 10px;
`;

const InfoBanner = styled.div`
    display: flex;
    gap: 8px;
    padding: 8px 12px;
    border-left: 3px solid var(--vscode-focusBorder);
    background: var(--vscode-inputValidation-infoBackground);
    border-radius: 4px;
    align-items: flex-start;
`;

const FlagsColumn = styled.div`
    margin-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
`;

const AddButtonWrapper = styled.div`
    margin: 16px 0 8px;
`;

const CollapsibleHeader = styled.div`
    display: flex;
    align-items: center;
    padding: 8px 0;
    cursor: pointer;
    user-select: none;
    &:hover {
        opacity: 0.8;
    }
`;

const CollapsibleContent = styled.div<{ isExpanded: boolean }>`
    display: ${({ isExpanded }: { isExpanded: boolean }) => (isExpanded ? "block" : "none")};
    padding-left: 8px;
    margin-top: 8px;
`;

export interface TriggerHandlerFormProps {
    functionModel?: FunctionModel;
    serviceModel: ServiceModel;
    isSaving: boolean;
    onSave: (functionModel: FunctionModel, openDiagram?: boolean) => void;
    onClose: () => void;
    isNew?: boolean;
    filePath?: string;
    /** The handler group being added (set by the catalog picker in add mode). */
    selectedGroup?: string;
    /**
     * Rule failures from the language server's save-time gate. This form renders its leaves itself
     * (rather than through the shared `Form`), so they are shown as a form-level banner with the
     * field label the server interpolated into each message.
     */
    serverValidationErrors?: ValidationResult[];
}

/** A ParamManager template's own sub-fields, in the order they should render as a mini add/edit form. */
const PARAM_TEMPLATE_SUB_FIELDS = ["type", "name", "defaultValue", "documentation"] as const;

/** Renames a template sub-field's own key onto ParamManager's conventional key for that concept. */
function paramManagerFieldKey(key: string): string {
    if (key === "name") {
        return "variable";
    }
    if (key === "defaultValue") {
        return "defaultable";
    }
    return key;
}

/**
 * The ParamManager add/edit mini-form for one addable-parameter kind (`functionModel.schema.parameter`
 * / `.header`) — walking the template's own `type`/`name`/`defaultValue`/`documentation`/`headerName`
 * sub-properties, each already carrying its own `metadata.label`. The same shape
 * `functions/http_resource.json`'s non-schema-driven `schema` map already uses.
 */
function paramTemplateFormFields(template: ParameterModel | undefined): FormField[] {
    if (!template) {
        return [];
    }
    const fields: FormField[] = [];
    for (const key of PARAM_TEMPLATE_SUB_FIELDS) {
        const sub = template[key] as PropertyModel | undefined;
        if (sub?.metadata?.label) {
            fields.push({
                key: paramManagerFieldKey(key),
                label: sub.metadata.label,
                type: getPrimaryInputType(sub.types)?.fieldType || "STRING",
                optional: sub.optional ?? false,
                editable: sub.editable ?? true,
                advanced: sub.advanced ?? false,
                documentation: sub.metadata?.description || "",
                value: (sub.value as string) ?? "",
                types: sub.types,
                enabled: sub.enabled ?? true,
            });
        }
    }
    return fields;
}

/** One already-added parameter, as the collapsed card + editable form ParamManager expects. */
function paramManagerValueOf(p: ParameterModel, index: number): SidePanelParameter {
    const defaultVal = p.defaultValue as PropertyModel | undefined;
    const documentationVal = p.documentation as PropertyModel | undefined;
    const displayDefault = defaultVal?.value ? ` = ${defaultVal.value}` : "";
    return {
        id: index,
        key: p.name?.value ?? "",
        value: `${p.type?.value ?? ""} ${p.name?.value ?? ""}${displayDefault}`.trim(),
        icon: "symbol-variable",
        identifierEditable: p.name?.editable ?? true,
        identifierRange: p.name?.codedata?.lineRange,
        hidden: p.hidden ?? false,
        imports: p.type?.imports ?? {},
        formValues: {
            variable: p.name?.value ?? "",
            type: p.type?.value ?? "",
            defaultable: defaultVal?.value ?? "",
            documentation: documentationVal?.value ?? "",
        },
    };
}

/** Recomposes a ParamManager row's collapsed-card display text after an edit. */
function composeParamManagerValue(param: SidePanelParameter): SidePanelParameter {
    const name = `${param.formValues["variable"] ?? ""}`;
    const type = `${param.formValues["type"] ?? ""}`;
    const defaultRaw = param.formValues["defaultable"];
    const hasDefault = defaultRaw !== undefined && defaultRaw !== null && `${defaultRaw}`.trim() !== "";
    let value = `${type} ${name}`.trim();
    if (hasDefault) {
        value += ` = ${`${defaultRaw}`.trim()}`;
    }
    return { ...param, key: name, value };
}

/** Converts a ParamManager row back into the wire `ParameterModel` merged into `functionModel.parameters`. */
function toParameterModel(param: SidePanelParameter): ParameterModel {
    const name = `${param.formValues["variable"] ?? ""}`;
    const type = `${param.formValues["type"] ?? ""}`;
    const defaultRaw = param.formValues["defaultable"];
    const hasDefault = defaultRaw !== undefined && defaultRaw !== null && `${defaultRaw}`.trim() !== "";
    const documentation = `${param.formValues["documentation"] ?? ""}`.trim();

    const model: ParameterModel = {
        kind: "REQUIRED",
        enabled: true,
        editable: true,
        optional: hasDefault,
        advanced: false,
        type: {
            value: type,
            enabled: true,
            editable: true,
            optional: false,
            advanced: false,
            types: [{ fieldType: "TYPE", selected: true }],
            imports: param.imports,
        },
        name: {
            value: name,
            enabled: true,
            editable: param.identifierEditable ?? true,
            optional: false,
            advanced: false,
            types: [{ fieldType: "IDENTIFIER", selected: true }],
        },
    };
    if (hasDefault) {
        model.defaultValue = {
            value: `${defaultRaw}`.trim(), enabled: true, editable: true, optional: true, advanced: false,
        };
    }
    if (documentation) {
        model.documentation = { value: documentation, enabled: true, editable: true, optional: true, advanced: false };
    }
    return model;
}

/** The "+ Add Parameter" ParamManager field for the generic addable-parameter kind. */
function buildParamManagerField(fn: FunctionModel, template: ParameterModel): FormField {
    const paramValues = addedParametersOf(fn, "parameter").map((p, index) => paramManagerValueOf(p, index));
    return {
        key: "parameters",
        label: "Parameters",
        type: "PARAM_MANAGER",
        optional: true,
        editable: true,
        enabled: true,
        documentation: template.metadata?.description || "",
        value: paramValues,
        paramManagerProps: {
            paramValues,
            formFields: paramTemplateFormFields(template),
            handleParameter: composeParamManagerValue,
        },
        types: [{ fieldType: "PARAM_MANAGER", selected: false }],
        addNewButtonLabel: template.metadata?.label || "Parameter",
    };
}

/**
 * Builds the ArtifactForm field list for a handler's user-renamable name / addable parameters /
 * editable return type (e.g. an MCP tool) — in that display order: name, then the parameter manager,
 * then return type. Individually-bound HTTP headers are handled separately (see `headerParameters`
 * below), reusing HTTP resource's own header editor rather than the generic ParamManager, since they
 * need the exact same autocomplete-header-name + auto-derived-identifier behavior.
 *
 * Recomputed only when the underlying handler changes (initial load, edit target, or variant switch)
 * — never from a live keystroke — so the `fields` identity ArtifactForm receives stays stable and
 * typing doesn't get interrupted by ArtifactForm's own `useEffect(() => setFields(fields), [fields])`
 * resync.
 */
function buildArtifactFields(fn: FunctionModel | null | undefined): FormField[] {
    if (!fn) {
        return [];
    }
    const fields: FormField[] = [];
    if (fn.name?.editable) {
        fields.push({
            key: "name",
            label: fn.name.metadata?.label || "Function Name",
            type: "IDENTIFIER",
            optional: fn.name.optional ?? false,
            editable: true,
            advanced: fn.name.advanced,
            enabled: fn.name.enabled ?? true,
            documentation: fn.name.metadata?.description || "",
            value: fn.name.value,
            types: fn.name.types,
            lineRange: fn.name.codedata?.lineRange,
        });
    }
    if (fn.documentation?.editable) {
        fields.push({
            key: "documentation",
            label: fn.documentation.metadata?.label || "Description",
            type: getPrimaryInputType(fn.documentation.types)?.fieldType || "STRING",
            optional: fn.documentation.optional ?? true,
            editable: true,
            advanced: fn.documentation.advanced,
            enabled: fn.documentation.enabled ?? true,
            placeholder: fn.documentation.placeholder,
            documentation: fn.documentation.metadata?.description || "",
            value: fn.documentation.value,
            types: fn.documentation.types,
        });
    }
    if (fn.canAddParameters && fn.schema?.parameter) {
        fields.push(buildParamManagerField(fn, fn.schema.parameter as ParameterModel));
    }
    if (fn.returnType?.editable) {
        fields.push({
            key: "returnType",
            label: fn.returnType.metadata?.label || "Return Type",
            type: "TYPE",
            optional: fn.returnType.optional ?? false,
            editable: true,
            advanced: fn.returnType.advanced,
            enabled: fn.returnType.enabled ?? true,
            documentation: fn.returnType.metadata?.description || "",
            value: fn.returnType.value,
            types: fn.returnType.types,
        });
    }
    return fields;
}

/**
 * Generic add/edit form for a schema-driven trigger handler (unified TriggerModel wire shape) — the
 * connector-agnostic counterpart of the FTP-specific FileIntegrationForm. Every section is driven by
 * schema markers rather than connector names:
 *
 * - variant selection — sibling functions sharing `group`, labelled by `variantLabel`;
 * - read-only markers — properties with codedata.type METADATA_FLAG;
 * - stream/modifier toggles — properties with codedata.type PAYLOAD_MODIFIER, recomposing the
 *   payload type through the templates the connector shipped;
 * - payload schema — the DATA_BINDING parameter (codedata.bindable), bound via the type creator;
 * - opt-in framework params — parameters marked `advanced` (caller and friends);
 * - function annotations — properties with codedata.type COMPLEX_FUNCTION_ANNOTATION (a granular
 *   per-field tree) or ANNOTATION_ATTACHMENT (a connector-synthesized whole-value expression);
 * - a user-renamable name / editable return type (e.g. an MCP tool) — rendered through ArtifactForm
 *   so it gets the real IdentifierField/TypeEditor widgets (type completion, identifier validation)
 *   rather than a plain text box.
 */
export function TriggerHandlerForm(props: TriggerHandlerFormProps) {
    const { serviceModel, isSaving, onSave, onClose, isNew, selectedGroup, serverValidationErrors } = props;
    const { rpcClient } = useRpcContext();

    const [functionModel, setFunctionModel] = useState<FunctionModel | null>(null);
    // The payload param (by name) the type-creator modal is open for — a handler can expose several
    // bindable payloads (e.g. CDC onUpdate's before/after), so we track which one is being defined.
    const [typeEditorParamName, setTypeEditorParamName] = useState<string | null>(null);
    const [isSignatureWarningOpen, setIsSignatureWarningOpen] = useState<boolean>(false);
    const [isAdvancedExpanded, setIsAdvancedExpanded] = useState<boolean>(false);
    const initialSignatureKeyRef = useRef<string | null>(null);

    // The name/return-type/parameters ArtifactForm fields — held separately from `functionModel` and
    // only ever rebuilt from the handler's source-of-truth (initial load / variant switch), never
    // from a keystroke, so the `fields` array identity ArtifactForm receives stays stable while typing.
    const [artifactFields, setArtifactFields] = useState<FormField[]>([]);
    const [isArtifactFieldsValid, setIsArtifactFieldsValid] = useState<boolean>(true);
    const [artifactLineRange, setArtifactLineRange] = useState<LineRange | undefined>(undefined);

    useEffect(() => {
        if (!props.filePath || !rpcClient) {
            return;
        }
        rpcClient.getBIDiagramRpcClient().getEndOfFile({ filePath: props.filePath }).then((res) => {
            setArtifactLineRange({ startLine: res, endLine: res });
        });
    }, [props.filePath, rpcClient]);

    const groupId = selectedGroup ?? (props.functionModel ? handlerGroupId(props.functionModel) : undefined);

    // Still-addable sibling variants of this handler group (e.g. CSV/JSON/XML of onFileChange), from
    // the service's addable catalog — consumed variants and mutually-exclusive siblings are already
    // filtered out (by the language server on the read path, and by addableCatalogOf on the client).
    const addableVariants = useMemo(() => {
        if (!groupId) {
            return [];
        }
        return addableCatalogOf(serviceModel).filter((fn) => handlerGroupId(fn) === groupId);
    }, [serviceModel, groupId]);

    // Add mode starts from the group's first addable variant; edit mode from the passed model.
    useEffect(() => {
        if (isNew) {
            const initial = props.functionModel ?? addableVariants[0];
            setFunctionModel(initial ? cloneDeep(initial) : null);
            setArtifactFields(buildArtifactFields(initial));
            setIsArtifactFieldsValid(true);
            initialSignatureKeyRef.current = null;
        } else {
            setFunctionModel(props.functionModel ? cloneDeep(props.functionModel) : null);
            setArtifactFields(buildArtifactFields(props.functionModel));
            setIsArtifactFieldsValid(true);
            initialSignatureKeyRef.current = props.functionModel
                ? functionSignatureKey(props.functionModel) : null;
        }
    }, [isNew, props.functionModel, addableVariants]);

    // ----- variant selection -----

    // Add mode: a real choice needs more than one addable variant. Edit mode: an enriched source
    // handler shows its (fixed) variant for context whenever it carries one.
    const hasVariants = isNew ? addableVariants.length > 1 : !!functionModel?.variantLabel;
    const selectedVariantLabel = functionModel?.variantLabel ?? functionModel?.name?.metadata?.label ?? "";

    const handleVariantChange = (label: string) => {
        const variant = addableVariants.find(
            (fn) => (fn.variantLabel ?? fn.name?.metadata?.label) === label
        );
        if (variant) {
            setFunctionModel(cloneDeep(variant));
            setArtifactFields(buildArtifactFields(variant));
            setIsArtifactFieldsValid(true);
        }
    };

    // ----- composition flags -----

    const metadataFlags = functionModel ? propertiesOfRole(functionModel, CODEDATA_METADATA_FLAG) : [];
    const modifierFlags = functionModel ? propertiesOfRole(functionModel, CODEDATA_PAYLOAD_MODIFIER) : [];
    // All bindable payload params — a handler may expose more than one (e.g. CDC onUpdate's
    // before/after), each configured independently below.
    const payloadParams = functionModel ? payloadParametersOf(functionModel) : [];
    // The first payload param still drives shared UI bits (e.g. the variant dropdown's label).
    const payloadParam = payloadParams[0];

    /** Recomposes every payload param's rendered type after a modifier/schema change. */
    const withRecomposedPayload = (fn: FunctionModel): FunctionModel => {
        const parameters = fn.parameters.map((p) =>
            isPayloadParameter(p) && p.type?.codedata
                ? { ...p, type: { ...p.type, value: composePayloadType(fn, p) } }
                : p
        );
        return { ...fn, parameters };
    };

    // ----- user-renamable name / editable return type / addable parameters -----
    // Most schema-driven handlers ship a fixed name, return type, and parameter list; a repeatable,
    // freely-named handler (e.g. an MCP tool) marks `name.editable` / `returnType.editable` /
    // `canAddParameters` instead so this form asks for them (via `artifactFields`/ArtifactForm below)
    // rather than emitting the catalog's placeholder verbatim. ArtifactForm reports live edits through
    // `onChange`; mirror them onto `functionModel` here so Save picks up the latest value.
    const handleArtifactFieldChange = (fieldKey: string, value: any) => {
        if (fieldKey === "parameters") {
            const newParams = (value as SidePanelParameter[]).map((p) => toParameterModel(p));
            setFunctionModel((prev) => (prev ? withAddedParameters(prev, "parameter", newParams) : prev));
            return;
        }
        setFunctionModel((prev) => {
            if (!prev) {
                return prev;
            }
            if (fieldKey === "name") {
                return { ...prev, name: { ...prev.name, value: String(value) } };
            }
            if (fieldKey === "returnType") {
                return { ...prev, returnType: { ...prev.returnType, value: String(value) } };
            }
            if (fieldKey === "documentation") {
                return { ...prev, documentation: { ...prev.documentation, value: String(value) } };
            }
            return prev;
        });
    };

    const handleModifierToggle = (key: string, prop: PropertyModel, checked: boolean) => {
        if (!functionModel) {
            return;
        }
        // Modifier flags store their checked state in `value` — "true"/"false" strings, accepted
        // alongside booleans by both this form's composer and the language server's.
        const updated: FunctionModel = {
            ...functionModel,
            properties: { ...functionModel.properties, [key]: { ...prop, value: String(checked) } },
        };
        setFunctionModel(withRecomposedPayload(updated));
    };

    // ----- payload schema binding -----

    const labelOfPayload = (param?: ParameterModel) => param?.metadata?.label || "Content Schema";
    // When a handler exposes more than one payload (e.g. CDC onUpdate's before/after), the shared
    // metadata label ("Database Entry") no longer tells them apart — append the param's own name
    // (the identifier used in the generated signature, e.g. `before`) so the user can tell which is
    // which. A single-payload handler keeps the plain label.
    const displayLabelOf = (param?: ParameterModel) => {
        const base = labelOfPayload(param);
        return payloadParams.length > 1 && param?.name?.value ? `${base} (${param.name.value})` : base;
    };
    // The payload param the type-creator modal is currently open for (by name).
    const typeEditorParam = payloadParams.find((p) => p.name?.value === typeEditorParamName);
    // An included-record databind (e.g. kafka's message shape) defaults the type creator to the
    // import tab — the schema's payload format is sample-driven (JSON) rather than built by hand.
    const typeCreatorDefaultTab =
        typeEditorParam?.type?.codedata?.type === CODEDATA_PAYLOAD_TYPE_INCLUDED_RECORD
            ? "import"
            : "create-from-scratch";

    const handleTypeCreated = (type: Type | string, imports?: Imports) => {
        const targetName = typeEditorParamName;
        setTypeEditorParamName(null);
        if (!functionModel || !targetName) {
            return;
        }
        const typeName = typeof type === "string" ? type : type.name;
        // The parameter keeps its schema-shipped name — only the bound shape changes.
        const parameters = functionModel.parameters.map((p) => {
            if (!isPayloadParameter(p) || p.name?.value !== targetName) {
                return p;
            }
            const updatedType: PropertyModel = {
                ...p.type,
                codedata: { ...p.type.codedata, boundType: typeName },
            };
            if (imports) {
                updatedType.imports = imports;
            }
            return { ...p, type: updatedType, enabled: true };
        });
        setFunctionModel(withRecomposedPayload({ ...functionModel, parameters }));
    };

    const handleDeletePayloadSchema = (target: ParameterModel) => {
        if (!functionModel) {
            return;
        }
        const parameters = functionModel.parameters.map((p) =>
            isPayloadParameter(p) && p.name?.value === target.name?.value
                ? { ...p, type: { ...p.type, codedata: { ...p.type.codedata, boundType: undefined } } }
                : p
        );
        setFunctionModel(withRecomposedPayload({ ...functionModel, parameters }));
    };

    // ----- opt-in framework params (advanced) -----

    const advancedParameters = functionModel?.parameters?.filter((p) => p.advanced === true) ?? [];

    const handleAdvancedParamToggle = (param: ParameterModel, checked: boolean) => {
        if (!functionModel) {
            return;
        }
        const parameters = functionModel.parameters.map((p) => (p === param ? { ...p, enabled: checked } : p));
        setFunctionModel({ ...functionModel, parameters });
    };

    // ----- individually bound HTTP headers -----
    // Reuses HTTP resource's own header editor/list (ResourceForm/Parameters) as-is — same
    // autocomplete header-name list, auto-derived identifier, and "Advanced Configurations" layout —
    // rather than the generic ParamManager, since that's the exact behavior asked for. Lives under the
    // Advanced Parameters section below alongside the fixed opt-in toggles.
    const [headerEditModel, setHeaderEditModel] = useState<ParameterModel | undefined>(undefined);
    const [isNewHeaderParam, setIsNewHeaderParam] = useState<boolean>(false);
    // The exact header object being edited, captured when editing starts — used to find-and-replace
    // it by identity at save time, rather than by array index. HeaderParamEditor's own submit calls
    // both `onChange` (live, once per keystroke/selection) and `onSave` (once, on final submit) for
    // the SAME save action; an index captured once and reused across both, combined with each call
    // independently writing to functionModel from a same-tick stale closure, was producing duplicate
    // parameters (one written by the live onChange, another by onSave, or a slot picked by a since-
    // shifted index) — e.g. both an `@http:Header string x` and an `@http:Header{name:...} string x`
    // for the same header. Object-identity replace is robust to either call firing, in either order.
    const [editingHeaderOriginal, setEditingHeaderOriginal] = useState<ParameterModel | undefined>(undefined);

    const headerTemplate = functionModel?.schema?.header as ParameterModel | undefined;
    const headerParameters = functionModel ? addedParametersOf(functionModel, "header") : [];

    const handleAddHeaderClick = () => {
        if (!headerTemplate) {
            return;
        }
        const fresh = cloneDeep(headerTemplate);
        fresh.name = { ...fresh.name, value: "" };
        fresh.httpParamType = "HEADER";
        setHeaderEditModel(fresh);
        setIsNewHeaderParam(true);
        setEditingHeaderOriginal(undefined);
    };

    const handleHeaderEditClick = (param: ParameterModel) => {
        setHeaderEditModel(param);
        setIsNewHeaderParam(false);
        setEditingHeaderOriginal(param);
    };

    // Live edits (e.g. picking a header name from the autocomplete) only update the in-progress draft
    // shown in the editor — never the committed functionModel — so they can never race with the final
    // save below, which is now the single commit point.
    const handleHeaderChange = (param: ParameterModel) => {
        setHeaderEditModel(param);
    };

    const handleHeaderSave = (param: ParameterModel) => {
        if (!functionModel) {
            return;
        }
        const updated = isNewHeaderParam || !editingHeaderOriginal
            ? [...headerParameters, param]
            : headerParameters.map((p) => (p === editingHeaderOriginal ? param : p));
        setFunctionModel(withAddedParameters(functionModel, "header", updated));
        setHeaderEditModel(undefined);
        setIsNewHeaderParam(false);
        setEditingHeaderOriginal(undefined);
    };

    const handleHeaderCancel = () => {
        setHeaderEditModel(undefined);
        setIsNewHeaderParam(false);
        setEditingHeaderOriginal(undefined);
    };

    const handleHeaderDelete = (param: ParameterModel) => {
        if (!functionModel) {
            return;
        }
        const updated = headerParameters.filter((p) => p !== param);
        setFunctionModel(withAddedParameters(functionModel, "header", updated));
        setHeaderEditModel(undefined);
        setEditingHeaderOriginal(undefined);
    };

    // ----- annotations -----

    const annotations = functionModel
        ? [...propertiesOfRole(functionModel, CODEDATA_COMPLEX_ANNOTATION),
            ...propertiesOfRole(functionModel, CODEDATA_ANNOTATION_ATTACHMENT)]
        : [];

    const handleAnnotationChange = (annotationKey: string, updated: PropertyModel) => {
        setFunctionModel((prev) => prev
            ? { ...prev, properties: { ...prev.properties, [annotationKey]: updated } }
            : prev);
    };

    // ----- expression diagnostics (annotation leaves) -----

    const fieldRefs = useRef<Record<string, AnnotationExpressionFieldHandle | null>>({});
    const [diagnosticsByField, setDiagnosticsByField] = useState<Record<string, Diagnostic[]>>({});
    const [validationStateByField, setValidationStateByField] = useState<Record<string, { isValidating: boolean }>>({});

    // Keyed on the variant identity (group + schema-shipped variant label), not `name.value`: the
    // latter is user-editable for handlers like an MCP tool (name.editable), so keying on it here —
    // and on the annotation section below — would wipe every annotation leaf's in-progress state on
    // every keystroke of a rename. `groupId`/`selectedVariantLabel` only change on an actual variant
    // switch or when editing a different handler, which is when annotation tracking should reset.
    useEffect(() => {
        setDiagnosticsByField({});
        setValidationStateByField({});
        fieldRefs.current = {};
    }, [groupId, selectedVariantLabel]);

    const registerFieldRef = useCallback((key: string, handle: AnnotationExpressionFieldHandle | null) => {
        if (handle) {
            fieldRefs.current[key] = handle;
        } else {
            delete fieldRefs.current[key];
        }
    }, []);

    const handleFieldDiagnostics = useCallback((key: string, diagnostics: Diagnostic[]) => {
        setDiagnosticsByField((prev) => ({ ...prev, [key]: diagnostics }));
    }, []);

    const handleFieldValidationState = useCallback((key: string, state: { isValidating: boolean }) => {
        setValidationStateByField((prev) => ({ ...prev, [key]: state }));
    }, []);

    const hasErrorDiagnostics = useMemo(
        () => Object.values(diagnosticsByField).some((diags) => diags?.some((d) => d.severity === 1)),
        [diagnosticsByField]
    );
    const hasPendingValidation = useMemo(
        () => Object.values(validationStateByField).some((s) => s?.isValidating),
        [validationStateByField]
    );

    // ----- save -----

    const hasSignatureChanged = (): boolean => {
        if (isNew || !functionModel || !initialSignatureKeyRef.current) {
            return false;
        }
        return functionSignatureKey(functionModel) !== initialSignatureKeyRef.current;
    };

    const handleSave = async () => {
        if (!functionModel) {
            return;
        }
        // Save-time revalidation of annotation expression fields — the authoritative gate, since
        // typing-time diagnostics are debounced and swallow LS errors silently.
        const liveRefs = Object.values(fieldRefs.current).filter(
            (handle): handle is AnnotationExpressionFieldHandle => handle !== null && handle !== undefined
        );
        if (liveRefs.length > 0) {
            const allDiagnostics = await Promise.all(liveRefs.map((h) => h.revalidate()));
            if (allDiagnostics.some((diags) => diags.some((d) => d.severity === 1))) {
                return;
            }
        }
        if (hasSignatureChanged()) {
            setIsSignatureWarningOpen(true);
            return;
        }
        onSave({ ...functionModel, enabled: true }, isNew);
    };

    const confirmSignatureChangeSave = () => {
        setIsSignatureWarningOpen(false);
        if (functionModel) {
            onSave({ ...functionModel, enabled: true }, isNew);
        }
    };

    const isSaveDisabled = hasErrorDiagnostics || hasPendingValidation
        || (artifactFields.length > 0 && !isArtifactFieldsValid);
    const saveTooltip = useMemo(() => {
        if (isSaving) {
            return "Saving...";
        }
        if (hasPendingValidation) {
            return "Waiting for expression diagnostics...";
        }
        if (isSaveDisabled) {
            return "Fix validation errors";
        }
        return "Save";
    }, [isSaveDisabled, isSaving, hasPendingValidation]);

    const payloadContext: GeneralPayloadContext = {
        protocol: serviceModel.listenerProtocol || serviceModel.moduleName,
        filterType: functionModel?.metadata?.label || "",
    };

    if (!functionModel) {
        return null;
    }

    const infoBannerText = functionModel.metadata?.notice;
    // Handler-level documentation. It rides on the function model, so selecting a different variant
    // (which swaps the whole model) re-renders this with the new variant's text. Rendered only when
    // non-empty — most handlers ship no description.
    const handlerDescription = functionModel.metadata?.description?.trim();
    const showAnnotationsDivider = hasVariants || metadataFlags.length > 0 || modifierFlags.length > 0;

    return (
        <>
            {isSaving && <ProgressIndicator id="trigger-handler-form-loading-bar" />}
            <SidePanelBody>
                <EditorContentColumn>
                    {infoBannerText && (
                        <InfoBanner>
                            <Codicon name="info" sx={{ marginTop: 2 }} />
                            <Typography variant="body3" sx={{ color: "var(--vscode-foreground)" }}>
                                {infoBannerText}
                            </Typography>
                        </InfoBanner>
                    )}

                    {serverValidationErrors?.length > 0 && (
                        <ErrorBanner
                            errorMsg={serverValidationErrors.map((error) => error.message).join("\n")}
                        />
                    )}

                    {/* Variant selection — sibling functions of the same group */}
                    {hasVariants && (
                        <Dropdown
                            id="trigger-handler-variant"
                            label={payloadParam?.type?.metadata?.label ? "Format" : "Variant"}
                            items={isNew
                                ? addableVariants.map((fn) => ({
                                    value: fn.variantLabel ?? fn.name?.metadata?.label ?? fn.name?.value ?? "",
                                }))
                                : [{ value: selectedVariantLabel }]}
                            value={selectedVariantLabel}
                            onValueChange={handleVariantChange}
                            disabled={!isNew}
                        />
                    )}

                    {/* Handler documentation — updates with the selected variant, hidden when empty */}
                    {handlerDescription && <MarkdownDescription description={handlerDescription} />}

                    {/* User-renamable name / editable return type / addable parameters (e.g. an MCP
                        tool). Rendered through ArtifactForm — the same IdentifierField/TypeEditor/
                        ParamManager widgets (type completion, identifier validation, inline param
                        table) the rest of the visualizer uses — with its own Save button hidden since
                        this form's Save (below) owns the actual save. */}
                    {artifactFields.length > 0 && props.filePath && artifactLineRange && (
                        <ArtifactForm
                            fileName={props.filePath}
                            targetLineRange={artifactLineRange}
                            fields={artifactFields}
                            nestedForm={true}
                            hideSaveButton={true}
                            preserveFieldOrder={true}
                            onChange={handleArtifactFieldChange}
                            onValidityChange={setIsArtifactFieldsValid}
                            onSubmit={() => { }}
                        />
                    )}

                    {/* Read-only markers + modifier toggles (e.g. Rows, Stream) */}
                    {(metadataFlags.length > 0 || modifierFlags.length > 0) && (
                        <FlagsColumn>
                            {metadataFlags.map(([key, prop]) => (
                                <CheckBoxGroup key={key} direction="vertical">
                                    <CheckBox
                                        label={prop.metadata?.label ?? key}
                                        checked={true}
                                        disabled={true}
                                        onChange={() => { }}
                                        sx={{ description: prop.metadata?.description ?? "" }}
                                    />
                                </CheckBoxGroup>
                            ))}
                            {modifierFlags.map(([key, prop]) => (
                                <CheckBoxGroup key={key} direction="vertical">
                                    <CheckBox
                                        label={prop.metadata?.label ?? key}
                                        checked={isModifierActive(prop)}
                                        disabled={prop.editable === false}
                                        onChange={(checked) => handleModifierToggle(key, prop, checked)}
                                        sx={{ description: prop.metadata?.description ?? "" }}
                                    />
                                </CheckBoxGroup>
                            ))}
                        </FlagsColumn>
                    )}

                    {/* Payload schema — one section per bindable DATA_BINDING param (a handler such
                        as CDC onUpdate exposes both a before- and an after-image). */}
                    {payloadParams
                        .filter((param) => param.type?.codedata?.bindable === true)
                        .map((param) => {
                            const label = displayLabelOf(param);
                            return (
                                <Fragment key={param.name?.value ?? label}>
                                    {hasDefaultPayload(param) ? (
                                        <AddButtonWrapper>
                                            <Tooltip
                                                content={`Define ${label} for easier access in the flow diagram`}
                                                position="bottom"
                                            >
                                                <LinkButton onClick={() => setTypeEditorParamName(param.name?.value ?? null)}>
                                                    <Codicon name="add" />
                                                    Define {label}
                                                </LinkButton>
                                            </Tooltip>
                                        </AddButtonWrapper>
                                    ) : (
                                        <div style={{ marginTop: 16 }}>
                                            <Typography variant="body2" sx={{ marginBottom: 8 }}>
                                                {label}
                                            </Typography>
                                            {/* The card shows the fully composed payload type (array/stream wrapper
                                                applied) next to the parameter name — mirroring the generated handler
                                                signature. Composition follows the active modifiers via
                                                composePayloadType, so the chip re-renders when Stream is toggled.
                                                Editing opens the inline schema editor, which strips the wrapper to
                                                the bare element for editing and re-applies it on save; we decompose
                                                that composed result back to the bound element (so recomposition
                                                doesn't compound the wrapper), and let the name follow the editor. A
                                                bindable payload is always editable, so force it on regardless of the
                                                shipped flag. Some connectors (kafka, rabbitmq, the SQL CDC triggers)
                                                bind to a fixed, structural identifier (records/message/before/after)
                                                that the user never renames — those ship the payload's own
                                                codedata.nameEditable:false (a PAYLOAD_TYPE-scoped flag, distinct
                                                from the generic Parameter.name.editable used elsewhere for plain
                                                identifier renaming), so we drop the Name field from both the card
                                                and the editor and only let the bound type change. FTP's content
                                                param leaves nameEditable unset (defaults true) and keeps the full
                                                name+type editor. */}
                                            <Parameters
                                                parameters={[{
                                                    ...param,
                                                    editable: true,
                                                    type: {
                                                        ...param.type,
                                                        value: composePayloadType(functionModel, param),
                                                    },
                                                }]}
                                                hideName={param.type?.codedata?.nameEditable === false}
                                                onChange={(edited) => {
                                                    if (edited.length === 0) {
                                                        handleDeletePayloadSchema(param);
                                                        return;
                                                    }
                                                    const [editedPayload] = edited;
                                                    const editedElement = decomposePayloadType(
                                                        functionModel, param, editedPayload.type?.value ?? "");
                                                    const editedName = editedPayload.name?.value;
                                                    const parameters = functionModel.parameters.map((p) =>
                                                        isPayloadParameter(p) && p.name?.value === param.name?.value
                                                            ? {
                                                                ...p,
                                                                name: editedName !== undefined
                                                                    ? { ...p.name, value: editedName }
                                                                    : p.name,
                                                                type: {
                                                                    ...p.type,
                                                                    imports: editedPayload.type?.imports ?? p.type?.imports,
                                                                    codedata: {
                                                                        ...p.type?.codedata,
                                                                        boundType: editedElement,
                                                                    },
                                                                },
                                                                enabled: true,
                                                            }
                                                            : p
                                                    );
                                                    setFunctionModel(
                                                        withRecomposedPayload({ ...functionModel, parameters }));
                                                }}
                                                showPayload={true}
                                                typeLabel={label}
                                            />
                                        </div>
                                    )}
                                </Fragment>
                            );
                        })}

                    {/* Function annotations — schema-shipped granular trees */}
                    {annotations.length > 0 && (
                        <>
                            {showAnnotationsDivider && <Divider />}
                            {annotations.map(([key, annotation]) => (
                                <AnnotationConfigSection
                                    // Keyed on the variant identity, not the user-editable name value
                                    // — see the effect above for why.
                                    key={`${groupId}-${selectedVariantLabel}-${key}`}
                                    annotationKey={key}
                                    annotation={annotation}
                                    filePath={props.filePath}
                                    targetLineRange={functionModel.codedata?.lineRange}
                                    disabled={isSaving}
                                    onChange={handleAnnotationChange}
                                    registerFieldRef={registerFieldRef}
                                    onDiagnosticsChange={handleFieldDiagnostics}
                                    onValidationStateChange={handleFieldValidationState}
                                />
                            ))}
                        </>
                    )}

                    {/* Opt-in framework params (caller and friends) + individually bound HTTP headers */}
                    {(advancedParameters.length > 0 || headerTemplate) && (
                        <>
                            <Divider />
                            <CollapsibleHeader onClick={() => setIsAdvancedExpanded(!isAdvancedExpanded)}>
                                <Codicon
                                    name={isAdvancedExpanded ? "chevron-down" : "chevron-right"}
                                    sx={{ marginRight: 4 }}
                                />
                                <Typography variant="body2">Advanced Parameters</Typography>
                            </CollapsibleHeader>
                            <CollapsibleContent isExpanded={isAdvancedExpanded}>
                                {advancedParameters.map((param, index) => (
                                    <CheckBoxGroup key={param.name?.value || index} direction="vertical">
                                        <CheckBox
                                            label={param.metadata?.label}
                                            checked={param.enabled}
                                            onChange={(checked) => handleAdvancedParamToggle(param, checked)}
                                            sx={{
                                                marginTop: index === 0 ? 0 : 8,
                                                description: param.metadata?.description,
                                            }}
                                        />
                                    </CheckBoxGroup>
                                ))}
                                {headerTemplate && (
                                    <>
                                        <Typography variant="body2" sx={{ marginTop: 12, marginBottom: 0 }}>
                                            {headerTemplate.metadata?.label || "HTTP Headers"}
                                        </Typography>
                                        {headerTemplate.metadata?.description && (
                                            <Typography
                                                variant="body3"
                                                sx={{ color: "var(--vscode-descriptionForeground)", marginBottom: 4 }}
                                            >
                                                {headerTemplate.metadata.description}
                                            </Typography>
                                        )}
                                        {headerParameters.map((param, index) => (
                                            <HeaderParamItem
                                                key={`header-${index}`}
                                                param={param}
                                                onDelete={handleHeaderDelete}
                                                onEditClick={handleHeaderEditClick}
                                            />
                                        ))}
                                        {headerEditModel && (
                                            <HeaderParamEditor
                                                isNew={isNewHeaderParam}
                                                param={headerEditModel}
                                                onChange={handleHeaderChange}
                                                onSave={handleHeaderSave}
                                                onCancel={handleHeaderCancel}
                                                type="HEADER"
                                            />
                                        )}
                                        {!headerEditModel && (
                                            <AddButtonWrapper>
                                                <LinkButton onClick={handleAddHeaderClick}>
                                                    <Codicon name="add" />
                                                    <>Add Header</>
                                                </LinkButton>
                                            </AddButtonWrapper>
                                        )}
                                    </>
                                )}
                            </CollapsibleContent>
                        </>
                    )}
                </EditorContentColumn>
                <ActionButtons
                    primaryButton={{
                        text: isSaving ? "Saving..." : "Save",
                        onClick: handleSave,
                        tooltip: saveTooltip,
                        disabled: isSaving || isSaveDisabled,
                        loading: isSaving,
                    }}
                    secondaryButton={{
                        text: "Cancel",
                        onClick: onClose,
                        tooltip: "Cancel",
                        disabled: isSaving,
                    }}
                    sx={{ justifyContent: "flex-end" }}
                />
            </SidePanelBody>

            <WarningPopup
                isOpen={isSignatureWarningOpen}
                onContinue={confirmSignatureChangeSave}
                onCancel={() => setIsSignatureWarningOpen(false)}
                message={SIGNATURE_CHANGE_BODY_WARNING}
            />

            <EntryPointTypeCreator
                isOpen={!!typeEditorParam}
                onClose={() => setTypeEditorParamName(null)}
                onTypeCreate={handleTypeCreated}
                initialTypeName={"Content"}
                modalTitle={`Define ${displayLabelOf(typeEditorParam)}`}
                payloadContext={payloadContext}
                defaultTab={typeCreatorDefaultTab}
                modalWidth={650}
                modalHeight={600}
            />
        </>
    );
}

export default TriggerHandlerForm;
