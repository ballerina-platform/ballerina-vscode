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
 * The spec {@code shapes[]} — how a {@link TypedescVariant}'s bound type is embedded in the declared type.
 *
 * <p>One class covers all four forms rather than a hierarchy, because this type exists only to survive the
 * Gson round-trip between the pipeline's {@code JsonArray} and the wire; the typed, exhaustively-switched
 * form lives in the resolver, where the semantics are decided.
 *
 * @since 1.10.0
 */
public class BindingShape {

    private String form;
    private String element;
    private Type envelope;
    private List<String> bindableFields;
    private List<String> fixedFields;
    private Type completionType;

    public BindingShape() {
    }

    public String getForm() {
        return form;
    }

    public void setForm(String form) {
        this.form = form;
    }

    public String getElement() {
        return element;
    }

    public void setElement(String element) {
        this.element = element;
    }

    public Type getEnvelope() {
        return envelope;
    }

    public void setEnvelope(Type envelope) {
        this.envelope = envelope;
    }

    public List<String> getBindableFields() {
        return bindableFields;
    }

    public void setBindableFields(List<String> bindableFields) {
        this.bindableFields = bindableFields;
    }

    public List<String> getFixedFields() {
        return fixedFields;
    }

    public void setFixedFields(List<String> fixedFields) {
        this.fixedFields = fixedFields;
    }

    public Type getCompletionType() {
        return completionType;
    }

    public void setCompletionType(Type completionType) {
        this.completionType = completionType;
    }
}
