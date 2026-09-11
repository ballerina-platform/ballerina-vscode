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
 * The spec {@code serviceTypes[].identifier} — the slot between {@code service} and {@code on new …}, and
 * whether the generated service must fill it.
 *
 * <p>Carries the document's own {@code form} tokens rather than a pre-rendered placeholder: turning
 * {@code basePath} into {@code /basePath} is a syntax decision, and every other one already belongs to the
 * renderer. Keeping the raw tokens also means a form outside the spec's vocabulary survives the trip and can
 * be named in the note the renderer emits instead of being flattened into "unknown".
 *
 * @since 1.7.0
 */
public class ServiceIdentifier {

    private String presence;
    private List<String> form;

    public ServiceIdentifier() {
    }

    public String getPresence() {
        return presence;
    }

    public void setPresence(String presence) {
        this.presence = presence;
    }

    public List<String> getForm() {
        return form;
    }

    public void setForm(List<String> form) {
        this.form = form;
    }
}
