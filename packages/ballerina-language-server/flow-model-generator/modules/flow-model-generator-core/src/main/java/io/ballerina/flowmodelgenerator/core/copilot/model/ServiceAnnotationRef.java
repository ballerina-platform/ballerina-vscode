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

/**
 * An annotation the generated service must or may carry — the wire shape the renderer consumes for a
 * trigger metadata document's {@code annotations[]} at {@code attachPoint: "service"} (the spec).
 *
 * <p>Distinct from {@link Annotation}, which states that the library <b>declares</b> an annotation (a
 * fact the compiler reports, rendered as {@code public annotation C A on service;}), and from
 * {@link AnnotationAttachment}, which is an annotation a library symbol <b>already carries</b> and which
 * renders verbatim with its real value. This one is an obligation on code that does not exist yet, so it
 * renders as a requirement: a placeholder value plus a marker saying whether omitting it is legal.
 *
 * @since 1.7.0
 */
public class ServiceAnnotationRef {

    private String name;
    private String module;
    private String presence;
    private String attachPoint;
    private Type typeConstraint;

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getModule() {
        return module;
    }

    public void setModule(String module) {
        this.module = module;
    }

    public String getPresence() {
        return presence;
    }

    public void setPresence(String presence) {
        this.presence = presence;
    }

    public String getAttachPoint() {
        return attachPoint;
    }

    public void setAttachPoint(String attachPoint) {
        this.attachPoint = attachPoint;
    }

    public Type getTypeConstraint() {
        return typeConstraint;
    }

    public void setTypeConstraint(Type typeConstraint) {
        this.typeConstraint = typeConstraint;
    }
}
