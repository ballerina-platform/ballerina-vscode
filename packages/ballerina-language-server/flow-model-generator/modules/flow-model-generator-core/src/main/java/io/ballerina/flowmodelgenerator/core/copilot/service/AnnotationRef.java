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

/**
 * One annotation a document requires generated code to attach.
 *
 * <p>Not {@code AnnotationAttachment}: that is an annotation the compiler reports as already present on a
 * library symbol, and renders verbatim with its real value. This is a requirement on code that does not
 * exist yet, and renders as a placeholder plus a presence marker.
 *
 * @param name           the annotation's name, unqualified, e.g. {@code "ServiceConfig"}
 * @param module         the {@code org/module} a cross-module annotation belongs to, e.g.
 *                       {@code "ballerinax/cdc"}; {@code null} for one declared by the home module,
 *                       which the renderer then prefixes with the library's own alias
 * @param required       the spec {@code presence}: whether the annotation must be attached at all
 * @param attachPoint    the spec {@code attachPoint}; always {@code "service"} for this tier
 * @param typeConstraint the annotation's type as module-prefixed signature text, or {@code null} for a
 *                       marker annotation the document gives no type
 * @since 1.7.0
 */
record AnnotationRef(String name, String module, boolean required, String attachPoint,
                     String typeConstraint) {
}
