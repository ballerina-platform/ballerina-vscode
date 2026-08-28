// Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com/) All Rights Reserved.

// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at

// http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.

import { z } from 'zod';

export interface Type {
    name: string;
    links?: Link[];
    // Spec §1.4 `subtypeFamily`: this reference stands for the named type AND every subtype of it, not the
    // exact type alone. Set only inside a data binding — a variant's `constraint` or `excludes`, or a
    // shape's `envelope` — which is the whole of where the spec puts it, because those are the three
    // positions that name a relationship a declared type must satisfy rather than a type to declare
    // verbatim. `http:StatusCodeResponse` is the corpus case: the family covers `http:Ok`,
    // `http:Created`, and any narrowing the reader declares themselves.
    subtypeFamily?: boolean;
}

export interface Link {
    category: Category;
    recordName: string;
    libraryName?: string;
}

export type Category = "internal" | "external";

export interface AnnotationAttachment {
    name: string;
    module?: string;
    value?: string;
}

export interface Parameter {
    name: string;
    description: string;
    type: Type;
    default?: string;
    // Whether this parameter may be omitted. The pipeline emits it only when true — from the init method's
    // DEFAULTABLE/INCLUDED_RECORD parameter kind, or the service index's own flag — so absent means required.
    // Declared here rather than read through a cast, so a producer that stops sending it fails type-checking
    // instead of silently dropping every listener default.
    optional?: boolean;
    annotations?: AnnotationAttachment[];
}

export interface ParameterDef {
    // Spec §7 `params[].name`: the authored name, or the deterministic one the pipeline generated for a slot
    // whose name the document leaves to the service author. Declared here rather than smuggled through a
    // cast at the one call site that needs it.
    name?: string;
    description: string;
    type: Type;
    default?: string;
    // Spec §7 `deprecated` — why this slot is superseded, as prose. See ServiceRemoteFunction.deprecated.
    deprecated?: string;
    // Spec §7 `presence`. An optional handler parameter may be omitted from the signature entirely — it is
    // never rendered as `T?` or given a default, neither of which is what the spec means.
    optional: boolean;
    // Spec §7: the slot's other legal types. `type` carries the codegen default; these are the rest, and
    // they are deliberately NOT joined into a union — a `|`-joined type declares a union-typed parameter,
    // whereas the spec means the author picks one of these when writing the signature.
    alternatives?: Type[];
    // Spec §8 at `attachPoint: "parameter"`. Named `annotationRefs`, not `annotations`, because the
    // sibling `Parameter` interface's `annotations` holds AnnotationAttachments — annotations the library
    // already carries, rendered verbatim. These are requirements on code that does not exist yet.
    annotationRefs?: AnnotationRequirement[];
    // Spec §9: how this slot's raw value may be projected into a user-defined type.
    binding?: ParamBinding;
    // Spec §7 `addMode: "many"`: the slot repeats zero or more times, each occurrence independently named
    // and typed by the author. Such a slot must NOT be written into the signature — the document states no
    // name for it, so emitting one would invent a parameter — and `name` is correspondingly absent unless
    // the document authored one. What it does state is the legal type surface of each occurrence.
    repeatable?: boolean;
}

// Spec §9 `params[].dataBinding`, as resolved for one parameter slot.
//
// Written inline on the parameter rather than referenced from a registry, and shaped as independent
// *variants* rather than alternative *modes*: two variants can share a bound and differ in shape
// (kafka's bare-vs-included), or share shapes and differ in bound (ftp's `string[]` vs `record {}`).
// A single flattened mode list could express neither without deleting half the surface.
export interface ParamBinding {
    typedescs: TypedescVariant[];
}

// Spec §9 `typedescs[]`: one independent way the slot's value may be projected.
export interface TypedescVariant {
    // This variant's upper bound. Exactly one type, never a union — two bounds sharing shapes are two
    // variants.
    constraint: Type;
    // Instantiations another variant already owns. A negative constraint, derivable from nothing else, so
    // it survives the renderer's suppression of names already visible elsewhere.
    excludes?: Type[];
    shapes: BindingShape[];
}

// Spec §9 `shapes[]`: how this variant's bound is embedded in the declared parameter type.
export interface BindingShape {
    form: "bare" | "array" | "stream" | "included";
    // For `array`/`stream`, whether each element is bare or includes the envelope. Batching combines with
    // either embedding, which is the case a rule-level `cardinality` flag could not express.
    element?: "bare" | "included";
    // The record a user type includes with `*Envelope;`. Present for `included`, and for an
    // `array`/`stream` whose `element` is `included`.
    envelope?: Type;
    // The envelope's fields this variant may retype; every other field stays pinned. The pipeline also
    // emits the complement as `fixedFields`; it is not declared here because the renderer states the
    // prohibition from `bindableFields` instead and never reads it.
    bindableFields?: string[];
    // For `stream`, the stream's completion type — `stream<T>` and `stream<T, error?>` are different types.
    completionType?: Type;
}

export interface Return {
    description?: string;
    type: Type;
    // Spec §8 at `attachPoint: "return"`: annotations the generated handler must or may carry on its
    // return (`returns @http:Cache {...} T`). Nested here because that is the slot they attach to.
    //
    // Spec §5.4 moved the document's own list from a sibling `returnAnnotations` on the handler onto
    // `returns.annotations`, beside the type it attaches to. The wire shape here was already nested, so
    // the move changed where the pipeline reads it and nothing about what this renderer sees.
    annotationRefs?: AnnotationRequirement[];
    // Spec §9.1: how the declared return type is projected on the way OUT — the outbound reading of the
    // same shape a parameter's `binding` states inbound. Present only where one member of the return union
    // is a builtin constraint the runtime serializes through: HTTP's `anydata` response branch, graphql's
    // streamed subscription element. Absent for a return whose members are all fixed types.
    binding?: ParamBinding;
}

export interface EnumValue {
    name: string;
    description: string;
}

export interface Field {
    name: string;
    description: string;
    type: Type;
    default?: string;
    // Whether the record field is declared `T name?;`. Declared here rather than read through an `as any`
    // cast in `renderRecord`, for the reason `Parameter.optional` gives one interface above: a producer that
    // stops sending it must fail type-checking rather than silently turn every optional field mandatory.
    optional?: boolean;
    isDeprecated?: boolean;
    annotations?: AnnotationAttachment[];
}

export interface UnionValue {
    name: string;
    type: Type;
}

export interface PathParameter {
    name: string;
    type: string;
}

export interface TypeDefinitionBase {
    name: string;
    description: string;
    type: string;
    isDeprecated?: boolean;
    annotations?: AnnotationAttachment[];
    // The compiler's signature for the type, sent only for definitions with no members to model
    // ("Error" and "Other" — tuples, maps, tables, streams, intersections). It is the right-hand
    // side of the declaration; every other category describes its shape through fields/members.
    baseType?: string;
}

export interface ConstantTypeDefinition extends TypeDefinitionBase {
    value: string;
    varType: Type;
}

export interface RecordTypeDefinition extends TypeDefinitionBase {
    fields: Field[];
}

export interface EnumTypeDefinition extends TypeDefinitionBase {
    members: EnumValue[];
}

export interface UnionTypeDefinition extends TypeDefinitionBase {
    members: UnionValue[];
}

export interface ClassTypeDefinition extends TypeDefinitionBase {
    functions: any[];
    // Set for an object type carrying the `client` qualifier (e.g. sql:Client), which renders as
    // `client class`. Class declarations with the qualifier are emitted as `clients` instead.
    isClient?: boolean;
}

export type TypeDefinition = 
    | RecordTypeDefinition 
    | EnumTypeDefinition 
    | UnionTypeDefinition 
    | ClassTypeDefinition 
    | TypeDefinitionBase
    | ConstantTypeDefinition;

export interface AbstractFunction {
    type: string;
    description: string;
    parameters: Parameter[];
    return: Return;
    isDeprecated?: boolean;
    annotations?: AnnotationAttachment[];
}

export interface ResourceFunction extends AbstractFunction {
    accessor: string;
    paths: (PathParameter | string)[];
}

export interface RemoteFunction extends AbstractFunction {
    name: string;
}

export interface ServiceRemoteFunction {
    // Spec §5 `options[].kind`. Drives the rendered keyword: `resource` needs an accessor and a path, and
    // rendering one as `remote function` does not compile.
    type: "remote" | "resource";
    description: string;
    parameters: ParameterDef[];
    return: Return;
    // Spec §5 `options[].presence`, tri-state: `true` optional, `false` required, **absent** when the document
    // is not answering the question (`addMode: "many"`, or a concrete type's declared method). Absent is not
    // the same as `false` — only `false` states an obligation.
    optional?: boolean;
    name: string;
    isDeprecated?: boolean;
    // The declared method carries `isolated`, introspected from the semantic model (the document models no
    // qualifiers, and should not — they are introspectable). An implementation that omits it does NOT
    // compile: the compiler reports "mismatched function signatures" whose expected and found halves print
    // identically, because it prints neither qualifier. Present only when the qualifier is declared.
    isolated?: boolean;
    // Spec §5 resource extras — the two positions of `resource function <accessor> <path>()`, and nothing
    // else. The spec replaced HTTP's `method`/`path` and GraphQL's `accessor`/`fieldName` with one pair
    // described symmetrically, which is why `methodValues`/`pathForm`/`fieldNameForm`/`graphqlOperation` are
    // gone. `graphqlOperation` is derivable from what remains: a query is `resource`/`get`, a subscription
    // `resource`/`subscribe`, and a mutation `remote`.
    //
    // `accessor` is the value to write (§1: the first declared value is the codegen default); the rest
    // describe the slot's constraint. Spec §11.2 still holds: a path is intent-derived and never invented.
    accessor?: string;
    accessorValues?: string[];
    accessorRequired?: boolean;
    // Spec §5 `values: ["*"]` — any accessor the language accepts. Carried apart from `accessorValues`
    // because the two must be worded differently: a note reading "must be one of `*`" is nonsense.
    accessorOpen?: boolean;
    pathRequired?: boolean;
    // Spec §5 gives `path` the same `valueSpec` as `accessor`, so it may enumerate the legal paths or declare
    // itself open. `path` is the one to write (§1's codegen default), `pathValues` the rest of the
    // vocabulary, `pathOpen` the `values: ["*"]` case. All three were missing while the accessor half had
    // them, so a document constraining its path reached the prompt with only "a path is required".
    path?: string;
    pathValues?: string[];
    pathOpen?: boolean;
    // Spec §5.3 `deprecated` — why this handler is superseded, as the document's own prose. Distinct from
    // `isDeprecated`, which says only *that* the symbol carries the annotation: this names the replacement,
    // which is the part a reader can act on. `ftp`'s `onFileChange` is the corpus instance.
    deprecated?: string;
    // Spec §8 at `attachPoint: "function"`: annotations the generated handler must or may carry.
    annotationRefs?: AnnotationRequirement[];
}

export interface Client {
    name: string;
    description: string;
    functions: (RemoteFunction | ResourceFunction)[];
    isDeprecated?: boolean;
    annotations?: AnnotationAttachment[];
}

export interface Listener {
    name: string;
    parameters: Parameter[];
    // Spec §2 `doc` — what this listener is and when a service attaches to it. Required by the spec on
    // every listener, and the one fact about attaching that no symbol carries: the parameters bring their
    // own doc comments, but a class named `Listener` in a package named `kafka` says only that something
    // listens, not that it polls the subscribed topics and hands each poll's batch to the service.
    description?: string;
    // Spec §2 `deprecated` — why this listener is superseded, as prose. See ServiceRemoteFunction.deprecated
    // for why it is text and not a flag.
    deprecated?: string;
}

// Spec §2 `listeners[].requiredImports`: an import the generated code needs for its runtime side
// effect even though nothing references it by name (bound to `_`). Scoped to the service that uses
// the listener, not to the library.
export interface RequiredImport {
    module: string;
    alias?: string;
}

// Spec §8 `annotations[]`: an annotation the generated code must or may carry, at any attach point.
// Deliberately distinct from `AnnotationAttachment`, which is an annotation the library *already carries*
// and renders verbatim with its real value; this is an obligation on code that does not exist yet, so it
// renders as a requirement with a placeholder value and a presence marker.
export interface AnnotationRequirement {
    name: string;
    // The `org/module` a cross-module annotation belongs to (`ballerinax/cdc`). Absent for one declared
    // by the library itself, which takes the listener's alias instead — the same rule spec §1 applies to
    // a service type.
    module?: string;
    presence: "required" | "optional";
    attachPoint: string;
    // The constraining record, introspected from the compiler rather than the document: spec §8's `type`
    // names the annotation tag, not its constraint (`@ftp:ServiceConfig` is constrained by
    // `ServiceConfiguration`). Absent for a cross-module annotation, whose constraint lives in symbols
    // the library's own semantic model cannot see.
    typeConstraint?: Type;
}

/**
 * The service-scope alias of {@link AnnotationRequirement}.
 *
 * Service scope shipped first, under the wire key `annotations`; handler, parameter and return scope use
 * `annotationRefs` because a `Parameter` already has an `annotations` field holding the semantic model's
 * real attachments. The asymmetry is deliberate — see `Service.annotations` on the Java side — and this
 * alias keeps the older name readable at its one call site rather than hiding the shared shape.
 */
export type ServiceAnnotationRef = AnnotationRequirement;

// Spec §3 `serviceTypes[].identifier`: the slot between `service` and `on new …`. Carries the document's own
// `form` tokens rather than a rendered placeholder — building `/basePath` from `basePath` is a syntax decision,
// and keeping the raw token means a form outside spec §10's vocabulary can still be named in the note.
export interface ServiceIdentifier {
    presence: "required" | "optional";
    form: string[];
}

// Spec §6.1 `subjects[]`: what a rule ranges over. A tagged union discriminated by `kind`.
export interface ConstraintSubject {
    kind: "identifier" | "annotation" | "annotationField" | "handler" | "param";
    // The annotation's actual name (`ServiceConfig`), already resolved from the document's registry id by
    // the Java side — a reader has to write this, not the id. Set for `annotation`/`annotationField`.
    annotation?: string;
    // For `annotationField`, the field path inside the annotation record. An array, so a nested field such
    // as `["retryConfig", "maxCount"]` is addressable — truncating it would name the wrong field.
    path?: string[];
    // For `handler` the handler as a reader sees it — its method name, or, for a spec §5.1
    // `addMode: "many"` shape whose name is always `*`, the last segment of its id (`graphql`'s
    // `$service.query` reads as `query`). For `param` the parameter's name.
    name?: string;
    // For `param`, the handler the parameter belongs to, resolved by the Java side from the parameter's
    // own hierarchical id rather than from a sibling field — spec §6.1.1 removed the `handler`/`name` pair.
    handler?: string;
    // Spec §6.1.1: the `$`-prefixed id the subject was addressed by. Carried for traceability and never
    // rendered — it names a slot in a JSON document, not anything that exists in Ballerina source, which is
    // the same reason the annotation subject's registry id is not rendered either.
    id?: string;
    // This subject's name within its rule. Asymmetric constraints fix `when`/`then`; symmetric ones use
    // free labels, referenced by the rule's `prefer`.
    role?: string;
    // Spec §6's top-level `rules[]`: a constraint spanning more than one service type. The declared *type
    // name* of the service type this subject belongs to, present only when that is NOT the one being
    // rendered — so a rule scoped to one service type carries nothing here. Without it a spanning rule would
    // present every alternative as belonging to the service type the reader happens to be looking at.
    serviceType?: string;
}

// Spec §6 `rules[]`: a named constraint from an open registry.
//
// `rule` is an open vocabulary, so this is deliberately a `string` rather than a union of the six entries
// the registry defines today: spec §6 requires an unrecognised id be skipped rather than rejected, and a
// closed type here would make a newer manifest a compile error rather than a skipped rule.
export interface ServiceConstraint {
    rule: string;
    subjects: ConstraintSubject[];
    // The document's own diagnostic sentence. Preferred over anything the renderer can synthesize: it says
    // *why* the constraint exists, which no amount of structure reconstructs.
    message?: string;
    // Present only when the document downgrades the rule; `error` is the default and is never stated.
    severity?: "warning";
    // The `role` a generator should default to. A hint, not part of the constraint.
    prefer?: string;
}

export interface Service {
    listener: Listener;
    type: "generic" | "fixed";
    name?: string;
    // Spec §3 `doc` — what this service type is for, in the document's own prose. Required by the spec on
    // every service type, `concrete` ones included: unlike a handler's doc, which is authored only because
    // a marker type has no method to introspect, this exists so every top-level construct in the file is
    // self-describing. Distinct from `instructions`, which is curated guidance on HOW to write the service
    // and exists for two libraries; this is one sentence on what it does and exists for every
    // schema-driven one.
    description?: string;
    isDeprecated?: boolean;
    // Hand-authored guidance for writing this service, from
    // `resources/copilot/instructions/<org>/<module>/service.md`.
    //
    // Declared on `Service` rather than only on `GenericService` because a metadata-derived (fixed) entry now
    // absorbs it too. The division of labour is strict: a curated file may state ONLY what neither the
    // trigger-metadata document nor the semantic model can — project conventions, compiler-plugin rules,
    // defaults and worked examples. Everything factual (types, presence, annotations, accessors, binding) is
    // synthesized and must not be restated here.
    instructions?: string;
    // Spec §1: the `org/module` a cross-module service type belongs to (`ballerinax/cdc`). Absent
    // for a home-module type, which is prefixed with the listener's alias instead.
    serviceTypeModule?: string;
    // Spec §2 `listeners[].services`: the other listeners this service type may attach to, as the
    // `alias:ClassName` a reader would write. One listener goes into `listener`, because a
    // `service … on new …` clause names one; where the document offers more, the choice is a transport
    // choice the reader may want to make differently. `ballerina/mcp` is the corpus case — all four of its
    // service types are listed under both `StreamableHttpListener` and `Listener` — and it is the only one,
    // so the field is absent for every other library.
    alternativeListeners?: string[];
    requiredImports?: RequiredImport[];
    // Spec §8: the annotations this service type must or may carry.
    annotations?: ServiceAnnotationRef[];
    // Spec §3: the identifier slot, absent when the connector does not consult it.
    identifier?: ServiceIdentifier;
    // Spec §6: the exclusivity constraints this service type declares.
    constraints?: ServiceConstraint[];
    // Spec §3's array cardinality: the document declares more than one service type, so this one is
    // "individually optional" rather than mandatory. NOT a mutual-exclusivity marker — §3 imposes no
    // "exactly one of N" rule, and `websocket`'s two service types are routinely written together.
    alternatives?: boolean;
    // Spec §3 `multipleListenersAllowed: false` — this service type attaches to exactly one listener.
    // Present only when the connector forbids it; the permissive case states nothing, because the
    // one-service-one-listener shape a generator writes by default is legal either way.
    singleListenerOnly?: boolean;
    // Spec §2 `multipleServicesOfSameTypeAllowed: false` — one listener hosts at most one service of THIS
    // type, though it may host others. Same presence rule as `singleListenerOnly`.
    singleServicePerListenerOnly?: boolean;
    // Spec §2 `multipleServicesAllowed: false` — one listener hosts at most one service, of any type. The
    // strictly stronger sibling of the above, and emitted instead of it rather than alongside.
    singleServiceOnly?: boolean;
    // Spec §2.1 `listeners[].platformDependencies`: native artifacts the build cannot fetch. Carried on the
    // service because the spec declares them on the listener, so only code using that listener needs them.
    platformDependencies?: PlatformDependency[];
    // Spec §2 `listeners[].services`: no listener declares it can host this service type, so it must never
    // be written as `service … on new …`. Present only when the restriction holds. `renderFixedService`
    // renders such a type as a `service class` that includes it, which is how `websocket`'s Service is
    // actually reached.
    notListenerAttachable?: boolean;
    // Spec §3 `deprecated` — why this service type is superseded, as prose. See
    // ServiceRemoteFunction.deprecated for why it is text and not a flag.
    deprecated?: string;
}

// Spec §2.1 — a native artifact the generated project needs on its classpath, which no public repository
// necessarily serves.
export interface PlatformDependency {
    // Maven coordinate as `groupId:artifactId:version`.
    coordinate: string;
    // `scope: "provided"` — compile-time only, supplied by the deployment rather than bundled. Emitted only
    // when true; absent means bundled, which needs no action from the reader.
    provided?: boolean;
    acquisitionUrl?: string;
    acquisitionNote?: string;
    nativeLibraries?: NativeLibrary[];
}

// An OS-specific native library. A missing one is not a build failure — the package compiles and the
// service fails at run time — which is exactly why it has to be stated.
export interface NativeLibrary {
    os: string;
    file: string;
    // The environment variable that OS discovers it through, derived from `os` by the pipeline.
    variable?: string;
}

export interface Annotation {
    name: string;
    attachmentPoint: string;
    displayName?: string;
    description?: string;
    typeConstraint?: Type;
}

export interface GenericService extends Service {
    // Narrowed to required: a generic service is nothing BUT its instructions — it carries no methods, no
    // annotations and no identifier, so an absent value would leave nothing to render at all. On a fixed
    // service the same field is optional, because there the synthesized block stands on its own.
    instructions: string;
    type: "generic";
}

export interface FixedService extends Service {
    type: "fixed";
    // Absent for fixed services whose service type declares no methods (e.g. mcp's marker Service).
    methods?: ServiceRemoteFunction[];
    // Spec §4 `addMode: "many"`: the shapes a handler of this service type may take, for a catalog whose
    // handler names are the author's to choose. Typed as ServiceRemoteFunction because each is one in every
    // respect but its name — but deliberately NOT in `methods`, because they are not writable as-is (spec
    // §11.1: such a handler "cannot yield a compilable signature"), so each renders as commented guidance.
    //
    // A list, though spec §4 says one: `graphql` declares three — a query (`resource`/`get`), a mutation
    // (`remote`) and a subscription (`resource`/`subscribe`) — differing in kind, accessor and return.
    handlerTemplates?: ServiceRemoteFunction[];
}

export interface Library {
    name: string;
    description: string;
    typeDefs: TypeDefinition[];
    clients: Client[];
    functions?: RemoteFunction[];
    services?: Service[];
    annotations?: Annotation[];
    instructions?: string;
    readme?: string;
}


export interface LibraryWithUrl extends Library {
    library_link: string;
}

export interface MiniType {
    name: string;
    description: string;
}

export interface GetTypesRequest {
    name: string;
    description: string;
    types: MiniType[];

}

export interface GetTypeResponse {
    libName: string;
    types: MiniType[];
}

export interface GetTypesResponse {
    libraries: GetTypeResponse[];
}


const miniTypeSchema = z.object({
    name: z.string(),
    description: z.string(),
});

const getTypeResponseSchema = z.object({
    libName: z.string(),
    types: z.array(miniTypeSchema),
});

export const getTypesResponseSchema = z.object({
    libraries: z.array(getTypeResponseSchema),
});
