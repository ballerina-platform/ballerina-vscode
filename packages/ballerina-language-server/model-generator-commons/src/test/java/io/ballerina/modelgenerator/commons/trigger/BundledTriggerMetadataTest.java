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

import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerMetadataModel;
import io.ballerina.modelgenerator.commons.trigger.models.TypeRef;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.URISyntaxException;
import java.net.URL;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Stream;

/**
 * Every LS-bundled {@code trigger-metadata.json}, read through {@link LibraryMetadataReader} and checked
 * against the Ballerina Trigger Construct Spec v1.0 as last revised 2026-08-19.
 *
 * <h2>What this is for</h2>
 *
 * <p>Two failure modes, and neither is caught anywhere else.
 *
 * <p><b>A document that stops conforming.</b> The corpus is copied from the spec repository's
 * {@code examples/}, so a document is only as current as the last sync. Every assertion below is on a field
 * the revision made <b>required</b> — {@code id} on every referenceable construct, {@code doc} on listeners
 * and service types, the {@code returns} object — so a stale document fails here rather than by quietly
 * rendering a thinner catalog.
 *
 * <p><b>A model that stops reading one.</b> Gson binds by field name and reports nothing when a name does
 * not match, so a renamed record component turns every value of that field into {@code null} silently.
 * These assertions run through the real reader and the real model, which is what makes them catch that:
 * {@code returns} moving from a bare union to {@link TriggerMetadataModel.ServiceType.ReturnSpec} would
 * otherwise have shown up only as returns disappearing from a rendered prompt.
 *
 * <p><b>The corpus is discovered, not listed.</b> A hardcoded list would leave a newly added document
 * unchecked, which is exactly when a document is most likely to be wrong.
 *
 * @since 1.10.0
 */
public class BundledTriggerMetadataTest {

    private static final String BUNDLED_ROOT = "trigger-metadata-models";
    /**
     * A document this module ships, used only to locate the shipped corpus on the classpath.
     *
     * <p>Needed because {@code trigger-metadata-models} exists TWICE on the test classpath: this module's
     * own test resources hold the reader's version-gate fixtures ({@code version-none}, {@code version-v2},
     * {@code version-v19}) under the same directory name, and they are meant to be unparseable or
     * off-version. A directory listing off {@code getResource(BUNDLED_ROOT)} resolves to whichever root
     * comes first -- the test one -- so it would enumerate those fixtures and never the corpus. Anchoring
     * on a document only the shipped corpus contains resolves the right root regardless of ordering.
     */
    private static final String CORPUS_ANCHOR = "kafka";
    private static final LibraryMetadataReader READER = LibraryMetadataReader.getInstance();

    /**
     * Every bundled document's module key, read off the classpath rather than listed here.
     *
     * <p>Deliberately a hard failure when the root resolves to nothing: an empty corpus would make every
     * test below vacuously pass, which is the one outcome worse than a failure.
     */
    private static List<String> bundledModules() {
        String anchor = BUNDLED_ROOT + "/" + CORPUS_ANCHOR + "/trigger-metadata.json";
        URL root = BundledTriggerMetadataTest.class.getClassLoader().getResource(anchor);
        Assert.assertNotNull(root, anchor + " is not on the test classpath; the corpus would be"
                + " silently empty and every assertion in this class vacuous.");
        Path directory;
        try {
            directory = Path.of(root.toURI()).getParent().getParent();
        } catch (URISyntaxException e) {
            throw new IllegalStateException("Could not resolve " + BUNDLED_ROOT, e);
        }
        try (Stream<Path> entries = Files.list(directory)) {
            List<String> modules = entries.filter(Files::isDirectory)
                    .map(path -> path.getFileName().toString())
                    .sorted()
                    .toList();
            Assert.assertFalse(modules.isEmpty(), "No bundled trigger-metadata documents found.");
            return modules;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** One document, read exactly as the Copilot's bundled tier reads it. */
    private static TriggerMetadataModel read(String moduleName) {
        return READER.getPackagedTriggerMetadataModel(new ModuleInfo("ballerinax", moduleName, moduleName,
                null)).orElseThrow(() -> new AssertionError(
                "trigger-metadata-models/" + moduleName + "/trigger-metadata.json did not parse to a"
                        + " document. A JSON error here is a build defect, not a connector's."));
    }

    @Test
    public void testEveryBundledDocumentParses() {
        for (String module : bundledModules()) {
            TriggerMetadataModel document = read(module);
            Assert.assertEquals(document.version(), "v1.0",
                    module + ": every corpus document declares the spec version it conforms to");
            Assert.assertNotNull(document.listeners(), module + ": a document declares at least one listener");
            Assert.assertFalse(document.listeners().isEmpty(), module + ": listeners[] is never empty");
            Assert.assertNotNull(document.serviceTypes(), module + ": a document declares a service type");
            Assert.assertFalse(document.serviceTypes().isEmpty(), module + ": serviceTypes[] is never empty");
        }
    }

    /**
     * Spec §0/§2/§3: {@code id} and {@code doc} are required on every listener and service type.
     *
     * <p>The 2026-08-19 revision added both, and a service type's {@code doc} is required <b>even when it is
     * {@code concrete}</b> — the one place the schema's "leave out what introspection recovers" rule is
     * suspended, because id and doc together are what make a top-level construct navigable on its own.
     */
    @Test
    public void testEveryListenerAndServiceTypeCarriesAnIdAndADoc() {
        for (String module : bundledModules()) {
            TriggerMetadataModel document = read(module);
            for (TriggerMetadataModel.Listener listener : document.listeners()) {
                assertId(listener.id(), module + ": listeners[].id");
                assertProse(listener.doc(), module + ": listeners[].doc");
            }
            for (TriggerMetadataModel.ServiceType serviceType : document.serviceTypes()) {
                assertId(serviceType.id(), module + ": serviceTypes[].id");
                assertProse(serviceType.doc(), module + ": serviceTypes[" + serviceType.id() + "].doc");
            }
        }
    }

    /**
     * Spec §0: a handler, its params and its return carry hierarchical ids scoped under their owner.
     *
     * <p>Also pins the containment rule the spec states in prose — "built by appending the child's own name
     * to the parent's id" — because that is what makes an id addressable at all: a param id that did not
     * start with its handler's could not be resolved back to the handler a note has to name.
     */
    @Test
    public void testHandlerParamAndReturnIdsAreHierarchical() {
        for (String module : bundledModules()) {
            TriggerMetadataModel document = read(module);
            for (TriggerMetadataModel.ServiceType serviceType : document.serviceTypes()) {
                for (TriggerMetadataModel.ServiceType.HandlerOption option : options(serviceType)) {
                    String where = module + ": " + serviceType.id();
                    assertId(option.id(), where + " handlers.options[].id");
                    Assert.assertTrue(option.id().startsWith(serviceType.id() + "."),
                            where + ": a handler id is scoped under its service type, got " + option.id());
                    for (TriggerMetadataModel.ServiceType.Param param : safe(option.params())) {
                        assertId(param.id(), where + " " + option.id() + " params[].id");
                        Assert.assertTrue(param.id().startsWith(option.id() + "."),
                                where + ": a param id is scoped under its handler, got " + param.id());
                    }
                    if (option.returns() != null) {
                        Assert.assertEquals(option.returns().id(), option.id() + ".returns",
                                where + ": a return's id is its handler's plus the fixed `returns` segment");
                    }
                }
            }
        }
    }

    /**
     * Spec §5.4: {@code returns} is an object carrying its own type, and {@code returnAnnotations} is gone.
     *
     * <p>The assertion that matters is the second half: a return-scope annotation now reaches the consumer
     * only through {@code returns.annotations}, so a document still writing the old sibling key would parse
     * without complaint and lose every return obligation. {@code additionalProperties: false} in the schema
     * forbids it, and this catches a document that slipped past the schema.
     */
    @Test
    public void testEveryReturnStatesATypeAndCarriesItsOwnAnnotations() {
        int returnsWithAnnotations = 0;
        for (String module : bundledModules()) {
            TriggerMetadataModel document = read(module);
            for (TriggerMetadataModel.ServiceType serviceType : document.serviceTypes()) {
                for (TriggerMetadataModel.ServiceType.HandlerOption option : options(serviceType)) {
                    TriggerMetadataModel.ServiceType.ReturnSpec returns = option.returns();
                    if (returns == null) {
                        // Legitimate: spec §5.4 omits `returns` entirely where the language form forbids a
                        // return clause, as ballerina/file's handlers do.
                        continue;
                    }
                    Assert.assertNotNull(returns.type(), module + ": " + option.id() + " states a return type");
                    Assert.assertFalse(returns.type().isEmpty(),
                            module + ": " + option.id() + " states a non-empty return type");
                    if (returns.annotations() != null && !returns.annotations().isEmpty()) {
                        returnsWithAnnotations++;
                    }
                }
            }
        }
        Assert.assertTrue(returnsWithAnnotations > 0,
                "No return in the corpus carries an annotation, so this test would pass even if"
                        + " `returns.annotations` were never read. ballerina/http's $cache is the instance.");
    }

    /**
     * Spec §9.1: a return may carry a data binding, the outbound reading of a parameter's.
     *
     * <p>Asserted as a corpus-wide count rather than per library, so it keeps holding as documents change:
     * what must not happen is the construct going unread everywhere, which is what a bare-union
     * {@code returns} would have caused.
     */
    @Test
    public void testReturnDataBindingIsRead() {
        int bindings = 0;
        for (String module : bundledModules()) {
            for (TriggerMetadataModel.ServiceType serviceType : read(module).serviceTypes()) {
                for (TriggerMetadataModel.ServiceType.HandlerOption option : options(serviceType)) {
                    if (option.returns() != null && option.returns().dataBinding() != null) {
                        Assert.assertNotNull(option.returns().dataBinding().typedescs(),
                                module + ": " + option.id() + " states a binding with no variants");
                        Assert.assertFalse(option.returns().dataBinding().typedescs().isEmpty(),
                                module + ": " + option.id() + " states a binding with no variants");
                        bindings++;
                    }
                }
            }
        }
        Assert.assertTrue(bindings > 0, "No return in the corpus carries a dataBinding, so §9.1 would be"
                + " unexercised. graphql, grpc, http, mcp, rabbitmq and websocket all declare one.");
    }

    /**
     * Spec §6.1.1: a {@code handler} or {@code param} rule subject addresses its construct by <b>id</b>, and
     * that id resolves within the service type the subject belongs to.
     *
     * <p>An unresolvable subject is not a parse error — the consumer drops it with a logged reason — which
     * is precisely why it needs asserting here: a rule silently reduced to nothing renders no note, and a
     * reader is told nothing about a constraint the connector still enforces.
     *
     * <p>Scoped to service-type-local rules, since no corpus document declares a top-level one; a spanning
     * rule's subjects name their own {@code serviceType} and would have to be resolved against that entry.
     */
    @Test
    public void testHandlerAndParamRuleSubjectsResolveByIdWithinTheirServiceType() {
        int handlerSubjects = 0;
        for (String module : bundledModules()) {
            TriggerMetadataModel document = read(module);
            for (TriggerMetadataModel.ServiceType serviceType : document.serviceTypes()) {
                Set<String> handlerIds = new HashSet<>();
                Set<String> paramIds = new HashSet<>();
                for (TriggerMetadataModel.ServiceType.HandlerOption option : options(serviceType)) {
                    handlerIds.add(option.id());
                    for (TriggerMetadataModel.ServiceType.Param param : safe(option.params())) {
                        paramIds.add(param.id());
                    }
                }
                for (TriggerMetadataModel.Rule rule : safeRules(serviceType.rules())) {
                    for (TriggerMetadataModel.Subject subject : safeSubjects(rule.subjects())) {
                        String where = module + ": rule " + rule.id() + " subject";
                        if (TriggerMetadataModel.Subject.KIND_HANDLER.equals(subject.kind())) {
                            assertId(subject.id(), where);
                            Assert.assertTrue(handlerIds.contains(subject.id()),
                                    where + " names handler id " + subject.id()
                                            + ", which " + serviceType.id() + " does not declare: "
                                            + handlerIds);
                            handlerSubjects++;
                        } else if (TriggerMetadataModel.Subject.KIND_PARAM.equals(subject.kind())) {
                            assertId(subject.id(), where);
                            Assert.assertTrue(paramIds.contains(subject.id()),
                                    where + " names param id " + subject.id()
                                            + ", which " + serviceType.id() + " does not declare");
                        }
                    }
                }
            }
        }
        Assert.assertTrue(handlerSubjects > 0, "No rule in the corpus addresses a handler, so the id-based"
                + " addressing §6.1.1 introduced would be unexercised.");
    }

    /**
     * Spec §6.1.1's worked case, pinned by name: a {@code structure.atLeastOne} over a <b>single</b> subject
     * is legal and the corpus relies on it.
     *
     * <p>graphql's is the instance the spec cites, and the reason the rule cannot be expressed any other
     * way: all three of its handler shapes are {@code addMode: "many"} and therefore named {@code "*"}, so
     * only the id distinguishes the query shape from the mutation and subscription ones. A consumer that
     * requires two subjects drops this rule and says nothing about a constraint that makes the difference
     * between a valid and an invalid schema.
     */
    @Test
    public void testGraphqlDeclaresASingleSubjectAtLeastOneRule() {
        TriggerMetadataModel graphql = read("graphql");
        TriggerMetadataModel.ServiceType service = graphql.serviceTypes().get(0);
        List<TriggerMetadataModel.Rule> rules = safeRules(service.rules());
        Assert.assertEquals(rules.size(), 1, "graphql declares exactly one rule");
        TriggerMetadataModel.Rule rule = rules.get(0);
        Assert.assertEquals(rule.rule(), TriggerMetadataModel.Rule.RULE_AT_LEAST_ONE);
        Assert.assertEquals(rule.subjects().size(), 1,
                "a single subject is a legal structure.atLeastOne (the spec §6.1.1)");
        Assert.assertEquals(rule.subjects().get(0).id(), "$service.query");
    }

    /**
     * Spec §1.3/§1.4: the two {@link TypeRef} flags are read, and read as the tri-state the schema makes
     * them — present-and-true, or absent.
     *
     * <p>{@code builtin} decides whether a leaf takes a module prefix, so reading it as a primitive would
     * turn "the document said nothing" into "the document said no" for every pre-revision document.
     */
    @Test
    public void testTypeRefFlagsAreRead() {
        int builtins = 0;
        int families = 0;
        for (String module : bundledModules()) {
            for (TriggerMetadataModel.ServiceType serviceType : read(module).serviceTypes()) {
                for (TriggerMetadataModel.ServiceType.HandlerOption option : options(serviceType)) {
                    for (TypeRef ref : allRefs(option)) {
                        if (ref.isBuiltin()) {
                            builtins++;
                            Assert.assertNull(ref.packageInfo(),
                                    module + ": a language type is never cross-module — " + ref.name());
                        }
                        if (ref.isSubtypeFamily()) {
                            families++;
                        }
                        // The schema writes both as `const: true`, so a `false` can only come from a
                        // consumer inventing one.
                        Assert.assertNotEquals(ref.builtin(), Boolean.FALSE,
                                module + ": `builtin` is present-and-true or absent, never false");
                        Assert.assertNotEquals(ref.subtypeFamily(), Boolean.FALSE,
                                module + ": `subtypeFamily` is present-and-true or absent, never false");
                    }
                }
            }
        }
        Assert.assertTrue(builtins > 0, "No leaf in the corpus is marked `builtin`, so §1.3 is unexercised.");
        Assert.assertTrue(families > 0, "No leaf in the corpus is marked `subtypeFamily`, so §1.4 is"
                + " unexercised. ballerina/http's StatusCodeResponse is the instance.");
    }

    /** Spec §1.1: the shape vocabulary is closed, and the corpus stays inside it. */
    @Test
    public void testEveryCompositeUsesADeclaredShape() {
        Set<String> declared = Set.of(TypeRef.SHAPE_ARRAY, TypeRef.SHAPE_STREAM, TypeRef.SHAPE_READONLY);
        int readonlys = 0;
        for (String module : bundledModules()) {
            for (TriggerMetadataModel.ServiceType serviceType : read(module).serviceTypes()) {
                for (TriggerMetadataModel.ServiceType.HandlerOption option : options(serviceType)) {
                    for (TypeRef ref : allRefs(option)) {
                        if (!ref.isComposite()) {
                            continue;
                        }
                        Assert.assertTrue(declared.contains(ref.shape()),
                                module + ": `" + ref.shape() + "` is not a shape this build implements."
                                        + " Spec §1.1 closes the vocabulary precisely so this fails loudly.");
                        if (TypeRef.SHAPE_READONLY.equals(ref.shape())) {
                            readonlys++;
                        }
                    }
                }
            }
        }
        Assert.assertTrue(readonlys > 0, "No type in the corpus uses the `readonly` shape §1.1 added, so it"
                + " is unexercised. ballerina/tcp's onBytes takes `readonly & byte[]`.");
    }

    // ---- helpers -------------------------------------------------------------------------------

    /** Every type reference reachable from one handler, at any depth. */
    private static List<TypeRef> allRefs(TriggerMetadataModel.ServiceType.HandlerOption option) {
        List<TypeRef> refs = new ArrayList<>();
        for (TriggerMetadataModel.ServiceType.Param param : safe(option.params())) {
            collect(param.type(), refs);
            collectBinding(param.dataBinding(), refs);
        }
        if (option.returns() != null) {
            collect(option.returns().type(), refs);
            collectBinding(option.returns().dataBinding(), refs);
        }
        return refs;
    }

    private static void collectBinding(TriggerMetadataModel.ServiceType.DataBinding binding, List<TypeRef> into) {
        if (binding == null || binding.typedescs() == null) {
            return;
        }
        for (TriggerMetadataModel.ServiceType.TypedescVariant variant : binding.typedescs()) {
            if (variant == null) {
                continue;
            }
            collect(variant.constraint(), into);
            collect(variant.excludes(), into);
            for (TriggerMetadataModel.ServiceType.Shape shape : variant.shapes() == null
                    ? List.<TriggerMetadataModel.ServiceType.Shape>of() : variant.shapes()) {
                if (shape == null) {
                    continue;
                }
                collect(shape.envelope(), into);
                collect(shape.completionType(), into);
            }
        }
    }

    private static void collect(List<TypeRef> refs, List<TypeRef> into) {
        if (refs == null) {
            return;
        }
        for (TypeRef ref : refs) {
            collect(ref, into);
        }
    }

    private static void collect(TypeRef ref, List<TypeRef> into) {
        if (ref == null) {
            return;
        }
        into.add(ref);
        collect(ref.elementType(), into);
        collect(ref.completionType(), into);
    }

    private static List<TriggerMetadataModel.ServiceType.HandlerOption> options(
            TriggerMetadataModel.ServiceType serviceType) {
        if (serviceType.handlers() == null || serviceType.handlers().options() == null) {
            return List.of();
        }
        return serviceType.handlers().options();
    }

    private static List<TriggerMetadataModel.ServiceType.Param> safe(
            List<TriggerMetadataModel.ServiceType.Param> params) {
        return params == null ? List.of() : params;
    }

    private static List<TriggerMetadataModel.Rule> safeRules(List<TriggerMetadataModel.Rule> rules) {
        return rules == null ? List.of() : rules;
    }

    private static List<TriggerMetadataModel.Subject> safeSubjects(List<TriggerMetadataModel.Subject> subjects) {
        return subjects == null ? List.of() : subjects;
    }

    private static void assertId(String id, String where) {
        Assert.assertNotNull(id, where + " is required by the spec");
        Assert.assertTrue(id.startsWith("$"), where + " is `$`-prefixed, got " + id);
    }

    private static void assertProse(String doc, String where) {
        Assert.assertNotNull(doc, where + " is required by the spec");
        Assert.assertFalse(doc.isBlank(), where + " states something");
    }
}
