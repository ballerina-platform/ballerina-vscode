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

import io.ballerina.modelgenerator.commons.trigger.models.TriggerLibraryFacts;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerMetadataModel;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerUISchemaModel;
import io.ballerina.modelgenerator.commons.trigger.models.TypeRef;
import io.ballerina.servicemodelgenerator.extension.connector.TriggerModelSynthesizer;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.List;
import java.util.Optional;

/**
 * Unit tests for {@link TriggerModelSynthesizer}, exercising it directly against hand-built
 * {@link TriggerMetadataModel}/{@link TriggerLibraryFacts} data rather than a compiled connector, so a
 * multi-module shape (e.g. CDC's own listener module plus a shared service-type module) can be tested
 * without a real {@code .bala}.
 */
public class TriggerModelSynthesizerTest {

    @Test(description = "A service type or listener required-import declared in a module other than the "
            + "connector's own must be surfaced in the synthesized model's importStatements, so the "
            + "generated source's cross-module references (e.g. cdc:Service) get an import.")
    public void testImportStatementsCoverCrossModuleReferences() {
        TypeRef.PackageInfo cdcModule = new TypeRef.PackageInfo("ballerinax", "cdc", "cdc", "1.3.2");
        TypeRef.PackageInfo driverModule =
                new TypeRef.PackageInfo("ballerinax", "mssql.cdc.driver", "mssql.cdc.driver", "1.0.2");

        TriggerMetadataModel.Listener listener = new TriggerMetadataModel.Listener(
                "$listener", "Listens for CDC events.",
                new TypeRef("CdcListener", null), null, List.of("$service"), true, null,
                List.of(new TriggerMetadataModel.RequiredImport(
                        TriggerMetadataModel.RequiredImport.IMPORT_TYPE_DRIVER, driverModule)),
                null);

        TriggerMetadataModel.ServiceType serviceType = new TriggerMetadataModel.ServiceType(
                "$service", "A CDC service.", new TypeRef("Service", cdcModule), null, false, true, null, null,
                new TriggerMetadataModel.ServiceType.Handlers(false, List.of()),
                null);

        TriggerMetadataModel authoring = new TriggerMetadataModel(
                "v1.0", List.of(listener), List.of(serviceType), List.of(), List.of());

        TriggerLibraryFacts facts = new TriggerLibraryFacts(
                List.of(new TriggerLibraryFacts.Listener("CdcListener", List.of())),
                List.of(new TriggerLibraryFacts.ServiceType("Service", null, List.of())),
                List.of());

        Optional<TriggerUISchemaModel> result = TriggerModelSynthesizer.synthesize(authoring, facts, null,
                "mssql.cdc", "MSSQL CDC", "icon-url", "event",
                "ballerinax", "mssql.cdc", "mssql.cdc", "1.0.0");

        Assert.assertTrue(result.isPresent());
        List<String> importStatements = result.get().importStatements();
        Assert.assertTrue(importStatements.contains("ballerinax/cdc"),
                "Expected the service type's own module to be a required import: " + importStatements);
        Assert.assertTrue(importStatements.contains("ballerinax/mssql.cdc.driver as _"),
                "Expected the listener's required driver import to be surfaced as side-effect-only: "
                        + importStatements);
        Assert.assertFalse(importStatements.contains("ballerinax/mssql.cdc"),
                "The connector's own module must not be duplicated into importStatements -- "
                        + "SchemaDrivenSourceGenerator already emits that import separately.");
    }

    @Test(description = "A single-module connector (service type and listener both in the connector's own "
            + "module) needs no extra imports.")
    public void testNoImportStatementsWhenEverythingIsSelfModule() {
        TriggerMetadataModel.Listener listener = new TriggerMetadataModel.Listener(
                "$listener", "Listens for events.",
                new TypeRef("Listener", null), null, List.of("$service"), false, null, null, null);
        TriggerMetadataModel.ServiceType serviceType = new TriggerMetadataModel.ServiceType(
                "$service", "A service.", new TypeRef("Service", null), null, false, false, null, null,
                new TriggerMetadataModel.ServiceType.Handlers(false, List.of()),
                null);
        TriggerMetadataModel authoring = new TriggerMetadataModel(
                "v1.0", List.of(listener), List.of(serviceType), List.of(), List.of());
        TriggerLibraryFacts facts = new TriggerLibraryFacts(
                List.of(new TriggerLibraryFacts.Listener("Listener", List.of())),
                List.of(new TriggerLibraryFacts.ServiceType("Service", null, List.of())),
                List.of());

        Optional<TriggerUISchemaModel> result = TriggerModelSynthesizer.synthesize(authoring, facts, null,
                "kafka", "Kafka", "icon-url", "event",
                "ballerinax", "kafka", "kafka", "1.0.0");

        Assert.assertTrue(result.isPresent());
        Assert.assertTrue(result.get().importStatements().isEmpty());
    }
}
