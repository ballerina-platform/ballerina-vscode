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
import io.ballerina.servicemodelgenerator.extension.model.LayoutSection;
import io.ballerina.servicemodelgenerator.extension.model.Parameter;
import org.testng.Assert;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

import java.util.List;

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

    /** A handler that authors no layout must reach the designer with none, not with an empty one. */
    @Test(dataProvider = "cdcModules")
    public void testAbsentAuthoredLayoutStaysAbsent(String moduleName) {
        TriggerUISchemaModel model = model(moduleName);
        for (TriggerUISchemaModel.ServiceTypeModel serviceType : model.serviceTypes()) {
            for (TriggerUISchemaModel.FunctionModel handler : serviceType.schemaFunctions()) {
                if (handler.layout() != null) {
                    continue;
                }
                for (Function wire : TriggerFunctionAdapter.toFunctions(handler)) {
                    Assert.assertNull(wire.getLayout(), moduleName + "/" + handler.name()
                            + ": a handler that authors no layout must not gain an empty one");
                }
            }
        }
    }

    /** An empty authored list is the same statement as no list at all, and must normalise to null. */
    @Test
    public void testEmptyAuthoredLayoutNormalisesToNull() {
        TriggerUISchemaModel.FunctionModel authored =
                withLayout(schemaFunction(model("kafka"), "onConsumerRecord"), List.of());
        Assert.assertNull(TriggerFunctionAdapter.toFunction(authored).getLayout(),
                "an empty layout list must normalise to null rather than an empty list");
    }

    /** A null authored list must stay null rather than becoming an empty one. */
    @Test
    public void testNullAuthoredLayoutStaysNull() {
        TriggerUISchemaModel.FunctionModel authored =
                withLayout(schemaFunction(model("kafka"), "onConsumerRecord"), null);
        Assert.assertNull(TriggerFunctionAdapter.toFunction(authored).getLayout(),
                "a null layout must not become an empty list");
    }

    /** An authored layout must survive the schema -> wire hop intact. */
    @Test
    public void testAuthoredLayoutReachesTheWireModel() {
        TriggerUISchemaModel.FunctionModel authored = withLayout(
                schemaFunction(model("kafka"), "onConsumerRecord"),
                List.of(new TriggerUISchemaModel.LayoutSection("msg", "Message", null, null,
                                List.of("records")),
                        new TriggerUISchemaModel.LayoutSection("adv", "Advanced", "Rarely needed.", true,
                                List.of("caller")),
                        new TriggerUISchemaModel.LayoutSection(null, null, null, null, List.of("*rest"))));

        List<LayoutSection> layout = TriggerFunctionAdapter.toFunction(authored).getLayout();
        Assert.assertNotNull(layout, "an authored layout must reach the wire model");
        Assert.assertEquals(layout.size(), 3, "every authored section must survive");
        Assert.assertEquals(layout.get(0).id(), "msg");
        Assert.assertEquals(layout.get(0).label(), "Message");
        Assert.assertEquals(layout.get(0).fields(), List.of("records"));
        Assert.assertNull(layout.get(0).description(), "an undescribed section must stay undescribed");
        Assert.assertNull(layout.get(0).advanced(), "a section that does not opt into advanced stays null");
        Assert.assertEquals(layout.get(1).description(), "Rarely needed.");
        Assert.assertEquals(layout.get(1).advanced(), Boolean.TRUE,
                "an advanced section must reach the designer marked advanced");
        Assert.assertNull(layout.get(2).label(), "an unlabelled section must stay unlabelled");
        Assert.assertEquals(layout.get(2).fields(), List.of("*rest"));
    }

    /** Every variant the adapter fans out must carry the handler's layout. */
    @Test
    public void testEveryFannedOutVariantCarriesTheLayout() {
        TriggerUISchemaModel.FunctionModel authored = withLayout(
                schemaFunction(model("ftp"), "onFileCsv"),
                List.of(new TriggerUISchemaModel.LayoutSection("msg", "Message", null, null,
                        List.of("content"))));

        List<Function> variants = TriggerFunctionAdapter.toFunctions(authored);
        Assert.assertFalse(variants.isEmpty(), "the fan-out must produce at least one function");
        for (Function variant : variants) {
            Assert.assertNotNull(variant.getLayout(),
                    variant.getVariantLabel() + ": every variant must inherit the handler's layout");
            Assert.assertEquals(variant.getLayout().get(0).label(), "Message");
        }
    }

    /** Copies a schema function, substituting its layout. */
    private TriggerUISchemaModel.FunctionModel withLayout(TriggerUISchemaModel.FunctionModel model,
                                                          List<TriggerUISchemaModel.LayoutSection> layout) {
        return new TriggerUISchemaModel.FunctionModel(model.metadata(), model.name(), model.nameEditable(),
                model.nameMetadata(), model.kind(), model.accessor(), model.qualifiers(), model.group(),
                model.variantLabel(), model.enabled(), model.editable(), model.optional(),
                model.canAddParameters(), model.repeatable(), model.documentation(), model.documentationSchema(),
                model.parameters(), model.parameterSchema(), model.properties(), model.returnType(), layout,
                model.codedata(), model.validations());
    }
}
