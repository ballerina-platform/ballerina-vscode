/*
 *  Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com)
 *
 *  WSO2 LLC. licenses this file to you under the Apache License,
 *  Version 2.0 (the "License"); you may not use this file except
 *  in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing,
 *  software distributed under the License is distributed on an
 *  "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 *  KIND, either express or implied.  See the License for the
 *  specific language governing permissions and limitations
 *  under the License.
 */

package io.ballerina.flowmodelgenerator.core.copilot.model;

import com.google.gson.annotations.SerializedName;

import java.util.ArrayList;
import java.util.List;

/**
 * Represents a service method (remote or resource function).
 *
 * @since 1.7.0
 */
public class ServiceRemoteFunction {
    private String name;
    private String type;
    /**
     * The declared method carries the {@code isolated} qualifier, so an implementation must repeat it.
     * Introspected from the semantic model, never from the document — a qualifier is exactly the kind
     * of fact the DRY principle keeps out of the metadata. Boxed and emitted only when true.
     *
     * <p>Omitting it fails with "mismatched function signatures" whose expected and found halves print
     * identically, because the compiler prints neither qualifier.
     */
    private Boolean isolated;
    private String description;
    private List<Parameter> parameters;
    @SerializedName("return")
    private Return returnInfo;
    // The spec `options[].presence`, tri-state. Boxed on purpose: the pipeline omits the key entirely under
    // `addMode: "many"`, where the document is not saying whether a handler is required, and a primitive
    // would silently turn that into `false` on the JSON round-trip — asserting "required" for a handler
    // nobody said anything about. Null means "not stated"; the renderer emits no marker for it.
    private Boolean optional;
    // The spec resource extras — the two positions of `resource function <accessor> <path>()`, and nothing
    // else. The spec collapsed HTTP's `method`/`path` and GraphQL's `accessor`/`fieldName` into one pair,
    // so `methodValues`, `pathForm`, `fieldNameForm`, `fieldNameRequired` and `graphqlOperation` are gone.
    //
    // These fields are the JSON contract, not an internal convenience: `CopilotLibraryManager` deserializes
    // the pipeline's own output back through this class, so a key the pipeline emits and this class does
    // not declare is DROPPED, silently and without a compile error. That is exactly what happened to the
    // three accessor keys below when the spec landed — the pipeline resolved every HTTP verb and the renderer had
    // a branch to print them, and the whole vocabulary vanished on the round trip. See
    // ServiceRemoteFunctionWireContractTest, which pins every key `HandlerDraft` writes.
    private String accessor;
    // The spec `accessor.values` — every legal accessor, for the note.
    private List<String> accessorValues;
    // The spec `accessor.presence` — whether one must be written.
    private Boolean accessorRequired;
    // The spec `values: ["*"]` — any accessor the language accepts. Told apart from an enumerated list
    // because a note reading "must be one of `*`" is nonsense, whereas "any the language accepts" is usable.
    private Boolean accessorOpen;
    // The spec `path.presence` — whether a resource path must be written. No syntactic FORM accompanies it:
    // the spec dropped the `identifierSegments`/`pathParamSegments` vocabulary because the language already fixes
    // the grammar. A value list is a different claim and is carried below.
    private Boolean pathRequired;
    // The spec `path` is the same `valueSpec` as `accessor`, so it may enumerate legal paths or declare
    // itself open. The path to write (the first declared value, per the spec's codegen-default rule)...
    private String path;
    // ...every legal path, for the note...
    private List<String> pathValues;
    // ...and `values: ["*"]`, worded differently from an enumerated list for the reason `accessorOpen`
    // gives. All three were absent while the accessor half carried them, so a document constraining its
    // path lost the constraint on this hop — the same silent drop the comment above records for the
    // accessor keys, in the other half of one shared definition.
    private Boolean pathOpen;
    // The spec at `attachPoint: "function"` — annotations the generated handler must or may carry. Named
    // `annotationRefs` to match parameter scope, where `annotations` is already taken by the semantic
    // model's own attachments; consistency across the three scopes beats saving a word at the free one.
    private List<ServiceAnnotationRef> annotationRefs;
    /**
     * The spec's {@code deprecated} — why this construct is superseded, as the document's own prose.
     *
     * <p>Distinct from {@link #deprecated}, and deliberately so: that field says <i>that</i> the symbol
     * carries a {@code @deprecated} annotation, this one says <i>why</i> and names the replacement. A
     * document may state the latter for a construct whose symbol carries no annotation at all, which is
     * exactly {@code ftp}'s {@code onFileChange}.
     */
    @SerializedName("deprecated")
    private String deprecationNote;

    @SerializedName("isDeprecated")
    private Boolean deprecated;

    public ServiceRemoteFunction() {
        this.parameters = new ArrayList<>();
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public Boolean isIsolated() {
        return isolated;
    }

    public void setIsolated(Boolean isolated) {
        this.isolated = isolated;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public List<Parameter> getParameters() {
        return parameters;
    }

    public void setParameters(List<Parameter> parameters) {
        this.parameters = parameters;
    }

    public Return getReturnInfo() {
        return returnInfo;
    }

    public void setReturnInfo(Return returnInfo) {
        this.returnInfo = returnInfo;
    }

    public Boolean isOptional() {
        return optional;
    }

    public void setOptional(Boolean optional) {
        this.optional = optional;
    }

    public String getAccessor() {
        return accessor;
    }

    public void setAccessor(String accessor) {
        this.accessor = accessor;
    }

    public List<String> getAccessorValues() {
        return accessorValues;
    }

    public void setAccessorValues(List<String> accessorValues) {
        this.accessorValues = accessorValues;
    }

    public Boolean isAccessorRequired() {
        return accessorRequired;
    }

    public void setAccessorRequired(Boolean accessorRequired) {
        this.accessorRequired = accessorRequired;
    }

    public Boolean isAccessorOpen() {
        return accessorOpen;
    }

    public void setAccessorOpen(Boolean accessorOpen) {
        this.accessorOpen = accessorOpen;
    }

    public String getPath() {
        return path;
    }

    public void setPath(String path) {
        this.path = path;
    }

    public List<String> getPathValues() {
        return pathValues;
    }

    public void setPathValues(List<String> pathValues) {
        this.pathValues = pathValues;
    }

    public Boolean isPathOpen() {
        return pathOpen;
    }

    public void setPathOpen(Boolean pathOpen) {
        this.pathOpen = pathOpen;
    }

    public Boolean isPathRequired() {
        return pathRequired;
    }

    public void setPathRequired(Boolean pathRequired) {
        this.pathRequired = pathRequired;
    }

    public List<ServiceAnnotationRef> getAnnotationRefs() {
        return annotationRefs;
    }

    public void setAnnotationRefs(List<ServiceAnnotationRef> annotationRefs) {
        this.annotationRefs = annotationRefs;
    }

    public Boolean isDeprecated() {
        return deprecated;
    }

    public void setDeprecated(Boolean deprecated) {
        this.deprecated = deprecated;
    }

    public String getDeprecationNote() {
        return deprecationNote;
    }

    public void setDeprecationNote(String deprecationNote) {
        this.deprecationNote = deprecationNote;
    }
}
