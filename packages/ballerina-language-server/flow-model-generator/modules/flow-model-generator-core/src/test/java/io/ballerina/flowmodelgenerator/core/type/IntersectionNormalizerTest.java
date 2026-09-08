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
import org.ballerinalang.diagramutil.connector.models.connector.TypeInfo;
import org.ballerinalang.diagramutil.connector.models.connector.types.ArrayType;
import org.ballerinalang.diagramutil.connector.models.connector.types.InclusionType;
import org.ballerinalang.diagramutil.connector.models.connector.types.IntersectionType;
import org.ballerinalang.diagramutil.connector.models.connector.types.MapType;
import org.ballerinalang.diagramutil.connector.models.connector.types.PrimitiveType;
import org.ballerinalang.diagramutil.connector.models.connector.types.RecordType;
import org.ballerinalang.diagramutil.connector.models.connector.types.UnionType;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.ArrayList;
import java.util.List;

/**
 * Tests the collapsing of {@code readonly & T} wrappers in a record configuration type tree.
 * <p>
 * The record editor dispatches on {@code typeName} and cannot render an {@code intersection}, and the value
 * generator emits the type name as a string literal for one. The identity assertions here are not incidental: the
 * type tree is built with memoized, shared nodes, and the form mutates the nodes it is handed, so a normalizer that
 * copied everything - or that wrote into its input - would be as wrong as one that collapsed nothing.
 *
 * @since 1.0.0
 */
public class IntersectionNormalizerTest {

    private static Type primitive(String name, String typeName) {
        Type type = new PrimitiveType(typeName);
        type.name = name;
        return type;
    }

    private static RecordType record(String name, Type... fields) {
        List<Type> fieldList = new ArrayList<>(List.of(fields));
        RecordType record = new RecordType(fieldList, (Type) null);
        record.name = name;
        record.typeInfo = new TypeInfo(name, "org", "module", "module", "1.0.0");
        return record;
    }

    /** A {@code readonly & member} wrapper carrying the field identity, as the language server builds it. */
    private static IntersectionType readonlyIntersection(String name, Type member) {
        IntersectionType intersection = new IntersectionType();
        intersection.name = name;
        intersection.typeInfo = new TypeInfo(name, "org", "module", "module", "1.0.0");
        intersection.members.add(new PrimitiveType(IntersectionNormalizer.READONLY_TYPE_NAMES));
        intersection.members.add(member);
        return intersection;
    }

    @Test(description = "A readonly intersection is replaced by the member carrying the shape.")
    public void testRootIntersectionCollapses() {
        RecordType inner = record("ServerCacheConfig", primitive("maxAge", "int"));
        IntersectionType wrapper = readonlyIntersection("ServerCacheConfig", inner);
        wrapper.optional = true;
        wrapper.selected = true;

        Type normalized = IntersectionNormalizer.normalize(wrapper);

        Assert.assertTrue(normalized instanceof RecordType);
        Assert.assertEquals(normalized.typeName, "record");
        Assert.assertEquals(normalized.name, "ServerCacheConfig");
        Assert.assertSame(normalized.typeInfo, wrapper.typeInfo, "the wrapper carries the declared type identity");
        Assert.assertTrue(normalized.optional);
        Assert.assertTrue(normalized.selected);
        Assert.assertSame(((RecordType) normalized).fields, inner.fields, "an untouched subtree is not copied");
    }

    @Test(description = "A readonly intersection nested in a record field collapses, and the input is untouched.")
    public void testNestedFieldIntersectionCollapses() {
        Type sibling = primitive("path", "string");
        RecordType inner = record("ServerCacheConfig", primitive("maxAge", "int"));
        IntersectionType field = readonlyIntersection("cacheConfig", inner);
        RecordType parent = record("GraphqlResourceConfig", sibling, field);

        RecordType normalized = (RecordType) IntersectionNormalizer.normalize(parent);

        Assert.assertNotSame(normalized, parent);
        Assert.assertSame(normalized.fields.get(0), sibling, "an unchanged sibling keeps its identity");
        Assert.assertEquals(normalized.fields.get(1).typeName, "record");
        Assert.assertEquals(normalized.fields.get(1).name, "cacheConfig");
        Assert.assertSame(parent.fields.get(1), field, "the input tree is never rewritten in place");
        Assert.assertEquals(field.typeName, "intersection");
    }

    @Test(description = "Nested readonly wrappers collapse all the way to the shape.")
    public void testNestedIntersectionsCollapseToFixpoint() {
        RecordType inner = record("Pet", primitive("name", "string"));
        IntersectionType normalizedTwice = readonlyIntersection("Pet", readonlyIntersection("Pet", inner));

        Type normalized = IntersectionNormalizer.normalize(normalizedTwice);

        Assert.assertEquals(normalized.typeName, "record");
        Assert.assertSame(((RecordType) normalized).fields, inner.fields);
    }

    @Test(description = "An intersection of two shapes has no single member to stand in for it.")
    public void testAmbiguousIntersectionIsLeftAlone() {
        IntersectionType ambiguous = new IntersectionType();
        ambiguous.members.add(record("Foo", primitive("a", "string")));
        ambiguous.members.add(record("Bar", primitive("b", "string")));

        Assert.assertSame(IntersectionNormalizer.normalize(ambiguous), ambiguous);
    }

    @Test(description = "An intersection with no shape member, and a tree with no intersection, are returned as is.")
    public void testNothingToCollapseReturnsTheInput() {
        IntersectionType readonlyOnly = new IntersectionType();
        readonlyOnly.members.add(new PrimitiveType(IntersectionNormalizer.READONLY_TYPE_NAMES));
        Assert.assertSame(IntersectionNormalizer.normalize(readonlyOnly), readonlyOnly);

        RecordType plain = record("Pet", primitive("name", "string"), primitive("age", "int"));
        Assert.assertSame(IntersectionNormalizer.normalize(plain), plain);
    }

    @Test(description = "One shared node reached through two slots normalizes to one shared node.")
    public void testSharedNodesStayShared() {
        IntersectionType shared = readonlyIntersection("Utc", record("Utc", primitive("seconds", "int")));
        RecordType parent = record("Certificate", shared, shared);

        RecordType normalized = (RecordType) IntersectionNormalizer.normalize(parent);

        Assert.assertEquals(normalized.fields.get(0).typeName, "record");
        Assert.assertSame(normalized.fields.get(0), normalized.fields.get(1));
    }

    @Test(description = "Normalizing an already normalized tree changes nothing, so it can run on both paths.")
    public void testIdempotence() {
        RecordType parent = record("Holder", readonlyIntersection("cacheConfig",
                record("ServerCacheConfig", primitive("maxAge", "int"))));

        Type once = IntersectionNormalizer.normalize(parent);
        Assert.assertSame(IntersectionNormalizer.normalize(once), once);
    }

    @Test(description = "Array member types and elements are normalized.")
    public void testArraySlotsAreNormalized() {
        RecordType inner = record("Pet", primitive("name", "string"));
        ArrayType array = new ArrayType(readonlyIntersection("Pet", inner));
        array.elements = new ArrayList<>(List.of(readonlyIntersection("Pet", inner)));

        ArrayType normalized = (ArrayType) IntersectionNormalizer.normalize(array);

        Assert.assertEquals(normalized.memberType.typeName, "record");
        Assert.assertEquals(normalized.elements.get(0).typeName, "record");
        Assert.assertEquals(array.memberType.typeName, "intersection", "the input array is untouched");
    }

    @Test(description = "Union members and inclusion types are normalized.")
    public void testUnionAndInclusionSlotsAreNormalized() {
        UnionType union = new UnionType();
        union.members.add(primitive("first", "string"));
        union.members.add(readonlyIntersection("Pet", record("Pet", primitive("name", "string"))));

        UnionType normalizedUnion = (UnionType) IntersectionNormalizer.normalize(union);
        Assert.assertEquals(normalizedUnion.members.get(1).typeName, "record");

        InclusionType inclusion = new InclusionType(
                readonlyIntersection("Base", record("Base", primitive("id", "string"))));
        InclusionType normalizedInclusion = (InclusionType) IntersectionNormalizer.normalize(inclusion);
        Assert.assertEquals(normalizedInclusion.inclusionType.typeName, "record");
    }

    @Test(description = "A shape member that is not a record keeps the state its own subclass holds.")
    public void testNonRecordShapeMemberKeepsItsState() {
        Type constraint = primitive("value", "string");
        MapType map = new MapType(constraint);
        IntersectionType wrapper = readonlyIntersection("headers", map);

        Type normalized = IntersectionNormalizer.normalize(wrapper);

        Assert.assertTrue(normalized instanceof MapType);
        Assert.assertEquals(normalized.name, "headers");
        Assert.assertSame(((MapType) normalized).paramType, constraint);
    }

    @Test(description = "The member describes the value, so its own documentation and value win over the wrapper's.")
    public void testMergePrefersTheMembersOwnValueDescription() {
        RecordType inner = record("Pet", primitive("name", "string"));
        inner.documentation = "the member's own docs";
        IntersectionType wrapper = readonlyIntersection("pet", inner);
        wrapper.documentation = "the wrapper's docs";
        wrapper.defaultValue = "()";

        Type normalized = IntersectionNormalizer.normalize(wrapper);

        Assert.assertEquals(normalized.documentation, "the member's own docs");
        Assert.assertEquals(normalized.defaultValue, "()", "the wrapper fills in what the member leaves unset");

        inner.documentation = "";
        Assert.assertNull(IntersectionNormalizer.normalize(readonlyIntersection("pet", inner)).documentation,
                "an empty documentation on the member is not a description");
    }
}
