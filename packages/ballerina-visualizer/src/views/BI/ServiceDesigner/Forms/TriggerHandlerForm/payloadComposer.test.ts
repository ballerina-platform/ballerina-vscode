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

// L1: pure logic behind the schema-driven TriggerHandlerForm (unified TriggerModel wire shape).
// Every fixture below mirrors real wire output captured from the language server's own test
// resources for the connectors that exercise a distinct code path here:
//   - kafka:    PAYLOAD_TYPE_INCLUDED_RECORD, template wraps in an array ("{{type}}[]")
//   - rabbitmq: PAYLOAD_TYPE_INCLUDED_RECORD, template is the bare element ("{{type}}"),
//               and its onMessage/onRequest handlers are the canonical ONE_OF_GROUP example
//   - ftp:      PAYLOAD_TYPE (no wrapper), a PAYLOAD_MODIFIER (Stream), and its onCreate
//               format variants (CSV/JSON/XML/Text/Raw Bytes) are the canonical
//               ONE_EACH_PER_GROUP example; onFileChange is the canonical LEGACY example
//   - cdc:      PAYLOAD_TYPE with a real bound custom schema (not just the default)
//   - mcp:      repeatable TRUE (add-without-limit), the canonical isSoleRepeatableGroup example
// Getting any of this wrong silently mis-renders or mis-generates a connector's handler form —
// there is no compiler to catch it, since the composition is pure string templating.

// The only mock here is @wso2/ballerina-core, matching utils/bi.test.ts's own rationale: its
// barrel export (lib/index.js) re-exports WSConnection, which requires vscode-ws-jsonrpc — an
// ESM-only package Jest cannot load without extra transform config. RepeatBehavior is the one
// runtime value payloadComposer.ts (and this file) actually needs from the package; every other
// import below is a type, fully erased at compile time, so it never reaches `require()`.
jest.mock("@wso2/ballerina-core", () => ({
    RepeatBehavior: {
        FALSE: "FALSE",
        TRUE: "TRUE",
        ONE_OF_GROUP: "ONE_OF_GROUP",
        ONE_EACH_PER_GROUP: "ONE_EACH_PER_GROUP",
        LEGACY: "LEGACY",
    },
}));

import type { FunctionModel, ParameterModel, PropertyModel, ServiceModel } from "@wso2/ballerina-core";
import { RepeatBehavior } from "@wso2/ballerina-core";
import {
    activeTemplateOf,
    addableCatalogOf,
    addedParametersOf,
    applyTypeTemplate,
    catalogFunctionsOf,
    composePayloadType,
    computeHandlerGroups,
    decomposePayloadType,
    functionSignatureKey,
    handlerGroupId,
    hasConfigurableFields,
    hasDefaultPayload,
    isAddedParameter,
    isModifierActive,
    isPayloadParameter,
    isSchemaTriggerFunction,
    isSchemaTriggerService,
    isSoleRepeatableGroup,
    payloadParameterOf,
    payloadParametersOf,
    propertiesOfRole,
    repeatBehaviorOf,
    typeNameToParamName,
    withAddedParameters,
} from "./payloadComposer";

// ---------------------------------------------------------------------------------------------
// Fixture builders — minimal-but-real shapes, cast where the full wire interface's unrelated
// required fields (e.g. FunctionModel.returnType) don't matter to the function under test.
// ---------------------------------------------------------------------------------------------

function prop(overrides: Partial<PropertyModel> = {}): PropertyModel {
    return { enabled: true, editable: true, optional: false, advanced: false, value: "", ...overrides };
}

function param(overrides: Partial<ParameterModel> = {}): ParameterModel {
    return { enabled: true, editable: true, optional: false, advanced: false, ...overrides } as ParameterModel;
}

/** kafka's onConsumerRecord payload — see get_sm_from_source/config/kafka_service_model.json. */
function kafkaPayloadParam(boundType?: string): ParameterModel {
    return param({
        kind: "DATA_BINDING",
        name: prop({ value: "consumerRecords", editable: false }),
        type: prop({
            value: boundType ? "kafka:AnydataConsumerRecord[]" : "",
            codedata: {
                type: "PAYLOAD_TYPE_INCLUDED_RECORD",
                template: "{{type}}[]",
                defaultType: "kafka:AnydataConsumerRecord",
                boundType,
                bindable: true,
                field: "value",
                typeIdentifier: "KafkaAnydataConsumer",
                nameEditable: false,
            } as any,
        }),
    });
}

/** rabbitmq's onMessage payload — see get_sm_from_source/config/rabbitmq_service_model.json. */
function rabbitmqPayloadParam(boundType?: string): ParameterModel {
    return param({
        kind: "DATA_BINDING",
        name: prop({ value: "message", editable: false }),
        type: prop({
            value: boundType ?? "rabbitmq:AnydataMessage",
            codedata: {
                type: "PAYLOAD_TYPE_INCLUDED_RECORD",
                template: "{{type}}",
                defaultType: "rabbitmq:AnydataMessage",
                boundType,
                bindable: true,
                field: "content",
                typeIdentifier: "RabbitmqAnydataMessage",
                nameEditable: false,
            } as any,
        }),
    });
}

/** ftp's onFileJson payload — see get_sm_from_source/config/ftp_service_model.json. */
function ftpPayloadParam(boundType?: string): ParameterModel {
    return param({
        kind: "DATA_BINDING",
        name: prop({ value: "content", editable: true }),
        type: prop({
            value: boundType || "json",
            codedata: {
                type: "PAYLOAD_TYPE",
                template: "{{type}}",
                defaultType: "json",
                boundType: boundType ?? "",
                bindable: true,
            } as any,
        }),
    });
}

/** ftp's Stream (Large Files) modifier — see get_sm_from_source/config/ftp_service_model.json. */
function ftpStreamModifierProp(active: boolean): PropertyModel {
    return prop({
        metadata: { label: "Stream (Large Files)", description: "Process the file content in chunks" },
        value: active as unknown as string,
        codedata: {
            type: "PAYLOAD_MODIFIER",
            template: "stream<{{type}}, error?>",
            modifier: "stream",
            targetParam: "payload",
        } as any,
    });
}

/** cdc's onUpdate before/after payloads — see get_sm_from_source/config/cdc_service_model.json. */
function cdcPayloadParam(name: "before" | "after", boundType?: string): ParameterModel {
    return param({
        kind: "DATA_BINDING",
        name: prop({ value: name, editable: false }),
        type: prop({
            value: boundType || "record {}",
            codedata: {
                type: "PAYLOAD_TYPE",
                template: "{{type}}",
                defaultType: "record {}",
                boundType: boundType ?? "",
                bindable: true,
                nameEditable: false,
            } as any,
        }),
    });
}

function fn(overrides: Partial<FunctionModel> = {}): FunctionModel {
    return {
        kind: "REMOTE",
        enabled: true,
        optional: false,
        editable: false,
        // A fixed (non-renamable) name is the default for real connector handlers — only a
        // user-renamable handler (e.g. an MCP tool) sets `name.editable: true`, and does so
        // explicitly in the tests that need it.
        name: prop({ value: "handler", editable: false }),
        parameters: [],
        returnType: prop({ editable: false }) as any,
        ...overrides,
    } as FunctionModel;
}

function serviceModel(overrides: Partial<ServiceModel> = {}): ServiceModel {
    return {
        id: 0, name: "svc", type: "service", moduleName: "kafka", orgName: "ballerinax", version: "1.0.0",
        packageName: "kafka", listenerProtocol: "kafka", icon: "",
        ...overrides,
    } as ServiceModel;
}

// ---------------------------------------------------------------------------------------------

describe("handlerGroupId / isSchemaTriggerFunction / isSchemaTriggerService", () => {
    it("prefers the explicit group id over the metadata label", () => {
        expect(handlerGroupId(fn({ group: "consume", metadata: { label: "On Message", description: "" } })))
            .toBe("consume");
    });

    it("falls back to the metadata label when no group is set (e.g. a plain, non-variant handler)", () => {
        expect(handlerGroupId(fn({ metadata: { label: "On Error", description: "" } }))).toBe("On Error");
    });

    it("is undefined for a handler with neither a group nor a metadata label", () => {
        expect(handlerGroupId(fn())).toBeUndefined();
    });

    it("isSchemaTriggerFunction is true only when `group` is set", () => {
        expect(isSchemaTriggerFunction(fn({ group: "consume" }))).toBe(true);
        expect(isSchemaTriggerFunction(fn())).toBe(false);
    });

    it("isSchemaTriggerService is true when schemaFunctions ships a catalog", () => {
        expect(isSchemaTriggerService(serviceModel({ schemaFunctions: [fn({ group: "onMessage" })] }))).toBe(true);
    });

    it("isSchemaTriggerService is true when functions carry the group marker even with no catalog", () => {
        expect(isSchemaTriggerService(serviceModel({ functions: [fn({ group: "onMessage" })] }))).toBe(true);
    });

    it("isSchemaTriggerService is false for a plain (non-schema-driven) service, and for undefined", () => {
        expect(isSchemaTriggerService(serviceModel({ functions: [fn()] }))).toBe(false);
        expect(isSchemaTriggerService(undefined)).toBe(false);
    });
});

describe("catalogFunctionsOf", () => {
    it("prefers the dedicated schemaFunctions catalog when present", () => {
        const catalog = [fn({ group: "onMessage", name: prop({ value: "onMessage" }) })];
        const model = serviceModel({ schemaFunctions: catalog, functions: [fn({ group: "onMessage", enabled: true })] });
        expect(catalogFunctionsOf(model)).toBe(catalog);
    });

    it("falls back to disabled group-marked functions for templates predating the schemaFunctions split", () => {
        const onError = fn({ group: "onError", enabled: false, name: prop({ value: "onError" }) });
        const onMessage = fn({ group: "onMessage", enabled: true, name: prop({ value: "onMessage" }) });
        const plain = fn({ enabled: false, name: prop({ value: "notSchemaDriven" }) });
        expect(catalogFunctionsOf(serviceModel({ functions: [onError, onMessage, plain] }))).toEqual([onError]);
    });
});

describe("repeatBehaviorOf", () => {
    it("defaults to FALSE when unset", () => {
        expect(repeatBehaviorOf(fn())).toBe(RepeatBehavior.FALSE);
    });

    it("returns the shipped value otherwise", () => {
        expect(repeatBehaviorOf(fn({ repeatable: RepeatBehavior.ONE_OF_GROUP }))).toBe(RepeatBehavior.ONE_OF_GROUP);
    });
});

describe("isAddedParameter / addedParametersOf / withAddedParameters", () => {
    const fixedRequestParam = param({ advanced: true, name: prop({ value: "req" }) });
    const userAddedParam = param({ name: prop({ value: "userField" }) });
    const userAddedHeader = param({ name: prop({ value: "x-trace-id" }), httpParamType: "HEADER" });

    it("a fixed (advanced) schema parameter is never counted as user-added, of either kind", () => {
        expect(isAddedParameter(fixedRequestParam, "parameter")).toBe(false);
        expect(isAddedParameter(fixedRequestParam, "header")).toBe(false);
    });

    it("distinguishes a plain user-added parameter from a user-added header by httpParamType", () => {
        expect(isAddedParameter(userAddedParam, "parameter")).toBe(true);
        expect(isAddedParameter(userAddedParam, "header")).toBe(false);
        expect(isAddedParameter(userAddedHeader, "header")).toBe(true);
        expect(isAddedParameter(userAddedHeader, "parameter")).toBe(false);
    });

    it("addedParametersOf returns only the matching kind, excluding fixed parameters", () => {
        const handler = fn({ parameters: [fixedRequestParam, userAddedParam, userAddedHeader] });
        expect(addedParametersOf(handler, "parameter")).toEqual([userAddedParam]);
        expect(addedParametersOf(handler, "header")).toEqual([userAddedHeader]);
    });

    it("withAddedParameters replaces only the given kind, leaving fixed params and the other kind untouched", () => {
        const handler = fn({ parameters: [fixedRequestParam, userAddedParam, userAddedHeader] });
        const replacement = [param({ name: prop({ value: "newField" }) })];
        const updated = withAddedParameters(handler, "parameter", replacement);
        expect(updated.parameters).toEqual([fixedRequestParam, userAddedHeader, ...replacement]);
    });
});

describe("addableCatalogOf — RepeatBehavior semantics, using each connector's real catalog shape", () => {
    // ftp's onCreate group: CSV/Text/Raw Bytes still addable, JSON/XML already present in source —
    // mirrors get_sm_from_source/config/ftp_service_model.json exactly.
    it("ONE_EACH_PER_GROUP (ftp onCreate variants): consuming one member only removes that member", () => {
        const catalog = [
            fn({ group: "onCreate", variantLabel: "CSV", repeatable: RepeatBehavior.ONE_EACH_PER_GROUP, name: prop({ value: "onFileCsv" }) }),
            fn({ group: "onCreate", variantLabel: "Text", repeatable: RepeatBehavior.ONE_EACH_PER_GROUP, name: prop({ value: "onFileText" }) }),
            fn({ group: "onCreate", variantLabel: "Raw Bytes", repeatable: RepeatBehavior.ONE_EACH_PER_GROUP, name: prop({ value: "onFile" }) }),
        ];
        const present = [
            fn({ group: "onCreate", variantLabel: "JSON", repeatable: RepeatBehavior.ONE_EACH_PER_GROUP, enabled: true, name: prop({ value: "onFileJson" }) }),
            fn({ group: "onCreate", variantLabel: "XML", repeatable: RepeatBehavior.ONE_EACH_PER_GROUP, enabled: true, name: prop({ value: "onFileXml" }) }),
        ];
        const model = serviceModel({ schemaFunctions: catalog, functions: present });
        expect(addableCatalogOf(model).map((f) => f.name.value)).toEqual(["onFileCsv", "onFileText", "onFile"]);
    });

    // rabbitmq's consume group: onMessage / onRequest are mutually exclusive — the canonical
    // ONE_OF_GROUP example (mirrors main/resources/trigger-models/rabbitmq.json).
    it("ONE_OF_GROUP (rabbitmq onMessage/onRequest): consuming either sibling hides the whole group", () => {
        const onMessage = fn({ group: "consume", variantLabel: "On Message", repeatable: RepeatBehavior.ONE_OF_GROUP, name: prop({ value: "onMessage" }) });
        const onRequest = fn({ group: "consume", variantLabel: "On Request", repeatable: RepeatBehavior.ONE_OF_GROUP, name: prop({ value: "onRequest" }) });
        const onError = fn({ repeatable: RepeatBehavior.FALSE, name: prop({ value: "onError" }) });
        const model = serviceModel({
            schemaFunctions: [onMessage, onRequest, onError],
            functions: [{ ...onMessage, enabled: true }],
        });
        // onRequest (sibling of the already-present onMessage) is hidden; onError (unrelated) stays.
        expect(addableCatalogOf(model).map((f) => f.name.value)).toEqual(["onError"]);
    });

    it("FALSE (default, single-instance): present once means gone from the catalog", () => {
        // group mirrors the real wire fallback (TriggerFunctionAdapter#setGroup): a manifest that
        // doesn't set an explicit group still gets one on the wire, defaulting to the function's own
        // name — a blank group here would be unrealistic test data, not a case that occurs in practice.
        const onError = fn({ repeatable: RepeatBehavior.FALSE, group: "onError", name: prop({ value: "onError", editable: false }) });
        const model = serviceModel({
            schemaFunctions: [{ ...onError }],
            functions: [{ ...onError, enabled: true }],
        });
        expect(addableCatalogOf(model)).toEqual([]);
    });

    // mcp's Tool: repeat-always — the canonical TRUE example (isSoleRepeatableGroup's own case).
    it("TRUE (mcp Tool): never removed from the catalog no matter how many are already present", () => {
        const tool = fn({ repeatable: RepeatBehavior.TRUE, name: prop({ value: "newTool" }, ) });
        const model = serviceModel({
            schemaFunctions: [tool],
            functions: [
                { ...tool, name: prop({ value: "tool1" }), enabled: true },
                { ...tool, name: prop({ value: "tool2" }), enabled: true },
            ],
        });
        expect(addableCatalogOf(model)).toEqual([tool]);
    });

    // ftp's onFileChange: deprecated, hidden by default, but once present displaces every
    // non-legacy entry regardless of group — the canonical LEGACY example.
    it("LEGACY (ftp onFileChange): hidden until present; once present, displaces every non-legacy entry", () => {
        // group mirrors the real wire fallback (TriggerFunctionAdapter#setGroup) — see the FALSE
        // test's comment above for why a blank group would be unrealistic test data.
        const onFileChange = fn({ repeatable: RepeatBehavior.LEGACY, group: "onFileChange", name: prop({ value: "onFileChange", editable: false }) });
        const onCreateCsv = fn({ group: "onCreate", repeatable: RepeatBehavior.ONE_EACH_PER_GROUP, name: prop({ value: "onFileCsv" }) });
        const onDelete = fn({ repeatable: RepeatBehavior.FALSE, name: prop({ value: "onFileDelete" }) });
        const catalog = [onFileChange, onCreateCsv, onDelete];

        // Not present yet: legacy entry hidden, everything else offered normally.
        const beforeModel = serviceModel({ schemaFunctions: catalog, functions: [] });
        expect(addableCatalogOf(beforeModel).map((f) => f.name.value)).toEqual(["onFileCsv", "onFileDelete"]);

        // Present: legacy entry now shows, every non-legacy entry is displaced (ignoring group).
        const afterModel = serviceModel({
            schemaFunctions: catalog,
            functions: [{ ...onFileChange, enabled: true }],
        });
        expect(afterModel === afterModel).toBe(true); // sanity: distinct object per branch
        expect(addableCatalogOf(afterModel).map((f) => f.name.value)).toEqual(["onFileChange"]);
    });

    it("distinct LEGACY entries are independent: one present neither hides itself nor a sibling", () => {
        const legacyA = fn({ repeatable: RepeatBehavior.LEGACY, group: "onFileChange", name: prop({ value: "onFileChange", editable: false }) });
        const legacyB = fn({ repeatable: RepeatBehavior.LEGACY, group: "onAnyEvent", name: prop({ value: "onAnyEvent", editable: false }) });
        const model = serviceModel({
            schemaFunctions: [legacyA, legacyB],
            functions: [{ ...legacyA, enabled: true }],
        });
        // Unlike every other RepeatBehavior, LEGACY is exempt from the "present once means gone from
        // the catalog" rule (see the FALSE test above) — a present LEGACY handler only ever *reveals*
        // the rest of the legacy surface (per the "LEGACY (ftp onFileChange)" test above), it never
        // hides any legacy entry, including its own. So legacyA stays offered alongside legacyB.
        expect(addableCatalogOf(model).map((f) => f.name.value)).toEqual(["onFileChange", "onAnyEvent"]);
    });
});

describe("isPayloadParameter / payloadParameterOf / payloadParametersOf", () => {
    it("recognises DATA_BINDING kind and both payload codedata types", () => {
        expect(isPayloadParameter(kafkaPayloadParam())).toBe(true);
        expect(isPayloadParameter(ftpPayloadParam())).toBe(true);
        expect(isPayloadParameter(param({ kind: "REQUIRED" }))).toBe(false);
    });

    it("payloadParameterOf returns the first payload param, ignoring plain ones", () => {
        const plain = param({ kind: "REQUIRED", name: prop({ value: "topic" }) });
        const handler = fn({ parameters: [plain, kafkaPayloadParam()] });
        expect(payloadParameterOf(handler)).toBe(handler.parameters[1]);
    });

    // cdc's onUpdate exposes both a before- and after-image — the canonical multi-payload example.
    it("payloadParametersOf returns every payload param — cdc onUpdate's before/after", () => {
        const before = cdcPayloadParam("before");
        const after = cdcPayloadParam("after");
        const handler = fn({ parameters: [before, after] });
        expect(payloadParametersOf(handler)).toEqual([before, after]);
    });

    it("returns an empty array for a handler with no payload parameters", () => {
        expect(payloadParametersOf(fn({ parameters: [param({ kind: "REQUIRED" })] }))).toEqual([]);
    });
});

describe("propertiesOfRole / hasConfigurableFields", () => {
    it("propertiesOfRole filters a function's properties by codedata.type", () => {
        const handler = fn({
            properties: {
                stream: ftpStreamModifierProp(false),
                readOnly: prop({ codedata: { type: "METADATA_FLAG" } as any }),
            },
        });
        expect(propertiesOfRole(handler, "PAYLOAD_MODIFIER").map(([k]) => k)).toEqual(["stream"]);
        expect(propertiesOfRole(handler, "METADATA_FLAG").map(([k]) => k)).toEqual(["readOnly"]);
    });

    it("hasConfigurableFields is false for a handler with nothing to configure (kafka's onError)", () => {
        const onError = fn({
            parameters: [param({ kind: "REQUIRED", advanced: false, editable: false, name: prop({ value: "err" }) })],
        });
        expect(hasConfigurableFields(onError)).toBe(false);
    });

    it("hasConfigurableFields is true when the payload is bindable", () => {
        expect(hasConfigurableFields(fn({ parameters: [kafkaPayloadParam()] }))).toBe(true);
    });

    it("hasConfigurableFields is true when a PAYLOAD_MODIFIER flag is present (ftp's Stream toggle)", () => {
        const handler = fn({
            parameters: [param({ kind: "REQUIRED", name: prop({ value: "err" }) })],
            properties: { stream: ftpStreamModifierProp(false) },
        });
        expect(hasConfigurableFields(handler)).toBe(true);
    });

    it("hasConfigurableFields is true for a user-renamable handler (mcp tool) via editable name", () => {
        expect(hasConfigurableFields(fn({ name: prop({ value: "newTool", editable: true }) }))).toBe(true);
    });

    it("hasConfigurableFields is false for a null/undefined function", () => {
        expect(hasConfigurableFields(undefined)).toBe(false);
    });
});

describe("computeHandlerGroups / isSoleRepeatableGroup", () => {
    it("collapses a group's variants into one card, needing a form when it has more than one member", () => {
        const csv = fn({ group: "onCreate", variantLabel: "CSV", repeatable: RepeatBehavior.ONE_EACH_PER_GROUP, metadata: { label: "On Create", description: "" }, name: prop({ value: "onFileCsv" }) });
        const json = fn({ group: "onCreate", variantLabel: "JSON", repeatable: RepeatBehavior.ONE_EACH_PER_GROUP, metadata: { label: "On Create", description: "" }, name: prop({ value: "onFileJson" }) });
        const groups = computeHandlerGroups(serviceModel({ schemaFunctions: [csv, json] }));
        expect(groups).toHaveLength(1);
        expect(groups[0]).toMatchObject({ id: "onCreate", label: "On Create", needsForm: true });
        expect(groups[0].quickAddFunction).toBeUndefined();
    });

    it("a sole-variant group with nothing configurable skips the form (quick-add)", () => {
        const onError = fn({
            metadata: { label: "On Error", description: "" },
            name: prop({ value: "onError", editable: false }),
            parameters: [param({ kind: "REQUIRED", name: prop({ value: "err" }) })],
        });
        const groups = computeHandlerGroups(serviceModel({ schemaFunctions: [onError] }));
        expect(groups[0].needsForm).toBe(false);
        expect(groups[0].quickAddFunction).toBe(onError);
    });

    it("isSoleRepeatableGroup returns the group only when it is the sole catalog entry and repeat-always (mcp Tool)", () => {
        const tool = fn({ repeatable: RepeatBehavior.TRUE, metadata: { label: "Tool", description: "" }, name: prop({ value: "newTool" }) });
        expect(isSoleRepeatableGroup(serviceModel({ schemaFunctions: [tool] }))?.id).toBe("Tool");
    });

    it("isSoleRepeatableGroup is undefined when there is more than one group", () => {
        const a = fn({ metadata: { label: "A", description: "" }, name: prop({ value: "a" }), repeatable: RepeatBehavior.TRUE });
        const b = fn({ metadata: { label: "B", description: "" }, name: prop({ value: "b" }) });
        expect(isSoleRepeatableGroup(serviceModel({ schemaFunctions: [a, b] }))).toBeUndefined();
    });

    it("isSoleRepeatableGroup is undefined when the sole group is not repeat-always", () => {
        const onError = fn({ metadata: { label: "On Error", description: "" }, name: prop({ value: "onError" }) });
        expect(isSoleRepeatableGroup(serviceModel({ schemaFunctions: [onError] }))).toBeUndefined();
    });
});

describe("applyTypeTemplate / isModifierActive", () => {
    it("substitutes every {{type}} occurrence", () => {
        expect(applyTypeTemplate("{{type}}[]", "Order")).toBe("Order[]");
        expect(applyTypeTemplate("stream<{{type}}, error?>", "Order")).toBe("stream<Order, error?>");
    });

    it("returns the element unchanged when there is no template", () => {
        expect(applyTypeTemplate(undefined, "Order")).toBe("Order");
    });

    it("returns the template as-is when it has no {{type}} placeholder", () => {
        expect(applyTypeTemplate("json", "Order")).toBe("json");
    });

    it("isModifierActive accepts both a real boolean and the string form", () => {
        expect(isModifierActive(prop({ value: true as unknown as string }))).toBe(true);
        expect(isModifierActive(prop({ value: "true" }))).toBe(true);
        expect(isModifierActive(prop({ value: false as unknown as string }))).toBe(false);
        expect(isModifierActive(prop({ value: "false" }))).toBe(false);
    });
});

describe("composePayloadType / activeTemplateOf / decomposePayloadType — per-connector round trips", () => {
    it("kafka (included-record, default/unbound): shows the connector's own wrapper type as-is", () => {
        const p = kafkaPayloadParam();
        const handler = fn({ parameters: [p] });
        // Included-record payloads never show the template-wrapped signature — just the element.
        expect(composePayloadType(handler, p)).toBe("kafka:AnydataConsumerRecord");
        expect(hasDefaultPayload(p)).toBe(true);
    });

    it("kafka (included-record, user-bound): still bare — the array wrapper never applies to it", () => {
        const p = kafkaPayloadParam("OrderEvent");
        const handler = fn({ parameters: [p] });
        expect(composePayloadType(handler, p)).toBe("OrderEvent");
        expect(hasDefaultPayload(p)).toBe(false);
        // decompose is a no-op for included-record payloads (never wrapped, so nothing to strip)
        expect(decomposePayloadType(handler, p, "OrderEvent")).toBe("OrderEvent");
    });

    it("rabbitmq (included-record, bare template): identical shape to kafka's, no [] wrapper", () => {
        const p = rabbitmqPayloadParam();
        const handler = fn({ parameters: [p] });
        expect(composePayloadType(handler, p)).toBe("rabbitmq:AnydataMessage");
    });

    it("ftp (direct binding, no modifier active): template applies but is a no-op ({{type}})", () => {
        const p = ftpPayloadParam();
        const handler = fn({ parameters: [p], properties: { stream: ftpStreamModifierProp(false) } });
        expect(composePayloadType(handler, p)).toBe("json");
        expect(activeTemplateOf(handler, p)).toBe("{{type}}");
    });

    it("ftp (Stream modifier active): the modifier's template supersedes the base template", () => {
        const p = ftpPayloadParam("Order");
        const handler = fn({ parameters: [p], properties: { stream: ftpStreamModifierProp(true) } });
        expect(composePayloadType(handler, p)).toBe("stream<Order, error?>");
        expect(activeTemplateOf(handler, p)).toBe("stream<{{type}}, error?>");
    });

    it("ftp: decomposing a Stream-wrapped edit recovers the bare bound element", () => {
        const p = ftpPayloadParam("Order");
        const handler = fn({ parameters: [p], properties: { stream: ftpStreamModifierProp(true) } });
        expect(decomposePayloadType(handler, p, "stream<Order, error?>")).toBe("Order");
    });

    it("ftp: decomposing a value that doesn't match the active template's wrapper is returned unchanged", () => {
        const p = ftpPayloadParam("Order");
        const handler = fn({ parameters: [p], properties: { stream: ftpStreamModifierProp(true) } });
        expect(decomposePayloadType(handler, p, "Order")).toBe("Order");
    });

    it("cdc (direct binding, real bound custom schema): shows the user's own record type as-is", () => {
        const p = cdcPayloadParam("after", "AfterEntrySchema");
        const handler = fn({ parameters: [p] });
        expect(composePayloadType(handler, p)).toBe("AfterEntrySchema");
        expect(hasDefaultPayload(p)).toBe(false);
    });

    it("cdc (direct binding, still default): falls back to the connector's default record shape", () => {
        const p = cdcPayloadParam("before");
        const handler = fn({ parameters: [p] });
        expect(composePayloadType(handler, p)).toBe("record {}");
        expect(hasDefaultPayload(p)).toBe(true);
    });

    it("a payload param with no codedata at all falls back to its own type.value", () => {
        const p = param({ kind: "DATA_BINDING", type: prop({ value: "anydata" }) });
        expect(composePayloadType(fn({ parameters: [p] }), p)).toBe("anydata");
    });

    it("an inactive modifier is ignored even if it has a template — only an active one supersedes", () => {
        const p = ftpPayloadParam("Order");
        // Two modifiers shipped, only one active — the active one (with a template) must win,
        // and an active flag with no template must be skipped in favor of the base template.
        const handler = fn({
            parameters: [p],
            properties: {
                noTemplateFlag: prop({ value: true as unknown as string, codedata: { type: "PAYLOAD_MODIFIER" } as any }),
                stream: ftpStreamModifierProp(false),
            },
        });
        expect(composePayloadType(handler, p)).toBe("Order");
    });
});

describe("typeNameToParamName", () => {
    it("camelCases a simple module-qualified type", () => {
        expect(typeNameToParamName("kafka:AnydataConsumerRecord", false)).toBe("anydataConsumerRecord");
    });

    it("strips array brackets before deriving the name", () => {
        expect(typeNameToParamName("Order[]", false)).toBe("order");
    });

    it("pluralizes per simple English rules when asked", () => {
        expect(typeNameToParamName("Order", true)).toBe("orders");
        expect(typeNameToParamName("Class", true)).toBe("classes"); // ends in "ss"
        expect(typeNameToParamName("Entry", true)).toBe("entries"); // consonant + y
        expect(typeNameToParamName("Key", true)).toBe("keys"); // vowel + y, not "keies"
        expect(typeNameToParamName("Status", true)).toBe("status"); // already ends in "s"
    });

    it("falls back to 'content' for an empty, purely-symbolic, or digit-led name", () => {
        expect(typeNameToParamName("", false)).toBe("content");
        expect(typeNameToParamName("[]", false)).toBe("content");
        expect(typeNameToParamName("123Type", false)).toBe("content");
    });
});

describe("functionSignatureKey", () => {
    it("is stable for the same signature and changes when a parameter's type changes", () => {
        const before = fn({ name: prop({ value: "onFileJson" }), parameters: [ftpPayloadParam("json")] });
        const same = fn({ name: prop({ value: "onFileJson" }), parameters: [ftpPayloadParam("json")] });
        const changed = fn({ name: prop({ value: "onFileJson" }), parameters: [ftpPayloadParam("MyRecord")] });
        expect(functionSignatureKey(before)).toBe(functionSignatureKey(same));
        expect(functionSignatureKey(before)).not.toBe(functionSignatureKey(changed));
    });

    it("changes when the function name changes, independent of parameters", () => {
        const a = fn({ name: prop({ value: "onFileJson" }), parameters: [] });
        const b = fn({ name: prop({ value: "onFileXml" }), parameters: [] });
        expect(functionSignatureKey(a)).not.toBe(functionSignatureKey(b));
    });

    it("changes when a parameter is enabled/disabled (opt-in advanced params)", () => {
        const p = param({ kind: "REQUIRED", name: prop({ value: "caller" }), type: prop({ value: "http:Caller" }), enabled: false });
        const handlerOff = fn({ name: prop({ value: "onMessage" }), parameters: [p] });
        const handlerOn = fn({ name: prop({ value: "onMessage" }), parameters: [{ ...p, enabled: true }] });
        expect(functionSignatureKey(handlerOff)).not.toBe(functionSignatureKey(handlerOn));
    });
});
