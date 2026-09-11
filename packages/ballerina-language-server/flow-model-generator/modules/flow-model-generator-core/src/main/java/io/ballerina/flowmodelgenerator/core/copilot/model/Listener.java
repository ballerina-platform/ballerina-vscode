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
 * Represents a listener definition.
 *
 * @since 1.7.0
 */
public class Listener {
    private String name;
    /**
     * The spec §2 {@code doc} — what this listener is and when a service attaches to it.
     *
     * <p>Required by the spec on every listener. The listener's <i>parameters</i> already carry their own
     * doc comments from the semantic model, but nothing states what attaching to the listener at all
     * accomplishes: a class named {@code Listener} in a package named {@code kafka} says only that
     * something listens, not that it polls the subscribed topics and dispatches each poll's batch.
     */
    private String description;
    /**
     * Spec's {@code deprecated} — why this construct is superseded, as the document's own prose. Text
     * rather than a flag: the sentence names the replacement, which is the only part a reader can act on.
     */
    @SerializedName("deprecated")
    private String deprecationNote;

    private List<Parameter> parameters;

    public Listener() {
        this.parameters = new ArrayList<>();
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

    public List<Parameter> getParameters() {
        return parameters;
    }

    public void setParameters(List<Parameter> parameters) {
        this.parameters = parameters;
    }
}
