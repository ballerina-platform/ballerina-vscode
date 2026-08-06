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

package io.ballerina.servicemodelgenerator.extension.connector;

import io.ballerina.modelgenerator.commons.trigger.models.Repeatable;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerUISchemaModel;
import io.ballerina.servicemodelgenerator.extension.connector.adapter.TriggerServiceAdapter;
import io.ballerina.servicemodelgenerator.extension.connector.adapter.TriggerSourceMerger;
import io.ballerina.servicemodelgenerator.extension.model.Function;
import io.ballerina.servicemodelgenerator.extension.model.Parameter;
import io.ballerina.servicemodelgenerator.extension.model.Service;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.List;

/**
 * Verifies {@link TriggerSourceMerger} preserves the schema-authored {@code optional} flag (whether the
 * designer's trash icon may remove a present handler) instead of forcing it to {@code false} for every
 * matched handler — a regression that silently disabled deletion for handlers the schema explicitly
 * marks optional (e.g. ftp's onFileDelete/onError, kafka's onError), while looking correct for
 * github/twilio purely because every one of their handlers is {@code optional: false} in the schema.
 *
 * @since 1.9.0
 */
public class TriggerSourceMergerTest {

    private TriggerUISchemaModel model(String moduleName) {
        return TriggerModelReader.getInstance().getBundledTriggerModel(moduleName).orElseThrow();
    }

    @Test
    public void testOptionalHandlerStaysOptionalOncePresentInSource() throws Exception {
        // ftp's onFileDelete is schema-optional (deletable) even once added to the source.
        Service service = TriggerServiceAdapter.toServiceTemplate(
                model("ftp"), "Service", "ballerina", "ftp", "ftp");
        TriggerSourceMerger.mergeSource(service, List.of(sourceFunction("onFileDelete", "REMOTE")));

        Function onFileDelete = findFunction(service, "onFileDelete");
        Assert.assertTrue(onFileDelete.isEnabled(), "the merged handler is present/enabled");
        Assert.assertTrue(onFileDelete.isOptional(),
                "a schema-optional handler must stay deletable once merged from source");
    }

    @Test
    public void testRequiredHandlerStaysNonOptionalOncePresentInSource() throws Exception {
        // asb's onMessage is schema-required (optional=false, not deletable): the compiler mandates
        // it, so it must stay non-optional after merge too.
        Service service = TriggerServiceAdapter.toServiceTemplate(
                model("asb"), "Service", "ballerinax", "asb", "asb");
        TriggerSourceMerger.mergeSource(service, List.of(sourceFunction("onMessage", "REMOTE")));

        Function onMessage = findFunction(service, "onMessage");
        Assert.assertTrue(onMessage.isEnabled(), "the merged handler is present/enabled");
        Assert.assertFalse(onMessage.isOptional(),
                "a schema-required handler must stay non-deletable once merged from source");
    }

    @Test
    public void testOneEachPerGroupConsumesOnlyMatchedVariant() throws Exception {
        // ftp's file-format handlers share the onCreate group as ONE_EACH_PER_GROUP: adding one
        // format consumes only that variant, leaving its siblings addable. (The old boolean model
        // treated any grouped handler as mutually exclusive, wrongly clearing the whole group.)
        Service service = TriggerServiceAdapter.toServiceTemplate(
                model("ftp"), "Service", "ballerina", "ftp", "ftp");
        TriggerSourceMerger.mergeSource(service, List.of(sourceFunction("onFileCsv", "REMOTE")));

        Assert.assertNotNull(findFunction(service, "onFileCsv"), "the added variant is present");
        List<String> addable = catalogNames(service);
        Assert.assertFalse(addable.contains("onFileCsv"), "the consumed variant leaves the catalog");
        Assert.assertTrue(addable.contains("onFileJson"), "sibling variants stay addable");
        Assert.assertTrue(addable.contains("onFileXml"), "sibling variants stay addable");
    }

    @Test
    public void testOneOfGroupConsumesEntireGroup() throws Exception {
        // Re-tag ftp's file-format group as ONE_OF_GROUP (RabbitMQ's onMessage/onRequest shape):
        // adding any one member must clear every sibling from the addable catalog.
        Service service = TriggerServiceAdapter.toServiceTemplate(
                model("ftp"), "Service", "ballerina", "ftp", "ftp");
        service.getSchemaFunctions().stream()
                .filter(fn -> "onCreate".equals(fn.getGroup()))
                .forEach(fn -> fn.setRepeatable(Repeatable.ONE_OF_GROUP));
        TriggerSourceMerger.mergeSource(service, List.of(sourceFunction("onFileCsv", "REMOTE")));

        List<String> addable = catalogNames(service);
        Assert.assertFalse(addable.contains("onFileJson"),
                "a mutually-exclusive group is fully consumed once one member is added");
        Assert.assertFalse(addable.contains("onFileXml"), "no sibling of the exclusive group remains");
    }

    @Test
    public void testLegacyHandlerHiddenFromFreshCatalog() throws Exception {
        // ftp's onFileChange is LEGACY: a service with no handlers yet (or any handlers other than
        // onFileChange) must never offer it as something new to add.
        Service service = TriggerServiceAdapter.toServiceTemplate(
                TriggerModelReader.getInstance().getBundledTriggerModel("ftp").orElseThrow(),
                "Service", "ballerina", "ftp", "ftp");
        TriggerSourceMerger.mergeSource(service, List.of());

        Assert.assertFalse(catalogNames(service).contains("onFileChange"),
                "a LEGACY handler must not be offered when it is not already present in the source");
    }

    @Test
    public void testLegacyHandlerStaysHiddenWhenAnotherHandlerIsPresent() throws Exception {
        Service service = TriggerServiceAdapter.toServiceTemplate(
                TriggerModelReader.getInstance().getBundledTriggerModel("ftp").orElseThrow(),
                "Service", "ballerina", "ftp", "ftp");
        TriggerSourceMerger.mergeSource(service, List.of(sourceFunction("onFileCsv", "REMOTE")));

        Assert.assertFalse(catalogNames(service).contains("onFileChange"),
                "a LEGACY handler must stay hidden once a different handler has been added");
    }

    @Test
    public void testLegacyHandlerConsumedDisplacesRestOfCatalog() throws Exception {
        // Once onFileChange is actually present in the source, every other schema function (not just
        // its own would-be group) must leave the addable catalog — the two are mutually incompatible
        // ways of handling file events (matches the ftp compiler plugin's MULTIPLE_CONTENT_METHODS
        // rule, generalised to the whole catalog as requested).
        Service service = TriggerServiceAdapter.toServiceTemplate(
                TriggerModelReader.getInstance().getBundledTriggerModel("ftp").orElseThrow(),
                "Service", "ballerina", "ftp", "ftp");
        TriggerSourceMerger.mergeSource(service, List.of(sourceFunction("onFileChange", "REMOTE")));

        Function onFileChange = findFunction(service, "onFileChange");
        Assert.assertTrue(onFileChange.isEnabled(), "onFileChange is present/enabled once matched");
        Assert.assertTrue(catalogNames(service).isEmpty(),
                "a consumed LEGACY handler displaces every other schema function from the catalog");
    }

    @Test
    public void testDistinctLegacyHandlersAreIndependent() throws Exception {
        // Re-tag two of ftp's format handlers as LEGACY (synthetic — ftp ships none for real): they
        // must not displace each other, and once either is present, the other stops being hidden by
        // the "not present yet" default too (independent of one another, per user request).
        Service service = TriggerServiceAdapter.toServiceTemplate(
                model("ftp"), "Service", "ballerina", "ftp", "ftp");
        service.getSchemaFunctions().stream()
                .filter(fn -> "onFileCsv".equals(fn.getName().getValue())
                        || "onFileJson".equals(fn.getName().getValue()))
                .forEach(fn -> fn.setRepeatable(Repeatable.LEGACY));
        TriggerSourceMerger.mergeSource(service, List.of(sourceFunction("onFileCsv", "REMOTE")));

        List<String> addable = catalogNames(service);
        Assert.assertTrue(addable.contains("onFileJson"),
                "a distinct LEGACY sibling stays addable once any LEGACY handler is present");
        Assert.assertFalse(addable.contains("onFileXml"),
                "a present LEGACY handler still displaces non-legacy schema functions");
    }

    @Test
    public void testLegacyHandlerParameterKeepsMatchingAcrossReadonlyIntersection() throws Exception {
        // ftp's onFileChange declares its watch-event parameter as `ftp:WatchEvent & readonly` (the
        // module's own recommended shape), but the compiler plugin also accepts the plain
        // `ftp:WatchEvent` (no readonly). Both must reconcile to the same matched, renamed parameter —
        // not fall through to a stray, unmatched "extra" parameter.
        Service service = TriggerServiceAdapter.toServiceTemplate(
                TriggerModelReader.getInstance().getBundledTriggerModel("ftp").orElseThrow(),
                "Service", "ballerina", "ftp", "ftp");
        Parameter plainWatchEvent = new Parameter.Builder()
                .kind("REQUIRED")
                .type(new Value.ValueBuilder().value("ftp:WatchEvent").build())
                .name(new Value.ValueBuilder().value("fileEvent").build())
                .build();
        TriggerSourceMerger.mergeSource(service,
                List.of(sourceFunctionWithParams("onFileChange", "REMOTE", List.of(plainWatchEvent))));

        Function onFileChange = findFunction(service, "onFileChange");
        Assert.assertEquals(onFileChange.getParameters().size(), 2,
                "the plain WatchEvent parameter must be claimed by the template, not appended as an extra");
        Parameter event = onFileChange.getParameters().get(0);
        Assert.assertTrue(event.isEnabled(), "the watch-event parameter is matched despite the readonly gap");
        Assert.assertEquals(event.getName().getValue(), "fileEvent",
                "the matched parameter takes the source's actual identifier");
    }

    private static List<String> catalogNames(Service service) {
        return service.getSchemaFunctions() == null ? List.of()
                : service.getSchemaFunctions().stream().map(fn -> fn.getName().getValue()).toList();
    }

    private static Function findFunction(Service service, String name) {
        return service.getFunctions().stream()
                .filter(f -> name.equals(f.getName().getValue()))
                .findFirst().orElseThrow(() -> new AssertionError(name + " not found in merged functions"));
    }

    /** A minimal parsed-from-source Function: just enough for {@code findTemplate} to match by name/kind. */
    private static Function sourceFunction(String name, String kind) {
        return sourceFunctionWithParams(name, kind, List.of());
    }

    private static Function sourceFunctionWithParams(String name, String kind, List<Parameter> parameters) {
        return new Function.FunctionBuilder()
                .kind(kind)
                .name(new Value.ValueBuilder().value(name).build())
                .accessor(new Value.ValueBuilder().value("").build())
                .parameters(parameters)
                .build();
    }
}
