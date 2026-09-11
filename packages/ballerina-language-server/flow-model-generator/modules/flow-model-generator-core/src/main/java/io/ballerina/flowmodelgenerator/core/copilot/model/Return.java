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
 * Represents a function return type.
 *
 * @since 1.7.0
 */
public class Return {
    private String description;
    private Type type;
    // The spec at `attachPoint: "return"` — annotations the generated handler must or may carry on its
    // return (`returns @http:Cache {...} T`). Nested here rather than on the method because that is the
    // syntactic slot they attach to.
    private List<ServiceAnnotationRef> annotationRefs;
    /**
     * The spec §9.1 — how the declared return type is projected on the way <i>out</i>.
     *
     * <p>The same shape a parameter's {@code binding} carries, read in the opposite direction: a parameter
     * binds a wire payload into a declared type, a return serializes a declared type out to wire form. It
     * is present only where one member of the return union is a builtin constraint the runtime converts
     * through — an HTTP resource's {@code anydata} branch, graphql's streamed subscription element — and
     * absent for a return whose members are all fixed types with no schema to bind.
     *
     * <p>Nested on the return rather than on the method for the reason {@link #annotationRefs} is: it
     * describes the return slot, and the renderer states it beside the type it constrains.
     */
    private ParamBinding binding;

    public Return() {
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public Type getType() {
        return type;
    }

    public void setType(Type type) {
        this.type = type;
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
}
