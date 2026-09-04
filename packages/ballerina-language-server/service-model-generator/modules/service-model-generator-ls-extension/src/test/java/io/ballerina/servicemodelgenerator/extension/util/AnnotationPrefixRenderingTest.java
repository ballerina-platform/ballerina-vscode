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

package io.ballerina.servicemodelgenerator.extension.util;

import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.SyntaxTree;
import io.ballerina.servicemodelgenerator.extension.model.Codedata;
import io.ballerina.servicemodelgenerator.extension.model.Function;
import io.ballerina.servicemodelgenerator.extension.model.Service;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import io.ballerina.tools.text.TextDocuments;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Unit test for rendering an annotation attachment under the prefix the target file binds its module to.
 *
 * <p>
 * The prefix machinery itself is tested in {@code model-generator-commons}, where it lives. What is
 * specific to this module is that the model stores the annotation's module <b>identity</b> while source
 * needs the <b>prefix</b> that file binds it to, resolved at render time.
 * </p>
 *
 * @since 1.9.0
 */
public class AnnotationPrefixRenderingTest {

    private ModulePartNode rootOf(String source) {
        return (ModulePartNode) SyntaxTree.from(TextDocuments.from(source)).rootNode();
    }

    @Test
    public void testServiceAnnotationPrefixResolvesAgainstTheFile() {
        // Regression test: the model stores the annotation's module IDENTITY (`ftp`), but source needs
        // the PREFIX that file binds it to (`ftp2`). Emitting the identity wrote `@ftp:ServiceConfig`
        // into a file where `ftp` is bound to ballerina/file — silently retargeting the annotation.
        Service service = serviceWithAnnotation("ftp", "ServiceConfig", "{path: \"/\"}");
        List<String> annots = Utils.getAnnotationEdits(service,
                rootOf("import ballerina/file as ftp;\nimport ballerina/ftp as ftp2;\n"));
        Assert.assertEquals(annots, List.of("@ftp2:ServiceConfig{path: \"/\"}"),
                "the annotation must follow the prefix its own module is bound to");
    }

    @Test
    public void testServiceAnnotationKeepsNaturalPrefixWhenUnaliased() {
        // Regression guard: nothing shadows `ftp`, so output is unchanged from before.
        Service service = serviceWithAnnotation("ftp", "ServiceConfig", "{path: \"/\"}");
        Assert.assertEquals(Utils.getAnnotationEdits(service, rootOf("import ballerina/ftp;\n")),
                List.of("@ftp:ServiceConfig{path: \"/\"}"));
        Assert.assertEquals(Utils.getAnnotationEdits(service, null),
                List.of("@ftp:ServiceConfig{path: \"/\"}"),
                "with no file context the natural prefix is the only available answer");
    }

    private Service serviceWithAnnotation(String moduleName, String originalName, String body) {
        Codedata codedata = new Codedata.Builder()
                .setType("SERVICE_ANNOTATION")
                .setOriginalName(originalName)
                .setModuleName(moduleName)
                .build();
        Value annotation = new Value.ValueBuilder()
                .setCodedata(codedata)
                .value(body)
                .enabled(true)
                .editable(true)
                .build();
        return new Service.ServiceModelBuilder()
                .setProperties(new LinkedHashMap<>(Map.of("serviceConfig", annotation)))
                .build();
    }

    @Test
    public void testFunctionAnnotationPrefixResolvesAtRenderTime() {
        // The model keeps the module IDENTITY (`ftp`); the prefix is a property of the target file and is
        // resolved when rendering, rather than being written back into codedata.moduleName.
        Function function = functionWithAnnotation("ftp", "FunctionConfig", "{afterProcess: ftp2:DELETE}");
        Assert.assertEquals(
                Utils.getAnnotationEdits(function, new HashMap<>(),
                        rootOf("import ballerina/file as ftp;\nimport ballerina/ftp as ftp2;\n")),
                List.of("@ftp2:FunctionConfig{afterProcess: ftp2:DELETE}"));
        // Unaliased and no-file-context both keep the natural prefix: unchanged from before.
        Assert.assertEquals(Utils.getAnnotationEdits(function, new HashMap<>(), rootOf("import ballerina/ftp;\n")),
                List.of("@ftp:FunctionConfig{afterProcess: ftp2:DELETE}"));
        Assert.assertEquals(Utils.getAnnotationEdits(function, new HashMap<>()),
                List.of("@ftp:FunctionConfig{afterProcess: ftp2:DELETE}"));
    }

    private Function functionWithAnnotation(String moduleName, String originalName, String body) {
        Codedata codedata = new Codedata.Builder()
                .setType("ANNOTATION_ATTACHMENT")
                .setOriginalName(originalName)
                .setModuleName(moduleName)
                .build();
        Value annotation = new Value.ValueBuilder()
                .setCodedata(codedata)
                .value(body)
                .enabled(true)
                .editable(true)
                .build();
        Function function = new Function.FunctionBuilder().build();
        function.setProperties(new LinkedHashMap<>(Map.of("annotFunctionConfig", annotation)));
        return function;
    }
}
