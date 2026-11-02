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

package io.ballerina.servicemodelgenerator.extension.settings;

import io.ballerina.compiler.syntax.tree.NodeParser;
import io.ballerina.servicemodelgenerator.extension.settings.ServiceSettingDescriptors.Descriptor;
import io.ballerina.servicemodelgenerator.extension.settings.ServiceSettingDescriptors.SubField;
import org.testng.Assert;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Invariants of the shipped setting descriptors and of reading and writing record settings.
 */
public class RecordSettingCodecTest {

    private static final List<String> MODULES = List.of("graphql", "http");
    private static final Set<String> EDITOR_KINDS = Set.of("toggle", "number", "text", "record", "contextInit");
    private static final Set<String> FIELD_KINDS = Set.of(RecordSettingCodec.KIND_TOGGLE,
            RecordSettingCodec.KIND_INTEGER, RecordSettingCodec.KIND_DECIMAL, RecordSettingCodec.KIND_TEXT,
            RecordSettingCodec.KIND_TEXT_LIST);

    @DataProvider(name = "descriptors")
    public Object[][] descriptors() {
        List<Object[]> rows = new ArrayList<>();
        for (String module : MODULES) {
            ServiceSettingDescriptors.Definition definition = ServiceSettingDescriptors.forModule(module)
                    .orElseThrow(() -> new AssertionError("No settings for " + module));
            for (Descriptor descriptor : definition.settings()) {
                rows.add(new Object[]{module + ":" + descriptor.field(), descriptor});
            }
        }
        return rows.toArray(Object[][]::new);
    }

    @Test
    public void everyModuleListsEachFieldOnce() {
        for (String module : MODULES) {
            Set<String> fields = new HashSet<>();
            for (Descriptor descriptor : ServiceSettingDescriptors.forModule(module).orElseThrow().settings()) {
                Assert.assertTrue(fields.add(descriptor.field()), module + " lists " + descriptor.field() + " twice");
            }
        }
    }

    @Test(dataProvider = "descriptors")
    public void everyDescriptorIsComplete(String name, Descriptor descriptor) {
        Assert.assertNotNull(descriptor.label(), name);
        Assert.assertNotNull(descriptor.description(), name);
        Assert.assertTrue(EDITOR_KINDS.contains(descriptor.editorKind()), name + ": " + descriptor.editorKind());
        Assert.assertEquals(descriptor.fields() != null, "record".equals(descriptor.editorKind()),
                name + ": only a record setting has sub-fields");
        if (descriptor.fields() == null) {
            return;
        }
        Set<String> names = new HashSet<>();
        for (SubField subField : descriptor.fields()) {
            Assert.assertTrue(names.add(subField.name()), name + " lists " + subField.name() + " twice");
            Assert.assertNotNull(subField.label(), name + "." + subField.name());
            Assert.assertTrue(FIELD_KINDS.contains(subField.kind()), name + "." + subField.name());
            if (subField.defaultValue() != null) {
                // A default the codec cannot write would make every value compare unequal to it.
                RecordSettingCodec.toLiteral(subField, subField.defaultValue());
            }
        }
    }

    @Test(dataProvider = "descriptors")
    public void recordValuesReadBackAsWritten(String name, Descriptor descriptor) {
        if (descriptor.fields() == null) {
            return;
        }
        Map<String, Object> values = new LinkedHashMap<>();
        for (SubField subField : descriptor.fields()) {
            values.put(subField.name(), sample(subField));
        }
        String written = RecordSettingCodec.write(descriptor, values);
        Assert.assertFalse(NodeParser.parseExpression(written).hasDiagnostics(), name + ": " + written);
        Map<String, Object> read = RecordSettingCodec.read(descriptor, written)
                .orElseThrow(() -> new AssertionError(name + ": not read back: " + written));
        Assert.assertEquals(normalize(read), normalize(values), name + ": " + written);
    }

    @Test(dataProvider = "descriptors")
    public void defaultsAreLeftOut(String name, Descriptor descriptor) {
        if (descriptor.fields() == null) {
            return;
        }
        Map<String, Object> defaults = new LinkedHashMap<>();
        for (SubField subField : descriptor.fields()) {
            if (subField.defaultValue() != null) {
                defaults.put(subField.name(), subField.defaultValue());
            }
        }
        Assert.assertEquals(RecordSettingCodec.write(descriptor, defaults), "{}", name);
    }

    @DataProvider(name = "unstructured")
    public Object[][] unstructured() {
        return new Object[][]{
                {"corsConfig"},
                {"{allowOrigins: ORIGINS}"},
                {"{allowOrigins: [\"*\", origin]}"},
                {"{maxAge: 0x10}"},
                {"{allowCredentials: \"true\"}"},
                {"{unknown: true}"},
                {"{allowOrigins: [\"a\"], allowOrigins: [\"b\"]}"},
                {"{...base}"},
                {"{allowOrigins}"},
        };
    }

    @Test(dataProvider = "unstructured")
    public void valuesTheEditorCannotShowAreUnstructured(String value) {
        Descriptor cors = ServiceSettingDescriptors.forModule("http").orElseThrow().settings().stream()
                .filter(descriptor -> descriptor.field().equals("cors"))
                .findFirst()
                .orElseThrow();
        Assert.assertTrue(RecordSettingCodec.read(cors, value).isEmpty(), value);
    }

    @Test
    public void numbersAreWrittenPlainly() {
        SubField decimal = new SubField("maxAge", "Max age", null, RecordSettingCodec.KIND_DECIMAL, null, null);
        SubField integer = new SubField("maxSize", "Max size", null, RecordSettingCodec.KIND_INTEGER, null, null);
        Assert.assertEquals(RecordSettingCodec.toLiteral(decimal, 30.50), "30.5");
        Assert.assertEquals(RecordSettingCodec.toLiteral(decimal, -1.0), "-1");
        Assert.assertEquals(RecordSettingCodec.toLiteral(decimal, "1e3"), "1000");
        Assert.assertEquals(RecordSettingCodec.toLiteral(integer, 120.0), "120");
        Assert.assertThrows(IllegalArgumentException.class, () -> RecordSettingCodec.toLiteral(integer, 1.5));
        Assert.assertThrows(IllegalArgumentException.class, () -> RecordSettingCodec.toLiteral(integer, "ten"));
    }

    /**
     * A value of the sub-field's kind that differs from its default, with text that needs escaping.
     */
    private static Object sample(SubField subField) {
        return switch (subField.kind()) {
            case RecordSettingCodec.KIND_TOGGLE -> !Boolean.TRUE.equals(subField.defaultValue());
            case RecordSettingCodec.KIND_INTEGER -> 42L;
            case RecordSettingCodec.KIND_DECIMAL -> new BigDecimal("12.5");
            case RecordSettingCodec.KIND_TEXT -> "a \"quoted\" \\ path";
            default -> List.of("https://a.example", "with \"quote\"");
        };
    }

    /**
     * Numbers as plain decimal strings, so a long and a decimal of the same value compare equal.
     */
    private static Map<String, Object> normalize(Map<String, Object> values) {
        Map<String, Object> normalized = new LinkedHashMap<>();
        values.forEach((key, value) -> normalized.put(key, value instanceof Number number
                ? new BigDecimal(number.toString()).stripTrailingZeros().toPlainString() : value));
        return normalized;
    }
}
