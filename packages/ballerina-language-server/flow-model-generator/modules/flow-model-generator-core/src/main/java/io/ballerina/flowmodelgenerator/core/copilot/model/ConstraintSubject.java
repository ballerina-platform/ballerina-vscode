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

import java.util.List;

/**
 * The spec {@code subjects[]} — one thing a {@link ServiceConstraint} ranges over.
 *
 * <p>A flat POJO with nullable slots rather than a sealed hierarchy, because this type exists only to
 * survive the Gson round-trip; the typed, exhaustively-switched form lives in the resolver, where the
 * semantics are decided. {@code kind} is the discriminator, so a malformed subject stays distinguishable.
 *
 * @since 1.10.0
 */
public class ConstraintSubject {

    private String kind;
    private String annotation;
    private String annotationId;
    private List<String> path;
    private String name;
    private String handler;
    // The spec §6.1.1 id a `handler` or `param` subject was addressed by, beside the reader-facing label in
    // `name`. Carried for traceability and never rendered: it names a slot in a JSON document, not anything
    // that exists in Ballerina source — the same division `annotationId`/`annotation` already draws.
    private String id;
    private String role;
    // The spec's top-level `rules[]` — a constraint spanning more than one service type. Present only on a
    // subject belonging to a service type OTHER than the entry carrying the rule, so a rule scoped to one
    // service type states nothing here. Without it a spanning rule would read as though every alternative
    // belonged to whichever service type happened to be rendering.
    private String serviceType;
    // The `serviceTypes[].id` the subject named, beside the resolved name above — the same id/name pairing
    // `annotationId`/`annotation` already uses, and never rendered for the same reason.
    private String serviceTypeId;

    public ConstraintSubject() {
    }

    public String getKind() {
        return kind;
    }

    public void setKind(String kind) {
        this.kind = kind;
    }

    public String getAnnotation() {
        return annotation;
    }

    public void setAnnotation(String annotation) {
        this.annotation = annotation;
    }

    public String getAnnotationId() {
        return annotationId;
    }

    public void setAnnotationId(String annotationId) {
        this.annotationId = annotationId;
    }

    public List<String> getPath() {
        return path;
    }

    public void setPath(List<String> path) {
        this.path = path;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getHandler() {
        return handler;
    }

    public void setHandler(String handler) {
        this.handler = handler;
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }

    public String getServiceType() {
        return serviceType;
    }

    public void setServiceType(String serviceType) {
        this.serviceType = serviceType;
    }

    public String getServiceTypeId() {
        return serviceTypeId;
    }

    public void setServiceTypeId(String serviceTypeId) {
        this.serviceTypeId = serviceTypeId;
    }
}
