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

package io.ballerina.flowmodelgenerator.core.copilot.service;

import io.ballerina.flowmodelgenerator.core.copilot.model.ParamBinding;
import io.ballerina.flowmodelgenerator.core.copilot.model.Parameter;
import io.ballerina.flowmodelgenerator.core.copilot.model.ServiceAnnotationRef;
import io.ballerina.flowmodelgenerator.core.copilot.model.Type;

import java.util.ArrayList;
import java.util.List;

/**
 * The accumulating output of one handler parameter.
 *
 * <p>Every slot is <b>held as a field and set once in {@link #toModel()}</b>, the same treatment
 * {@link HandlerDraft} already had. With three components writing here, leaving each to write straight onto
 * the {@link Parameter} would make the result a property of {@link AspectRegistry}'s ordering.
 *
 * <p>{@code optional} and {@code repeatable} are left <b>null</b> rather than {@code false} when they do not
 * apply — the spec's {@code presence: "required"} is the default, and a boxed {@code false} would serialize
 * the key rather than omit it, which is what the general omission rule forbids.
 *
 * @since 1.7.0
 */
final class ParamDraft {

    // Non-fatal only. A parameter has no veto: what makes a slot unusable — a signature member the package
    // does not declare — is caught before the handler is built at all, so a diagnostic here drops a
    // *contribution* to the slot, never the slot itself.
    private final List<String> diagnostics = new ArrayList<>();

    private String name;
    private String description;
    private Type type;
    private boolean optional;
    private boolean repeatable;
    private List<Type> alternatives;
    private List<ServiceAnnotationRef> annotationRefs;
    private ParamBinding binding;
    private String deprecated;

    /** The slot's name: authored where the document states one, generated where it does not. */
    void setName(String name) {
        this.name = name;
    }

    /** The parameter's doc-comment description; omitted when the source has none. */
    void setDescription(String description) {
        if (description != null && !description.isEmpty()) {
            this.description = description;
        }
    }

    /**
     * The spec {@code deprecated} — why this slot is superseded, as the document's own prose.
     *
     * <p>Text rather than a flag, for the reason {@link HandlerDraft#setDeprecated} gives: the sentence
     * names the replacement, which is the only part a reader can act on.
     */
    void setDeprecated(String deprecated) {
        if (deprecated != null && !deprecated.isBlank()) {
            this.deprecated = deprecated;
        }
    }

    /** The spec {@code params[].type}, resolved to a name plus its links. */
    void setType(Type type) {
        this.type = type;
    }

    /** The spec {@code params[].presence}: emitted only for an optional slot. */
    void setOptional(boolean optional) {
        this.optional = optional;
    }

    /**
     * The spec {@code params[].addMode: "many"} — the slot repeats, each occurrence independently named
     * and typed by the author.
     *
     * <p>Emitted only when true, per the omission rule; "at most one" is the spec's stated default for an absent
     * key. A consumer must read this as "do not put this slot in the signature": the document states no
     * name for it, so writing one would invent a parameter.
     */
    void setRepeatable(boolean repeatable) {
        this.repeatable = repeatable;
    }

    /**
     * The spec — the slot's other legal types, as {@code {name, links}} pairs so the type closure can reach
     * their definitions. Emitted as an array and never joined: see {@link ParamTypeResolver.ParamType}.
     */
    void setAlternatives(List<Type> alternatives) {
        if (alternatives != null && !alternatives.isEmpty()) {
            this.alternatives = alternatives;
        }
    }

    /**
     * The spec at {@code attachPoint: "parameter"} — the annotations this slot may carry.
     *
     * <p>Named {@code annotationRefs} rather than {@code annotations} because the {@code Parameter} POJO
     * this deserializes into already has an {@code annotations} field holding {@code AnnotationAttachment}s
     * — annotations the compiler found <i>already present</i> on a library symbol, which render verbatim
     * with their real value. These are requirements on code that does not exist yet, and collapsing the two
     * onto one key would make "the library has this" indistinguishable from "your code needs this".
     */
    void setAnnotationRefs(List<ServiceAnnotationRef> refs) {
        if (refs != null && !refs.isEmpty()) {
            this.annotationRefs = refs;
        }
    }

    /** The spec — the data-binding rule this slot's {@code dataBinding} id names. */
    void setBinding(ParamBinding binding) {
        this.binding = binding;
    }

    /**
     * Records that a contribution was dropped, without dropping the parameter. The reason travels up to the
     * service's report through {@link HandlerDraft#addParam}.
     */
    void drop(String reason) {
        diagnostics.add(reason);
    }

    /** Every non-fatal drop recorded while building this parameter. */
    List<String> diagnostics() {
        return diagnostics;
    }

    /**
     * The finished parameter.
     *
     * <p>The two booleans are set only when true. Everything else is handed over as-is, including nulls: a
     * slot that was never written stays absent from the wire rather than carrying an empty value.
     */
    Parameter toModel() {
        Parameter parameter = new Parameter();
        parameter.setName(name);
        parameter.setDescription(description);
        parameter.setDeprecationNote(deprecated);
        parameter.setType(type);
        if (optional) {
            parameter.setOptional(true);
        }
        if (repeatable) {
            parameter.setRepeatable(true);
        }
        parameter.setAlternatives(alternatives);
        parameter.setAnnotationRefs(annotationRefs);
        parameter.setBinding(binding);
        return parameter;
    }
}
