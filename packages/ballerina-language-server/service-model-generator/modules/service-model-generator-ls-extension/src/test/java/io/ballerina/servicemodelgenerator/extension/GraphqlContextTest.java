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

package io.ballerina.servicemodelgenerator.extension;

import com.google.gson.Gson;
import com.google.gson.JsonElement;
import com.google.gson.JsonNull;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.reflect.TypeToken;
import io.ballerina.compiler.syntax.tree.ModuleMemberDeclarationNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.ServiceDeclarationNode;
import io.ballerina.compiler.syntax.tree.SyntaxTree;
import io.ballerina.modelgenerator.commons.AbstractLSTest;
import io.ballerina.servicemodelgenerator.extension.graphqlcontext.ContextFunctionBody;
import io.ballerina.servicemodelgenerator.extension.graphqlcontext.GraphqlContextRequest;
import io.ballerina.servicemodelgenerator.extension.model.Codedata;
import io.ballerina.servicemodelgenerator.extension.model.request.CommonModelFromSourceRequest;
import io.ballerina.tools.text.LineRange;
import io.ballerina.tools.text.TextDocuments;
import org.ballerinalang.langserver.util.TestUtil;
import org.eclipse.lsp4j.DidCloseTextDocumentParams;
import org.eclipse.lsp4j.DidOpenTextDocumentParams;
import org.eclipse.lsp4j.TextDocumentIdentifier;
import org.eclipse.lsp4j.TextEdit;
import org.testng.Assert;
import org.testng.annotations.AfterClass;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.lang.reflect.Type;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

/**
 * Tests for the GraphQL request context endpoints: {@code getGraphqlContext} and {@code applyGraphqlContext}.
 *
 * <p>
 * Each case runs against a copy of a fixture project. An edit case applies the returned edits in memory and compares
 * the result with the expected files under {@code expected/}. Whatever the designer writes has to build as written,
 * so every expected project (its fixture with the expected files laid over it) must compile with {@code bal build};
 * check that whenever an expected file changes. The compile is not run here: the test JVM's heap cannot hold the
 * language server and a compilation of the GraphQL module together.
 * </p>
 */
public class GraphqlContextTest extends AbstractLSTest {

    private static final Type TEXT_EDITS_TYPE = new TypeToken<Map<String, List<TextEdit>>>() {
    }.getType();

    private static final Type ENTRIES_TYPE = new TypeToken<List<ContextFunctionBody.ContextEntry>>() {
    }.getType();
    private static final Gson GSON = new Gson();

    private final Map<String, Path> projectCopies = new HashMap<>();
    private String lastProject;

    /**
     * The cases grouped by fixture, so each fixture's project is loaded once and evicted once its cases are done.
     */
    @Override
    @DataProvider(name = "data-provider")
    protected Object[] getConfigsList() {
        Object[] configs = super.getConfigsList();
        Arrays.sort(configs, Comparator.comparing((Object config) -> projectOf((Path) config))
                .thenComparing(config -> ((Path) config).getFileName().toString()));
        return configs;
    }

    private String projectOf(Path config) {
        try {
            return gson.fromJson(Files.readString(config), TestConfig.class).project();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /**
     * Drops the fixture's project from the language server. Closing the last open document of a project evicts it,
     * so the service file is opened and closed: the heap then holds one fixture's dependencies at a time.
     */
    private void evict(String fixture) throws IOException {
        Path copy = projectCopies.get(fixture);
        if (copy == null) {
            return;
        }
        try (Stream<Path> files = Files.list(copy)) {
            for (Path file : files.filter(path -> path.toString().endsWith(".bal")).toList()) {
                String uri = file.toUri().toString();
                sendNotification("textDocument/didOpen",
                        new DidOpenTextDocumentParams(getDocumentIdentifier(file.toString(), uri)));
                sendNotification("textDocument/didClose",
                        new DidCloseTextDocumentParams(new TextDocumentIdentifier(uri)));
            }
        }
    }

    @Override
    @Test(dataProvider = "data-provider")
    public void test(Path config) throws IOException {
        TestConfig testConfig = gson.fromJson(Files.readString(configDir.resolve(config)), TestConfig.class);
        if (lastProject != null && !lastProject.equals(testConfig.project())) {
            evict(lastProject);
        }
        lastProject = testConfig.project();
        Path project = projectCopy(testConfig.project());
        Path file = project.resolve(testConfig.file());
        Codedata codedata = new Codedata.Builder().setLineRange(serviceRange(file)).build();
        Object request = request(testConfig, file.toString(), codedata);
        JsonObject response = call(request, "serviceDesign/" + testConfig.api());
        String errorMsg = response.has("errorMsg") && !response.get("errorMsg").isJsonNull()
                ? response.get("errorMsg").getAsString() : null;

        if (testConfig.expectError()) {
            Assert.assertNotNull(errorMsg, "Expected an error: " + testConfig.description());
            Assert.assertTrue(response.getAsJsonObject("textEdits") == null
                            || response.getAsJsonObject("textEdits").isEmpty(),
                    "A refused request must produce no edits: " + testConfig.description());
            return;
        }
        Assert.assertNull(errorMsg, testConfig.description());
        // A change that does less than was asked says so; any other change carries no note.
        String note = response.has("note") && !response.get("note").isJsonNull()
                ? response.get("note").getAsString() : null;
        Assert.assertEquals(note, testConfig.expectedNote(), testConfig.description());

        if (testConfig.expectedResponse() != null) {
            Assert.assertEquals(compact(response, project), testConfig.expectedResponse(),
                    testConfig.description());
        }
        if (testConfig.expected() != null) {
            Map<String, List<TextEdit>> edits = gson.fromJson(response.getAsJsonObject("textEdits"),
                    TEXT_EDITS_TYPE);
            assertFiles(resDir.resolve("expected").resolve(testConfig.expected()), project, applyEdits(edits),
                    testConfig.description());
        }
    }

    /**
     * The working copy of a fixture project. One copy serves every case on that fixture: the edits are applied in
     * memory and never written back, so the copy (and the language server's view of it) stays as the fixture was.
     * Loading a fresh project per case would load its dependencies again each time and exhaust the test JVM's heap.
     */
    private Path projectCopy(String fixture) throws IOException {
        Path copy = projectCopies.get(fixture);
        if (copy == null) {
            copy = copyProject(sourceDir.resolve(fixture));
            projectCopies.put(fixture, copy);
        }
        return copy;
    }

    @AfterClass(alwaysRun = true)
    public void deleteProjectCopies() throws IOException {
        if (lastProject != null) {
            evict(lastProject);
        }
        for (Path copy : projectCopies.values()) {
            deleteRecursively(copy);
        }
        projectCopies.clear();
    }

    /**
     * The typed request of the case's endpoint.
     */
    private static Object request(TestConfig testConfig, String filePath, Codedata codedata) {
        JsonObject fields = testConfig.request() == null ? new JsonObject() : testConfig.request();
        return switch (testConfig.api()) {
            case "getGraphqlContext" -> new CommonModelFromSourceRequest(filePath, codedata);
            case "applyGraphqlContext" -> new GraphqlContextRequest(filePath, codedata,
                    string(fields, "action"), string(fields, "functionName"),
                    fields.has("deleteFunction") && fields.get("deleteFunction").getAsBoolean(),
                    fields.has("entries") ? GSON.fromJson(fields.get("entries"), ENTRIES_TYPE) : null);
            default -> throw new AssertionError("Unknown api: " + testConfig.api());
        };
    }

    private static String string(JsonObject fields, String key) {
        return fields.has(key) && !fields.get(key).isJsonNull() ? fields.get(key).getAsString() : null;
    }

    /**
     * Sends the request without failing on an error response, so a case can expect one.
     */
    private JsonObject call(Object request, String api) {
        String response = TestUtil.getResponseString(serviceEndpoint.request(api, request));
        return JsonParser.parseString(response).getAsJsonObject().getAsJsonObject("result");
    }

    /**
     * The part of a read response a case asserts on, with absolute paths made relative to the project.
     */
    private JsonObject compact(JsonObject response, Path project) {
        JsonObject compact = new JsonObject();
        compact.add("supported", response.get("supported"));
        for (String key : List.of("configured", "functionName", "expression", "signatureValid", "candidates",
                "entries", "editable", "notEditableReason", "valueScope")) {
            compact.add(key, response.has(key) ? response.get(key) : JsonNull.INSTANCE);
        }
        JsonElement functionFile = response.get("functionFilePath");
        compact.add("functionFile", functionFile == null || functionFile.isJsonNull() ? JsonNull.INSTANCE
                : gson.toJsonTree(relative(project, Path.of(functionFile.getAsString()))));
        return compact;
    }

    private static LineRange serviceRange(Path file) throws IOException {
        SyntaxTree syntaxTree = SyntaxTree.from(TextDocuments.from(Files.readString(file)),
                file.getFileName().toString());
        ModulePartNode root = syntaxTree.rootNode();
        for (ModuleMemberDeclarationNode member : root.members()) {
            if (member instanceof ServiceDeclarationNode serviceNode) {
                return serviceNode.lineRange();
            }
        }
        throw new AssertionError("No service in " + file);
    }

    /**
     * The content of each edited file once its edits are applied, keyed by the file's real path. Edits apply from
     * the last to the first, so earlier positions stay valid; edits at one position apply in the order given.
     */
    private static Map<Path, String> applyEdits(Map<String, List<TextEdit>> edits) throws IOException {
        Map<Path, String> results = new HashMap<>();
        for (Map.Entry<String, List<TextEdit>> entry : edits.entrySet()) {
            Path path = Path.of(entry.getKey());
            String text = Files.exists(path) ? Files.readString(path) : "";
            List<TextEdit> fileEdits = new ArrayList<>(entry.getValue());
            List<Integer> lineStarts = lineStarts(text);
            List<int[]> offsets = new ArrayList<>();
            for (int i = 0; i < fileEdits.size(); i++) {
                TextEdit edit = fileEdits.get(i);
                offsets.add(new int[]{offset(lineStarts, text, edit.getRange().getStart()),
                        offset(lineStarts, text, edit.getRange().getEnd()), i});
            }
            offsets.sort(Comparator.<int[]>comparingInt(o -> o[0]).thenComparingInt(o -> o[2]));
            StringBuilder builder = new StringBuilder(text);
            for (int i = offsets.size() - 1; i >= 0; i--) {
                int[] o = offsets.get(i);
                builder.replace(o[0], o[1], fileEdits.get(o[2]).getNewText());
            }
            results.put(realPath(path), builder.toString());
        }
        return results;
    }

    private static Path realPath(Path path) throws IOException {
        return Files.exists(path) ? path.toRealPath() : path.toAbsolutePath().normalize();
    }

    private static List<Integer> lineStarts(String text) {
        List<Integer> starts = new ArrayList<>();
        starts.add(0);
        for (int i = 0; i < text.length(); i++) {
            if (text.charAt(i) == '\n') {
                starts.add(i + 1);
            }
        }
        return starts;
    }

    private static int offset(List<Integer> lineStarts, String text, org.eclipse.lsp4j.Position position) {
        if (position.getLine() >= lineStarts.size()) {
            return text.length();
        }
        return Math.min(text.length(), lineStarts.get(position.getLine()) + position.getCharacter());
    }

    /**
     * Asserts each expected file: an edited file must read as expected after its edits, and an expected file the
     * response did not edit must already read as expected.
     */
    private static void assertFiles(Path expectedDir, Path project, Map<Path, String> edited, String description)
            throws IOException {
        try (Stream<Path> files = Files.walk(expectedDir)) {
            for (Path expected : files.filter(Files::isRegularFile).toList()) {
                Path actual = realPath(project.resolve(expectedDir.relativize(expected).toString()));
                String content = edited.containsKey(actual) ? edited.get(actual)
                        : Files.exists(actual) ? Files.readString(actual) : null;
                Assert.assertNotNull(content, description + ": missing " + actual);
                // A Windows checkout gives the fixtures CRLF endings while the inserted text uses LF.
                Assert.assertEquals(normalizeLineEndings(content), normalizeLineEndings(Files.readString(expected)),
                        description + ": " + expectedDir.relativize(expected));
            }
        }
    }

    private static String normalizeLineEndings(String text) {
        return text.replace("\r\n", "\n");
    }

    private static Path copyProject(Path source) throws IOException {
        Path target = Files.createTempDirectory("service-settings").toRealPath();
        try (Stream<Path> paths = Files.walk(source)) {
            for (Path path : paths.toList()) {
                Path destination = target.resolve(source.relativize(path).toString());
                if (Files.isDirectory(path)) {
                    Files.createDirectories(destination);
                } else {
                    Files.copy(path, destination);
                }
            }
        }
        return target;
    }

    private static String relative(Path project, Path path) {
        try {
            return project.relativize(path.toRealPath()).toString().replace("\\", "/");
        } catch (IOException e) {
            return project.relativize(path).toString().replace("\\", "/");
        }
    }

    private static void deleteRecursively(Path path) throws IOException {
        if (!Files.exists(path)) {
            return;
        }
        try (Stream<Path> paths = Files.walk(path)) {
            for (Path p : paths.sorted(Comparator.reverseOrder()).toList()) {
                Files.deleteIfExists(p);
            }
        }
    }

    @Override
    protected String getResourceDir() {
        return "graphql_context";
    }

    @Override
    protected Class<? extends AbstractLSTest> clazz() {
        return GraphqlContextTest.class;
    }

    @Override
    protected String getServiceName() {
        return "serviceDesign";
    }

    @Override
    protected String getApiName() {
        return "getGraphqlContext";
    }

    /**
     * One test case.
     *
     * @param description      what the case checks
     * @param project          the fixture project under {@code source/}
     * @param file             the file of the service, relative to the project
     * @param api              the endpoint to call
     * @param request          the request fields other than {@code filePath} and {@code codedata}
     * @param expected         for an edit, the directory under {@code expected/} holding the files it should produce
     * @param expectedResponse for a read, the compact response it should return
     * @param expectedNote     for an edit, the note it should return; absent when it should return none
     * @param expectError      whether the request should be refused
     */
    private record TestConfig(String description, String project, String file, String api, JsonObject request,
                              String expected, JsonObject expectedResponse, String expectedNote,
                              boolean expectError) {
    }
}
