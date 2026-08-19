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
import io.ballerina.servicemodelgenerator.extension.connector.adapter.TriggerFunctionAdapter;
import io.ballerina.servicemodelgenerator.extension.model.Function;
import io.ballerina.servicemodelgenerator.extension.model.Parameter;
import org.testng.Assert;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

/**
 * Unit test for {@link TriggerFunctionAdapter}: the {@code bindingGroup} carried by a CDC
 * {@code onUpdate} handler's {@code before}/{@code after} parameters so they render as one bindable
 * payload UI section (see {@code trigger-models/{mssql,mysql,postgresql,oracledb}.json}) though
 * staying independent real Ballerina parameters.
 *
 * @since 1.9.0
 */
public class TriggerFunctionAdapterTest {

    private TriggerUISchemaModel model(String moduleName) {
        return TriggerModelReader.getInstance().getBundledTriggerModel(moduleName).orElseThrow();
    }

    private TriggerUISchemaModel.FunctionModel schemaFunction(TriggerUISchemaModel model, String name) {
        return model.serviceTypes().getFirst().schemaFunctions().stream()
                .filter(f -> name.equals(f.name())).findFirst().orElseThrow();
    }

    private Parameter parameter(Function function, String name) {
        return function.getParameters().stream()
                .filter(p -> name.equals(p.getName().getValue())).findFirst().orElseThrow();
    }

    @DataProvider(name = "cdcModules")
    public Object[][] cdcModules() {
        return new Object[][]{{"mssql"}, {"mysql"}, {"postgresql"}, {"oracledb"}};
    }

    @Test(dataProvider = "cdcModules")
    public void testOnUpdateBeforeAfterShareBindingGroup(String moduleName) {
        Function onUpdate = TriggerFunctionAdapter.toFunction(schemaFunction(model(moduleName), "onUpdate"));
        Parameter before = parameter(onUpdate, "before");
        Parameter after = parameter(onUpdate, "after");

        String beforeGroup = before.getBindingGroup();
        String afterGroup = after.getBindingGroup();
        Assert.assertNotNull(beforeGroup, moduleName + ": before's bindingGroup must not be null");
        Assert.assertFalse(beforeGroup.isBlank(), moduleName + ": before's bindingGroup must not be blank");
        Assert.assertEquals(afterGroup, beforeGroup,
                moduleName + ": before/after must share the same bindingGroup");
    }

    @Test(dataProvider = "cdcModules")
    public void testOnReadSinglePayloadParamHasNoBindingGroup(String moduleName) {
        Function onRead = TriggerFunctionAdapter.toFunction(schemaFunction(model(moduleName), "onRead"));
        Parameter afterEntry = parameter(onRead, "after");
        Assert.assertNull(afterEntry.getBindingGroup(),
                moduleName + ": onRead's single payload param must not be grouped");
    }
}
