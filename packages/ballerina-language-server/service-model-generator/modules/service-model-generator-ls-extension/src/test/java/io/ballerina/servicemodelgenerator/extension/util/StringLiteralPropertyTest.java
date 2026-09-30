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
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */
package io.ballerina.servicemodelgenerator.extension.util;

import io.ballerina.modelgenerator.commons.ServiceDeclaration;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import org.testng.Assert;
import org.testng.annotations.Test;

/** A service's string-literal attach point is edited as a {@code STRING_LITERAL} field. */
public class StringLiteralPropertyTest {

    @Test
    public void testStringLiteralPropertyFromSource() {
        Value property = ServiceModelUtils.getStringLiteralProperty("\"orders\"");

        Assert.assertEquals(property.getValue(), "\"orders\"");
        Assert.assertEquals(property.getCodedata().getType(), "STRING_LITERAL");
        Assert.assertEquals(property.getTypes().getFirst().fieldType(), Value.FieldType.STRING_LITERAL);
        Assert.assertTrue(property.isEditable());
    }

    @Test
    public void testStringLiteralPropertyFromTemplate() {
        ServiceDeclaration template = new ServiceDeclaration(
                new ServiceDeclaration.Package(1, "ballerinax", "rabbitmq", "3.6.0"), "RabbitMQ",
                0, null, null, null, 0, 0, null, null, null, 1,
                "Queue Name", "The queue to consume from", "\"\"", "Listener", "event");

        Value property = ServiceModelUtils.getStringLiteral(template);

        Assert.assertEquals(property.getMetadata().label(), "Queue Name");
        Assert.assertEquals(property.getMetadata().description(), "The queue to consume from");
        Assert.assertEquals(property.getPlaceholder(), "\"\"");
        Assert.assertEquals(property.getValue(), "");
        Assert.assertEquals(property.getTypes().getFirst().fieldType(), Value.FieldType.STRING_LITERAL);
        Assert.assertFalse(property.isOptional());
        Assert.assertFalse(property.isAdvanced());
    }
}
