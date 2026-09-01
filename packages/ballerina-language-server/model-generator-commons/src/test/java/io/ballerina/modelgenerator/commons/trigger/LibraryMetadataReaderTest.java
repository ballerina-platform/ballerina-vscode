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
import io.ballerina.modelgenerator.commons.trigger.models.ArtifactInfo;
import io.ballerina.modelgenerator.commons.trigger.models.ArtifactMetadata;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerMetadataModel;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerUIMetadataModel;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;

/**
 * Tests {@link LibraryMetadataReader}'s public L1 and L2 reads: {@link LibraryMetadataReader#getTriggerMetadataModel}
 * and {@link LibraryMetadataReader#getTriggerUIMetadataModel} (connector-owned metadata resolved from its
 * {@code .bala}). Most go through {@link ModuleInfo}-keyed calls, mirroring how a caller (e.g.
 * {@code TriggerModelReader}) uses it; the shipped-document cases go through the package-private
 * {@code readTriggerMetadataModel(Path)} seam both reads funnel into, since no released connector ships
 * a document to resolve by name yet.
 */
public class LibraryMetadataReaderTest {

    private static final LibraryMetadataReader READER = LibraryMetadataReader.getInstance();

    @Test
    public void testGetTriggerMetadataModelNullModuleInfo() {
        Assert.assertTrue(READER.getTriggerMetadataModel(null).isEmpty());
    }

    @Test
    public void testGetTriggerMetadataModelIncompleteModuleInfo() {
        ModuleInfo moduleInfo = new ModuleInfo(null, "kafka", "kafka", "1.0.0");
        Assert.assertTrue(READER.getTriggerMetadataModel(moduleInfo).isEmpty());
    }

    @Test
    public void testGetTriggerUIMetadataModelNullModuleInfo() {
        Assert.assertTrue(READER.getTriggerUIMetadataModel(null).isEmpty());
    }

    @Test
    public void testGetTriggerUIMetadataModelIncompleteModuleInfo() {
        ModuleInfo moduleInfo = new ModuleInfo(null, "kafka", "kafka", "1.0.0");
        Assert.assertTrue(READER.getTriggerUIMetadataModel(moduleInfo).isEmpty());
    }

    @Test
    public void testGetTriggerMetadataModelUnresolvableModuleGracefullyEmpty() {
        // Not a real Central package -- must resolve to empty, not throw (the version-less
        // PackageUtil.getModulePackage overload throws on an unknown org/module).
        ModuleInfo moduleInfo = new ModuleInfo("no-such-org", "no-such-module", "no-such-module", null);
        Assert.assertTrue(READER.getTriggerMetadataModel(moduleInfo).isEmpty());
    }

    @Test
    public void testGetTriggerUIMetadataModelUnresolvableModuleGracefullyEmpty() {
        ModuleInfo moduleInfo = new ModuleInfo("no-such-org", "no-such-module", "no-such-module", null);
        Assert.assertTrue(READER.getTriggerUIMetadataModel(moduleInfo).isEmpty());
    }

    // ---- upstream: local-repository resolvability -----------------------------------------

    @Test
    public void testIsLocallyResolvableNullOrIncompleteModuleInfo() {
        Assert.assertFalse(READER.isLocallyResolvable(null));
        Assert.assertFalse(READER.isLocallyResolvable(new ModuleInfo(null, "kafka", "kafka", "1.0.0")));
        Assert.assertFalse(READER.isLocallyResolvable(new ModuleInfo("ballerinax", "kafka", null, "1.0.0")));
    }

    @Test
    public void testIsLocallyResolvableUnresolvableModule() {
        ModuleInfo moduleInfo = new ModuleInfo("no-such-org", "no-such-module", "no-such-module", null);
        Assert.assertFalse(READER.isLocallyResolvable(moduleInfo));
        // Repeatable: a miss must not be memoized, so that a subsequent pull of the package is picked
        // up instead of being masked for the rest of the session.
        Assert.assertFalse(READER.isLocallyResolvable(moduleInfo));
    }

    @Test
    public void testUnresolvableModuleMissIsNotMemoized() {
        // Same guarantee via the public reads: asking twice must re-resolve rather than return a
        // cached "absent", which is what lets a mid-session `bal pull` take effect.
        ModuleInfo moduleInfo = new ModuleInfo("no-such-org", "still-no-module", "still-no-module", null);
        Assert.assertTrue(READER.getTriggerMetadataModel(moduleInfo).isEmpty());
        Assert.assertTrue(READER.getTriggerMetadataModel(moduleInfo).isEmpty());
        Assert.assertFalse(READER.isLocallyResolvable(moduleInfo));
    }

    // ---- the shipped-document path -------------------------------------------------------

    /**
     * Reading a connector-shipped document, over the root every metadata read funnels through.
     *
     * <p>These go in through the {@link java.nio.file.Path} seam because no package published to Central
     * ships a {@code resources/trigger-metadata.json} yet, so a name-keyed test would have nothing to
     * read. It is nonetheless the path a future connector takes, and the one
     * {@link LibraryMetadataReader#getTriggerMetadataModel(ModuleInfo)} ends in.
     */
    @Test
    public void testAPackageShippingNoDocumentReadsEmpty() throws IOException {
        Path root = Files.createTempDirectory("no-metadata");
        Assert.assertTrue(READER.readTriggerMetadataModel(root).isEmpty());
    }

    @Test
    public void testAShippedDocumentIsRead() throws IOException {
        Path root = shipping("""
                {
                  "version": "v1.0",
                  "listeners": [{ "type": { "name": "Listener" }, "services": ["$service"] }],
                  "serviceTypes": [{
                    "id": "$service",
                    "type": { "name": "Service" },
                    "concrete": false,
                    "multipleListenersAllowed": false,
                    "handlers": { "backedByConcreteType": false, "options": [] }
                  }]
                }
                """);
        Optional<TriggerMetadataModel> read = READER.readTriggerMetadataModel(root);
        Assert.assertTrue(read.isPresent());
        Assert.assertEquals(read.get().serviceTypes().size(), 1);
    }

    @Test
    public void testAMalformedShippedDocumentReadsEmpty() throws IOException {
        // A third party with a JSON typo gets a WARNING log line naming the file -- the one signal a
        // connector author has that their document is wrong. The read itself is simply empty, so the
        // caller's own tier ordering decides what happens next.
        Assert.assertTrue(READER.readTriggerMetadataModel(
                shipping("{ \"version\": \"v1.0\", \"listeners\": [ ")).isEmpty());
    }

    @Test
    public void testAShippedDocumentParsingToNothingReadsEmpty() throws IOException {
        // Valid JSON, no document. Logged for the same reason, and equally empty.
        Assert.assertTrue(READER.readTriggerMetadataModel(shipping("null")).isEmpty());
    }

    @Test
    public void testAPackageRootThatCannotBeInspectedReadsEmpty() throws IOException {
        // A FILE where a package root must be a directory, so resolving `resources/trigger-metadata.json`
        // under it cannot describe a document either way. Must not throw.
        Path notADirectory = Files.createTempFile("not-a-package", ".txt");
        Assert.assertTrue(READER.readTriggerMetadataModel(notADirectory).isEmpty());
    }

    // ---- the L2 shipped-document path (readTriggerUIMetadataModel) ------------------------

    @Test
    public void testUiMissingVersionReadsEmpty() throws IOException {
        Path root = shippingUi("{ \"trigger\": { \"displayName\": \"No Version\" } }");
        Assert.assertTrue(READER.readTriggerUIMetadataModel(root, null).isEmpty());
    }

    @Test
    public void testUiUnsupportedMajorVersionRefused() throws IOException {
        Path root = shippingUi("{ \"version\": \"v2.0\", \"trigger\": { \"displayName\": \"V2\" } }");
        Assert.assertTrue(READER.readTriggerUIMetadataModel(root, null).isEmpty());
    }

    @Test
    public void testUiNewerMinorVersionAccepted() throws IOException {
        Path root = shippingUi("{ \"version\": \"v1.19\", \"trigger\": { \"displayName\": \"V1_19\" } }");
        TriggerUIMetadataModel model = READER.readTriggerUIMetadataModel(root, null).orElseThrow();
        Assert.assertEquals(model.trigger().displayName(), "V1_19");
    }

    @Test
    public void testUiTriggerKindPrecedesLegacyKind() throws IOException {
        Path newer = shippingUi("""
                { "version": "v1.0", "metadata": { "kind": "listener", "triggerKind": "graphql" } }
                """);
        TriggerUIMetadataModel.Metadata newerMetadata = READER.readTriggerUIMetadataModel(newer, null)
                .orElseThrow().metadata();
        Assert.assertEquals(newerMetadata.kind(), "listener");
        Assert.assertEquals(newerMetadata.effectiveTriggerKind(), "graphql");

        Path legacy = shippingUi("""
                { "version": "v1.0", "metadata": { "kind": "file" } }
                """);
        Assert.assertEquals(READER.readTriggerUIMetadataModel(legacy, null).orElseThrow().metadata()
                .effectiveTriggerKind(), "file");
    }

    @Test
    public void testUiMalformedDocumentReadsEmpty() throws IOException {
        Path root = shippingUi("{ \"version\": \"v1.0\", \"trigger\": { ");
        Assert.assertTrue(READER.readTriggerUIMetadataModel(root, null).isEmpty());
    }

    @Test
    public void testUiTopLevelArrayReadsEmpty() throws IOException {
        // parseTriggerUIMetadata requires a JSON object at the root; a bare array is valid JSON but not
        // a legal L2 document shape.
        Path root = shippingUi("[]");
        Assert.assertTrue(READER.readTriggerUIMetadataModel(root, null).isEmpty());
    }

    @Test
    public void testArtifactInfoReadsOnlyProjectionAndResolvesSvgText() throws IOException {
        Path root = shippingUi("""
                {
                  "version": "v1.0",
                  "metadata": { "kind": "event" },
                  "trigger": { "deliberatelyNotAModel": [1, 2, 3] },
                  "artifactInfo": {
                    "displayLabel": "RabbitMQ Event Integration",
                    "icon": {
                      "lightPath": "icons/light.svg",
                      "darkPath": "icons/dark.svg",
                      "color": "#f60"
                    },
                    "identifier": {
                      "resolvers": [{ "via": "annotationField", "fields": ["queueName"] }]
                    }
                  }
                }
                """);
        Path icons = Files.createDirectories(root.resolve("resources/icons"));
        Files.writeString(icons.resolve("light.svg"), "<svg><path fill=\"currentColor\"/></svg>");
        Files.writeString(icons.resolve("dark.svg"), "<svg><path fill=\"currentColor\"/></svg>");

        ArtifactMetadata metadata = READER.readArtifactMetadata(root, "1.0.0").orElseThrow();
        ArtifactInfo.Resolved info = metadata.artifactInfo();
        Assert.assertEquals(metadata.triggerKind(), "event");
        Assert.assertEquals(info.displayLabel(), "RabbitMQ Event Integration");
        Assert.assertEquals(info.icon().color(), "#f60");
        Assert.assertTrue(info.icon().light().startsWith("<svg"));
        Assert.assertEquals(info.identifier().resolvers().get(0).fields(), java.util.List.of("queueName"));
    }

    @Test
    public void testArtifactProjectionPrefersTriggerKindAndFallsBackToKind() throws IOException {
        Path newer = shippingUi("""
                { "version": "v1.0", "metadata": { "kind": "file", "triggerKind": "event" } }
                """);
        Assert.assertEquals(READER.readArtifactMetadata(newer, null).orElseThrow().triggerKind(), "event");

        Path legacy = shippingUi("""
                { "version": "v1.0", "metadata": { "kind": "file" } }
                """);
        Assert.assertEquals(READER.readArtifactMetadata(legacy, null).orElseThrow().triggerKind(), "file");

        Path nonCanonical = shippingUi("""
                { "version": "v1.0", "metadata": { "kind": "listener" } }
                """);
        Assert.assertTrue(READER.readArtifactMetadata(nonCanonical, null).isEmpty());
    }

    @Test
    public void testArtifactInfoRejectsEscapingAssetPath() throws IOException {
        Path root = shippingUi("""
                { "version": "v1.0", "artifactInfo": {
                  "displayLabel": "Unsafe",
                  "icon": { "lightPath": "../light.svg", "darkPath": "../dark.svg" }
                } }
                """);
        Assert.assertTrue(READER.readArtifactInfo(root, null).isEmpty());
    }

    /** A package root shipping the given {@code resources/trigger-metadata.json}. */
    private static Path shipping(String json) throws IOException {
        Path root = Files.createTempDirectory("shipped-metadata");
        Path resources = Files.createDirectories(root.resolve("resources"));
        Files.writeString(resources.resolve("trigger-metadata.json"), json, StandardCharsets.UTF_8);
        return root;
    }

    /** A package root shipping the given {@code resources/trigger-ui-metadata.json}. */
    private static Path shippingUi(String json) throws IOException {
        Path root = Files.createTempDirectory("shipped-ui-metadata");
        Path resources = Files.createDirectories(root.resolve("resources"));
        Files.writeString(resources.resolve("trigger-ui-metadata.json"), json, StandardCharsets.UTF_8);
        return root;
    }
}
