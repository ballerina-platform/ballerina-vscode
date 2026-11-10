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

package io.ballerina.designmodelgenerator.extension;

import io.ballerina.artifactsgenerator.Artifact;
import io.ballerina.artifactsgenerator.ArtifactsCache;
import io.ballerina.artifactsgenerator.ArtifactsGenerator;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.projects.BuildOptions;
import io.ballerina.projects.Document;
import io.ballerina.projects.Module;
import io.ballerina.projects.Project;
import io.ballerina.projects.directory.BuildProject;
import org.testng.Assert;
import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The artifact tree of a TCP service whose connection service class sits in another file. The service lists the
 * class's handlers and the class is left out of Types, and both stay current when either file alone changes.
 *
 * @since 6.0.1
 */
public class TcpConnectionArtifactsTest {

    private static final Path PROJECT = Path.of("src", "test", "resources", "artifacts", "source", "tcp_split")
            .toAbsolutePath();
    private static final String ENTRY_POINTS = "Entry Points";
    private static final String TYPES = "Types";
    private static final String ADDITIONS = "additions";
    private static final String UPDATES = "updates";
    private static final String DELETIONS = "deletions";

    private static final String SERVICE = """
            import ballerina/tcp;

            listener tcp:Listener tcpListener = new (3000);

            service on tcpListener {
                remote function onConnect(tcp:Caller caller) returns tcp:ConnectionService|tcp:Error {
                    return new EchoService();
                }
            }
            """;

    @BeforeClass
    public void initCache() {
        if (ArtifactsCache.getInstance() == null) {
            ArtifactsCache.initialize();
        }
    }

    @Test(description = "A class in another file is listed under its service, not under Types")
    public void testListsHandlersAcrossFiles() {
        Map<String, Map<String, Artifact>> artifacts = ArtifactsGenerator.artifacts(loadProject());

        Artifact service = single(artifacts.get(ENTRY_POINTS));
        Assert.assertTrue(service.children().keySet().containsAll(List.of("onConnect", "onBytes", "onError")),
                "Service children: " + service.children().keySet());
        Assert.assertTrue(artifacts.get(TYPES).containsKey("Message"));
        Assert.assertFalse(artifacts.get(TYPES).containsKey("EchoService"));
    }

    @Test(description = "Changing the class alone refreshes the handlers listed under the service in the other file")
    public void testClassChangeRefreshesService() {
        Project project = loadProject();
        ArtifactsGenerator.artifacts(project);

        Document handlers = document(project, "handlers.bal");
        String withOnClose = handlers.textDocument().toString().replace("""
                    remote function onError(""", """
                    remote function onClose() returns tcp:Error? {
                    }

                    remote function onError(""");
        Map<String, Map<String, Map<String, Artifact>>> changes = changesAfterEdit(handlers, withOnClose);

        Artifact service = single(changes.get(ENTRY_POINTS).get(UPDATES));
        Assert.assertTrue(service.children().containsKey("onClose"),
                "Service children: " + service.children().keySet());
        Assert.assertFalse(changes.containsKey(TYPES) && changes.get(TYPES).containsKey(ADDITIONS),
                "The class must stay out of Types: " + changes.get(TYPES));
    }

    @Test(description = "Removing the service alone brings its class in the other file back under Types")
    public void testServiceRemovalRestoresClassType() {
        Project project = loadProject();
        ArtifactsGenerator.artifacts(project);

        String withoutService = SERVICE.substring(0, SERVICE.indexOf("service on"));
        Map<String, Map<String, Map<String, Artifact>>> changes =
                changesAfterEdit(document(project, "main.bal"), withoutService);

        Assert.assertTrue(changes.get(TYPES).get(ADDITIONS).containsKey("EchoService"),
                "Types: " + changes.get(TYPES));
        Assert.assertFalse(changes.get(ENTRY_POINTS).get(DELETIONS).isEmpty());
    }

    @Test(description = "A change to a file on neither side of the pair regenerates that file alone")
    public void testUnlinkedChangeStaysLocal() {
        Project project = loadProject();
        ArtifactsGenerator.artifacts(project);

        Map<String, Map<String, Map<String, Artifact>>> changes = changesAfterEdit(document(project, "types.bal"), """
                type Message record {|
                    string text;
                    int priority;
                |};
                """);

        Assert.assertEquals(changes.keySet(), Set.of(TYPES));
    }

    private static Project loadProject() {
        return BuildProject.load(PROJECT, BuildOptions.builder().setOffline(true).build());
    }

    private static Document document(Project project, String fileName) {
        Module module = project.currentPackage().getDefaultModule();
        return module.documentIds().stream()
                .map(module::document)
                .filter(document -> document.name().equals(fileName))
                .findFirst()
                .orElseThrow();
    }

    private static Map<String, Map<String, Map<String, Artifact>>> changesAfterEdit(Document document,
                                                                                   String content) {
        Document edited = document.modify().withContent(content).apply();
        Module module = edited.module();
        SemanticModel semanticModel =
                PackageUtil.getCompilation(module.packageInstance()).getSemanticModel(module.moduleId());
        return ArtifactsGenerator.artifactChanges(module.project().sourceRoot().toString(), edited.syntaxTree(),
                semanticModel, module);
    }

    private static Artifact single(Map<String, Artifact> artifacts) {
        Assert.assertNotNull(artifacts);
        Assert.assertEquals(artifacts.size(), 1, "Artifacts: " + artifacts.keySet());
        return artifacts.values().iterator().next();
    }
}
