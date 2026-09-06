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

/**
 * The spec §2 {@code listeners[].services} — one other listener a service type may attach to, as the
 * {@code alias:ClassName} a reader would write.
 *
 * <p>Deliberately leaner than {@link Listener}: an alternative is a pointer ("this transport also works"),
 * so it carries no init parameters and no {@code doc} — those are read off the library's own listener
 * class. What it does carry, beyond the name, is {@code deprecated}: a listener the document supersedes is
 * still offered as an alternative, but a reader choosing it needs to see the reason, and a bare name string
 * had nowhere to put it. {@code ballerina/mcp} is the corpus case — its {@code Listener} is deprecated in
 * favour of {@code StreamableHttpListener}, and it is exactly the transport that ends up here rather than in
 * the {@code on new …} clause.
 *
 * @since 1.7.0
 */
public class AlternativeListener {

    private String name;
    /**
     * The spec {@code deprecated} — why this listener is superseded, as the document's own prose. Text
     * rather than a flag, mirroring {@link Listener#getDeprecationNote()}: the sentence names the
     * replacement, which is the only part a reader can act on. Null, and so omitted, when the listener is
     * not deprecated.
     */
    @SerializedName("deprecated")
    private String deprecationNote;

    public AlternativeListener() {
    }

    public AlternativeListener(String name) {
        this.name = name;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDeprecationNote() {
        return deprecationNote;
    }

    public void setDeprecationNote(String deprecationNote) {
        this.deprecationNote = deprecationNote;
    }
}
