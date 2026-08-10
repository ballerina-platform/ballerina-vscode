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

import { FunctionModel, ParameterModel, PropertyModel, RepeatBehavior, ServiceModel } from "@wso2/ballerina-core";

/**
 * Pure helpers for schema-driven trigger handlers (unified TriggerModel wire shape).
 *
 * The language server expands each handler variant into a self-contained wire FunctionModel whose
 * payload parameter carries its composition inputs on `type.codedata`:
 *
 *   element = codedata.boundType ?? codedata.defaultType
 *   base    = codedata.template applied to element      ({{type}} -> element)
 *   result  = an active PAYLOAD_MODIFIER property's template (value === true), else base
 *
 * so the UI can recompose the rendered type when the user toggles a modifier (e.g. stream) or binds
 * a custom schema — no connector-specific string surgery.
 */

const TYPE_PLACEHOLDER = "{{type}}";

export const CODEDATA_PAYLOAD_TYPE = "PAYLOAD_TYPE";
export const CODEDATA_PAYLOAD_TYPE_INCLUDED_RECORD = "PAYLOAD_TYPE_INCLUDED_RECORD";
export const CODEDATA_PAYLOAD_MODIFIER = "PAYLOAD_MODIFIER";
export const CODEDATA_METADATA_FLAG = "METADATA_FLAG";
export const CODEDATA_COMPLEX_ANNOTATION = "COMPLEX_FUNCTION_ANNOTATION";
export const CODEDATA_FIELD_VALUE_CHOICE = "FIELD_VALUE_CHOICE";
// A connector-synthesized handler annotation with no granular per-field authoring -- a single
// RECORD_MAP_EXPRESSION the user edits as one expression, unlike CODEDATA_COMPLEX_ANNOTATION's
// MAPPING_FIELD tree. Rendered by the same AnnotationConfigSection, just as one expression field.
export const CODEDATA_ANNOTATION_ATTACHMENT = "ANNOTATION_ATTACHMENT";

/** The group id linking a handler's format variants (falls back to its display label). */
export function handlerGroupId(fn: FunctionModel): string | undefined {
    return fn.group ?? fn.metadata?.label;
}

/** True when the service's functions carry the schema-driven handler-catalog markers. */
export function isSchemaTriggerFunction(fn: FunctionModel): boolean {
    return !!fn.group;
}

/** True when the service is a schema-driven trigger (marker functions or an addable catalog). */
export function isSchemaTriggerService(serviceModel?: ServiceModel): boolean {
    if (!serviceModel) {
        return false;
    }
    return (serviceModel.schemaFunctions?.length ?? 0) > 0
        || (serviceModel.functions?.some(isSchemaTriggerFunction) ?? false);
}

/**
 * The addable handler catalog. The language server ships it in `schemaFunctions` (source handlers
 * live in `functions`); templates that predate the split are recognised by their disabled
 * catalog-marker functions as a fallback.
 */
export function catalogFunctionsOf(serviceModel: ServiceModel): FunctionModel[] {
    if (serviceModel.schemaFunctions?.length) {
        return serviceModel.schemaFunctions;
    }
    return (serviceModel.functions ?? []).filter((fn) => isSchemaTriggerFunction(fn) && !fn.enabled);
}

/** The repeat behaviour of a handler, defaulting to FALSE when unset. */
export function repeatBehaviorOf(fn: FunctionModel): RepeatBehavior {
    return fn.repeatable ?? RepeatBehavior.FALSE;
}

/**
 * A handler's addable-parameter kinds (`FunctionModel.schema` keys the language server ships when
 * `canAddParameters` is set — see `TriggerModel.FunctionModel.parameterSchema`). `parameter` is a
 * plain user-typed parameter; `header` is an individually bound HTTP header (emits `@http:Header`,
 * the same annotation HTTP resource functions use for their own header parameters).
 */
export type AddableParameterKind = "parameter" | "header";

const HTTP_PARAM_TYPE_HEADER = "HEADER";

/**
 * Whether a parameter was appended by the user through the addable `parameterSchema` catalog, as
 * opposed to a fixed schema parameter (e.g. MCP's opt-in `Request`/`Headers`/`Meta`, toggled via the
 * Advanced Parameters checkboxes rather than added/removed freely). A fixed parameter is always
 * `advanced === true`; nothing user-added through the parameter manager is.
 */
export function isAddedParameter(p: ParameterModel, kind: AddableParameterKind): boolean {
    if (p.advanced === true) {
        return false;
    }
    const isHeaderParam = p.httpParamType === HTTP_PARAM_TYPE_HEADER;
    return kind === "header" ? isHeaderParam : !isHeaderParam;
}

/** A handler's user-added parameters of one kind (its `parameters`, minus fixed and other-kind ones). */
export function addedParametersOf(fn: FunctionModel, kind: AddableParameterKind): ParameterModel[] {
    return (fn.parameters ?? []).filter((p) => isAddedParameter(p, kind));
}

/**
 * Replaces a handler's user-added parameters of one kind with a fresh set (e.g. after a ParamManager
 * edit), leaving its fixed parameters and the other kind's user-added ones untouched.
 */
export function withAddedParameters(
    fn: FunctionModel, kind: AddableParameterKind, params: ParameterModel[]
): FunctionModel {
    const kept = (fn.parameters ?? []).filter((p) => !isAddedParameter(p, kind));
    return { ...fn, parameters: [...kept, ...params] };
}

/**
 * The still-addable handler catalog, with the group/repeat rules enforced against the handlers
 * already present (enabled) in the service. The language server already prunes `schemaFunctions` on
 * the read path; applying the same rules on the client keeps the catalog correct independently —
 * e.g. right after a handler is added, before the model is refetched:
 *
 *   - a present ONE_OF_GROUP handler hides every sibling of its group (mutually exclusive);
 *   - a present handler that is not TRUE hides its own (same-name) catalog entry (add-once);
 *   - a present LEGACY handler hides every NON-LEGACY catalog entry, ignoring group (mutually
 *     incompatible with the "modern" catalog, not just its own group);
 *   - distinct LEGACY entries are independent of each other: none is hidden by another being
 *     present/absent — hidden only while NO LEGACY handler is present anywhere in the service yet.
 *
 * TRUE (repeat-always) handlers are never hidden. ONE_EACH_PER_GROUP naturally keeps siblings, since
 * only the same-name entry is removed.
 */
export function addableCatalogOf(serviceModel: ServiceModel): FunctionModel[] {
    const catalog = catalogFunctionsOf(serviceModel);
    const present = (serviceModel.functions ?? []).filter((fn) => fn.enabled && isSchemaTriggerFunction(fn));

    const exclusiveGroups = new Set<string>();
    const consumedNames = new Set<string>();
    let legacyHandlerPresent = false;
    for (const fn of present) {
        const behavior = repeatBehaviorOf(fn);
        const group = handlerGroupId(fn);
        if (behavior === RepeatBehavior.ONE_OF_GROUP && group) {
            exclusiveGroups.add(group);
        }
        if (behavior === RepeatBehavior.LEGACY) {
            legacyHandlerPresent = true;
        }
        if (behavior !== RepeatBehavior.TRUE && fn.name?.value) {
            consumedNames.add(fn.name.value);
        }
    }

    return catalog.filter((fn) => {
        const behavior = repeatBehaviorOf(fn);
        if (behavior === RepeatBehavior.LEGACY) {
            // Distinct LEGACY entries are independent of each other: consuming one never displaces
            // another, but once any one of them is present the rest stop being hidden by the
            // "not present yet" default too (the service is already committed to the legacy surface).
            return legacyHandlerPresent;
        }
        if (legacyHandlerPresent) {
            return false;
        }
        const group = handlerGroupId(fn);
        if (group && exclusiveGroups.has(group)) {
            return false;
        }
        if (behavior !== RepeatBehavior.TRUE && fn.name?.value && consumedNames.has(fn.name.value)) {
            return false;
        }
        return true;
    });
}

/** Whether a parameter is a payload (data-binding) parameter. */
export function isPayloadParameter(p: ParameterModel): boolean {
    return p.kind === "DATA_BINDING"
        || p.type?.codedata?.type === CODEDATA_PAYLOAD_TYPE
        || p.type?.codedata?.type === CODEDATA_PAYLOAD_TYPE_INCLUDED_RECORD;
}

/** The first payload (data-binding) parameter of an expanded variant, if any. */
export function payloadParameterOf(fn: FunctionModel): ParameterModel | undefined {
    return fn.parameters?.find(isPayloadParameter);
}

/**
 * All payload (data-binding) parameters of an expanded variant. A handler may expose more than one —
 * e.g. a CDC `onUpdate(record {} before, record {} after)` binds both the before- and after-images —
 * each configured independently in the form.
 */
export function payloadParametersOf(fn: FunctionModel): ParameterModel[] {
    return fn.parameters?.filter(isPayloadParameter) ?? [];
}

/** Properties of a given codedata role, keyed as shipped. */
export function propertiesOfRole(fn: FunctionModel, role: string): [string, PropertyModel][] {
    return Object.entries(fn.properties ?? {}).filter(
        ([, prop]) => (prop as PropertyModel).codedata?.type === role
    ) as [string, PropertyModel][];
}

/**
 * Whether a single handler variant has anything {@link TriggerHandlerForm} would let the user
 * configure: a bindable payload, composition flags, function annotations, opt-in advanced
 * parameters, a user-renamable name, or an editable return type. False for a handler like kafka's
 * `onError`, whose only parameter is a fixed, non-editable error — the form would render empty, so
 * callers can skip it (add directly / hide the edit affordance) instead of opening a blank panel.
 */
export function hasConfigurableFields(fn: FunctionModel): boolean {
    if (!fn) {
        return false;
    }
    const payloadParam = payloadParameterOf(fn);
    const isPayloadBindable = payloadParam?.type?.codedata?.bindable === true;
    const hasMetadataFlags = propertiesOfRole(fn, CODEDATA_METADATA_FLAG).length > 0;
    const hasModifierFlags = propertiesOfRole(fn, CODEDATA_PAYLOAD_MODIFIER).length > 0;
    const hasAnnotations = propertiesOfRole(fn, CODEDATA_COMPLEX_ANNOTATION).length > 0
        || propertiesOfRole(fn, CODEDATA_ANNOTATION_ATTACHMENT).length > 0;
    const hasAdvancedParams = fn.parameters?.some((p) => p.advanced === true) ?? false;
    const hasEditableName = fn.name?.editable === true;
    const hasEditableReturnType = fn.returnType?.editable === true;
    return isPayloadBindable || hasMetadataFlags || hasModifierFlags || hasAnnotations || hasAdvancedParams
        || hasEditableName || hasEditableReturnType;
}

/** One card in the add-handler catalog picker — a group's variants collapse into one entry. */
export interface HandlerGroup {
    id: string;
    label: string;
    description: string;
    /** False when the group has exactly one variant and nothing configurable on it. */
    needsForm: boolean;
    /** The variant to add directly when {@code needsForm} is false. */
    quickAddFunction?: FunctionModel;
    /** The repeat behaviour shared by the group's members (see {@link repeatBehaviorOf}). */
    repeatable: RepeatBehavior;
}

/**
 * The add-handler catalog, collapsed into one card per handler group (a group's functions are its
 * format variants). Shared by {@link TriggerHandlerConfigForm} (renders the picker) and the "+ Add
 * Handler" entry point (which skips the picker straight to the form when there's exactly one
 * always-addable group — see `isSoleRepeatableGroup`).
 */
export function computeHandlerGroups(serviceModel: ServiceModel): HandlerGroup[] {
    const catalog = addableCatalogOf(serviceModel);
    const groups = new Map<string, HandlerGroup>();
    const membersByGroup = new Map<string, FunctionModel[]>();
    for (const fn of catalog) {
        const id = handlerGroupId(fn);
        if (!id) {
            continue;
        }
        if (!groups.has(id)) {
            groups.set(id, {
                id,
                label: fn.metadata?.label || id,
                description: fn.metadata?.description || "",
                needsForm: true,
                repeatable: repeatBehaviorOf(fn),
            });
        }
        if (!membersByGroup.has(id)) {
            membersByGroup.set(id, []);
        }
        membersByGroup.get(id).push(fn);
    }
    for (const group of groups.values()) {
        const members = membersByGroup.get(group.id) ?? [];
        group.needsForm = members.length > 1 || members.some(hasConfigurableFields);
        if (!group.needsForm) {
            group.quickAddFunction = members[0];
        }
    }
    return Array.from(groups.values());
}

/**
 * Whether the add-handler catalog has exactly one group, and it's repeat-always (e.g. MCP's `Tool` —
 * there's nothing to choose between, so the picker step is pure friction). When true, "+ Add Handler"
 * should open that group's form directly instead of the picker.
 */
export function isSoleRepeatableGroup(serviceModel: ServiceModel): HandlerGroup | undefined {
    const groups = computeHandlerGroups(serviceModel);
    if (groups.length !== 1) {
        return undefined;
    }
    return groups[0].repeatable === RepeatBehavior.TRUE ? groups[0] : undefined;
}

export function applyTypeTemplate(template: string | undefined, element: string): string {
    if (!template) {
        return element;
    }
    return template.includes(TYPE_PLACEHOLDER) ? template.split(TYPE_PLACEHOLDER).join(element) : template;
}

/** Whether a PAYLOAD_MODIFIER flag is currently active (its value is the checked state). */
export function isModifierActive(prop: PropertyModel): boolean {
    const value = prop.value as unknown;
    return value === true || value === "true";
}

/**
 * Composes the rendered payload type from a parameter's codedata and the function's modifier flags.
 * An active modifier's template supersedes the base template (matching the LS PayloadComposer).
 *
 * An included-record payload (kafka's AnydataConsumerRecord, rabbitmq's AnydataMessage) binds the
 * user's type inside a connector-generated wrapper record rather than emitting it directly — the
 * template describes that wrapper's shape (e.g. an array of the wrapper), not the user's type, so
 * applying it here would show a fabricated signature type instead of the type the user actually
 * chose. FTP-style direct bindings have no such wrapper, so the composed (and, once a modifier like
 * Stream is toggled, re-composed) type is the true signature type and is shown as-is.
 */
export function composePayloadType(fn: FunctionModel, param: ParameterModel): string {
    const codedata = param.type?.codedata;
    if (!codedata) {
        return param.type?.value ?? "";
    }
    const element = codedata.boundType || codedata.defaultType || "";
    if (codedata.type === CODEDATA_PAYLOAD_TYPE_INCLUDED_RECORD) {
        return element;
    }
    const activeModifier = propertiesOfRole(fn, CODEDATA_PAYLOAD_MODIFIER)
        .map(([, prop]) => prop)
        .find((prop) => isModifierActive(prop) && !!prop.codedata?.template);
    if (activeModifier) {
        return applyTypeTemplate(activeModifier.codedata.template, element);
    }
    const base = applyTypeTemplate(codedata.template, element);
    return base || element;
}

/**
 * The template currently governing a payload param's composition — an active modifier's template
 * supersedes the param's base template (mirrors {@link composePayloadType}).
 */
export function activeTemplateOf(fn: FunctionModel, param: ParameterModel): string | undefined {
    const activeModifier = propertiesOfRole(fn, CODEDATA_PAYLOAD_MODIFIER)
        .map(([, prop]) => prop)
        .find((prop) => isModifierActive(prop) && !!prop.codedata?.template);
    return activeModifier?.codedata?.template ?? param.type?.codedata?.template;
}

/**
 * Inverse of {@link composePayloadType}: strips the active template's wrapper off a composed type
 * string to recover the bound element (e.g. `stream<Order, error?>` or `Order[]` -> `Order`). Used
 * when an edit hands back the composed type so the recovered element can be re-stored as boundType
 * without the wrapper compounding. Returns the input unchanged when it lacks the expected wrapper.
 * An included-record payload never showed a wrapped type to begin with (see composePayloadType), so
 * the edited value is already the bare element.
 */
export function decomposePayloadType(fn: FunctionModel, param: ParameterModel, composed: string): string {
    if (param.type?.codedata?.type === CODEDATA_PAYLOAD_TYPE_INCLUDED_RECORD) {
        return composed;
    }
    const template = activeTemplateOf(fn, param);
    if (!template || !template.includes(TYPE_PLACEHOLDER)) {
        return composed;
    }
    const placeholderAt = template.indexOf(TYPE_PLACEHOLDER);
    const prefix = template.slice(0, placeholderAt);
    const suffix = template.slice(placeholderAt + TYPE_PLACEHOLDER.length);
    if (composed.length >= prefix.length + suffix.length
        && composed.startsWith(prefix)
        && composed.endsWith(suffix)) {
        return composed.slice(prefix.length, composed.length - suffix.length);
    }
    return composed;
}

/** Whether the payload still renders its shipped default (no user-bound schema). */
export function hasDefaultPayload(param: ParameterModel): boolean {
    return !param.type?.codedata?.boundType;
}

/**
 * Converts a bound type name to a parameter name — camelCased, pluralized when the base template
 * produces an array (e.g. CSV rows).
 */
export function typeNameToParamName(typeName: string, pluralize: boolean): string {
    if (!typeName) {
        return "content";
    }
    let baseName = typeName.trim();
    if (baseName.includes(":")) {
        baseName = baseName.split(":").pop() || baseName;
    }
    while (baseName.endsWith("[]")) {
        baseName = baseName.slice(0, -2);
    }
    baseName = baseName.replace(/[^A-Za-z0-9_]/g, "");
    if (!baseName || /^\d/.test(baseName)) {
        return "content";
    }
    const camelCase = baseName.charAt(0).toLowerCase() + baseName.slice(1);
    if (!pluralize) {
        return camelCase;
    }
    const lastChar = camelCase.slice(-1);
    const lastTwoChars = camelCase.slice(-2);
    if (lastTwoChars === "ss" || lastTwoChars === "sh" || lastTwoChars === "ch" || lastChar === "x" || lastChar === "z") {
        return camelCase + "es";
    }
    if (lastChar === "y" && !["a", "e", "i", "o", "u"].includes(camelCase.slice(-2, -1))) {
        return camelCase.slice(0, -1) + "ies";
    }
    if (lastChar === "s") {
        return camelCase;
    }
    return camelCase + "s";
}

/**
 * A stable key of the function's generated signature — two models sharing this key regenerate the
 * same handler signature; a diff means saving will rewrite it (and may break body code).
 */
export function functionSignatureKey(fn: FunctionModel): string {
    const params = (fn.parameters ?? []).map((p) =>
        [p.kind ?? "", p.name?.value ?? "", p.type?.value ?? "", p.enabled ?? false].join("|")
    );
    return [fn.name?.value ?? "", ...params].join(";");
}
