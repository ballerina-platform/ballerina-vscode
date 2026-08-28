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
 * Represents a function or method parameter.
 *
 * @since 1.7.0
 */
public class Parameter {
    private String name;
    private String description;
    /**
     * Spec's {@code deprecated} — why this construct is superseded, as the document's own prose. Text
     * rather than a flag: the sentence names the replacement, which is the only part a reader can act on.
     */
    @SerializedName("deprecated")
    private String deprecationNote;

    private Type type;
    private Boolean optional;
    @SerializedName("default")
    private String defaultValue;
    /**
     * Annotations the compiler reports as <b>already present</b> on this parameter — a fact about the
     * library, rendered verbatim with its real value.
     *
     * <p>Deliberately not the same field as {@link #annotationRefs}, and deliberately not renamed to match
     * it: the two are opposite in kind, and the asymmetry in their names is the thing that keeps them from
     * being "harmonised" into one. See {@link Service#getAnnotations()} for the same distinction at service
     * scope, where the key is historical.
     */
    private List<AnnotationAttachment> annotations;
    // The spec — the slot's other legal types. Carried as Type (not String) so the renderer's type closure
    // can reach their definitions through the links; never joined into a union.
    private List<Type> alternatives;
    /**
     * The spec at {@code attachPoint: "parameter"} — annotations code written against this library
     * <b>must or may attach</b> here. A requirement on code that does not exist yet, which is why it cannot
     * share {@link #annotations}: that field holds attachments the library already carries.
     */
    private List<ServiceAnnotationRef> annotationRefs;
    // The spec — how this slot's raw value may be projected into a user-defined type.
    private ParamBinding binding;
    /**
     * The spec {@code addMode: "many"} — this slot repeats zero or more times, each occurrence
     * independently named and typed by the author.
     *
     * <p>Boxed and emitted only when true. A renderer must keep such a slot <b>out of the signature</b>:
     * the document states no name for it, so writing one would invent a parameter. What it states instead
     * is the legal type surface of each occurrence, which is worth saying in a note.
     */
    private Boolean repeatable;

    public Parameter() {
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getDeprecationNote() {
        return deprecationNote;
    }

    public void setDeprecationNote(String deprecationNote) {
        this.deprecationNote = deprecationNote;
    }

    public Type getType() {
        return type;
    }

    public void setType(Type type) {
        this.type = type;
    }

    public Boolean isOptional() {
        return optional;
    }

    public void setOptional(Boolean optional) {
        this.optional = optional;
    }

    public String getDefaultValue() {
        return defaultValue;
    }

    public void setDefaultValue(String defaultValue) {
        this.defaultValue = defaultValue;
    }

    public List<AnnotationAttachment> getAnnotations() {
        return annotations;
    }

    public void setAnnotations(List<AnnotationAttachment> annotations) {
        this.annotations = annotations;
    }

    public List<Type> getAlternatives() {
        return alternatives;
    }

    public void setAlternatives(List<Type> alternatives) {
        this.alternatives = alternatives;
    }

    public List<ServiceAnnotationRef> getAnnotationRefs() {
        return annotationRefs;
    }

    public void setAnnotationRefs(List<ServiceAnnotationRef> annotationRefs) {
        this.annotationRefs = annotationRefs;
    }

    public ParamBinding getBinding() {
        return binding;
    }

    public void setBinding(ParamBinding binding) {
        this.binding = binding;
    }

    public Boolean isRepeatable() {
        return repeatable;
    }

    public void setRepeatable(Boolean repeatable) {
        this.repeatable = repeatable;
    }
}
