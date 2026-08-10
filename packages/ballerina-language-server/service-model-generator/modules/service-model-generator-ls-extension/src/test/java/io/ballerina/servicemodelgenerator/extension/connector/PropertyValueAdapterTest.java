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
import io.ballerina.servicemodelgenerator.extension.connector.adapter.PropertyValueAdapter;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.List;

/**
 * Unit test for {@link PropertyValueAdapter}'s {@code TriggerUISchemaModel.Property} <-> wire {@code Value}
 * conversion — the generic converter used for annotation-tree/composition-flag properties (as opposed
 * to the specialized payload-parameter construction in {@code TriggerFunctionAdapter}).
 *
 * @since 1.9.0
 */
public class PropertyValueAdapterTest {

    @Test
    public void testToValueMapsCoreFields() {
        TriggerUISchemaModel.Property property = leaf("hello", true, false, true, true);

        Value value = PropertyValueAdapter.toValue(property);

        Assert.assertEquals(value.getValue(), "hello");
        Assert.assertTrue(value.isEnabled());
        Assert.assertFalse(value.isEditable());
        Assert.assertTrue(value.isOptional());
        Assert.assertTrue(value.isAdvanced());
    }

    @Test
    public void testToValuePreservesNameEditableOnCodedata() {
        // Regression: toCodedata used to silently drop nameEditable even though the wire Codedata
        // class fully supports it (dormant today only because the one schema usage of
        // codedata.nameEditable — PAYLOAD_TYPE/PAYLOAD_TYPE_INCLUDED_RECORD — bypasses this generic
        // converter via TriggerFunctionAdapter's own specialized construction).
        TriggerUISchemaModel.Codedata modelCodedata = codedata("SOME_TYPE", true);
        TriggerUISchemaModel.Property property = new TriggerUISchemaModel.Property(null, true, true, false, false, null,
                "x", null, null, null, null, modelCodedata, null);

        Value value = PropertyValueAdapter.toValue(property);

        Assert.assertEquals(value.getCodedata().getNameEditable(), Boolean.TRUE,
                "nameEditable must round-trip through the generic model-to-wire conversion");
    }

    @Test
    public void testToPropertyPreservesNameEditableOnCodedata() {
        io.ballerina.servicemodelgenerator.extension.model.Codedata wireCodedata =
                new io.ballerina.servicemodelgenerator.extension.model.Codedata("SOME_TYPE");
        wireCodedata.setNameEditable(true);
        Value value = new Value.ValueBuilder().value("x").setCodedata(wireCodedata)
                .enabled(true).editable(true).build();

        TriggerUISchemaModel.Property property = PropertyValueAdapter.toProperty(value);

        Assert.assertEquals(property.codedata().nameEditable(), Boolean.TRUE,
                "nameEditable must round-trip through the generic wire-to-model conversion");
    }

    @Test
    public void testWireFieldTypeMapsMetadataFlagToFlag() {
        TriggerUISchemaModel.PropertyType metadataFlag =
                new TriggerUISchemaModel.PropertyType("METADATA_FLAG", true, "boolean", null, null, null, null, null);
        TriggerUISchemaModel.Property property = new TriggerUISchemaModel.Property(null, true, true, false, false, null,
                "true", List.of(metadataFlag), null, null, null, null, null);

        Value value = PropertyValueAdapter.toValue(property);

        Assert.assertEquals(value.getTypes().getFirst().fieldType(), Value.FieldType.FLAG,
                "METADATA_FLAG (no wire constant) must render as a FLAG checkbox");
    }

    @Test
    public void testWireFieldTypeFallsBackToExpressionForUnrecognizedFieldType() {
        TriggerUISchemaModel.PropertyType unknown =
                new TriggerUISchemaModel.PropertyType("SOME_FUTURE_WIDGET", true, "string", null, null, null, null,
                        null);
        TriggerUISchemaModel.Property property = new TriggerUISchemaModel.Property(null, true, true, false, false, null,
                "x", List.of(unknown), null, null, null, null, null);

        Value value = PropertyValueAdapter.toValue(property);

        Assert.assertEquals(value.getTypes().getFirst().fieldType(), Value.FieldType.EXPRESSION,
                "an unrecognized open-vocabulary fieldType must fall back to EXPRESSION, not throw");
    }

    @Test
    public void testToValueRecursesThroughNestedPropertiesAndChoices() {
        TriggerUISchemaModel.Property child = leaf("child-value", true, true, false, false);
        TriggerUISchemaModel.Property choice = leaf("choice-value", true, true, false, false);
        TriggerUISchemaModel.Property parent = new TriggerUISchemaModel.Property(null, true, true, false, false, null,
                null, null, null, List.of(choice), java.util.Map.of("child", child), null, null);

        Value value = PropertyValueAdapter.toValue(parent);

        Assert.assertEquals(value.getProperties().get("child").getValue(), "child-value");
        Assert.assertEquals(value.getChoices().getFirst().getValue(), "choice-value");
    }

    private static TriggerUISchemaModel.Property leaf(String value, boolean enabled, boolean editable,
                                              boolean optional, boolean advanced) {
        return new TriggerUISchemaModel.Property(null, enabled, editable, optional, advanced, null, value,
                null, null, null, null, null, null);
    }

    private static TriggerUISchemaModel.Codedata codedata(String type, boolean nameEditable) {
        return new TriggerUISchemaModel.Codedata(type, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                nameEditable);
    }
}
