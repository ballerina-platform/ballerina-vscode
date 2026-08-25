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

package io.ballerina.modelgenerator.commons.trigger.utils;

import io.ballerina.modelgenerator.commons.trigger.models.TypeRef;

import java.util.List;
import java.util.function.UnaryOperator;
import java.util.stream.Collectors;

/**
 * Renders a {@link TypeRef} tree into a qualified Ballerina type signature. {@code aliasResolver}
 * maps a module name to its import prefix left to the caller, not this module's concern.
 *
 * @since 1.10.0
 */
public final class TypeRefRenderer {

    private TypeRefRenderer() {
    }

    /** A union as {@code A|B}; {@code null}/empty renders as {@code anydata}. */
    public static String render(List<TypeRef> refs, String moduleName, UnaryOperator<String> aliasResolver) {
        if (refs == null || refs.isEmpty()) {
            return "anydata";
        }
        return refs.stream().map(r -> render(r, moduleName, aliasResolver)).collect(Collectors.joining("|"));
    }

    /**
     * One node: a qualified name, {@code T[]}, {@code stream<T>}/{@code stream<T, C>}, or
     * {@code readonly & T}.
     *
     * @throws IllegalArgumentException on a {@code shape} outside the closed vocabulary -- unlike the
     *                                  open rule registry, an unrecognised type shape cannot be
     *                                  rendered at all and must fail loudly, not silently
     */
    public static String render(TypeRef ref, String moduleName, UnaryOperator<String> aliasResolver) {
        if (ref == null) {
            return "anydata";
        }
        if (ref.isNamed()) {
            return qualifyName(ref, moduleName, aliasResolver);
        }
        List<TypeRef> elements = ref.elementType();
        String element = render(elements, moduleName, aliasResolver);
        // A bare union binds looser than [] or &, so "A|B[]" reads as "A|(B[])" -- parenthesize.
        boolean union = elements != null && elements.size() > 1;
        switch (ref.shape()) {
            case TypeRef.SHAPE_ARRAY:
                return union || isIntersection(elements) ? "(" + element + ")[]" : element + "[]";
            case TypeRef.SHAPE_READONLY:
                return union ? "readonly & (" + element + ")" : "readonly & " + element;
            case TypeRef.SHAPE_STREAM:
                if (ref.completionType() == null || ref.completionType().isEmpty()) {
                    return "stream<" + element + ">";
                }
                return "stream<" + element + ", " + render(ref.completionType(), moduleName, aliasResolver) + ">";
            default:
                throw new IllegalArgumentException("Unrecognized TypeRef shape: " + ref.shape());
        }
    }

    /** Whether a single-member element list renders as a {@code readonly & T} intersection. */
    private static boolean isIntersection(List<TypeRef> elements) {
        return elements != null && elements.size() == 1 && elements.get(0) != null
                && TypeRef.SHAPE_READONLY.equals(elements.get(0).shape());
    }

    private static String qualifyName(TypeRef ref, String moduleName, UnaryOperator<String> aliasResolver) {
        String name = ref.name();
        if (name == null || name.isEmpty()) {
            return name;
        }
        boolean builtin = Boolean.TRUE.equals(ref.builtin()) || !Character.isUpperCase(name.charAt(0));
        if (builtin) {
            return name;
        }
        String prefixModule = ref.packageInfo() != null ? ref.packageInfo().moduleName() : moduleName;
        return aliasResolver.apply(prefixModule) + ":" + name;
    }
}
