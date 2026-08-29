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
import io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.Optional;

/**
 * Tests the Phase-D integration seam on {@link TriggerModelReader}: the resolve+introspect+synthesize
 * fallback for a connector not bundled in this jar.
 *
 * <p>{@code testResolveGracefullyDegradesForUnpublishedPackage} exercises a real, if narrow, defect
 * this work uncovered: {@code testorg/triggerfixture} (the same fixture connector used to verify
 * {@code TriggerLibraryIntrospector} and {@code TriggerModelSynthesizer} against a real compiled
 * {@code SemanticModel}) was {@code bal push --repository=local}'d for manual testing, expecting the
 * local repository to satisfy resolution the way a real connector's Central publication would. It does
 * not: {@code PackageUtil.getModulePackage}'s version-less overload falls through to a live
 * {@code CentralAPI.latestPackageVersion} lookup on an offline-metadata miss, which <b>throws</b> for
 * an org/module Central has never heard of, rather than returning empty -- and {@code local} is not
 * consulted by generic (non-declared-dependency) resolution at all. Fixed by wrapping the whole
 * resolve+synthesize attempt in {@code catch (Throwable)} so this degrades to "not schema-driven"
 * instead of propagating and breaking {@code useSchemaDrivenPath} for every unrecognized module.
 * Genuine end-to-end verification of the resolve+introspect+synthesize pipeline against a real
 * resolved package (not this local-repo shortcut) is covered by {@code TriggerLibraryIntrospector}'s
 * and {@code TriggerModelSynthesizer}'s own tests, which exercise the same logic directly against a
 * real compiled {@code SemanticModel} and the real {@code SchemaDrivenSourceGenerator}.
 *
 * @since 1.10.0
 */
public class TriggerModelReaderSchemaDrivenTest {

    private static final String ORG = "testorg";
    private static final String MODULE = "triggerfixture";

    @Test
    public void testResolveGracefullyDegradesForUnpublishedPackage() {
        // testorg/triggerfixture is not a real Central package; this must resolve to empty, not throw.
        Optional<TriggerUISchemaModel> model = TriggerModelReader.getInstance()
                .getSchemaDrivenTriggerModel(ORG, MODULE);
        Assert.assertTrue(model.isEmpty());
        Assert.assertFalse(TriggerModelReader.getInstance().hasSchemaDrivenModel(ORG, MODULE));

        Optional<ServiceInitModel> initModel = TriggerModelReader.getInstance()
                .getSchemaDrivenServiceInitModel(ORG, MODULE);
        Assert.assertTrue(initModel.isEmpty());
    }

    @Test
    public void testBundledConnectorUnaffected() {
        // A bundled connector (e.g. kafka) must still resolve via the classpath registry, not the new
        // resolve+synthesize fallback -- zero regression for the existing curated set.
        Optional<TriggerUISchemaModel> kafka = TriggerModelReader.getInstance()
                .getSchemaDrivenTriggerModel("ballerinax", "kafka");
        Assert.assertTrue(kafka.isPresent());
        Assert.assertEquals(kafka.get().moduleName(), "kafka");
    }

    @Test
    public void testUnknownConnectorResolvesEmpty() {
        Optional<TriggerUISchemaModel> unknown = TriggerModelReader.getInstance()
                .getSchemaDrivenTriggerModel("no-such-org", "no-such-module");
        Assert.assertTrue(unknown.isEmpty());
    }
}
