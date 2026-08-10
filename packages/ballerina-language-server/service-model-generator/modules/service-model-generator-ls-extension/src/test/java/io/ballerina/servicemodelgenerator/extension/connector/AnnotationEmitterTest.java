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

import io.ballerina.modelgenerator.commons.trigger.models.TriggerUISchemaModel;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Unit test for {@link AnnotationEmitter} and the annotation wiring in
 * {@link SchemaDrivenSourceGenerator#buildFunctionSource}: the granular {@code codedata} roles
 * (COMPLEX_FUNCTION_ANNOTATION -> MAPPING_FIELD -> FIELD_VALUE_CHOICE -> MAPPING_CONSTRUCTOR) emit a
 * well-formed {@code @ftp:FunctionConfig { ... }}. Leaf rendering (string quoting) derives from the
 * leaf's declared types[].
 *
 * @since 1.9.0
 */
public class AnnotationEmitterTest {

    private TriggerUISchemaModel.FunctionModel onFileCsv() {
        TriggerUISchemaModel model = TriggerModelReader.getInstance().getBundledTriggerModel("ftp").orElseThrow();
        return model.serviceTypes().getFirst().schemaFunctions().stream()
                .filter(f -> "onFileCsv".equals(f.name())).findFirst().orElseThrow();
    }

    @Test
    public void testFunctionConfigAnnotationEmitsCorrectly() throws Exception {
        List<String> annotations = AnnotationEmitter.annotationsOf(onFileCsv().properties());
        Assert.assertEquals(annotations.size(), 1, "one @ftp:FunctionConfig annotation expected");
        // moveTo's string type quotes its value; optional fields (checked) emit; the selected
        // FIELD_VALUE_CHOICE branch (MOVE -> MAPPING_CONSTRUCTOR) is used.
        Assert.assertEquals(annotations.getFirst(),
                "@ftp:FunctionConfig {afterProcess: {moveTo: \"/home/processed\"}, "
                        + "afterError: {moveTo: \"/home/failed\"}}");
    }

    @Test
    public void testAnnotationsOfSkipsAttachmentWhenEveryOptionalFieldIsUnchecked() {
        // Regression: annotationsOf (add-time) used to always emit the attachment even with an empty
        // body (e.g. `@ftp:FunctionConfig {}`), unlike annotationBody (update-time) which already
        // skipped it. No bundled schema hits this today (every COMPLEX_FUNCTION_ANNOTATION ships at
        // least one field enabled by default) but the two entry points must agree once one does.
        Map<String, TriggerUISchemaModel.Property> fields = new LinkedHashMap<>();
        fields.put("afterProcess", leaf(false, null, "afterProcess", true));
        fields.put("afterError", leaf(false, null, "afterError", true));
        Map<String, TriggerUISchemaModel.Property> properties = new LinkedHashMap<>();
        properties.put("config", annotationNode("ftp", "FunctionConfig", fields));

        List<String> annotations = AnnotationEmitter.annotationsOf(properties);
        Assert.assertTrue(annotations.isEmpty(),
                "an annotation whose body renders empty (every optional field unchecked) must be "
                        + "skipped entirely, matching annotationBody's behavior, got: " + annotations);
    }

    private static TriggerUISchemaModel.Property leaf(boolean enabled, String value, String field, boolean optional) {
        TriggerUISchemaModel.Codedata codedata = new TriggerUISchemaModel.Codedata(null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, field, optional,
                null, null, null, null, null);
        return new TriggerUISchemaModel.Property(null, enabled, true, optional, false, null, value, null, null,
                null, null, codedata, null);
    }

    private static TriggerUISchemaModel.Property annotationNode(String module, String name,
                                                         Map<String, TriggerUISchemaModel.Property> fields) {
        TriggerUISchemaModel.Codedata codedata = new TriggerUISchemaModel.Codedata("COMPLEX_FUNCTION_ANNOTATION", null,
                name, module, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null);
        return new TriggerUISchemaModel.Property(null, true, true, false, false, null, null, null, null, null,
                fields, codedata, null);
    }

    @Test
    public void testBuildFunctionSourceEmitsAnnotationVariantNameAndComposedType() throws Exception {
        String source = SchemaDrivenSourceGenerator.buildFunctionSource(onFileCsv());
        Assert.assertTrue(source.contains("@ftp:FunctionConfig {afterProcess:"),
                "annotation should sit above the function: " + source);
        // The VARIATION_SELECTOR (default CSV) fans out to the CSV variant's originalName.
        Assert.assertTrue(source.contains("function onFileCsv("),
                "variant handler name should resolve to the selected variant: " + source);
        // The content param's composed type (default CSV payload string[] wrapped by {{type}}[]).
        Assert.assertTrue(source.contains("string[][]"),
                "the variant payload should compose to string[][]: " + source);
    }
}
