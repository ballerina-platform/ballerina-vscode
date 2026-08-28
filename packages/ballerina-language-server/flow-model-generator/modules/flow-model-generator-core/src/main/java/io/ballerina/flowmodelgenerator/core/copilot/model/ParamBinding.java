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
 * The spec {@code params[].dataBinding} — how one parameter slot's raw value may be projected into a
 * user-defined type.
 *
 * <p>Written inline on the parameter rather than referenced from a registry, and shaped as independent
 * {@link TypedescVariant variants} rather than as alternative modes: two variants can share a bound and
 * differ in shape, or share shapes and differ in bound. One flattened mode list could express neither
 * without dropping half the surface.
 *
 * @since 1.10.0
 */
public class ParamBinding {

    private List<TypedescVariant> typedescs;

    public ParamBinding() {
    }

    public List<TypedescVariant> getTypedescs() {
        return typedescs;
    }

    public void setTypedescs(List<TypedescVariant> typedescs) {
        this.typedescs = typedescs;
    }
}
