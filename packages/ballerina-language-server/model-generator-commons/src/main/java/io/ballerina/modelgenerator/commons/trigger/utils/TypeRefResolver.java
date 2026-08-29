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

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.function.Predicate;

/**
 * Turns a document's {@code TypeRef} into the module-prefixed signature text a consumer can render, per
 * <b>Ballerina Trigger Construct spec — {@code TypeRef}</b>.
 *
 * <p>The spec states the two rules this class encodes:
 * <ul>
 *   <li>{@code packageInfo} is present only for a type outside this file's home module, and such a
 *       reference is written with that module's own alias; a bare {@code {"name": ...}} means the
 *       connector's own module.</li>
 *   <li>A union is an array of {@link TypeRef} whose first element is the codegen default — hence
 *       {@link #first(List)}, which callers needing a single representative type must use rather than
 *       indexing the list themselves.</li>
 * </ul>
 *
 * <p>Ballerina binds a module's <i>last dot-segment</i> as its default import prefix, so
 * {@code mssql.cdc.driver} aliases to {@code driver} and {@code trigger.github} to {@code github} —
 * see {@link #moduleAlias(String)}.
 *
 * <p>Lives in commons because the spec was implemented twice and divergently, once for the Copilot catalog
 * and once for the service-model trigger synthesizer. The Copilot consumer routes through it today; the
 * synthesizer still routes through {@link TypeRefRenderer}.
 *
 * <p>TODO: converge with {@link TypeRefRenderer} so one class answers this question. They disagree on
 * three points today, and this one is the weaker reading of the spec on all three: an absent or empty
 * union renders {@code ""} here but {@code "anydata"} there; {@link TypeRef#SHAPE_READONLY} is
 * unhandled here (falls through to {@code ""}) but rendered there; and an unrecognised {@code shape}
 * is swallowed here but throws there, so a spec addition lands as silently missing text rather than a
 * failure. Fold this class into that one — keeping the genuinely new helpers below, which it lacks —
 * rather than the reverse.
 *
 * @since 1.10.0
 */
public final class TypeRefResolver {

    /** The spec: nil, written {@code ()}, and the member that makes a union nilable. */
    private static final String NIL = "()";

    private TypeRefResolver() {
        // Prevent instantiation
    }

    /**
     * The import prefix Ballerina binds for a module: its last dot-segment.
     * {@code "trigger.github"} → {@code "github"}, {@code "kafka"} → {@code "kafka"}.
     *
     * @param moduleName the module name; may be {@code null}
     * @return the alias, or the input unchanged when it carries no dot
     */
    public static String moduleAlias(String moduleName) {
        if (moduleName != null && moduleName.contains(".")) {
            return moduleName.substring(moduleName.lastIndexOf('.') + 1);
        }
        return moduleName;
    }

    /**
     * The leading identifier of a type name, i.e. the part that could name a declared type:
     * {@code "AnydataConsumerRecord[]"} → {@code "AnydataConsumerRecord"}, {@code "record {}"} →
     * {@code "record"}. Returns {@code null} when the name starts with no identifier character at all
     * ({@code "()"}, {@code ""}), which is how built-in and anonymous shapes are told apart from
     * user-defined type references.
     *
     * @param typeName the type name; may be {@code null}
     * @return the leading identifier, or {@code null}
     */
    public static String baseIdentifier(String typeName) {
        if (typeName == null || typeName.isEmpty()) {
            return null;
        }
        int end = 0;
        while (end < typeName.length()
                && (Character.isLetterOrDigit(typeName.charAt(end)) || typeName.charAt(end) == '_')) {
            end++;
        }
        return end == 0 ? null : typeName.substring(0, end);
    }

    /**
     * The spec: "the first element is the codegen default." The single representative member of a
     * scalar-or-union slot.
     *
     * @param refs the slot's type members; may be {@code null} or empty
     * @return the first member, or {@code null}
     */
    public static TypeRef first(List<TypeRef> refs) {
        return refs == null || refs.isEmpty() ? null : refs.get(0);
    }

    /**
     * The module a {@link TypeRef} belongs to, or {@code null} for a bare reference (the spec: a bare
     * {@code {"name": ...}} means same module as the connector's own types).
     *
     * <p>Prefers {@code moduleName} over {@code packageName}: a submodule such as {@code mssql.cdc}
     * shares its parent's package name but is a distinct module, and it is the <i>module</i> that
     * determines both the import path and the alias.
     *
     * @param ref the reference; may be {@code null}
     * @return the module name, or {@code null} for a bare or coordinate-less reference
     */
    public static String moduleOf(TypeRef ref) {
        if (ref == null || ref.packageInfo() == null) {
            return null;
        }
        TypeRef.PackageInfo info = ref.packageInfo();
        if (info.moduleName() != null && !info.moduleName().isEmpty()) {
            return info.moduleName();
        }
        return info.packageName() == null || info.packageName().isEmpty() ? null : info.packageName();
    }

    /**
     * The {@code org/module} coordinate a <b>cross-module</b> {@link TypeRef} belongs to, e.g.
     * {@code "ballerinax/cdc"}; empty for a reference that does not leave the home module.
     *
     * <p>Judged at <b>module</b> granularity rather than package, because a submodule such as
     * {@code mssql.cdc} shares its parent's package name while being a distinct module — and it is the
     * module that determines both the import path and the alias.
     *
     * <p>The coordinate is returned rather than the alias it renders with: deriving a prefix is a rendering
     * decision, and the full {@code org/module} also lets a consumer name the owning package in a
     * provenance note. A reference whose coordinates yield no usable prefix is reported as not-foreign
     * rather than as a foreign type with a blank alias, which would erase the type name at the point of use.
     *
     * @param ref        the reference; may be {@code null}
     * @param homeModule the home module every cross-module judgement in the document is relative to
     * @return the foreign {@code org/module}, or empty for a home-module or unusable reference
     */
    public static Optional<String> foreignModulePath(TypeRef ref, String homeModule) {
        String module = moduleOf(ref);
        if (module == null || module.equals(homeModule)) {
            return Optional.empty();
        }
        String org = ref.packageInfo().org();
        String alias = moduleAlias(module);
        if (org == null || org.isEmpty() || alias == null || alias.isEmpty()) {
            return Optional.empty();
        }
        return Optional.of(org + "/" + module);
    }

    /**
     * Renders a {@link TypeRef} tree as module-prefixed signature text.
     *
     * <p>A cross-module reference gets its own module's alias ({@code cdc:Error}); a reference to a type
     * the home module declares gets the home alias ({@code kafka:Caller}), which a downstream link resolver
     * strips back off while recording the link; language types and anonymous shapes ({@code json},
     * {@code record {}}, {@code ()}) stay bare.
     *
     * <p><b>A language type is recognised by the document, not by this code.</b> The spec §1.3 puts
     * {@code builtin: true} on every such leaf precisely so a consumer does not have to keep Ballerina's
     * language-type set in sync by hand, and §1.2 says outright to read the flag rather than pattern-match
     * on casing. The {@code declaredByHomeModule} fallback below still applies to an unflagged leaf, which
     * is what keeps a document authored before the flag existed rendering exactly as it did.
     *
     * <p><b>Qualification is per leaf</b>, which is why the spec makes this a tree: a composite is rendered
     * by rendering its parts and re-assembling the syntax around them, so {@code stream<anydata, Error?>}
     * qualifies its {@code Error} and leaves {@code anydata} alone. A flat string form could not — its
     * leading identifier is {@code stream}, so the whole expression either gains a prefix it must not have
     * or keeps an inner name that does not resolve.
     *
     * <p>A nilable part is a union containing {@code ()}, so {@code [Error, ()]} renders as {@code Error?}
     * rather than {@code Error|()} — both compile, but only the first is what a reader writes.
     *
     * @param ref                  the reference; may be {@code null}
     * @param homePackageName      the resolved library's package name, whose alias prefixes home types
     * @param declaredByHomeModule whether the home module declares a type of the given base name
     * @return the signature text, or {@code ""} for a missing reference
     */
    public static String render(TypeRef ref, String homePackageName, Predicate<String> declaredByHomeModule) {
        if (ref == null) {
            return "";
        }
        if (!ref.isNamed()) {
            return renderComposite(ref, homePackageName, declaredByHomeModule);
        }
        if (ref.name() == null) {
            return "";
        }
        String name = ref.name();
        // The spec §1.2/§1.3: a language type is never qualified, and the document states which leaves
        // those are rather than leaving a consumer to infer it. Read before anything else, because it is
        // the one answer that cannot be wrong — the fallback below asks whether the resolved package
        // declares a type of the same name, which for a builtin is a coincidence away from prefixing
        // `error` as `kafka:error`.
        if (ref.isBuiltin()) {
            return name;
        }
        if (ref.packageInfo() != null) {
            String refPackage = ref.packageInfo().packageName();
            String refModule = ref.packageInfo().moduleName() != null
                    ? ref.packageInfo().moduleName() : refPackage;
            if (refPackage != null && !refPackage.equals(homePackageName)) {
                return moduleAlias(refModule) + ":" + name;
            }
            return moduleAlias(homePackageName) + ":" + name;
        }
        String base = baseIdentifier(name);
        if (base != null && declaredByHomeModule.test(base)) {
            return moduleAlias(homePackageName) + ":" + name;
        }
        return name;
    }

    /**
     * The spec §1.1 shape table, as syntax: {@code array} → {@code T[]}, {@code stream} →
     * {@code stream<T[, C]>}, {@code readonly} → {@code readonly & T}. An unknown shape emits nothing
     * rather than inventing one.
     */
    private static String renderComposite(TypeRef ref, String homePackageName,
                                          Predicate<String> declaredByHomeModule) {
        String element = renderPart(ref.elementType(), homePackageName, declaredByHomeModule);
        if (element.isEmpty()) {
            // A composite with no element states no type at all; emitting `[]` or `stream<>` would be
            // uncompilable, so it degrades to nothing and the caller's own emptiness check applies.
            return "";
        }
        if (TypeRef.SHAPE_ARRAY.equals(ref.shape())) {
            // A union element needs parentheses: `(A|B)[]` is an array of A-or-B, whereas `A|B[]` is
            // A-or-array-of-B, which is a different type.
            return needsParens(ref.elementType()) ? "(" + element + ")[]" : element + "[]";
        }
        if (TypeRef.SHAPE_STREAM.equals(ref.shape())) {
            String completion = renderPart(ref.completionType(), homePackageName, declaredByHomeModule);
            return completion.isEmpty() ? "stream<" + element + ">"
                    : "stream<" + element + ", " + completion + ">";
        }
        if (TypeRef.SHAPE_READONLY.equals(ref.shape())) {
            // `&` binds tighter than `|` in a Ballerina type descriptor, so `readonly & A|B` is
            // `(readonly & A)|B` — a different type from the one a union element states. The element is
            // parenthesised for exactly the case the array branch above parenthesises it.
            return needsParens(ref.elementType()) ? "readonly & (" + element + ")" : "readonly & " + element;
        }
        // The spec closes the shape vocabulary precisely so this cannot be reached silently; returning the
        // element alone would misdescribe the type, so nothing is emitted and the slot reads as unstated.
        return "";
    }

    /**
     * One part of a composite: a single type, or a union.
     *
     * <p>A union whose last member is {@code ()} is written with {@code ?}, the form the spec says a nilable
     * type takes in source.
     */
    private static String renderPart(List<TypeRef> part, String homePackageName,
                                     Predicate<String> declaredByHomeModule) {
        if (part == null || part.isEmpty()) {
            return "";
        }
        if (part.size() == 1) {
            return render(part.get(0), homePackageName, declaredByHomeModule);
        }
        List<TypeRef> members = new ArrayList<>(part);
        boolean nilable = false;
        for (int i = members.size() - 1; i >= 0; i--) {
            TypeRef member = members.get(i);
            if (member != null && member.isNamed() && NIL.equals(member.name())) {
                members.remove(i);
                nilable = true;
            }
        }
        if (members.isEmpty()) {
            return NIL;
        }
        StringBuilder joined = new StringBuilder();
        for (int i = 0; i < members.size(); i++) {
            if (i > 0) {
                joined.append("|");
            }
            joined.append(render(members.get(i), homePackageName, declaredByHomeModule));
        }
        String rendered = joined.toString();
        if (!nilable) {
            return rendered;
        }
        // `A|B?` parses as `A|(B?)`, which is the same set, but the parenthesised form is what makes the
        // nilability apply to the whole union unambiguously.
        return members.size() > 1 ? "(" + rendered + ")?" : rendered + "?";
    }

    /**
     * Whether a part must be parenthesised before an array suffix, or inside a {@code readonly}
     * intersection.
     *
     * <p>Two cases, and both are about operator precedence rather than style:
     * <ul>
     *   <li>a <b>union</b> — {@code A|B[]} is A-or-array-of-B, not an array of A-or-B. One member plus a
     *       nil is rendered {@code T?}, which still needs parentheses before {@code []};</li>
     *   <li>a <b>{@code readonly} intersection</b> — {@code readonly & byte[][]} reads as an array of the
     *       whole intersection only with parentheses, since {@code []} binds tighter than {@code &}.</li>
     * </ul>
     */
    private static boolean needsParens(List<TypeRef> part) {
        if (part == null || part.isEmpty()) {
            return false;
        }
        if (part.size() > 1) {
            return true;
        }
        TypeRef only = part.get(0);
        return only != null && TypeRef.SHAPE_READONLY.equals(only.shape());
    }

    /**
     * Joins a union's members with {@code |} into one signature.
     *
     * <p>Correct for a slot whose value genuinely <i>is</i> the union — notably a handler's
     * {@code returns}, where the spec's nilable rule ({@code T?} written as an explicit {@code ()} member)
     * makes {@code error|()} the intended text. It is <b>not</b> correct for a {@code params[].type} union,
     * which enumerates alternatives legal for the slot rather than a union-typed parameter.
     *
     * @param refs                 the union members; may be {@code null} or empty
     * @param homePackageName      the resolved library's package name
     * @param declaredByHomeModule whether the home module declares a type of the given base name
     * @return the joined signature, or {@code ""} when there are no members
     */
    public static String renderUnion(List<TypeRef> refs, String homePackageName,
                                     Predicate<String> declaredByHomeModule) {
        if (refs == null || refs.isEmpty()) {
            return "";
        }
        StringBuilder joined = new StringBuilder();
        for (int i = 0; i < refs.size(); i++) {
            if (i > 0) {
                joined.append("|");
            }
            joined.append(render(refs.get(i), homePackageName, declaredByHomeModule));
        }
        return joined.toString();
    }

    /**
     * A union written the way source does: a trailing {@code ()} member becomes {@code ?}.
     *
     * <p>Distinct from {@link #renderUnion}, which joins every member with {@code |}. Both are correct
     * Ballerina for the same set, but a stream's completion type reads as {@code error?} in real programs
     * and as {@code error|()} in none.
     *
     * @param refs                 the union members; may be {@code null} or empty
     * @param homePackageName      the resolved library's package name
     * @param declaredByHomeModule whether the home module declares a type of the given base name
     * @return the joined signature, or {@code ""} when there are no members
     */
    public static String renderNilableUnion(List<TypeRef> refs, String homePackageName,
                                            Predicate<String> declaredByHomeModule) {
        return renderPart(refs, homePackageName, declaredByHomeModule);
    }
}
