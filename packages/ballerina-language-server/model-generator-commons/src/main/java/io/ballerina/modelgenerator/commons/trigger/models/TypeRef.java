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

package io.ballerina.modelgenerator.commons.trigger.models;

import java.util.List;

/**
 * A Ballerina type reference.
 *
 * @param name           a plain type name; mutually exclusive with {@code shape}
 * @param packageInfo    cross-module origin; {@code null} for same-module
 * @param builtin        {@code true} only for one of Ballerina's own language types; never {@code false}
 * @param subtypeFamily  {@code true} when this reference stands for the named type and every
 *                       introspectable subtype of it, not the exact type alone; never {@code false}
 * @param shape          {@link #SHAPE_ARRAY}, {@link #SHAPE_STREAM} or {@link #SHAPE_READONLY};
 *                       {@code null} for a named type
 * @param elementType    the array element, stream value, or readonly-intersected type
 * @param completionType what a stream terminates with; stream-only, optional
 * @since 1.10.0
 */
public record TypeRef(String name, PackageInfo packageInfo, Boolean builtin, Boolean subtypeFamily, String shape,
                      List<TypeRef> elementType, List<TypeRef> completionType) {

    /** {@code T[]}. */
    public static final String SHAPE_ARRAY = "array";
    /** {@code stream<T>} or {@code stream<T, C>}. */
    public static final String SHAPE_STREAM = "stream";
    /** {@code readonly & T}. */
    public static final String SHAPE_READONLY = "readonly";

    public TypeRef(String name, PackageInfo packageInfo) {
        this(name, packageInfo, null, null, null, null, null);
    }

    public TypeRef(String name, PackageInfo packageInfo, String shape, List<TypeRef> elementType,
                   List<TypeRef> completionType) {
        this(name, packageInfo, null, null, shape, elementType, completionType);
    }

    public boolean isNamed() {
        return shape == null;
    }

    public boolean isComposite() {
        return shape != null;
    }

    /** Read rather than inferred from casing: the spec says {@code builtin} is what decides a module prefix. */
    public boolean isBuiltin() {
        return Boolean.TRUE.equals(builtin);
    }

    public boolean isSubtypeFamily() {
        return Boolean.TRUE.equals(subtypeFamily);
    }

    public record PackageInfo(String org, String packageName, String moduleName, String version) {
    }
}
