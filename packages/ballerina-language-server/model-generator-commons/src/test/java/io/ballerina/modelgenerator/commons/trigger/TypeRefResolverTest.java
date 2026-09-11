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

package io.ballerina.modelgenerator.commons.trigger;

import io.ballerina.modelgenerator.commons.trigger.models.TypeRef;
import io.ballerina.modelgenerator.commons.trigger.utils.TypeRefResolver;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.List;
import java.util.Set;
import java.util.function.Predicate;

/**
 * {@link TypeRefResolver} against the Ballerina Trigger Construct Spec §1 — turning a document's type tree
 * into the signature text a reader writes.
 *
 * <p>The home module throughout is {@code kafka}, and it declares {@code Caller} and {@code Error}. That
 * pairing is the point of most of these: {@code Error} and {@code error} differ only in case, which is the
 * authoring convention §1.2 explicitly tells a consumer <b>not</b> to pattern-match on.
 *
 * @since 1.10.0
 */
public class TypeRefResolverTest {

    private static final String HOME = "kafka";
    private static final Predicate<String> DECLARED = Set.of("Caller", "Error", "AnydataConsumerRecord")::contains;

    private static String render(TypeRef ref) {
        return TypeRefResolver.render(ref, HOME, DECLARED);
    }

    private static TypeRef named(String name) {
        return new TypeRef(name, null);
    }

    private static TypeRef builtin(String name) {
        return new TypeRef(name, null, Boolean.TRUE, null, null, null, null);
    }

    private static TypeRef composite(String shape, List<TypeRef> element, List<TypeRef> completion) {
        return new TypeRef(null, null, shape, element, completion);
    }

    // ---- §1.2/§1.3 qualification --------------------------------------------------------------

    @Test
    public void testAHomeModuleTypeTakesTheHomeAlias() {
        Assert.assertEquals(render(named("Caller")), "kafka:Caller");
    }

    @Test
    public void testABuiltinIsNeverQualified() {
        Assert.assertEquals(render(builtin("anydata")), "anydata");
        Assert.assertEquals(render(builtin("error")), "error");
        Assert.assertEquals(render(builtin("()")), "()");
        Assert.assertEquals(render(builtin("record {}")), "record {}");
    }

    /**
     * The spec §1.2 in one assertion: {@code builtin} decides, not casing and not what the package happens
     * to declare.
     *
     * <p>A module may declare a type whose name collides with a language one — the corpus's own
     * {@code Error}/{@code error} pair is one character away from it — and the unflagged fallback would then
     * qualify a language type as {@code kafka:error}. Reading the flag first is what makes that impossible.
     */
    @Test
    public void testABuiltinWinsOverAHomeModuleDeclarationOfTheSameName() {
        Predicate<String> declaresError = name -> true;
        Assert.assertEquals(TypeRefResolver.render(builtin("error"), HOME, declaresError), "error",
                "a leaf the document marks builtin is a language type whatever the package declares");
        Assert.assertEquals(TypeRefResolver.render(named("Error"), HOME, declaresError), "kafka:Error",
                "an unflagged leaf still falls back to what the package declares");
    }

    @Test
    public void testAnUndeclaredUnflaggedNameIsLeftBare() {
        // Not qualified, because the home module does not declare it — the pre-existing fallback, which a
        // document authored before `builtin` existed still relies on.
        Assert.assertEquals(render(named("json")), "json");
    }

    @Test
    public void testACrossModuleTypeTakesItsOwnAlias() {
        TypeRef ref = new TypeRef("Service", new TypeRef.PackageInfo("ballerinax", "cdc", "cdc", "1.4.0"));
        Assert.assertEquals(render(ref), "cdc:Service");
    }

    // ---- §1.1 shapes ---------------------------------------------------------------------------

    @Test
    public void testArrayRendersWithTheSuffix() {
        Assert.assertEquals(render(composite(TypeRef.SHAPE_ARRAY, List.of(builtin("byte")), null)), "byte[]");
        Assert.assertEquals(render(composite(TypeRef.SHAPE_ARRAY,
                List.of(named("AnydataConsumerRecord")), null)), "kafka:AnydataConsumerRecord[]");
    }

    @Test
    public void testNestedArrayRendersBothSuffixes() {
        TypeRef inner = composite(TypeRef.SHAPE_ARRAY, List.of(builtin("string")), null);
        Assert.assertEquals(render(composite(TypeRef.SHAPE_ARRAY, List.of(inner), null)), "string[][]");
    }

    @Test
    public void testStreamRendersItsCompletionAsANilableUnion() {
        TypeRef ref = composite(TypeRef.SHAPE_STREAM, List.of(builtin("anydata")),
                List.of(named("Error"), builtin("()")));
        Assert.assertEquals(render(ref), "stream<anydata, kafka:Error?>");
    }

    @Test
    public void testStreamWithoutACompletionRendersOneParameter() {
        Assert.assertEquals(render(composite(TypeRef.SHAPE_STREAM, List.of(builtin("anydata")), null)),
                "stream<anydata>");
    }

    /**
     * Spec §1.1's third shape, added by the 2026-08-19 revision: {@code readonly & T}.
     *
     * <p>{@code ballerina/tcp}'s {@code onBytes} is the corpus instance and takes exactly this tree — a
     * {@code readonly} whose element is itself an array — which is why the nesting is asserted rather than
     * just the keyword.
     */
    @Test
    public void testReadonlyRendersAsAnIntersection() {
        TypeRef byteArray = composite(TypeRef.SHAPE_ARRAY, List.of(builtin("byte")), null);
        Assert.assertEquals(render(composite(TypeRef.SHAPE_READONLY, List.of(byteArray), null)),
                "readonly & byte[]");
    }

    @Test
    public void testReadonlyQualifiesItsElementLikeAnyOtherLeaf() {
        Assert.assertEquals(render(composite(TypeRef.SHAPE_READONLY, List.of(named("Caller")), null)),
                "readonly & kafka:Caller");
    }

    /**
     * {@code &} binds tighter than {@code |}, so a union element has to be parenthesised or the type means
     * something else: {@code readonly & A|B} is {@code (readonly & A)|B}.
     */
    @Test
    public void testReadonlyParenthesisesAUnionElement() {
        Assert.assertEquals(render(composite(TypeRef.SHAPE_READONLY,
                List.of(builtin("string"), builtin("int")), null)), "readonly & (string|int)");
    }

    /** {@code []} binds tighter than {@code &}, so an array OF an intersection needs its own parentheses. */
    @Test
    public void testAnArrayOfAReadonlyIsParenthesised() {
        TypeRef readonlyByte = composite(TypeRef.SHAPE_READONLY, List.of(builtin("byte")), null);
        Assert.assertEquals(render(composite(TypeRef.SHAPE_ARRAY, List.of(readonlyByte), null)),
                "(readonly & byte)[]");
    }

    @Test
    public void testAUnionArrayElementIsParenthesised() {
        Assert.assertEquals(render(composite(TypeRef.SHAPE_ARRAY,
                List.of(named("Caller"), builtin("string")), null)), "(kafka:Caller|string)[]");
    }

    @Test
    public void testAnUnknownShapeEmitsNothingRatherThanGuessing() {
        Assert.assertEquals(render(composite("map", List.of(builtin("string")), null)), "",
                "spec §1.1 closes the vocabulary so an unreadable type fails loudly rather than silently");
    }

    // ---- unions --------------------------------------------------------------------------------

    @Test
    public void testRenderUnionJoinsEveryMember() {
        Assert.assertEquals(TypeRefResolver.renderUnion(
                List.of(builtin("error"), builtin("()")), HOME, DECLARED), "error|()");
    }

    @Test
    public void testRenderNilableUnionWritesTheNilAsAQuestionMark() {
        Assert.assertEquals(TypeRefResolver.renderNilableUnion(
                List.of(builtin("error"), builtin("()")), HOME, DECLARED), "error?");
    }
}
