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

package io.ballerina.flowmodelgenerator.core.type;

import org.ballerinalang.diagramutil.connector.models.connector.Type;
import org.ballerinalang.diagramutil.connector.models.connector.types.ArrayType;
import org.ballerinalang.diagramutil.connector.models.connector.types.EnumType;
import org.ballerinalang.diagramutil.connector.models.connector.types.ErrorType;
import org.ballerinalang.diagramutil.connector.models.connector.types.InclusionType;
import org.ballerinalang.diagramutil.connector.models.connector.types.IntersectionType;
import org.ballerinalang.diagramutil.connector.models.connector.types.MapType;
import org.ballerinalang.diagramutil.connector.models.connector.types.ObjectType;
import org.ballerinalang.diagramutil.connector.models.connector.types.RecordType;
import org.ballerinalang.diagramutil.connector.models.connector.types.StreamType;
import org.ballerinalang.diagramutil.connector.models.connector.types.TableType;
import org.ballerinalang.diagramutil.connector.models.connector.types.UnionType;

import java.util.ArrayList;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;

/**
 * Collapses {@code readonly & T} intersection wrappers in a record configuration {@link Type} tree.
 * <p>
 * The record editor dispatches on {@code typeName} and has no {@code intersection} renderer, so such a node renders
 * as a leaf labelled "intersection" and its value is generated as the literal string {@code "intersection"}.
 * Replacing the wrapper with the member that carries the shape keeps the editor free of intersection handling. The
 * wrapper's {@code typeInfo} is preserved, so the {@code readonly & T} identity survives the collapse.
 * <p>
 * Scoped to the record configuration endpoints on purpose: {@code Type.fromSemanticSymbol} is shared with
 * {@code expressionEditor/visibleVariableTypes}, {@code ballerinaSymbol/*} and {@code ballerinaConnector/*}, whose
 * consumers render an intersection as {@code A & B} by design.
 * <p>
 * Never mutates the input. {@code Type.fromSemanticSymbol} memoizes and hands out shared instances, so an in-place
 * rewrite would corrupt unrelated slots of the tree.
 *
 * @since 1.0.0
 */
public final class IntersectionNormalizer {

    /**
     * The only intersection member that constrains mutability without carrying a shape of its own. Every other
     * member counts as a shape, so an intersection such as {@code Foo & Bar} stays ambiguous and is left alone.
     */
    public static final String READONLY_TYPE_NAMES = "readonly";

    private IntersectionNormalizer() {
    }

    /**
     * Replaces every collapsible intersection in the tree with the member that carries its shape.
     *
     * @param node the root of the type tree
     * @return the normalized tree; {@code node} itself when there is nothing to collapse. Untouched subtrees are
     * shared with the input rather than copied.
     */
    public static Type normalize(Type node) {
        return node == null ? null : normalize(node, new IdentityHashMap<>());
    }

    private static Type normalize(Type node, Map<Type, Type> memo) {
        if (node == null) {
            return null;
        }
        Type cached = memo.get(node);
        if (cached != null) {
            return cached;
        }
        // Reserve the slot before recursing, so a self-referential type resolves instead of overflowing. The
        // collapsed node is what is reserved, not the input: an occurrence reached from inside its own subtree
        // must not be the intersection this class exists to remove.
        Type unwrapped = unwrap(node);
        memo.put(node, unwrapped);

        Type normalized = normalizeChildren(unwrapped, memo);
        memo.put(node, normalized);
        return normalized;
    }

    /**
     * Collapses one node's intersection wrappers, repeating to a fixpoint so that
     * {@code readonly & (readonly & T)} unwraps all the way to {@code T}.
     */
    private static Type unwrap(Type node) {
        Type current = node;
        for (Type member = shapeMember(current); member != null; member = shapeMember(current)) {
            current = merge(current, member);
        }
        return current;
    }

    /**
     * Returns the single member of an intersection that carries its shape, or {@code null} when there is no
     * unambiguous one: {@code Foo & Bar} has no single member to render in the intersection's place.
     */
    private static Type shapeMember(Type node) {
        if (!(node instanceof IntersectionType intersection) || intersection.members == null) {
            return null;
        }
        Type shape = null;
        for (Type member : intersection.members) {
            if (member == null || member.typeName == null || READONLY_TYPE_NAMES.equals(member.typeName)) {
                continue;
            }
            if (shape != null) {
                return null;
            }
            shape = member;
        }
        return shape;
    }

    /**
     * Merges the wrapper's identity onto the member that replaces it. The wrapper is the field slot, so its name,
     * position and flags win; the member describes the shape, so anything it states about the value stands.
     */
    private static Type merge(Type wrapper, Type member) {
        Type merged = shallowCopy(member);
        if (wrapper.name != null) {
            merged.name = wrapper.name;
        }
        if (wrapper.typeInfo != null) {
            merged.typeInfo = wrapper.typeInfo;
        }
        if (wrapper.displayAnnotation != null) {
            merged.displayAnnotation = wrapper.displayAnnotation;
        }
        merged.optional = wrapper.optional;
        merged.defaultable = wrapper.defaultable;
        merged.isRestType = wrapper.isRestType;
        merged.selected = wrapper.selected;
        merged.documentation = preferMember(member.documentation, wrapper.documentation);
        merged.value = preferMember(member.value, wrapper.value);
        merged.defaultValue = preferMember(member.defaultValue, wrapper.defaultValue);
        return merged;
    }

    private static String preferMember(String memberValue, String wrapperValue) {
        return memberValue == null || memberValue.isEmpty() ? wrapperValue : memberValue;
    }

    /**
     * Normalizes the child slots the record editor descends into, the same set the webview's
     * {@code normalizeIntersections} walks. Containers it cannot render - map, error, stream and table - are left
     * as they are.
     */
    private static Type normalizeChildren(Type node, Map<Type, Type> memo) {
        switch (node) {
            case RecordType record -> {
                List<Type> fields = normalizeList(record.fields, memo);
                Type restType = normalize(record.restType, memo);
                if (fields == record.fields && restType == record.restType) {
                    return node;
                }
                RecordType copy = (RecordType) shallowCopy(record);
                copy.fields = fields;
                copy.restType = restType;
                copy.hasRestType = restType != null;
                return copy;
            }
            case UnionType union -> {
                List<Type> members = normalizeList(union.members, memo);
                if (members == union.members) {
                    return node;
                }
                UnionType copy = (UnionType) shallowCopy(union);
                copy.members = members;
                return copy;
            }
            case EnumType enumType -> {
                List<Type> members = normalizeList(enumType.members, memo);
                if (members == enumType.members) {
                    return node;
                }
                EnumType copy = (EnumType) shallowCopy(enumType);
                copy.members = members;
                return copy;
            }
            case IntersectionType intersection -> {
                // Only reached when the intersection is not collapsible, such as `Foo & Bar`.
                List<Type> members = normalizeList(intersection.members, memo);
                if (members == intersection.members) {
                    return node;
                }
                IntersectionType copy = (IntersectionType) shallowCopy(intersection);
                copy.members = members;
                return copy;
            }
            case ArrayType array -> {
                Type memberType = normalize(array.memberType, memo);
                List<Type> elements = normalizeList(array.elements, memo);
                if (memberType == array.memberType && elements == array.elements) {
                    return node;
                }
                ArrayType copy = (ArrayType) shallowCopy(array);
                copy.memberType = memberType;
                copy.elements = elements;
                return copy;
            }
            case InclusionType inclusion -> {
                Type inclusionType = normalize(inclusion.inclusionType, memo);
                if (inclusionType == inclusion.inclusionType) {
                    return node;
                }
                InclusionType copy = (InclusionType) shallowCopy(inclusion);
                copy.inclusionType = inclusionType;
                return copy;
            }
            case ObjectType object -> {
                List<Type> fields = normalizeList(object.fields, memo);
                if (fields == object.fields) {
                    return node;
                }
                ObjectType copy = (ObjectType) shallowCopy(object);
                copy.fields = fields;
                return copy;
            }
            default -> {
                return node;
            }
        }
    }

    /**
     * Returns the list with every element normalized, or the input list itself when no element changed.
     */
    private static List<Type> normalizeList(List<Type> list, Map<Type, Type> memo) {
        if (list == null) {
            return null;
        }
        List<Type> normalized = null;
        for (int i = 0; i < list.size(); i++) {
            Type child = list.get(i);
            Type result = normalize(child, memo);
            if (result != child && normalized == null) {
                normalized = new ArrayList<>(list);
            }
            if (normalized != null) {
                normalized.set(i, result);
            }
        }
        return normalized == null ? list : normalized;
    }

    /**
     * Copies a node without copying its children. {@link Type#copy()} is deep for records, unions, arrays and
     * enums, which would discard the structure sharing this walk depends on.
     */
    private static Type shallowCopy(Type node) {
        Type copy = switch (node) {
            case RecordType record -> new RecordType(record.fields, record.restType);
            case UnionType union -> new UnionType(union.members);
            case EnumType enumType -> new EnumType(enumType.members);
            case IntersectionType intersection -> {
                IntersectionType intersectionCopy = new IntersectionType();
                intersectionCopy.members = intersection.members;
                yield intersectionCopy;
            }
            case ArrayType array -> {
                ArrayType arrayCopy = new ArrayType(array.memberType);
                arrayCopy.elements = array.elements;
                yield arrayCopy;
            }
            case InclusionType inclusion -> new InclusionType(inclusion.inclusionType);
            case MapType map -> new MapType(map.paramType);
            case ObjectType object -> new ObjectType(object.fields);
            case ErrorType error -> {
                ErrorType errorCopy = new ErrorType();
                errorCopy.isErrorUnion = error.isErrorUnion;
                errorCopy.errorUnion = error.errorUnion;
                errorCopy.detailType = error.detailType;
                yield errorCopy;
            }
            case StreamType stream -> new StreamType(stream.leftTypeParam, stream.rightTypeParam);
            case TableType table -> new TableType(table.rowType, table.keys, table.constraintType);
            // PrimitiveType and ConstType hold no state of their own, and the serializer writes fields, not classes.
            default -> new Type();
        };
        copyBaseFields(node, copy);
        return copy;
    }

    /**
     * Copies the base fields, overwriting the {@code typeName} each subclass constructor stamps on itself with the
     * source's own - a {@code PrimitiveType} carries names such as {@code [int, decimal]} that must survive.
     */
    private static void copyBaseFields(Type source, Type target) {
        target.name = source.name;
        target.typeName = source.typeName;
        target.optional = source.optional;
        target.typeInfo = source.typeInfo;
        target.defaultable = source.defaultable;
        target.defaultValue = source.defaultValue;
        target.displayAnnotation = source.displayAnnotation;
        target.documentation = source.documentation;
        target.isRestType = source.isRestType;
        target.value = source.value;
        target.selected = source.selected;
    }
}
