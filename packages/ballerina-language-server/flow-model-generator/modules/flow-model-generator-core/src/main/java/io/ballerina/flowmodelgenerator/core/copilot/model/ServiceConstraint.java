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
 * The spec {@code rules[]} — one exclusivity constraint a service type declares.
 *
 * <p>{@code rule} carries the registry id verbatim ({@code "structure.exactlyOne"}), because the spec makes
 * the vocabulary <b>open</b>: a consumer that does not recognise an id must skip it, which a closed enum
 * here would turn into a parse failure. {@code message} is the document's own sentence and is preferred
 * over anything a renderer can synthesize -- it says why the constraint exists.
 *
 * @since 1.7.0
 */
public class ServiceConstraint {

    private String id;
    private String rule;
    private List<ConstraintSubject> subjects;
    private String message;
    private String severity;
    private String prefer;

    public ServiceConstraint() {
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getRule() {
        return rule;
    }

    public void setRule(String rule) {
        this.rule = rule;
    }

    public List<ConstraintSubject> getSubjects() {
        return subjects;
    }

    public void setSubjects(List<ConstraintSubject> subjects) {
        this.subjects = subjects;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public String getSeverity() {
        return severity;
    }

    public void setSeverity(String severity) {
        this.severity = severity;
    }

    public String getPrefer() {
        return prefer;
    }

    public void setPrefer(String prefer) {
        this.prefer = prefer;
    }
}
