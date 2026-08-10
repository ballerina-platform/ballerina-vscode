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
import io.ballerina.servicemodelgenerator.extension.builder.function.SchemaDrivenFunctionBuilder;
import io.ballerina.servicemodelgenerator.extension.connector.adapter.TriggerServiceAdapter;
import io.ballerina.servicemodelgenerator.extension.model.Function;
import io.ballerina.servicemodelgenerator.extension.model.Parameter;
import io.ballerina.servicemodelgenerator.extension.model.Service;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import io.ballerina.servicemodelgenerator.extension.util.Utils;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.HashMap;
import java.util.List;

/**
 * Unit test for the wire-level shape of a grouped/repeatable schema function catalog: FTP's file-format
 * handlers (onFileCsv/onFileJson/…) share the {@code onCreate} group as {@code ONE_EACH_PER_GROUP},
 * carrying the handler-catalog fields ({@code group}/{@code variantLabel}/{@code addLabel}/
 * {@code repeatable}), the composed payload parameter, the composition flags (stream / metadata
 * markers) and the function-level annotation tree — the wire contract the generic front-end handler
 * form consumes. Also covers the save-side collapse of an edited COMPLEX_FUNCTION_ANNOTATION tree into
 * an emitted {@code @ftp:FunctionConfig {...}} attachment.
 *
 * <p>These handlers are pre-expanded in FTP's own {@code trigger-ui-schema.json} (each format is its own
 * top-level schemaFunction), not fanned out at runtime from a single VARIATION_SELECTOR parameter.
 * None of the 15 currently bundled trigger models use the runtime VARIANT-parameter expansion mechanism
 * {@link TriggerServiceAdapter} still supports (FTP itself was refactored away from it), so this class
 * verifies the wire-level shape grouped/repeatable handlers must have, not the fan-out algorithm itself.
 *
 * @since 1.9.0
 */
public class TriggerFunctionExpansionTest {

    /** The shipped FTP model: file-format handlers pre-expanded, sharing the {@code onCreate} group. */
    private Service ftpTemplate() {
        TriggerUISchemaModel model = TriggerModelReader.getInstance().getBundledTriggerModel("ftp").orElseThrow();
        return TriggerServiceAdapter.toServiceTemplate(model, "Service", "ballerina", "ftp", "ftp");
    }

    /** Looks a handler up across the template's present functions and its addable catalog. */
    private static Function byName(Service service, String name) {
        return java.util.stream.Stream.concat(
                        service.getFunctions().stream(),
                        service.getSchemaFunctions() == null ? java.util.stream.Stream.<Function>empty()
                                : service.getSchemaFunctions().stream())
                .filter(f -> name.equals(f.getName().getValue()))
                .findFirst().orElse(null);
    }

    @Test
    public void testGroupedHandlersCarryCatalogFields() {
        Service service = ftpTemplate();
        // onFileCsv/onFileJson/onFileXml/onFileText/onFile (5 formats) + onFileDelete/onFileChange/
        // onError are all addable wire functions, all in the catalog (schemaFunctions) — ftp ships no
        // present handlers by default.
        List<String> names = service.getSchemaFunctions().stream().map(f -> f.getName().getValue()).toList();
        for (String expected : List.of("onFileCsv", "onFileJson", "onFileXml", "onFileText", "onFile")) {
            Assert.assertTrue(names.contains(expected), expected + " missing from " + names);
        }

        Function csv = byName(service, "onFileCsv");
        Assert.assertEquals(csv.getGroup(), "onCreate", "format variants must share the schema group id");
        Assert.assertEquals(csv.getVariantLabel(), "CSV");
        Assert.assertEquals(csv.getRepeatable(), Repeatable.ONE_EACH_PER_GROUP,
                "grouped file-format variants are each addable once");
        Assert.assertFalse(csv.isEnabled(), "schemaFunction templates ship disabled (addable)");

        Function raw = byName(service, "onFile");
        Assert.assertEquals(raw.getGroup(), "onCreate");
        Assert.assertEquals(raw.getVariantLabel(), "Raw Bytes");
    }

    @Test
    public void testPayloadParameterComposition() {
        Service service = ftpTemplate();
        Function csv = byName(service, "onFileCsv");

        Parameter content = csv.getParameters().stream()
                .filter(p -> "content".equals(p.getName().getValue())).findFirst().orElseThrow();
        Assert.assertEquals(content.getKind(), "DATA_BINDING", "bindable payload -> DATA_BINDING");
        Assert.assertEquals(content.getType().getValue(), "string[][]",
                "CSV composes element(defaultType string[]) through template {{type}}[]");
        Assert.assertEquals(content.getType().getCodedata().getTemplate(), "{{type}}[]");
        Assert.assertEquals(content.getType().getCodedata().getBindable(), Boolean.TRUE);
        Assert.assertEquals(content.getType().getCodedata().getDefaultType(), "string[]");

        // Composition flags surface as wire properties for the UI, keyed as declared in the model.
        Value stream = csv.getProperty("stream");
        Assert.assertNotNull(stream, "PAYLOAD_MODIFIER flag must surface as a wire property");
        Assert.assertEquals(stream.getCodedata().getType(), "PAYLOAD_MODIFIER");
        Assert.assertEquals(stream.getCodedata().getTemplate(), "stream<{{type}}, error?>");
        Value rows = csv.getProperty("rows");
        Assert.assertNotNull(rows, "METADATA_FLAG marker must surface as a wire property");
        Assert.assertEquals(rows.getCodedata().getType(), "METADATA_FLAG");

        // Text is a locked (non-bindable) variant: plain REQUIRED string param, no data binding.
        Function text = byName(service, "onFileText");
        Parameter textContent = text.getParameters().stream()
                .filter(p -> "content".equals(p.getName().getValue())).findFirst().orElseThrow();
        Assert.assertEquals(textContent.getKind(), "REQUIRED");
        Assert.assertEquals(textContent.getType().getValue(), "string");

        // Framework params keep their include-checkbox contract: advanced + disabled until ticked.
        Parameter caller = csv.getParameters().stream()
                .filter(p -> "caller".equals(p.getName().getValue())).findFirst().orElseThrow();
        Assert.assertTrue(caller.isAdvanced(), "caller is an opt-in framework param");
        Assert.assertFalse(caller.isEnabled());
        Assert.assertEquals(caller.getType().getValue(), "ftp:Caller");
    }

    @Test
    public void testVariantlessComplexPayloadSurfacesCompositionFlags() {
        // Each FTP file format is its own schemaFunction, whose `content` parameter is a
        // COMPLEX_PAYLOAD directly rather than under a VARIATION_SELECTOR. Its composition siblings
        // (the `stream` toggle, the `rows` marker) must still surface as wire properties, or the
        // handler form renders neither.
        Service ftp = ftpTemplate();
        Function csv = byName(ftp, "onFileCsv");
        Assert.assertNotNull(csv, "onFileCsv must be an addable FTP handler");
        Assert.assertEquals(csv.getGroup(), "onCreate", "FTP file-format variants share the onCreate group");

        Parameter content = csv.getParameters().stream()
                .filter(p -> "content".equals(p.getName().getValue())).findFirst().orElseThrow();
        Assert.assertEquals(content.getKind(), "DATA_BINDING");
        Assert.assertEquals(content.getType().getValue(), "string[][]",
                "CSV composes element(defaultType string[]) through template {{type}}[]");

        Value stream = csv.getProperty("stream");
        Assert.assertNotNull(stream, "variant-less COMPLEX_PAYLOAD must still surface the PAYLOAD_MODIFIER toggle");
        Assert.assertEquals(stream.getCodedata().getType(), "PAYLOAD_MODIFIER");
        Assert.assertEquals(stream.getCodedata().getTemplate(), "stream<{{type}}, error?>");
        Value rows = csv.getProperty("rows");
        Assert.assertNotNull(rows, "variant-less COMPLEX_PAYLOAD must still surface the METADATA_FLAG marker");
        Assert.assertEquals(rows.getCodedata().getType(), "METADATA_FLAG");

        // A payload with no composition siblings (JSON) adds no spurious flags.
        Function json = byName(ftp, "onFileJson");
        Assert.assertNotNull(json, "onFileJson must be an addable FTP handler");
        Assert.assertNull(json.getProperty("stream"), "JSON payload has no stream toggle");
        Assert.assertNull(json.getProperty("rows"), "JSON payload has no rows marker");
    }

    @Test
    public void testComplexAnnotationCollapsesToAttachmentOnSave() {
        Service service = ftpTemplate();
        Function csv = byName(service, "onFileCsv");

        Value functionConfig = csv.getProperty("afterFileProcessing");
        Assert.assertNotNull(functionConfig, "annotation tree must ride the wire function");
        Assert.assertEquals(functionConfig.getCodedata().getType(), "COMPLEX_FUNCTION_ANNOTATION");

        // Simulate the UI: only the "on success -> move to" mapping field is ticked, with a custom
        // destination (the shape the string field produces). For an OPTIONAL_FIELD node, inclusion is
        // driven by its own `value` (the include flag), not `enabled`.
        Value afterProcess = functionConfig.getProperties().get("afterProcess");
        afterProcess.setValue(Boolean.TRUE);
        Value afterError = functionConfig.getProperties().get("afterError");
        afterError.setValue(Boolean.FALSE);
        Value moveTo = afterProcess.getProperties().get("action").getChoices().get(0).getProperties().get("moveTo");
        moveTo.setValue("/tmp/archive");

        SchemaDrivenFunctionBuilder.renderComplexAnnotations(csv);
        String source = Utils.generateFunctionDefSource(csv, List.of(),
                Utils.FunctionAddContext.TRIGGER_ADD, Utils.FunctionSignatureContext.FUNCTION_ADD, new HashMap<>());
        Assert.assertTrue(source.contains("@ftp:FunctionConfig{afterProcess: {moveTo: \"/tmp/archive\"}}"),
                "annotation must render above the handler; got:\n" + source);
        Assert.assertTrue(source.contains("remote function onFileCsv(string[][] content, ftp:Caller caller)")
                        || source.contains("remote function onFileCsv(string[][] content)"),
                "variant signature must compose payload + required params; got:\n" + source);
    }

    @Test
    public void testUncheckedAnnotationEmitsNothing() {
        Service service = ftpTemplate();
        Function csv = byName(service, "onFileCsv");
        Value functionConfig = csv.getProperty("afterFileProcessing");
        functionConfig.getProperties().get("afterProcess").setValue(Boolean.FALSE);
        functionConfig.getProperties().get("afterError").setValue(Boolean.FALSE);

        // No enabled mapping fields -> the whole @FunctionConfig attachment is skipped.
        SchemaDrivenFunctionBuilder.renderComplexAnnotations(csv);
        String source = Utils.generateFunctionDefSource(csv, List.of(),
                Utils.FunctionAddContext.TRIGGER_ADD, Utils.FunctionSignatureContext.FUNCTION_ADD, new HashMap<>());
        Assert.assertFalse(source.contains("FunctionConfig"),
                "no enabled mapping fields -> no annotation; got:\n" + source);
    }
}
