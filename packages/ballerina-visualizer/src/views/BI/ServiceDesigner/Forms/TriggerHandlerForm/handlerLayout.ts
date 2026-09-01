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

import type { FunctionModel, HandlerLayoutSection, ParameterModel, PropertyModel } from "@wso2/ballerina-core";

import {
    CODEDATA_ANNOTATION_ATTACHMENT,
    CODEDATA_COMPLEX_ANNOTATION,
    CODEDATA_METADATA_FLAG,
    CODEDATA_PAYLOAD_MODIFIER,
    bindingGroupOf,
    bindingGroupSiblingsOf,
    groupedPayloadParametersOf,
    propertiesOfRole,
} from "./payloadComposer";

/**
 * Resolves a schema-driven handler's authored `layout` into the ordered, grouped sections
 * TriggerHandlerForm renders. No layout -> one unlabeled section holding every unit in the form's
 * historical order.
 *
 * An unlabeled section keeps each unit's default chrome (the flags column, the advanced box, the divider
 * before annotations); a labeled section shows its units plainly under its heading, and may set `advanced`
 * to sit inside the collapsed advanced box.
 *
 * Two id namespaces: `$`-prefixed ids name the form's built-in units, and `*rest` is a placement directive
 * rather than a name. Everything else is an author's own identifier, used bare.
 */

/** The variant/format dropdown. */
export const LAYOUT_ID_VARIANT = "$variant";
/** The handler's own documentation blurb. */
export const LAYOUT_ID_DESCRIPTION = "$description";
/** The renamable-handler name field. */
export const LAYOUT_ID_NAME = "$name";
/** The editable doc-comment field. */
export const LAYOUT_ID_DOCUMENTATION = "$documentation";
/** The addable-parameters manager. */
export const LAYOUT_ID_PARAMETERS = "$parameters";
/** The editable return type field. */
export const LAYOUT_ID_RETURN_TYPE = "$returnType";
/** The individually-bound HTTP header block. */
export const LAYOUT_ID_HEADERS = "$headers";
/**
 * Directive: every unit no section claimed, in default order. Placement is section-granular: it
 * always appends the remainder at the end of whichever section's `fields` names it, regardless of
 * where in that array it sits (`["*rest", "stream"]` resolves to `[stream, ...remainder]`).
 */
export const LAYOUT_ID_REST = "*rest";

/**
 * Layout id -> ArtifactForm `FormField.key`. The `$` prefix is load-bearing: real connectors ship
 * parameters named `headers` (mcp) and `parameters` (sap.jco), which bare ids would collide with.
 */
const ARTIFACT_FIELD_KEY_BY_ID: Record<string, string> = {
    [LAYOUT_ID_NAME]: "name",
    [LAYOUT_ID_DOCUMENTATION]: "documentation",
    [LAYOUT_ID_PARAMETERS]: "parameters",
    [LAYOUT_ID_RETURN_TYPE]: "returnType",
};

const ARTIFACT_ID_BY_FIELD_KEY: Record<string, string> = Object.fromEntries(
    Object.entries(ARTIFACT_FIELD_KEY_BY_ID).map(([id, key]) => [key, id])
);

/** The key of the single section a handler with no authored layout resolves to. */
export const DEFAULT_SECTION_KEY = "$default";

export type HandlerUnitKind =
    | "VARIANT"
    | "DESCRIPTION"
    | "ARTIFACT_FIELD"
    | "FLAG"
    | "MODIFIER"
    | "PAYLOAD"
    | "ANNOTATION"
    | "ADVANCED_PARAM"
    | "HEADERS";

/** One addressable thing the handler form can render. */
export interface HandlerUnit {
    /** The primary id an author writes in `layout[].fields`. */
    id: string;
    /** Extra ids that also address this unit; only payload sections use these (binding-group members). */
    altIds?: string[];
    kind: HandlerUnitKind;
    /** The `fn.properties` key, for FLAG / MODIFIER / ANNOTATION units. */
    propertyKey?: string;
    /** The property itself, for FLAG / MODIFIER / ANNOTATION units. */
    property?: PropertyModel;
    /** The parameter, for PAYLOAD / ADVANCED_PARAM units. */
    parameter?: ParameterModel;
    /** The ArtifactForm `FormField.key`, for ARTIFACT_FIELD units. */
    fieldKey?: string;
}

export interface ResolvedSection {
    /** Stable React key: the author's section `id`, else its index, else `DEFAULT_SECTION_KEY`. */
    key: string;
    /** Heading to render. Absent -> an ordered run with no heading and default per-unit chrome. */
    label?: string;
    /** Explanatory text under the heading. */
    description?: string;
    /** Render this group inside the collapsed "Advanced Configurations" box. Labeled sections only. */
    advanced?: boolean;
    units: HandlerUnit[];
}

/** Dev-only diagnostics: authoring mistakes are reported, never thrown. */
function warn(message: string): void {
    // eslint-disable-next-line no-console
    console.warn(`[TriggerHandlerForm layout] ${message}`);
}

/**
 * Every unit the handler form can render, in the order it rendered them before `layout` existed.
 * `artifactFieldKeys` comes from the caller's already-built ArtifactForm fields so the two cannot
 * disagree. Units the form gates at render time are still emitted, so they stay addressable.
 */
export function handlerUnitsOf(fn: FunctionModel, artifactFieldKeys: string[] = []): HandlerUnit[] {
    if (!fn) {
        return [];
    }
    const units: HandlerUnit[] = [
        { id: LAYOUT_ID_VARIANT, kind: "VARIANT" },
        { id: LAYOUT_ID_DESCRIPTION, kind: "DESCRIPTION" },
    ];

    for (const fieldKey of artifactFieldKeys) {
        units.push({
            id: ARTIFACT_ID_BY_FIELD_KEY[fieldKey] ?? fieldKey,
            kind: "ARTIFACT_FIELD",
            fieldKey,
        });
    }

    for (const [propertyKey, property] of propertiesOfRole(fn, CODEDATA_METADATA_FLAG)) {
        units.push({ id: propertyKey, kind: "FLAG", propertyKey, property });
    }
    for (const [propertyKey, property] of propertiesOfRole(fn, CODEDATA_PAYLOAD_MODIFIER)) {
        units.push({ id: propertyKey, kind: "MODIFIER", propertyKey, property });
    }

    for (const param of groupedPayloadParametersOf(fn)) {
        const group = bindingGroupOf(param);
        const memberNames = group
            ? bindingGroupSiblingsOf(fn, param)
                .map((p) => p.name?.value)
                .filter((name): name is string => !!name)
            : [];
        const id = group ?? param.name?.value ?? "";
        units.push({
            id,
            altIds: memberNames.filter((name) => name !== id),
            kind: "PAYLOAD",
            parameter: param,
        });
    }

    for (const [propertyKey, property] of [
        ...propertiesOfRole(fn, CODEDATA_COMPLEX_ANNOTATION),
        ...propertiesOfRole(fn, CODEDATA_ANNOTATION_ATTACHMENT),
    ]) {
        units.push({ id: propertyKey, kind: "ANNOTATION", propertyKey, property });
    }

    for (const param of fn.parameters?.filter((p) => p.advanced === true) ?? []) {
        units.push({ id: param.name?.value ?? "", kind: "ADVANCED_PARAM", parameter: param });
    }

    if (fn.schema?.header) {
        units.push({ id: LAYOUT_ID_HEADERS, kind: "HEADERS" });
    }

    return units.filter((unit) => !!unit.id);
}

/**
 * Index every unit by its primary id, then by its alt ids. First registration wins; a later unit
 * sharing an earlier one's primary id is shadowed -- it can never be named by a layout and always
 * falls into the remainder, so it's flagged rather than silently dropped.
 */
function indexUnits(units: HandlerUnit[]): Map<string, HandlerUnit> {
    const byId = new Map<string, HandlerUnit>();
    for (const unit of units) {
        if (byId.has(unit.id)) {
            warn(`"${unit.id}" names more than one field on this handler; only the first is addressable `
                + "by a layout");
            continue;
        }
        byId.set(unit.id, unit);
    }
    for (const unit of units) {
        for (const altId of unit.altIds ?? []) {
            if (!byId.has(altId)) {
                byId.set(altId, unit);
            }
        }
    }
    return byId;
}

/**
 * Keeps the ArtifactForm block whole: its four fields share one react-hook-form context, so they can be
 * ordered but not split. They collapse to the position of the first one, so naming any of them moves the
 * whole block. `explicitlyDeclaredKeys` names sections that explicitly claimed at least one field before
 * the remainder was merged in, so a section that both names a field and hosts `*rest` still counts as a
 * real, deliberate split -- and the split warning fires only on an actual mistake.
 */
function consolidateArtifactUnits(
    sections: ResolvedSection[], explicitlyDeclaredKeys: Set<string>
): ResolvedSection[] {
    const owners = sections.filter((section) => section.units.some((unit) => unit.kind === "ARTIFACT_FIELD"));
    if (owners.length === 0) {
        return sections;
    }
    const split = owners.filter((section) => explicitlyDeclaredKeys.has(section.key));
    if (split.length > 1) {
        warn(
            "the name/documentation/parameters/returnType fields share one form context and cannot be " +
            `split across sections; rendering all of them in "${split[0].key}"`
        );
    }
    const artifactUnits = owners.flatMap((section) => section.units.filter((unit) => unit.kind === "ARTIFACT_FIELD"));
    const first = split[0] ?? owners[0];
    return sections.map((section) => {
        if (!owners.includes(section)) {
            return section;
        }
        const others = section.units.filter((unit) => unit.kind !== "ARTIFACT_FIELD");
        if (section !== first) {
            return { ...section, units: others };
        }
        const insertAt = section.units.findIndex((unit) => unit.kind === "ARTIFACT_FIELD");
        const before = section.units.slice(0, insertAt).filter((unit) => unit.kind !== "ARTIFACT_FIELD");
        return { ...section, units: [...before, ...artifactUnits, ...others.slice(before.length)] };
    });
}

/** The handler form's sections, in render order. */
export function resolveHandlerLayout(fn: FunctionModel, artifactFieldKeys: string[] = []): ResolvedSection[] {
    const units = handlerUnitsOf(fn, artifactFieldKeys);
    const layout = fn?.layout;
    if (!layout || layout.length === 0) {
        return [{ key: DEFAULT_SECTION_KEY, units }];
    }

    const byId = indexUnits(units);
    const claimed = new Set<HandlerUnit>();
    const seenSectionKeys = new Set<string>();
    let restAt = -1;

    const sections: ResolvedSection[] = layout.map((section: HandlerLayoutSection, index: number) => {
        let key = section.id?.trim() || `$section-${index}`;
        if (seenSectionKeys.has(key)) {
            warn(`section id "${key}" is reused by more than one section; disambiguating it for rendering`);
            key = `${key}-${index}`;
        }
        seenSectionKeys.add(key);
        const picked: HandlerUnit[] = [];
        for (const field of section.fields ?? []) {
            if (field === LAYOUT_ID_REST) {
                if (restAt === -1) {
                    restAt = index;
                } else {
                    warn(`"${LAYOUT_ID_REST}" appears more than once; only the first placement is used`);
                }
                continue;
            }
            const unit = byId.get(field);
            if (!unit) {
                warn(`section "${key}" names "${field}", which matches no field on this handler -- skipped`);
                continue;
            }
            if (claimed.has(unit)) {
                warn(`"${field}" is claimed by an earlier section; the later mention is ignored`);
                continue;
            }
            claimed.add(unit);
            picked.push(unit);
        }
        const label = section.label?.trim() || undefined;
        let advanced = section.advanced === true;
        if (advanced && !label) {
            warn(`section "${key}" is marked advanced but has no label; an advanced group needs a heading `
                + "to sit under, so it is rendered in place instead");
            advanced = false;
        }
        return {
            key,
            label,
            description: section.description?.trim() || undefined,
            advanced: advanced || undefined,
            units: picked,
        };
    });

    // Captured before the remainder is merged in, so a section that both names a field and hosts
    // `*rest` (e.g. `fields: ["$name", "*rest"]`) is still recognised as explicitly declared.
    const explicitlyDeclaredKeys = new Set(
        sections.filter((section) => section.units.length > 0).map((section) => section.key)
    );

    const remainder = units.filter((unit) => !claimed.has(unit));
    if (remainder.length > 0) {
        if (restAt === -1) {
            sections.push({ key: LAYOUT_ID_REST, units: remainder });
        } else {
            sections[restAt] = { ...sections[restAt], units: [...sections[restAt].units, ...remainder] };
        }
    }

    return consolidateArtifactUnits(sections, explicitlyDeclaredKeys)
        .filter((section) => section.units.length > 0);
}

/**
 * Orders the caller's ArtifactForm fields to match the resolved layout. Keys the layout never named keep
 * their original relative order, after the ones it did.
 */
export function orderArtifactFieldKeys(sections: ResolvedSection[], artifactFieldKeys: string[]): string[] {
    const declared = sections
        .flatMap((section) => section.units)
        .filter((unit) => unit.kind === "ARTIFACT_FIELD")
        .map((unit) => unit.fieldKey)
        .filter((key): key is string => !!key && artifactFieldKeys.includes(key));
    const seen = new Set(declared);
    return [...declared, ...artifactFieldKeys.filter((key) => !seen.has(key))];
}
