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

package io.ballerina.flowmodelgenerator.extension;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.ClassSymbol;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.TypeDefinitionSymbol;
import io.ballerina.flowmodelgenerator.core.copilot.CopilotLibraryManager;
import io.ballerina.flowmodelgenerator.core.copilot.model.Annotation;
import io.ballerina.flowmodelgenerator.core.copilot.model.Library;
import io.ballerina.flowmodelgenerator.core.copilot.model.ModelToJsonConverter;
import io.ballerina.flowmodelgenerator.core.copilot.model.Service;
import io.ballerina.flowmodelgenerator.core.copilot.model.Type;
import io.ballerina.flowmodelgenerator.core.copilot.model.TypeLink;
import io.ballerina.flowmodelgenerator.core.copilot.service.ServiceLoader;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.projects.Package;
import org.testng.Assert;
import org.testng.SkipException;
import org.testng.annotations.Test;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;

/**
 * End-to-end tests for the schema-driven Copilot service loader: trigger metadata (structure) +
 * semantic model (listener params, concrete methods + their doc comments, validation), entered
 * through the public
 * {@link ServiceLoader#loadAllServices(String, Package, SemanticModel)} overload — exactly the call
 * {@code CopilotLibraryManager} makes.
 *
 * <p>Each library resolves its latest cached/central package, so assertions pin only
 * version-stable facts (handler vocabulary, param names, doc presence, type link shapes) rather
 * than full golden documents.
 *
 * @since 1.7.0
 */
public class CopilotSchemaServicesTest {

    private static final String MCP = "ballerina/mcp";
    private static final String MCP_PREFIX = "mcp:";

    /**
     * The system property the build hands the corpus versions down through, as
     * {@code org/package=version} pairs.
     */
    private static final String PINNED_VERSIONS_PROPERTY = "copilot.pinnedVersions";

    /** Set to {@code true} to skip, rather than fail, when a corpus package is not locally resolvable. */
    private static final String ALLOW_UNRESOLVED_PROPERTY = "copilot.allowUnresolvedPackages";

    /**
     * The package version each library's assertions are resolved against.
     *
     * <p>Resolution is otherwise "whatever Central serves latest", which makes every assertion in this class
     * hostage to an upstream release. That is not hypothetical: {@code ballerina/smb} 2.0.1 removed the
     * {@code WatchEvent} record and added a compiler plugin that rejects {@code onFileChange}, and two tests
     * here began failing with {@code expected [6] but found [5]}.
     *
     * <p><b>The build owns these values, not this class.</b> They arrive through
     * {@value #PINNED_VERSIONS_PROPERTY}, assembled by {@code copilotCorpusVersions} in
     * {@code flow-model-generator-ls-extension/build.gradle} straight out of
     * {@code build-config/ballerina_dependencies/Dependencies.toml} — the lock file the hermetic Ballerina
     * home is provisioned from, so the version a test <i>requests</i> is by construction the version the
     * build <i>provisioned</i>. Held as literals here, the two drifted silently.
     *
     * <p>A bump is therefore one line in that project's {@code Ballerina.toml} plus a regenerated lock, and
     * is expected to come with re-verifying the affected trigger-metadata document against the new release.
     *
     * <p><b>There is deliberately no hardcoded fallback</b>, which would reintroduce the duplication this
     * indirection removes. An absent property is a hard failure naming what to do, which costs a clear
     * message on a bare {@code java -cp} run and nothing at all under Gradle.
     */
    private static final Map<String, String> PINNED_VERSIONS = pinnedVersions();

    private static Map<String, String> pinnedVersions() {
        String declared = System.getProperty(PINNED_VERSIONS_PROPERTY);
        if (declared == null || declared.isBlank()) {
            throw new IllegalStateException("-D" + PINNED_VERSIONS_PROPERTY + " is not set. The corpus"
                    + " versions come from build-config/ballerina_dependencies/Dependencies.toml by way of"
                    + " copilotCorpusVersions in flow-model-generator-ls-extension/build.gradle, so run"
                    + " these tests through Gradle"
                    + " (or pass -D" + PINNED_VERSIONS_PROPERTY + "=org/pkg=version,... yourself). There is"
                    + " no built-in default on purpose: a second copy of the versions would drift from the"
                    + " ones the build pre-fetches.");
        }
        Map<String, String> parsed = new HashMap<>();
        for (String entry : declared.split(",")) {
            int separator = entry.indexOf('=');
            if (separator > 0) {
                String library = entry.substring(0, separator).trim();
                String version = entry.substring(separator + 1).trim();
                if (!library.isEmpty() && !version.isEmpty()) {
                    parsed.put(library, version);
                }
            }
        }
        // A malformed property must not silently downgrade every library to "latest", which is the
        // behaviour pinning exists to remove.
        if (parsed.isEmpty()) {
            throw new IllegalStateException("-D" + PINNED_VERSIONS_PROPERTY + " parsed to nothing usable: "
                    + declared + ". Expected org/pkg=version pairs separated by commas.");
        }
        return Map.copyOf(parsed);
    }

    private final Map<String, JsonArray> cache = new HashMap<>();
    private final Map<String, SemanticModel> semanticModels = new HashMap<>();

    /**
     * The pinned version of a library this class resolves, or a failure naming what to add.
     *
     * <p>This is what makes the corpus extendible rather than merely pinned. Resolving without a version is
     * still possible in the API and still means "whatever Central serves latest", so the moment someone adds
     * a {@code load("ballerina/somethingNew")} the class would quietly reacquire the exact fragility all of
     * this removes — and it would pass, until a release broke it weeks later. Requiring the pin makes adding
     * a library a two-line, self-announcing change: the entry in {@code copilotCorpusLibraries}, and the
     * dependency it reads from the lock.
     */
    private static String requirePin(String libraryName) {
        String pinned = PINNED_VERSIONS.get(libraryName);
        if (pinned == null) {
            throw new AssertionError(libraryName + " is resolved by this test but has no pinned version, so"
                    + " it would resolve whatever Central serves latest. Add it to copilotCorpusLibraries in"
                    + " flow-model-generator-ls-extension/build.gradle, and declare it in"
                    + " build-config/ballerina_dependencies/Ballerina.toml so the lock provisions it."
                    + " Currently pinned: " + new TreeSet<>(PINNED_VERSIONS.keySet()));
        }
        return pinned;
    }

    private JsonArray load(String libraryName) {
        return cache.computeIfAbsent(libraryName, lib -> {
            String[] parts = lib.split("/");
            // Always the pinned version, so an upstream release cannot silently rewrite what these
            // assertions are testing against. See PINNED_VERSIONS and requirePin.
            String pinned = requirePin(lib);
            Optional<Package> pkgOpt = PackageUtil.getModulePackage(
                    PackageUtil.getSampleProject(), parts[0], parts[1], pinned);
            if (pkgOpt.isEmpty()) {
                throw unresolved(lib, pinned);
            }
            Package pkg = pkgOpt.get();
            SemanticModel semanticModel = PackageUtil.getCompilation(pkg)
                    .getSemanticModel(pkg.getDefaultModule().moduleId());
            semanticModels.put(lib, semanticModel);
            return wireJson(ServiceLoader.loadAllServices(lib, pkg, semanticModel));
        });
    }

    /**
     * What an unresolvable package means, and why it is a <b>failure</b> rather than a skip.
     *
     * <p>The build provisions every corpus library into a build-owned Ballerina home before the tests run,
     * so by the time a test runs the package is either present or the build is broken. A skip would report
     * the second as the first: the suite stays green while asserting nothing.
     *
     * <p>{@value #ALLOW_UNRESOLVED_PROPERTY} restores the skip for a run with no build behind it — an IDE
     * invocation on a machine that has never fetched the corpus. CI leaves it unset.
     */
    private static RuntimeException unresolved(String libraryName, String version) {
        String coordinates = libraryName + (version == null ? "" : ":" + version);
        if (Boolean.getBoolean(ALLOW_UNRESOLVED_PROPERTY)) {
            throw new SkipException("Could not resolve package for " + coordinates);
        }
        throw new AssertionError("Could not resolve " + coordinates + ", which the build is supposed to have"
                + " provisioned. Check that it is listed in copilotCorpusLibraries in"
                + " flow-model-generator-ls-extension/build.gradle and locked in"
                + " build-config/ballerina_dependencies/Dependencies.toml. Set -D" + ALLOW_UNRESOLVED_PROPERTY
                + "=true to skip instead, for a run with no build behind it.");
    }

    /**
     * Names of the module-level type definitions and classes the resolved package version declares.
     * Every emitted service type and listener must come from this vocabulary, whichever version
     * Central happens to serve — that is the loader's contract, stated without pinning a release.
     */
    private Set<String> declaredNames(String libraryName) {
        load(libraryName);
        SemanticModel semanticModel = semanticModels.get(libraryName);
        Assert.assertNotNull(semanticModel, "No semantic model cached for " + libraryName);
        Set<String> names = new HashSet<>();
        for (Symbol symbol : semanticModel.moduleSymbols()) {
            if (symbol instanceof TypeDefinitionSymbol || symbol instanceof ClassSymbol) {
                symbol.getName().ifPresent(names::add);
            }
        }
        return names;
    }

    // ---- helpers -------------------------------------------------------------------

    /**
     * The services as they go on the wire.
     *
     * <p>Routed through {@link ModelToJsonConverter} rather than a bare {@code Gson}, because that is the
     * one place a Copilot service becomes JSON in production. Asserting on this output keeps these tests a
     * check on the <b>wire contract</b> — a wrong {@code @SerializedName} or a collection that stopped being
     * omitted when empty fails here, which reading the POJOs directly would not catch.
     */
    private static JsonArray wireJson(List<Service> services) {
        Library library = new Library("test", "test");
        library.setServices(services);
        return ModelToJsonConverter.libraryToJson(library).getAsJsonObject().getAsJsonArray("services");
    }

    private static JsonObject serviceNamed(JsonArray services, String name) {
        for (JsonElement element : services) {
            JsonObject svc = element.getAsJsonObject();
            if (svc.has("name") && name.equals(svc.get("name").getAsString())) {
                return svc;
            }
        }
        Assert.fail("No service named " + name + " in " + services);
        return null;
    }

    private static JsonObject methodNamed(JsonObject service, String name) {
        for (JsonElement element : service.getAsJsonArray("methods")) {
            JsonObject method = element.getAsJsonObject();
            if (name.equals(method.get("name").getAsString())) {
                return method;
            }
        }
        Assert.fail("No method named " + name + " in " + service);
        return null;
    }

    private static List<String> methodNames(JsonObject service) {
        List<String> names = new ArrayList<>();
        if (!service.has("methods")) {
            return names;
        }
        service.getAsJsonArray("methods").forEach(m ->
                names.add(m.getAsJsonObject().get("name").getAsString()));
        return names;
    }

    private static JsonObject paramNamed(JsonObject method, String name) {
        for (JsonElement element : method.getAsJsonArray("parameters")) {
            JsonObject param = element.getAsJsonObject();
            if (name.equals(param.get("name").getAsString())) {
                return param;
            }
        }
        Assert.fail("No parameter named " + name + " in " + method);
        return null;
    }

    private static List<String> paramNames(JsonObject method) {
        List<String> names = new ArrayList<>();
        if (!method.has("parameters")) {
            return names;
        }
        method.getAsJsonArray("parameters").forEach(p ->
                names.add(p.getAsJsonObject().get("name").getAsString()));
        return names;
    }

    private static void assertInternalLink(JsonObject typed, String recordName) {
        JsonObject type = typed.getAsJsonObject("type");
        Assert.assertTrue(type.has("links"), "Expected links on type " + type);
        JsonObject link = type.getAsJsonArray("links").get(0).getAsJsonObject();
        Assert.assertEquals(link.get("category").getAsString(), "internal");
        Assert.assertEquals(link.get("recordName").getAsString(), recordName);
    }

    // ---- kafka -----------------------------------------------------------------------

    @Test
    public void testKafkaSchemaServices() {
        JsonArray services = load("ballerinax/kafka");
        Assert.assertEquals(services.size(), 1);

        JsonObject service = serviceNamed(services, "Service");
        Assert.assertEquals(service.get("type").getAsString(), "fixed");

        JsonObject listener = service.getAsJsonObject("listener");
        Assert.assertEquals(listener.get("name").getAsString(), "kafka:Listener");
        List<String> initParams = new ArrayList<>();
        listener.getAsJsonArray("parameters").forEach(p ->
                initParams.add(p.getAsJsonObject().get("name").getAsString()));
        Assert.assertTrue(initParams.contains("bootstrapServers"),
                "Expected bootstrapServers in " + initParams);
        Assert.assertTrue(initParams.contains("config"), "Expected config in " + initParams);
        JsonObject bootstrapServers = null;
        for (JsonElement p : listener.getAsJsonArray("parameters")) {
            if ("bootstrapServers".equals(p.getAsJsonObject().get("name").getAsString())) {
                bootstrapServers = p.getAsJsonObject();
            }
        }
        Assert.assertNotNull(bootstrapServers);
        Assert.assertFalse(bootstrapServers.get("description").getAsString().isEmpty(),
                "Listener param docs must come from the init method's parameterMap");

        Assert.assertEquals(methodNames(service), List.of("onConsumerRecord", "onError"));

        JsonObject onConsumerRecord = methodNamed(service, "onConsumerRecord");
        Assert.assertEquals(onConsumerRecord.get("type").getAsString(), "remote");
        // The spec reversed this. A marker service type still declares no method, so there is no doc
        // comment to introspect — which is exactly why the document now AUTHORS one, and why it is the only
        // description a generator will ever see for such a handler.
        Assert.assertTrue(onConsumerRecord.has("description"),
                "the spec makes `doc` the authored description of a marker-type handler");
        Assert.assertTrue(onConsumerRecord.get("description").getAsString()
                        .startsWith("Invoked with each batch of records polled"),
                onConsumerRecord.toString());
        // The document's `presence: "required"` must reach the wire. It used to be dropped, which left a
        // mandatory handler indistinguishable from a skippable one; `onError` below is the optional
        // counterpart. Spec v2's kafka document declares no `addMode` at all, so presence is no longer
        // scoped to `subset` — an absent mode must not suppress a presence the document does state.
        Assert.assertTrue(onConsumerRecord.has("optional"),
                "A stated presence must reach the wire, not be dropped");
        Assert.assertFalse(onConsumerRecord.get("optional").getAsBoolean(),
                "kafka's onConsumerRecord declares presence: \"required\"");

        // The spec makes `name` required on every fixed slot, so these are the document's own authored
        // names rather than generated ones — and the order is the document's, which is why it is asserted
        // at all: kafka 4.6.5's own README documents
        // `onConsumerRecord(kafka:Caller caller, kafka:BytesConsumerRecord[] records)`, so `caller` leads.
        // Reordering these silently reorders the generated handler signature.
        Assert.assertEquals(paramNames(onConsumerRecord), List.of("caller", "records"));
        JsonObject records = paramNamed(onConsumerRecord, "records");
        Assert.assertEquals(records.getAsJsonObject("type").get("name").getAsString(),
                "AnydataConsumerRecord[]");
        assertInternalLink(records, "AnydataConsumerRecord[]");
        JsonObject caller = paramNamed(onConsumerRecord, "caller");
        Assert.assertTrue(caller.get("optional").getAsBoolean(),
                "presence: optional must map to the param optional flag");

        Assert.assertEquals(onConsumerRecord.getAsJsonObject("return")
                .getAsJsonObject("type").get("name").getAsString(), "error?");

        JsonObject onError = methodNamed(service, "onError");
        // A bare `Error` slot is generated as <alias>Error — never the keyword `error`.
        Assert.assertEquals(paramNames(onError), List.of("err"));
        Assert.assertEquals(paramNamed(onError, "err").getAsJsonObject("type")
                .get("name").getAsString(), "Error");
        // The optional counterpart of onConsumerRecord above: both states are expressible, which is the
        // whole point of stating presence at all.
        Assert.assertTrue(onError.get("optional").getAsBoolean(),
                "kafka's onError declares presence: \"optional\"");
    }

    // ---- rabbitmq ----------------------------------------------------------------------

    @Test
    public void testRabbitmqSchemaServices() {
        JsonArray services = load("ballerinax/rabbitmq");
        JsonObject service = serviceNamed(services, "Service");

        Assert.assertEquals(methodNames(service), List.of("onMessage", "onRequest", "onError"));

        JsonObject onRequest = methodNamed(service, "onRequest");
        // Authored names. The spec makes `params[].name` required on every fixed slot, so these come
        // from the document rather than from the generator -- which is why they no longer have to
        // coincide with what the retired service-index happened to carry.
        Assert.assertEquals(paramNames(onRequest), List.of("message", "caller"));
        Assert.assertEquals(onRequest.getAsJsonObject("return")
                .getAsJsonObject("type").get("name").getAsString(), "anydata|error");
        Assert.assertTrue(onRequest.has("description"),
                "the spec makes `doc` the authored description of a marker-type handler");

        JsonObject onError = methodNamed(service, "onError");
        Assert.assertEquals(paramNames(onError), List.of("message", "err"));
    }

    // ---- ftp ---------------------------------------------------------------------------

    @Test
    public void testFtpSchemaServices() {
        JsonArray services = load("ballerina/ftp");
        JsonObject service = serviceNamed(services, "Service");

        // The metadata's handler vocabulary, including onFileChange (absent from the old index).
        Assert.assertEquals(methodNames(service), List.of("onFileCsv", "onFileJson", "onFileXml",
                "onFileText", "onFile", "onFileDelete", "onError", "onFileChange"));

        // Metadata structure wins: onFileJson has no caller; names come from the metadata file.
        JsonObject onFileJson = methodNamed(service, "onFileJson");
        Assert.assertEquals(paramNames(onFileJson), List.of("content", "fileInfo"));
        Assert.assertEquals(paramNamed(onFileJson, "content").getAsJsonObject("type")
                .get("name").getAsString(), "json");
        assertInternalLink(paramNamed(onFileJson, "fileInfo"), "FileInfo");

        // First union member is the codegen default for the CSV content type.
        JsonObject onFileCsv = methodNamed(service, "onFileCsv");
        Assert.assertEquals(paramNamed(onFileCsv, "content").getAsJsonObject("type")
                .get("name").getAsString(), "string[][]");
        Assert.assertTrue(paramNamed(onFileCsv, "caller").get("optional").getAsBoolean());
    }

    // ---- mssql (metadata keyed as mssql.cdc) ---------------------------------------------

    @Test
    public void testMssqlSchemaServices() {
        JsonArray services = load("ballerinax/mssql");
        JsonObject service = serviceNamed(services, "Service");

        JsonObject listener = service.getAsJsonObject("listener");
        Assert.assertEquals(listener.get("name").getAsString(), "mssql:CdcListener",
                "The metadata-declared CdcListener must validate against the resolved package");

        // The spec: the service type belongs to ballerinax/cdc, not to the home module, so it is
        // written with its own module's alias — `service cdc:Service on new mssql:CdcListener(...)`.
        // `mssql:Service` would not compile.
        Assert.assertEquals(service.get("serviceTypeModule").getAsString(), "ballerinax/cdc");

        // The spec: the listener's side-effect import travels with the service that uses it. The
        // foreign service type itself is NOT imported - provenance is carried by the renderer's
        // Special Agent Note, the same mechanism every other cross-module reference uses.
        List<String> imports = new ArrayList<>();
        for (JsonElement element : service.getAsJsonArray("requiredImports")) {
            JsonObject entry = element.getAsJsonObject();
            imports.add(entry.get("module").getAsString()
                    + (entry.has("alias") ? " as " + entry.get("alias").getAsString() : ""));
        }
        Assert.assertTrue(imports.contains("ballerinax/mssql.cdc.driver as _"),
                "The spec side-effect import missing, got " + imports);
        Assert.assertFalse(imports.contains("ballerinax/cdc"),
                "A foreign service type must not be imported, got " + imports);

        Assert.assertEquals(methodNames(service),
                List.of("onRead", "onCreate", "onUpdate", "onDelete", "onError"));

        JsonObject onUpdate = methodNamed(service, "onUpdate");
        Assert.assertEquals(paramNames(onUpdate), List.of("beforeEntry", "afterEntry", "tableName"));
        Assert.assertEquals(paramNamed(onUpdate, "beforeEntry").getAsJsonObject("type")
                .get("name").getAsString(), "record {}");

        // Cross-module TypeRef: prefixed with the foreign alias and never linked.
        JsonObject onError = methodNamed(service, "onError");
        JsonObject cdcError = paramNamed(onError, "cdcError");
        Assert.assertEquals(cdcError.getAsJsonObject("type").get("name").getAsString(), "cdc:Error");
        Assert.assertFalse(cdcError.getAsJsonObject("type").has("links"));

        // Metadata declares returns: () — a nil return carries no information and must be omitted.
        Assert.assertFalse(onError.has("return"));
    }

    @Test
    public void testMssqlCrossModuleServiceAnnotationCarriesItsConstraint() {
        // The spec across a module boundary — the case the whole annotation phase exists for. mssql's
        // document declares a REQUIRED annotation that belongs to ballerinax/cdc, and generated CDC code
        // without it does not work.
        JsonObject service = serviceNamed(load("ballerinax/mssql"), "Service");

        Assert.assertTrue(service.has("annotations"), "the required annotation must reach the catalog");
        JsonArray annotations = service.getAsJsonArray("annotations");
        Assert.assertEquals(annotations.size(), 1);
        JsonObject annotation = annotations.get(0).getAsJsonObject();

        Assert.assertEquals(annotation.get("name").getAsString(), "ServiceConfig");
        Assert.assertEquals(annotation.get("presence").getAsString(), "required");
        Assert.assertEquals(annotation.get("attachPoint").getAsString(), "service");
        // The spec: it belongs to another module, so it states that module and renders `@cdc:ServiceConfig`.
        Assert.assertEquals(annotation.get("module").getAsString(), "ballerinax/cdc");

        // The document names the annotation TAG (`ServiceConfig`); its constraining record is called
        // something else entirely (`CdcServiceConfig`) and is declared in a different package. It is
        // introspected from the compiler — the foreign module's symbols are already in this compilation,
        // because a module whose annotation the generated code must attach is necessarily a dependency.
        JsonObject constraint = annotation.getAsJsonObject("typeConstraint");
        Assert.assertNotNull(constraint, "a required annotation with no field source is unusable");
        Assert.assertEquals(constraint.get("name").getAsString(), "CdcServiceConfig");

        // An EXTERNAL link is what carries the record's definition into the prompt, via the same
        // reachability mechanism every other cross-package type reference already uses.
        JsonObject link = constraint.getAsJsonArray("links").get(0).getAsJsonObject();
        Assert.assertEquals(link.get("category").getAsString(), "external");
        Assert.assertEquals(link.get("recordName").getAsString(), "CdcServiceConfig");
        Assert.assertEquals(link.get("libraryName").getAsString(), "ballerinax/cdc");
    }

    // A home-module counterpart of the test above lived here, against `ballerina/ftp`: its document says
    // `type: {"name": "ServiceConfig"}` while the package declares
    // `public annotation ServiceConfiguration ServiceConfig on service;`, so it proved the emitted
    // constraint is the compiler's record and not the document's tag.
    //
    // Removed because the corpus resolves ftp at `ballerinaFtpVersion`, and that release declares no
    // service-scope annotation at all — so the spec resolver drops `ServiceConfig` as undeclared, which is
    // correct for that version and leaves the test nothing to assert. The cross-module half of the same
    // guarantee is still covered by testMssqlCrossModuleServiceAnnotationCarriesItsConstraint above.

    // ---- mcp ---------------------------------------------------------------------------

    @Test
    public void testMcpSchemaServices() {
        JsonArray services = load(MCP);
        Set<String> declared = declaredNames(MCP);

        List<String> names = new ArrayList<>();
        services.forEach(s -> names.add(s.getAsJsonObject().get("name").getAsString()));

        // Present in every mcp release the metadata targets.
        Assert.assertTrue(names.contains("Service"), "Expected Service in " + names);
        Assert.assertTrue(names.contains("AdvancedService"), "Expected AdvancedService in " + names);

        // The validation guard as an invariant rather than as one release's snapshot: the metadata
        // may name service types and a listener authored ahead of a release, and anything the
        // resolved version does not declare must never reach the prompt. Which types a given mcp
        // ships is deliberately not asserted here — see the pinned test for that.
        for (String name : names) {
            Assert.assertTrue(declared.contains(name),
                    "Emitted service type " + name + " is not declared by the resolved package: " + declared);
        }

        for (JsonElement element : services) {
            JsonObject svc = element.getAsJsonObject();
            assertListenerIsDeclared(svc.getAsJsonObject("listener").get("name").getAsString(), declared);
            if ("Service".equals(svc.get("name").getAsString())) {
                Assert.assertFalse(svc.has("methods"),
                        "Wildcard (addMode: many) handlers must not surface as literal methods");
            }
            if ("AdvancedService".equals(svc.get("name").getAsString())) {
                Assert.assertEquals(methodNames(svc), List.of("onListTools", "onCallTool"),
                        "Concrete service types must introspect their declared methods");
            }
        }
    }

    /**
     * A listener must be module-qualified and name a class the resolved package actually declares —
     * otherwise the generated {@code on new mcp:X(...)} would not compile.
     */
    private static void assertListenerIsDeclared(String listenerName, Set<String> declared) {
        Assert.assertTrue(listenerName.startsWith(MCP_PREFIX),
                "Listener must be module-qualified, got: " + listenerName);
        Assert.assertTrue(declared.contains(listenerName.substring(MCP_PREFIX.length())),
                "Listener " + listenerName + " is not a class the resolved package declares: " + declared);
    }

    // ---- trigger.github ---------------------------------------------------------------

    @Test
    public void testTriggerGithubSchemaServices() {
        JsonArray services = load("ballerinax/trigger.github");
        Assert.assertEquals(services.size(), 10);

        JsonObject issues = serviceNamed(services, "IssuesService");
        Assert.assertEquals(issues.getAsJsonObject("listener").get("name").getAsString(),
                "github:Listener");
        Assert.assertTrue(methodNames(issues).contains("onOpened"));

        JsonObject onOpened = methodNamed(issues, "onOpened");
        Assert.assertEquals(onOpened.get("type").getAsString(), "remote");
        // FLAG: github's declared handlers carry no doc comments, so no description is available
        // (matching what the retired service-index served for this library).
        Assert.assertFalse(onOpened.has("description"),
                "No doc comment in source means no description is emitted");
        Assert.assertEquals(paramNames(onOpened), List.of("payload"));
        JsonObject payload = paramNamed(onOpened, "payload");
        Assert.assertEquals(payload.getAsJsonObject("type").get("name").getAsString(), "IssuesEvent");
        assertInternalLink(payload, "IssuesEvent");
        Assert.assertEquals(onOpened.getAsJsonObject("return")
                .getAsJsonObject("type").get("name").getAsString(), "error?");
    }

    @Test
    public void testMcpServiceModelRoundTrip() {
        // CopilotLibraryManager Gson-round-trips every service through the Service model class.
        // mcp's marker Service legitimately has no methods: the model keeps methods == null and the
        // re-serialized JSON omits the key — the shape the TS renderer's `?? []` guards handle.
        JsonArray services = load(MCP);
        Set<String> declared = declaredNames(MCP);
        Gson gson = new Gson();
        for (JsonElement element : services) {
            io.ballerina.flowmodelgenerator.core.copilot.model.Service service =
                    gson.fromJson(element, io.ballerina.flowmodelgenerator.core.copilot.model.Service.class);
            JsonObject reSerialized = gson.toJsonTree(service).getAsJsonObject();
            if ("Service".equals(service.getName())) {
                Assert.assertNull(service.getMethods());
                Assert.assertFalse(reSerialized.has("methods"),
                        "A method-less fixed service must omit the methods key after the round trip");
            }
            if ("AdvancedService".equals(service.getName())) {
                Assert.assertEquals(service.getMethods().size(), 2);
                Assert.assertTrue(reSerialized.has("methods"));
            }
            // The listener must survive the round trip intact and still name a real class; which
            // class that is depends on the resolved version, so it is checked, not hard-coded.
            assertListenerIsDeclared(
                    reSerialized.getAsJsonObject("listener").get("name").getAsString(), declared);
        }
    }

    // ---- net-new libraries (never in the SQLite index) -----------------------------------

    @Test
    public void testSmbSchemaServices() {
        JsonArray services = load("ballerina/smb");
        JsonObject service = serviceNamed(services, "Service");

        JsonObject listener = service.getAsJsonObject("listener");
        Assert.assertEquals(listener.get("name").getAsString(), "smb:Listener");
        Assert.assertTrue(listener.getAsJsonArray("parameters").size() > 0,
                "Listener init params must be introspected");

        // Exactly the vocabulary smb's compiler plugin admits, verified by compiling all seven against
        // smb 2.0.1: "smb listener only supports `onFile`, `onFileText`, `onFileJson`, `onFileXml`,
        // `onFileCsv`, `onFileDelete` and `onError` remote methods".
        //
        // `onFileChange` is deliberately absent. smb 1.0.2 declared a `WatchEvent` record and shipped no
        // compiler plugin at all, so the handler was legal; 2.0.1 removed the type AND rejects the name
        // outright (`ERROR invalid remote method name 'onFileChange'`). The document no longer declares it.
        Assert.assertEquals(methodNames(service), List.of("onFileText", "onFileJson", "onFileXml",
                "onFileCsv", "onFile", "onFileDelete", "onError"));

        JsonObject onFileJson = methodNamed(service, "onFileJson");
        Assert.assertEquals(paramNames(onFileJson), List.of("content", "fileInfo", "caller"));
        Assert.assertTrue(paramNamed(onFileJson, "caller").get("optional").getAsBoolean());
        assertInternalLink(paramNamed(onFileJson, "fileInfo"), "FileInfo");
        // The spec: smb's handlers are marker-type, so the document authors their descriptions.
        Assert.assertTrue(onFileJson.has("description"),
                "the spec makes `doc` the authored description of a marker-type handler");
    }

    @Test
    public void testWebsubSchemaServices() {
        JsonArray services = load("ballerina/websub");
        JsonObject service = serviceNamed(services, "SubscriberService");

        Assert.assertEquals(service.getAsJsonObject("listener").get("name").getAsString(),
                "websub:Listener");
        // onHubError is now emitted. It used to be silently dropped because the metadata declared its
        // param as "HubError", which the package does not declare — the veto that protected the prompt
        // from an uncompilable signature also made a real handler invisible. The document now says
        // "InternalHubError", which is what websub actually declares: verified by compiling a subscriber
        // service with `onHubError(websub:InternalHubError err)` (builds) against the same handler typed
        // `websub:HubError` ("unknown type 'HubError'"). The handler itself is genuinely part of the
        // contract — websub's plugin rejects an invented handler name but accepts this one.
        Assert.assertEquals(methodNames(service), List.of("onEventNotification",
                "onSubscriptionVerification", "onUnsubscriptionVerification",
                "onSubscriptionValidationDenied", "onHubError"));
        // The parameter is now AUTHORED by the document (the spec makes `name` required on a fixed slot)
        // rather than generated from the type, so it is `err` where the generator produced
        // `internalHubError`. The type is what matters and is unchanged.
        assertInternalLink(paramNamed(methodNamed(service, "onHubError"), "err"), "InternalHubError");

        // The metadata deliberately leaves these params unnamed: names are generated from the
        // declared type — idiomatic, compilable Ballerina.
        JsonObject onEventNotification = methodNamed(service, "onEventNotification");
        Assert.assertEquals(paramNames(onEventNotification), List.of("event"));
        assertInternalLink(paramNamed(onEventNotification, "event"),
                "ContentDistributionMessage");

        JsonObject onSubscriptionVerification = methodNamed(service, "onSubscriptionVerification");
        Assert.assertEquals(onSubscriptionVerification.getAsJsonObject("return")
                        .getAsJsonObject("type").get("name").getAsString(),
                "SubscriptionVerificationSuccess|SubscriptionVerificationError");
    }

    @Test
    public void testGoogleCalendarSchemaServices() {
        JsonArray services = load("ballerinax/trigger.google.calendar");
        JsonObject service = serviceNamed(services, "CalendarService");

        Assert.assertEquals(service.getAsJsonObject("listener").get("name").getAsString(),
                "calendar:Listener");
        Assert.assertEquals(methodNames(service),
                List.of("onNewEvent", "onEventUpdate", "onEventDelete"));

        JsonObject onNewEvent = methodNamed(service, "onNewEvent");
        Assert.assertEquals(onNewEvent.get("type").getAsString(), "remote");
        Assert.assertEquals(paramNames(onNewEvent), List.of("payload"));
        assertInternalLink(paramNamed(onNewEvent, "payload"), "Event");
        Assert.assertEquals(onNewEvent.getAsJsonObject("return")
                .getAsJsonObject("type").get("name").getAsString(), "error?");
    }

    /**
     * smb and websub were never in the service-index {@code Annotation} table. They are no longer
     * a special case: every library's catalog is built from the Semantic Model, so these assert
     * the same path every other library takes, through {@code CopilotLibraryManager}.
     */
    @Test
    public void testNetNewLibraryAnnotationsReachTheCatalog() {
        List<Annotation> smb = libraryAnnotations("ballerina/smb");

        Annotation serviceConfig = annotationNamed(smb, "ServiceConfig", "SERVICE");
        Assert.assertNotNull(serviceConfig.getDescription(),
                "Semantic-Model annotations carry the library's doc comment");
        Assert.assertFalse(serviceConfig.getDescription().isEmpty(),
                "Semantic-Model annotations carry the library's doc comment");
        assertInternalTypeConstraint(serviceConfig, "SmbServiceConfig");

        // smb declares FunctionConfig `on service remote function`, which the compiler reports as RESOURCE
        // (its constant for that Ballerina attach point — the enum has no SERVICE_REMOTE). It is emitted
        // verbatim; it is not reclassified.
        //
        // This used to track whatever Central served, because `libraryAnnotations` went through
        // CopilotLibraryManager's version-less overload. It no longer does: the manager takes pinned
        // versions, so this reads the corpus pin like every other assertion here. The distinction the
        // attach point turns on is a real one — smb 1.0.2 declared the same annotation `on function`
        // (reported FUNCTION) and 2.0.1 moved it — which is exactly why it must not be resolved against
        // whichever release happens to be latest.
        annotationNamed(smb, "FunctionConfig", "RESOURCE");

        annotationNamed(libraryAnnotations("ballerina/websub"), "SubscriberServiceConfig", "SERVICE");

        // kafka likewise has no curated rows. Its `on parameter` annotation now reaches the
        // catalog instead of being dropped for sitting outside SERVICE/OBJECT_METHOD.
        annotationNamed(libraryAnnotations("ballerinax/kafka"), "Payload", "PARAMETER");
    }

    private List<Annotation> libraryAnnotations(String libraryName) {
        // Through the pinned overload, so an annotation's attach point is read from the same release
        // everything else in this class asserts against rather than from whatever Central serves latest.
        String pinned = requirePin(libraryName);
        List<Library> libraries = new CopilotLibraryManager()
                .loadFilteredLibraries(new String[]{libraryName}, PINNED_VERSIONS);
        if (libraries.isEmpty()) {
            throw unresolved(libraryName, pinned);
        }
        List<Annotation> annotations = libraries.get(0).getAnnotations();
        Assert.assertNotNull(annotations, libraryName + " should expose an annotation catalog");
        return annotations;
    }

    private static Annotation annotationNamed(List<Annotation> annotations, String name,
                                              String attachmentPoint) {
        for (Annotation annotation : annotations) {
            if (name.equals(annotation.getName())
                    && attachmentPoint.equals(annotation.getAttachmentPoint())) {
                return annotation;
            }
        }
        StringBuilder present = new StringBuilder();
        for (Annotation annotation : annotations) {
            present.append(" @").append(annotation.getName())
                    .append('/').append(annotation.getAttachmentPoint());
        }
        Assert.fail("No @" + name + " on " + attachmentPoint + " in:" + present);
        return null;
    }

    private static void assertInternalTypeConstraint(Annotation annotation, String recordName) {
        Type typeConstraint = annotation.getTypeConstraint();
        Assert.assertNotNull(typeConstraint, "@" + annotation.getName() + " must carry a type constraint");
        Assert.assertEquals(typeConstraint.getName(), recordName);
        List<TypeLink> links = typeConstraint.getLinks();
        Assert.assertNotNull(links, "@" + annotation.getName() + " type constraint must be linked");
        Assert.assertEquals(links.size(), 1, "Expected exactly one link, got: " + links.size());
        Assert.assertEquals(links.get(0).getCategory(), "internal");
        Assert.assertEquals(links.get(0).getRecordName(), recordName);
    }

    private static JsonObject mapTypeConstraint(JsonObject annotation) {
        // Adapts an annotation's typeConstraint to the shape assertInternalLink expects.
        JsonObject wrapper = new JsonObject();
        wrapper.add("type", annotation.getAsJsonObject("typeConstraint"));
        return wrapper;
    }

    // ---- fallback & pinning --------------------------------------------------------------

    @Test
    public void testNonSchemaDrivenLibraryStaysOnServiceIndex() {
        // ballerina/ai is not schema-driven -- it is in the service index and ships no trigger-metadata
        // document in either tier -- so the overload must produce exactly the SQLite-path output.
        // Not asb: asb ships a bundled document, so it goes down the schema path and is not this case.
        String library = "ballerina/ai";
        JsonArray viaOverload = load(library);
        JsonArray viaIndex = wireJson(ServiceLoader.loadAllServices(library));
        Assert.assertEquals(viaOverload, viaIndex);
    }

    /**
     * The counterpart of the test above, and the property that lets the index fallback be withheld from a
     * schema-driven library.
     *
     * <p>{@code ballerina/ftp} has BOTH sources, so it is the case where substituting one for the other is
     * possible at all. The index entry describes the same handlers with strictly fewer facts — no
     * annotation obligations, no constraints, no binding rules, no presence markers — so serving it in
     * place of the document would be a silent downgrade rather than a fallback.
     *
     * <p>Asserting both halves matters: that the two paths differ, and that the schema path is the richer
     * one. Difference alone would also be satisfied by the schema path being worse.
     */
    @Test
    public void testSchemaDrivenLibraryIsNeverSubstitutedByTheIndex() {
        String library = "ballerina/ftp";
        JsonArray viaOverload = load(library);
        JsonArray viaIndex = wireJson(ServiceLoader.loadAllServices(library));
        Assert.assertNotEquals(viaOverload, viaIndex,
                "ftp is schema-driven; the index catalog must not be what the overload returns");

        JsonObject schemaService = serviceNamed(viaOverload, "Service");
        // The spec obligation was asserted here too, and is not any more: the ftp release the corpus pins
        // declares no service-scope annotation, so there is none to carry. The claim this test makes is
        // unaffected — the two assertions below are each a fact the index has no column for, which is what
        // makes the schema path the richer of the two rather than merely a different one.
        JsonObject onFileCsv = methodNamed(schemaService, "onFileCsv");
        Assert.assertTrue(onFileCsv.has("optional"),
                "the schema path states whether a handler must be implemented; the index does not");
        Assert.assertTrue(paramNamed(onFileCsv, "content").has("binding"),
                "the schema path carries the spec binding rule; the index has no equivalent");
    }

    @Test
    public void testTriggerSourcePropertyPinsToIndex() {
        System.setProperty("ballerina.copilot.triggerSource", "index");
        try {
            String library = "ballerinax/kafka";
            // Resolved here rather than through `load` to bypass its cache, since this assertion needs the
            // triggerSource property to be in force during the load — but at the corpus pin, not at latest,
            // so the comparison is against the same release everything else here reads.
            String[] parts = library.split("/");
            String version = requirePin(library);
            Optional<Package> pkgOpt = PackageUtil.getModulePackage(
                    PackageUtil.getSampleProject(), parts[0], parts[1], version);
            if (pkgOpt.isEmpty()) {
                throw unresolved(library, version);
            }
            Package pkg = pkgOpt.get();
            SemanticModel semanticModel = PackageUtil.getCompilation(pkg)
                    .getSemanticModel(pkg.getDefaultModule().moduleId());
            JsonArray pinned = wireJson(ServiceLoader.loadAllServices(library, pkg, semanticModel));
            JsonArray viaIndex = wireJson(ServiceLoader.loadAllServices(library));
            Assert.assertEquals(pinned, viaIndex,
                    "triggerSource=index must force the SQLite path even for schema-driven libraries");
        } finally {
            System.clearProperty("ballerina.copilot.triggerSource");
        }
    }

    // ---- the curated overlay is additive on the schema path -------------------------------------

    @Test
    public void testACuratedOverlayNoLongerDeletesTheMetadataDocument() {
        // ballerina/http declares `type.name = "Service"` and generic-services.json declares a curated
        // entry of the same name, so the name collision used to drop the ENTIRE metadata-derived entry:
        // 8 method values, 3 path forms, 6 parameter slots, 7 annotation references (including the
        // corpus's only `attachPoint: "return"`) and a dataBindingRules rule reached the prompt nowhere.
        // The two sources are not substitutes — the document states facts, the curated file states the
        // conventions a document deliberately cannot carry — so a collision now merges instead of replacing.
        JsonObject service = serviceNamed(load("ballerina/http"), "Service");
        Assert.assertEquals(service.get("type").getAsString(), "fixed",
                "the metadata-derived entry must survive the collision, not be replaced by the curated one");
        Assert.assertTrue(service.has("handlerTemplates"),
                "http is an addMode:\"many\" catalog, so its shape must reach the wire: " + service);
        Assert.assertTrue(service.has("identifier"),
                "the spec's required base path is stated by the document and must survive");
        // The fourth assertion -- that the curated guidance is carried onto the surviving entry -- and the
        // testTheCuratedGuidanceIsTheLibrarysOwnServiceMarkdown case that checked the absorbed text both
        // asserted the content of copilot/instructions/ballerina/http/service.md. That file (with the other
        // eight curated .md overlays) was deleted when this branch adopted the upstream documentation policy
        // wholesale, so those two assertions have no subject left: no library ships a curated overlay, and
        // `instructions` is absent from every service on the wire. The merge behaviour they guarded -- a
        // name collision must not delete the metadata-derived entry -- is still fully covered by the three
        // assertions above, which is the regression this test was written for.
    }

    @Test
    public void testGraphqlRendersEveryWildcardShapeNotJustTheFirst() {
        // graphql declares three "*" options where the spec allows one: a query (resource/get), a mutation
        // (remote) and a subscription (resource/subscribe, returning a stream). They differ in kind,
        // accessor and return, so taking only the first deleted two thirds of the handler surface.
        JsonObject service = serviceNamed(load("ballerina/graphql"), "Service");
        JsonArray templates = service.getAsJsonArray("handlerTemplates");
        Assert.assertNotNull(templates, "graphql's wildcard shapes must reach the wire: " + service);
        Assert.assertEquals(templates.size(), 3, "every wildcard shape must survive: " + templates);

        // Spec v2 removed `graphqlOperation` from the document and from the wire, so the shapes are told
        // apart by the two facts that remain: the handler kind, and — for a resource — its accessor. A
        // query is `resource`/`get`, a mutation is a `remote` method with no accessor, and a subscription
        // is `resource`/`subscribe`. Pinning the pairs in sequence is what proves all three survived AND
        // that document order held; asserting only the count would pass on three copies of the query.
        List<String> shapes = new ArrayList<>();
        for (JsonElement element : templates) {
            JsonObject template = element.getAsJsonObject();
            Assert.assertTrue(template.has("type"), "each shape must state its kind: " + template);
            shapes.add(template.get("type").getAsString()
                    + (template.has("accessor") ? "/" + template.get("accessor").getAsString() : ""));
        }
        Assert.assertEquals(shapes, List.of("resource/get", "remote", "resource/subscribe"),
                "document order is preserved");
    }

    // ---- Trigger Construct Spec v1.0, 2026-08-19 revision --------------------------------

    /**
     * Spec §2/§3 {@code doc}: the two prose fields the revision made required reach the catalog.
     *
     * <p>Neither is recoverable from a symbol, which is the whole reason the spec suspends its own
     * "leave out what introspection recovers" rule for them. A service type's own object type carries no
     * doc comment worth reading — {@code kafka:Service} is a marker that declares nothing — and a class
     * named {@code Listener} in a package named {@code kafka} says only that something listens.
     */
    @Test
    public void testServiceAndListenerDocsReachTheCatalog() {
        JsonObject service = serviceNamed(load("ballerinax/kafka"), "Service");
        Assert.assertTrue(service.has("description"),
                "the spec §3 makes `doc` required on every service type: " + service);
        Assert.assertTrue(service.get("description").getAsString().contains("subscribed topics"),
                service.get("description").getAsString());

        JsonObject listener = service.getAsJsonObject("listener");
        Assert.assertTrue(listener.has("description"),
                "the spec §2 makes `doc` required on every listener: " + listener);
        Assert.assertFalse(listener.get("description").getAsString().isBlank());
    }

    /**
     * Spec §2 {@code listeners[].services}: a service type hosted by more than one listener says so.
     *
     * <p>{@code ballerina/mcp} is the case that made the multi-listener path live — it lists all four of
     * its service types under both {@code StreamableHttpListener} and {@code Listener}, where every other
     * corpus document declares one listener. The pairing tier still writes one into the
     * {@code on new …} clause, so without this the stdio transport would exist in the document and nowhere
     * in the catalog.
     *
     * <p>The alternative is asserted to be a class the resolved package declares, for the same reason the
     * primary listener is: offering a transport whose {@code on new mcp:X(...)} does not compile is worse
     * than offering none.
     */
    @Test
    public void testMcpStatesTheOtherListenerItsServicesMayAttachTo() {
        JsonArray services = load(MCP);
        Set<String> declared = declaredNames(MCP);
        int stated = 0;
        for (JsonElement element : services) {
            JsonObject svc = element.getAsJsonObject();
            JsonArray alternatives = svc.getAsJsonArray("alternativeListeners");
            if (alternatives == null) {
                continue;
            }
            for (JsonElement alternative : alternatives) {
                String name = alternative.getAsString();
                assertListenerIsDeclared(name, declared);
                Assert.assertNotEquals(name, svc.getAsJsonObject("listener").get("name").getAsString(),
                        "a listener is never an alternative to itself");
                stated++;
            }
        }
        Assert.assertTrue(stated > 0,
                "mcp declares two listeners hosting the same service types; the second must be stated: "
                        + services);
    }

    /**
     * The counterpart: a single-listener document states nothing, which is every other library.
     *
     * <p>Worth pinning because the field is only correct as an exception. Emitted unconditionally it would
     * put a line on every trigger service in the catalog restating the listener the declaration already
     * names.
     */
    @Test
    public void testASingleListenerLibraryStatesNoAlternative() {
        for (JsonElement element : load("ballerinax/kafka")) {
            Assert.assertFalse(element.getAsJsonObject().has("alternativeListeners"),
                    "kafka declares one listener, so there is no alternative to state: " + element);
        }
    }

    /**
     * Spec §6.1.1: a {@code handler} subject addresses its handler by <b>id</b>, and a
     * {@code structure.atLeastOne} over a <b>single</b> subject is legal.
     *
     * <p>graphql is the case the spec cites and the case that was being lost: all three of its handler
     * shapes are {@code addMode: "many"} and so named {@code "*"}, so only the id tells the query shape
     * from the mutation and subscription ones — and the previous two-subject floor dropped the rule whole,
     * saying nothing about a constraint that decides whether the generated schema is valid at all.
     *
     * <p>The subject's rendered {@code name} is asserted too: {@code "*"} names nothing a reader could look
     * for, so the label has to come from the id's own segment.
     */
    @Test
    public void testGraphqlSingleSubjectConstraintSurvivesAndIsAddressedById() {
        JsonObject service = serviceNamed(load("ballerina/graphql"), "Service");
        JsonArray constraints = service.getAsJsonArray("constraints");
        Assert.assertNotNull(constraints, "graphql's atLeastOne rule must reach the wire: " + service);
        Assert.assertEquals(constraints.size(), 1, constraints.toString());

        JsonObject constraint = constraints.get(0).getAsJsonObject();
        Assert.assertEquals(constraint.get("rule").getAsString(), "structure.atLeastOne");
        JsonArray subjects = constraint.getAsJsonArray("subjects");
        Assert.assertEquals(subjects.size(), 1, "a single subject is a legal atLeastOne: " + subjects);

        JsonObject subject = subjects.get(0).getAsJsonObject();
        Assert.assertEquals(subject.get("kind").getAsString(), "handler");
        Assert.assertEquals(subject.get("id").getAsString(), "$service.query",
                "the id the document addressed the handler by travels for traceability");
        Assert.assertEquals(subject.get("name").getAsString(), "query",
                "a `many` option is named `*`, so the reader-facing label comes from the id's own segment");
    }

    /**
     * Spec §5.4/§8: a return-scope annotation now reaches the consumer through {@code returns.annotations}.
     *
     * <p>The list moved off the handler's {@code returnAnnotations} sibling, so a consumer still reading the
     * old key would parse the document without complaint and emit no return obligation at all.
     * {@code ballerina/http}'s {@code $cache} is the corpus instance.
     */
    @Test
    public void testHttpReturnAnnotationIsReadFromTheReturnObject() {
        JsonObject resource = onlyHandlerTemplate(load("ballerina/http"));
        JsonObject returnInfo = resource.getAsJsonObject("return");
        JsonArray refs = returnInfo.getAsJsonArray("annotationRefs");
        Assert.assertNotNull(refs, "http's $cache attaches to the return: " + returnInfo);
        Assert.assertEquals(refs.size(), 1, refs.toString());
        Assert.assertEquals(refs.get(0).getAsJsonObject().get("name").getAsString(), "Cache");
        Assert.assertEquals(refs.get(0).getAsJsonObject().get("attachPoint").getAsString(), "return");
    }

    /**
     * Spec §9.1 and §1.4: a return carries its own data binding, and an envelope may name a subtype family.
     *
     * <p>The outbound counterpart of a parameter's binding — the declared return type is what the runtime
     * serializes out — and the only statement anywhere that an HTTP resource may return a narrower type
     * than the {@code anydata} its union names. The {@code subtypeFamily} flag on the envelope is what
     * separates "include this one record" from "include any of {@code http:Ok}, {@code http:Created}, or a
     * narrowing you declare yourself", which no other field on the page can express.
     */
    @Test
    public void testHttpReturnCarriesItsDataBindingAndSubtypeFamily() {
        JsonObject resource = onlyHandlerTemplate(load("ballerina/http"));
        JsonObject binding = resource.getAsJsonObject("return").getAsJsonObject("binding");
        Assert.assertNotNull(binding, "spec §9.1: http's resource return binds: " + resource);

        JsonArray variants = binding.getAsJsonArray("typedescs");
        Assert.assertEquals(variants.size(), 2, "a bare branch and an envelope branch: " + variants);
        Assert.assertEquals(variants.get(0).getAsJsonObject().getAsJsonObject("constraint")
                .get("name").getAsString(), "anydata");

        JsonObject envelope = variants.get(1).getAsJsonObject().getAsJsonArray("shapes").get(0)
                .getAsJsonObject().getAsJsonObject("envelope");
        Assert.assertEquals(envelope.get("name").getAsString(), "StatusCodeResponse");
        Assert.assertTrue(envelope.has("subtypeFamily") && envelope.get("subtypeFamily").getAsBoolean(),
                "spec §1.4: the envelope is a family, not one record: " + envelope);
    }

    /**
     * Spec §9.1 for a streamed return: graphql's subscription binds the stream's <i>element</i>.
     *
     * <p>Distinct from the bare case above and worth its own assertion: the bindable part is each value the
     * stream yields, not the stream, so a consumer that read the shape as bare would tell a reader to
     * declare a return type where a stream is required.
     */
    @Test
    public void testGraphqlSubscriptionReturnBindsItsStreamElement() {
        JsonArray templates = serviceNamed(load("ballerina/graphql"), "Service")
                .getAsJsonArray("handlerTemplates");
        JsonObject subscription = templates.get(2).getAsJsonObject();
        Assert.assertEquals(subscription.get("accessor").getAsString(), "subscribe", subscription.toString());

        JsonObject binding = subscription.getAsJsonObject("return").getAsJsonObject("binding");
        Assert.assertNotNull(binding, "graphql's subscription return binds: " + subscription);
        JsonObject shape = binding.getAsJsonArray("typedescs").get(0).getAsJsonObject()
                .getAsJsonArray("shapes").get(0).getAsJsonObject();
        Assert.assertEquals(shape.get("form").getAsString(), "stream");
        Assert.assertEquals(shape.get("element").getAsString(), "bare");
    }

    /**
     * Every newly bundled document, against the release the build actually provisions.
     *
     * <h2>Why this exists</h2>
     *
     * <p>The 2026-08-19 corpus added eighteen documents for libraries that previously had none. A document
     * is only as good as its agreement with a real package: it names a listener class, service object
     * types and handler parameter types, and every one of those is validated against the resolved release
     * before anything is emitted. When the agreement fails the pipeline is deliberately silent about
     * recovering — it returns an empty catalog and withholds the SQLite fallback, on the grounds that a
     * thinner catalog presented as authoritative hides the defect. That is the right behaviour and it is
     * also invisible, so it needs a test that names the number.
     *
     * <p>Schema validity does not cover this. A document can validate perfectly and still describe a
     * release that does not exist.
     *
     * <h2>What each expectation means</h2>
     *
     * <p>The minimum service count, not the exact one: a library may gain a service type without this
     * test having an opinion, but it may never lose its whole catalog silently. Zero is stated only where
     * zero is the known, understood outcome, and never as a default.
     *
     * <p>The nine libraries here are those the build provisions. Seven more documents ship for libraries
     * that are not in {@code build-config/ballerina_dependencies} — {@code aws.sqs},
     * {@code azure.storage.files}, {@code googleapis.chat}, {@code sap.jco}, {@code telegram},
     * {@code trigger.twilio} and {@code whatsapp.business} — so nothing here can resolve them. Adding one
     * to that project's {@code Ballerina.toml} and to {@code copilotCorpusLibraries} is all it takes to
     * bring it under this test.
     */
    @Test
    public void testNewlyBundledDocumentsMatchTheirPackage() {
        Map<String, Integer> minimumServices = new HashMap<>();
        minimumServices.put("ballerinax/mysql", 1);
        minimumServices.put("ballerinax/postgresql", 1);
        minimumServices.put("ballerinax/salesforce", 2);
        minimumServices.put("ballerinax/solace", 1);
        minimumServices.put("ballerinax/solace.jms", 1);
        minimumServices.put("ballerina/mqtt", 1);
        minimumServices.put("ballerinax/trigger.shopify", 4);
        minimumServices.put("ballerinax/trigger.hubspot", 7);
        // ballerinax/oracledb 1.14.0 declares no listener class at all — CDC is not in that release, and
        // its sibling packages (mssql 1.19.0, mysql 1.18.0, postgresql 1.17.0) each declare
        // `public isolated class CdcListener` where oracledb declares nothing. The document is therefore
        // ahead of the pinned release rather than wrong: it also names `ballerinax/oracledb.cdc.driver`
        // 1.0.0, which the same release does not ship.
        //
        // Zero costs nothing here — the SQLite index has no oracledb listener either, so the library had
        // no catalog before the document arrived and has none now. It is pinned at zero rather than left
        // untested so that the release which fixes it shows up as a failing expectation to update, not as
        // a change nobody notices.
        minimumServices.put("ballerinax/oracledb", 0);

        for (Map.Entry<String, Integer> expected : minimumServices.entrySet()) {
            JsonArray services = load(expected.getKey());
            Assert.assertTrue(services.size() >= expected.getValue(),
                    expected.getKey() + ": expected at least " + expected.getValue()
                            + " service(s) from its trigger-metadata document, got " + services.size()
                            + ". A newly empty catalog means the document no longer agrees with the"
                            + " resolved release — check the veto report for the listener or service type"
                            + " it names.");
            for (JsonElement element : services) {
                JsonObject service = element.getAsJsonObject();
                Assert.assertEquals(service.get("type").getAsString(), "fixed",
                        expected.getKey() + ": a metadata-derived entry is always `fixed`: " + service);
                Assert.assertTrue(service.has("description"),
                        expected.getKey() + ": the spec §3 makes `doc` required: " + service);
                Assert.assertTrue(service.getAsJsonObject("listener").has("description"),
                        expected.getKey() + ": the spec §2 makes `doc` required: " + service);
            }
        }
    }

    /** The single {@code addMode: "many"} shape a service declares, for the libraries that declare one. */
    private static JsonObject onlyHandlerTemplate(JsonArray services) {
        JsonObject service = serviceNamed(services, "Service");
        JsonArray templates = service.getAsJsonArray("handlerTemplates");
        Assert.assertNotNull(templates, "expected an addMode:\"many\" catalog: " + service);
        Assert.assertEquals(templates.size(), 1, templates.toString());
        return templates.get(0).getAsJsonObject();
    }

    @Test
    public void testAnIndexDerivedEntryStillYieldsToTheCuratedOverlay() {
        // The additive rule is scoped to the schema path on purpose. An index row carries a listener and a
        // method list and nothing else — which is precisely why the curated prose was written — so there is
        // nothing in it worth preserving alongside, and the SQLite path keeps its replace semantics.
        for (String library : new String[]{"ballerina/http", "ballerina/graphql"}) {
            JsonArray viaIndex = wireJson(ServiceLoader.loadAllServices(library));
            boolean hasGeneric = false;
            for (JsonElement element : viaIndex) {
                JsonObject svc = element.getAsJsonObject();
                if (svc.has("type") && "generic".equals(svc.get("type").getAsString())) {
                    hasGeneric = true;
                }
            }
            Assert.assertTrue(hasGeneric,
                    "the SQLite path must still emit the curated generic entry for " + library);
        }
    }
}
