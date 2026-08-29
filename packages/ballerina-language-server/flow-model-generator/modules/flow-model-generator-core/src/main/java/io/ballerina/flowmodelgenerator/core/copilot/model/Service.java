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

import java.util.List;

/**
 * Represents a service definition.
 *
 * @since 1.7.0
 */
public class Service {
    private String type;
    @SerializedName("name")
    private String name;
    /**
     * The spec §3 {@code doc} — what this service type is for, in the document's own prose.
     *
     * <p>Required by the spec on every service type, {@code concrete} ones included, and for a reason the
     * rest of the schema inverts: everywhere else a fact introspection can recover is left out, but a
     * service type is one of the constructs a reader navigates the file by, so it says what it is
     * regardless. Nothing else in the catalog carries it — a marker type's own symbol has no doc comment
     * worth reading, and a concrete one's says what the <i>object type</i> is rather than what writing a
     * service against it accomplishes.
     *
     * <p>Distinct from {@link #instructions}, which is curated guidance about <i>how</i> to write the
     * service and exists for two libraries; this is one sentence about what the service does and exists for
     * every schema-driven one.
     */
    @SerializedName("description")
    private String description;
    @SerializedName("instructions")
    private String instructions;
    private Listener listener;
    /**
     * The spec §2 {@code listeners[].services} — the other listeners this service type may attach to.
     *
     * <p>One listener goes into {@link #listener}, because a {@code service … on new …} clause names one
     * and the pipeline has to choose. Where the document offers more, the choice is a transport choice the
     * reader may want to make differently: {@code ballerina/mcp} lists all four of its service types under
     * both {@code StreamableHttpListener} and {@code Listener}, so rendering only the first would make the
     * other transport invisible. Absent for a single-listener document, which is every other one.
     */
    private List<String> alternativeListeners;
    // The spec: the org/module a cross-module service type belongs to (ballerinax/cdc). Null for a
    // home-module type. The renderer derives the prefix and the provenance note from it.
    private String serviceTypeModule;
    // The spec: side-effect-only imports the listener requires; needed only by code using that listener.
    private List<RequiredImport> requiredImports;
    /**
     * The spec: the annotations this service type must or may carry, scoped by the document's
     * {@code appliesTo}.
     *
     * <p><b>The key is {@code annotations} here but {@code annotationRefs} at handler, parameter and return
     * scope, and that asymmetry is deliberate.</b> A {@code Service} has no competing field, so this one
     * shipped first under the shorter name; a {@code Parameter} already has an {@code annotations} field
     * holding the semantic model's real attachments, which are the opposite kind of thing — a fact about the
     * library rather than a requirement on generated code. Renaming this to match would churn the renderer
     * and P3's fixtures for no change in output, so it is left as-is and recorded as a cleanup. Do not
     * "harmonise" the two by pointing them at one field.
     */
    private List<ServiceAnnotationRef> annotations;
    // The spec: the identifier/base-path slot between `service` and `on new`. Null when the connector does
    // not consult it, which is what an absent `identifier` key means.
    private ServiceIdentifier identifier;
    // The spec: the exclusivity constraints this service type declares (`oneOf` / `atMostOne`).
    private List<ServiceConstraint> constraints;
    /**
     * The spec's array cardinality: the document declares more than one service type, so this one is
     * "individually optional" rather than mandatory. Boxed and emitted only when true.
     *
     * <p>Not a synonym for "mutually exclusive". The spec leaves the choice "to whatever supplied the
     * generation intent" and imposes no "exactly one of N" rule — {@code websocket} declares two service
     * types where the first's handler <i>returns</i> the second, so both are routinely declared together.
     */
    private Boolean alternatives;
    /**
     * The spec {@code multipleListenersAllowed: false} — this service type attaches to exactly one
     * listener. Present only when the connector forbids it; a permissive value states nothing, because the
     * one-service-one-listener shape a generator writes by default is legal either way.
     */
    private Boolean singleListenerOnly;
    /**
     * The spec {@code multipleServicesPerListenerAllowed: false} — one listener hosts at most one service
     * of this type. Same presence rule as {@link #singleListenerOnly}.
     */
    private Boolean singleServicePerListenerOnly;

    /**
     * The spec {@code multipleServicesAllowed: false} — one listener hosts at most one service, of any
     * type. The strictly stronger sibling of {@link #singleServicePerListenerOnly}, emitted instead of it
     * rather than alongside, since "at most one service" already entails "at most one of this type".
     */
    private Boolean singleServiceOnly;

    /**
     * The spec {@code listeners[].platformDependencies} — native artifacts the build cannot fetch.
     * Carried on the service because the spec declares them on the listener, so only code that uses that
     * listener needs them.
     */
    private List<PlatformDependency> platformDependencies;
    /**
     * The spec {@code listeners[].services} — no listener declares it can host this service type, so it must
     * never be written as {@code service … on new …}. Boxed and emitted only when true, the same presence
     * rule as {@link #singleListenerOnly}.
     *
     * <p>Such a type is still worth rendering: {@code websocket}'s {@code Service} is the return of its
     * {@code UpgradeService} resource, and its nine handlers exist in no other source — the library's own
     * {@code Service} object type is a marker that declares none of them. A consumer renders it as a
     * {@code service class} that includes the type instead of as a listener attachment.
     */
    private Boolean notListenerAttachable;
    /**
     * The spec {@code addMode: "many"} — the shapes a handler of this service type may take, for a catalog
     * whose handler names are the author's to choose.
     *
     * <p>Typed as {@link ServiceRemoteFunction} because each <i>is</i> one in every respect but its name:
     * same kind, parameters, return and annotation obligations. They are held apart from {@link #methods}
     * because they are not writable as-is — a consumer must render them as guidance, never as signatures.
     *
     * <p>A list rather than a single value: {@code graphql} declares three, one each for a query, a mutation
     * and a subscription, and they differ in kind, accessor and return.
     */
    private List<ServiceRemoteFunction> handlerTemplates;
    @SerializedName("methods")
    private List<ServiceRemoteFunction> methods;
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

    public Service() {
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public List<String> getAlternativeListeners() {
        return alternativeListeners;
    }

    public void setAlternativeListeners(List<String> alternativeListeners) {
        this.alternativeListeners = alternativeListeners;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getInstructions() {
        return instructions;
    }

    public void setInstructions(String instructions) {
        this.instructions = instructions;
    }

    public Listener getListener() {
        return listener;
    }

    public void setListener(Listener listener) {
        this.listener = listener;
    }

    public String getServiceTypeModule() {
        return serviceTypeModule;
    }

    public void setServiceTypeModule(String serviceTypeModule) {
        this.serviceTypeModule = serviceTypeModule;
    }

    public List<RequiredImport> getRequiredImports() {
        return requiredImports;
    }

    public void setRequiredImports(List<RequiredImport> requiredImports) {
        this.requiredImports = requiredImports;
    }

    public List<ServiceAnnotationRef> getAnnotations() {
        return annotations;
    }

    public void setAnnotations(List<ServiceAnnotationRef> annotations) {
        this.annotations = annotations;
    }

    public ServiceIdentifier getIdentifier() {
        return identifier;
    }

    public void setIdentifier(ServiceIdentifier identifier) {
        this.identifier = identifier;
    }

    public List<ServiceConstraint> getConstraints() {
        return constraints;
    }

    public void setConstraints(List<ServiceConstraint> constraints) {
        this.constraints = constraints;
    }

    public Boolean isAlternatives() {
        return alternatives;
    }

    public void setAlternatives(Boolean alternatives) {
        this.alternatives = alternatives;
    }

    public Boolean isSingleListenerOnly() {
        return singleListenerOnly;
    }

    public void setSingleListenerOnly(Boolean singleListenerOnly) {
        this.singleListenerOnly = singleListenerOnly;
    }

    public Boolean isSingleServicePerListenerOnly() {
        return singleServicePerListenerOnly;
    }

    public void setSingleServicePerListenerOnly(Boolean singleServicePerListenerOnly) {
        this.singleServicePerListenerOnly = singleServicePerListenerOnly;
    }

    public Boolean isNotListenerAttachable() {
        return notListenerAttachable;
    }

    public void setNotListenerAttachable(Boolean notListenerAttachable) {
        this.notListenerAttachable = notListenerAttachable;
    }

    public List<ServiceRemoteFunction> getHandlerTemplates() {
        return handlerTemplates;
    }

    public void setHandlerTemplates(List<ServiceRemoteFunction> handlerTemplates) {
        this.handlerTemplates = handlerTemplates;
    }

    public List<ServiceRemoteFunction> getMethods() {
        return methods;
    }

    public void setMethods(List<ServiceRemoteFunction> methods) {
        this.methods = methods;
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

    public Boolean getSingleServiceOnly() {
        return singleServiceOnly;
    }

    public void setSingleServiceOnly(Boolean singleServiceOnly) {
        this.singleServiceOnly = singleServiceOnly;
    }

    public List<PlatformDependency> getPlatformDependencies() {
        return platformDependencies;
    }

    public void setPlatformDependencies(List<PlatformDependency> platformDependencies) {
        this.platformDependencies = platformDependencies;
    }
}
