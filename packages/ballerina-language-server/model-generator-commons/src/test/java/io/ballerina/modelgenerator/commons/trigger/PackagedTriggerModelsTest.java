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
import io.ballerina.modelgenerator.commons.trigger.models.TriggerMetadataModel;
import org.testng.Assert;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

/**
 * Round-trips every packaged {@code trigger-metadata-models/<module>/trigger-metadata.json} sample
 * through {@link LibraryMetadataReader}, catching a sample that silently fails to bind against
 * {@link TriggerMetadataModel} or the reader's version gate.
 */
public class PackagedTriggerModelsTest {

    private static final LibraryMetadataReader READER = LibraryMetadataReader.getInstance();

    @DataProvider(name = "packagedModules")
    public Object[][] packagedModules() {
        return new Object[][] {
                {"ftp"}, {"kafka"}, {"mcp"}, {"mssql"}, {"rabbitmq"}, {"smb"},
                {"trigger.github"}, {"trigger.google.calendar"}, {"websub"},
                {"http"}, {"graphql"}, {"grpc"}, {"websocket"}, {"sap.jco"},
                {"solace"}, {"solace.jms"}, {"mqtt"}, {"asb"}, {"aws.sqs"},
                {"mysql"}, {"postgresql"}, {"oracledb"}, {"salesforce"},
                {"trigger.shopify"}, {"trigger.hubspot"}, {"trigger.twilio"},
                {"whatsapp.business"}, {"telegram"}, {"googleapis.chat"}, {"file"},
                {"azure.storage.files"}, {"tcp"},
        };
    }

    @Test(dataProvider = "packagedModules")
    public void testPackagedSampleParsesAndValidates(String moduleName) {
        ModuleInfo moduleInfo = new ModuleInfo("ballerinax", moduleName, moduleName, "1.0.0");
        TriggerMetadataModel model = READER.getPackagedTriggerMetadataModel(moduleInfo)
                .orElseThrow(() -> new AssertionError(moduleName + " failed to parse or pass the version gate"));
        Assert.assertTrue(model.version() != null && model.version().startsWith("v1."),
                moduleName + " has an unexpected version: " + model.version());
        Assert.assertFalse(model.listeners() == null || model.listeners().isEmpty(), moduleName + " has no listeners");
        Assert.assertFalse(model.serviceTypes() == null || model.serviceTypes().isEmpty(),
                moduleName + " has no serviceTypes");
    }
}
