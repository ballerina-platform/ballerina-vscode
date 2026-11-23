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

import io.ballerina.compiler.syntax.tree.ModuleMemberDeclarationNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.ServiceDeclarationNode;
import io.ballerina.compiler.syntax.tree.SyntaxTree;
import io.ballerina.servicemodelgenerator.extension.model.Codedata;
import io.ballerina.servicemodelgenerator.extension.model.Function;
import io.ballerina.servicemodelgenerator.extension.model.Service;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import io.ballerina.tools.text.TextDocuments;
import org.testng.Assert;
import org.testng.annotations.DataProvider;
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

    @Test
    public void testChoiceAnnotationRendersTheSelectedBranch() {
        // Regression test: googleapis.chat's ServiceConfig is a union (endpoint URL | project number), offered
        // as a CHOICE whose value only names the default branch. Rendering that value wrote
        // `@chat:ServiceConfigendpointUrl` -- invalid, and blind to the branch the user picked.
        Service service = serviceWithAnnotation("googleapis.chat", "ServiceConfig", "endpointUrl");
        Value annotation = service.getProperties().get("serviceConfig");
        annotation.setChoices(List.of(
                branch("endpointUrl", "\"https://chat.example.com\"", false),
                branch("projectNumber", "\"1004421593216\"", true)));

        Assert.assertEquals(Utils.getAnnotationEdits(service, rootOf("import ballerinax/googleapis.chat;\n")),
                List.of("@chat:ServiceConfig{projectNumber: \"1004421593216\"}"));

        annotation.getChoices().get(0).setEnabled(true);
        annotation.getChoices().get(1).setEnabled(false);
        Assert.assertEquals(Utils.getAnnotationEdits(service, rootOf("import ballerinax/googleapis.chat;\n")),
                List.of("@chat:ServiceConfig{endpointUrl: \"https://chat.example.com\"}"));
    }

    @DataProvider
    public Object[][] projectNumberMappings() {
        return new Object[][]{
                {"{projectNumber: \"1004421593216\"}", "\"1004421593216\""},
                // Shorthand: Ballerina reads `{projectNumber}` as `{projectNumber: projectNumber}`.
                {"{projectNumber}", "projectNumber"},
                // A comment beside the field is not part of its value, or the re-rendered brace is commented out.
                {"{projectNumber: \"1004421593216\" // prod\n}", "\"1004421593216\""}
        };
    }

    @Test(dataProvider = "projectNumberMappings")
    public void testChoiceAnnotationIsRestoredFromSource(String mapping, String expectedValue) {
        // Regression test: reading the annotation back set only the choice's outer value, which rendering
        // ignores, so reopening `{projectNumber: ...}` and saving rewrote it from the default branch.
        String source = "import ballerinax/googleapis.chat;\n\n"
                + "@chat:ServiceConfig " + mapping + "\n"
                + "service chat:ChatService on chatListener {\n}\n";
        ModulePartNode root = rootOf(source);
        ServiceDeclarationNode serviceNode = null;
        for (ModuleMemberDeclarationNode member : root.members()) {
            if (member instanceof ServiceDeclarationNode node) {
                serviceNode = node;
            }
        }
        Assert.assertNotNull(serviceNode);
        Service service = serviceWithAnnotation("googleapis.chat", "ServiceConfig", "endpointUrl");
        Value annotation = service.getProperties().get("serviceConfig");
        annotation.setChoices(List.of(mappingBranch("endpointUrl", true), mappingBranch("projectNumber", false)));
        // An optional leaf compiles disabled; restoring a value must enable it or rendering drops it.
        annotation.getChoices().get(1).getProperties().get("projectNumber").setEnabled(false);

        Utils.updateAnnotationAttachmentProperty(serviceNode, service, null);

        Assert.assertFalse(annotation.getChoices().get(0).isEnabled());
        Assert.assertTrue(annotation.getChoices().get(1).isEnabled(), "the branch the source fills is selected");
        Assert.assertEquals(annotation.getChoices().get(1).getProperties().get("projectNumber").getValue(),
                expectedValue);
        Assert.assertEquals(Utils.getAnnotationEdits(service, root),
                List.of("@chat:ServiceConfig{projectNumber: " + expectedValue + "}"),
                "saving a reopened service keeps the field value it was read from");
    }

    private ServiceDeclarationNode serviceOf(ModulePartNode root) {
        return (ServiceDeclarationNode) root.members().stream()
                .filter(member -> member instanceof ServiceDeclarationNode).findFirst().orElseThrow();
    }

    private Service reopened(String mapping, ModulePartNode[] rootOut) {
        String source = "import ballerinax/googleapis.chat;\n\n@chat:ServiceConfig " + mapping + "\n"
                + "service chat:ChatService on chatListener {\n}\n";
        rootOut[0] = rootOf(source);
        Service service = serviceWithAnnotation("googleapis.chat", "ServiceConfig", "endpointUrl");
        service.getProperties().get("serviceConfig")
                .setChoices(List.of(mappingBranch("endpointUrl", true), mappingBranch("projectNumber", false)));
        Utils.updateAnnotationAttachmentProperty(serviceOf(rootOut[0]), service, null);
        return service;
    }

    @Test
    public void testSpreadOnlyAnnotationIsKeptAsWritten() {
        // No branch can hold a spread, so it stays, and no template default is written beside it.
        ModulePartNode[] root = new ModulePartNode[1];
        Service service = reopened("{...chatConfig}", root);
        service.getProperties().get("serviceConfig").getChoices().get(0).getProperties().get("endpointUrl")
                .setValue("\"\"");
        Assert.assertEquals(Utils.getAnnotationEdits(service, root[0]), List.of("@chat:ServiceConfig{...chatConfig}"));
    }

    @Test
    public void testValueEnteredAfterASpreadOnlyRestoreIsSaved() {
        // The restore disables the shown branch's leaves; the webview enables one when the user enters a value
        // that differs from its loaded default. That value is written beside the spread; an untouched default
        // (left disabled) is not.
        ModulePartNode[] root = new ModulePartNode[1];
        Service service = reopened("{...chatConfig}", root);
        Value endpointUrl = service.getProperties().get("serviceConfig").getChoices().get(0).getProperties()
                .get("endpointUrl");
        Assert.assertFalse(endpointUrl.isEnabled(), "restore disables the leaf");
        endpointUrl.setValue("\"\"");
        Assert.assertEquals(Utils.getAnnotationEdits(service, root[0]), List.of("@chat:ServiceConfig{...chatConfig}"),
                "an untouched template default is not written");
        endpointUrl.setEnabled(true);
        endpointUrl.setValue("\"https://chat.example.com\"");
        Assert.assertEquals(Utils.getAnnotationEdits(service, root[0]),
                List.of("@chat:ServiceConfig{endpointUrl: \"https://chat.example.com\", ...chatConfig}"));
    }

    @Test
    public void testPopulatedGroupLeavesAreClearedOnASpreadOnlyRestore() {
        // The restore must reach a group's descendants: collectBranchFields descends into a group without
        // looking at the group's own flag, so a populated child would otherwise be written beside the spread.
        Value timeout = leaf("timeout", "timeout", null);
        timeout.setValue("30");
        Value group = new Value.ValueBuilder().enabled(true).editable(true)
                .setProperties(new LinkedHashMap<>(Map.of("timeout", timeout))).build();
        Value branch = new Value.ValueBuilder().enabled(true).editable(true)
                .setProperties(new LinkedHashMap<>(Map.of("advanced", group))).build();
        Service service = serviceWithAnnotation("googleapis.chat", "ServiceConfig", "endpointUrl");
        service.getProperties().get("serviceConfig").setChoices(List.of(branch));
        ModulePartNode root = rootOf("import ballerinax/googleapis.chat;\n\n@chat:ServiceConfig {...chatConfig}\n"
                + "service chat:ChatService on chatListener {\n}\n");
        Utils.updateAnnotationAttachmentProperty(serviceOf(root), service, null);
        Assert.assertEquals(Utils.getAnnotationEdits(service, root), List.of("@chat:ServiceConfig{...chatConfig}"));
    }

    @Test
    public void testQuotedFieldNamesAreRestoredAndKept() {
        // `'projectNumber` is the same field as `projectNumber`: restoring and the unmodeled-member filter
        // must agree, or the value is neither rendered from the branch nor kept from the source.
        ModulePartNode[] root = new ModulePartNode[1];
        Service service = reopened("{'projectNumber: \"123\"}", root);
        Assert.assertEquals(Utils.getAnnotationEdits(service, root[0]),
                List.of("@chat:ServiceConfig{projectNumber: \"123\"}"));
    }

    @Test
    public void testSpreadBesideABranchFieldIsKept() {
        ModulePartNode[] root = new ModulePartNode[1];
        Service service = reopened("{projectNumber: pn, ...extraCfg}", root);
        Assert.assertEquals(Utils.getAnnotationEdits(service, root[0]),
                List.of("@chat:ServiceConfig{projectNumber: pn, ...extraCfg}"));
    }

    @Test
    public void testClearingTheOnlyFieldDropsTheAnnotation() {
        // Regression test: an empty branch used to fall back to the source text, so a cleared value, or a
        // switch to a branch left empty, wrote the old mapping back and the edit was silently lost.
        ModulePartNode[] root = new ModulePartNode[1];
        Service service = reopened("{projectNumber: \"123\"}", root);
        service.getProperties().get("serviceConfig").getChoices().get(1).getProperties().get("projectNumber")
                .setValue("");
        Assert.assertEquals(Utils.getAnnotationEdits(service, root[0]), List.of(),
                "no valid annotation exists to write, so none is written");
    }

    @Test
    public void testUnfilledChoiceAnnotationIsNotWritten() {
        Service service = serviceWithAnnotation("googleapis.chat", "ServiceConfig", "endpointUrl");
        service.getProperties().get("serviceConfig")
                .setChoices(List.of(mappingBranch("endpointUrl", true), mappingBranch("projectNumber", false)));
        Assert.assertEquals(Utils.getAnnotationEdits(service, rootOf("import ballerinax/googleapis.chat;\n")),
                List.of(), "`@chat:ServiceConfig{}` matches neither union member");
    }

    @Test
    public void testChoiceLeafRendersLikeTheCreationPath() {
        // A multi-valued leaf keeps its entries in `values`, an enum leaf carries a qualifier, and a dotted
        // path nests: the same shapes the creation path renders.
        Service service = serviceWithAnnotation("googleapis.chat", "ServiceConfig", "scopes");
        Value scopes = leaf("scopes", "scopes", null);
        scopes.setValues(List.of("\"a\"", "\"b\""));
        Value mode = leaf("mode", "mode", "chat");
        mode.setValue("SOME_ENUM");
        Value token = leaf("auth.token", "auth.token", null);
        token.setValue("\"t\"");
        Value branch = new Value.ValueBuilder().enabled(true).editable(true)
                .setProperties(new LinkedHashMap<>(Map.of("scopes", scopes))).build();
        branch.getProperties().put("mode", mode);
        branch.getProperties().put("token", token);
        service.getProperties().get("serviceConfig").setChoices(List.of(branch));
        Assert.assertEquals(Utils.getAnnotationEdits(service, rootOf("import ballerinax/googleapis.chat;\n")),
                List.of("@chat:ServiceConfig{scopes: [\"a\", \"b\"], mode: chat:SOME_ENUM, auth: {token: \"t\"}}"));
    }

    private Value leaf(String key, String path, String qualifier) {
        Codedata codedata = new Codedata.Builder().setType("SERVICE_ANNOTATION").setOriginalName("ServiceConfig")
                .setModuleName("googleapis.chat").setPath(path).build();
        codedata.setValueQualifier(qualifier);
        return new Value.ValueBuilder().setCodedata(codedata).value("").enabled(true).editable(true).build();
    }

    /** A branch shaped as the trigger metadata compiles it: its leaf names the record field via `field`. */
    private Value mappingBranch(String field, boolean selected) {
        Codedata codedata = new Codedata.Builder().setType("MAPPING_FIELD").build();
        codedata.setField(field);
        Value leaf = new Value.ValueBuilder().setCodedata(codedata).value("").enabled(true).editable(true).build();
        return new Value.ValueBuilder()
                .enabled(selected)
                .editable(true)
                .setProperties(new LinkedHashMap<>(Map.of(field, leaf)))
                .build();
    }

    private Value branch(String field, String fieldValue, boolean selected) {
        Value leaf = new Value.ValueBuilder()
                .setCodedata(new Codedata.Builder().setType("SERVICE_ANNOTATION").setOriginalName("ServiceConfig")
                        .setModuleName("googleapis.chat").setPath(field).build())
                .value(fieldValue)
                .enabled(true)
                .editable(true)
                .build();
        return new Value.ValueBuilder()
                .enabled(selected)
                .editable(true)
                .setProperties(new LinkedHashMap<>(Map.of(field, leaf)))
                .build();
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
