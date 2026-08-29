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

import io.ballerina.servicemodelgenerator.extension.model.Codedata;
import io.ballerina.servicemodelgenerator.extension.model.Function;
import io.ballerina.servicemodelgenerator.extension.model.Parameter;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.List;

/**
 * Direct unit tests for {@link IncludedRecordBinder}'s pure helpers — {@code typeIdentifierOf} and
 * {@code includedRecordParam} -- plus the shared {@link PayloadComposer#applyTemplate} it wraps its
 * wrapper-type templates through. {@code forAdd}/{@code forUpdate}/
 * {@code overlayFromSource} themselves need a compiled project (via {@code DatabindUtil}) and are
 * already exercised indirectly through the {@code add_function}/{@code update_function}/
 * {@code get_sm_from_source} fixture suites for kafka and rabbitmq's included-record payloads.
 *
 * @since 1.9.0
 */
public class IncludedRecordBinderTest {

    @Test
    public void testTypeIdentifierOfPrefersExplicitTypeIdentifier() {
        Codedata codedata = new Codedata("PAYLOAD_TYPE_INCLUDED_RECORD");
        codedata.setTypeIdentifier("KafkaAnydataConsumer");
        codedata.setDefaultType("kafka:AnydataConsumerRecord");

        Assert.assertEquals(IncludedRecordBinder.typeIdentifierOf(codedata), "KafkaAnydataConsumer");
    }

    @Test
    public void testTypeIdentifierOfFallsBackToDefaultTypeLocalName() {
        Codedata codedata = new Codedata("PAYLOAD_TYPE_INCLUDED_RECORD");
        codedata.setDefaultType("kafka:AnydataConsumerRecord");

        Assert.assertEquals(IncludedRecordBinder.typeIdentifierOf(codedata), "AnydataConsumerRecord",
                "falls back to the base type's local name (module-qualifier stripped) when unset");
    }

    @Test
    public void testTypeIdentifierOfHandlesUnqualifiedDefaultType() {
        Codedata codedata = new Codedata("PAYLOAD_TYPE_INCLUDED_RECORD");
        codedata.setDefaultType("AnydataConsumerRecord");

        Assert.assertEquals(IncludedRecordBinder.typeIdentifierOf(codedata), "AnydataConsumerRecord");
    }

    @Test
    public void testTypeIdentifierOfDefaultsToPayloadRecordWhenNothingAvailable() {
        Codedata codedata = new Codedata("PAYLOAD_TYPE_INCLUDED_RECORD");

        Assert.assertEquals(IncludedRecordBinder.typeIdentifierOf(codedata), "PayloadRecord",
                "a blank typeIdentifier and blank defaultType must not produce a blank/invalid identifier");
    }

    @Test
    public void testApplyTemplateSubstitutesPlaceholder() {
        Assert.assertEquals(PayloadComposer.applyTemplate("{{type}}[]", "KafkaAnydataConsumer1"),
                "KafkaAnydataConsumer1[]");
    }

    @Test
    public void testApplyTemplateReturnsElementWhenTemplateBlank() {
        Assert.assertEquals(PayloadComposer.applyTemplate(null, "Foo"), "Foo");
        Assert.assertEquals(PayloadComposer.applyTemplate("", "Foo"), "Foo");
    }

    @Test
    public void testApplyTemplateMissingPlaceholderReturnsTemplateUnchanged() {
        // Now shared with PayloadComposer (see its javadoc): a template missing {{type}}/standalone-T is
        // returned as-is rather than falling back to the element -- callers (e.g. IncludedRecordBinder)
        // are expected to have already normalized the template (see TriggerFunctionAdapter#normalizeTemplate)
        // before it reaches here.
        Assert.assertEquals(PayloadComposer.applyTemplate("stream<error?>", "Foo"), "stream<error?>");
    }

    @Test
    public void testApplyTemplateHandlesNullElement() {
        Assert.assertEquals(PayloadComposer.applyTemplate("{{type}}[]", null), "[]");
    }

    @Test
    public void testIncludedRecordParamFindsTheMatchingParameter() {
        Parameter plain = parameterWithCodedataType(null);
        Parameter includedRecord = parameterWithCodedataType("PAYLOAD_TYPE_INCLUDED_RECORD");
        Function function = new Function.FunctionBuilder()
                .parameters(List.of(plain, includedRecord))
                .build();

        Assert.assertSame(IncludedRecordBinder.includedRecordParam(function), includedRecord);
    }

    @Test
    public void testIncludedRecordParamReturnsNullWhenNoneMatch() {
        Function function = new Function.FunctionBuilder()
                .parameters(List.of(parameterWithCodedataType("PAYLOAD_TYPE"), parameterWithCodedataType(null)))
                .build();

        Assert.assertNull(IncludedRecordBinder.includedRecordParam(function));
    }

    @Test
    public void testIncludedRecordParamHandlesNullFunctionAndParameters() {
        Assert.assertNull(IncludedRecordBinder.includedRecordParam(null));
        Assert.assertNull(IncludedRecordBinder.includedRecordParam(new Function.FunctionBuilder().build()));
    }

    private static Parameter parameterWithCodedataType(String codedataType) {
        Value type;
        if (codedataType == null) {
            type = new Value.ValueBuilder().value("json").build();
        } else {
            Codedata codedata = new Codedata(codedataType);
            type = new Value.ValueBuilder().value("json").setCodedata(codedata).build();
        }
        return new Parameter.Builder().type(type).name(new Value.ValueBuilder().value("payload").build()).build();
    }
}
