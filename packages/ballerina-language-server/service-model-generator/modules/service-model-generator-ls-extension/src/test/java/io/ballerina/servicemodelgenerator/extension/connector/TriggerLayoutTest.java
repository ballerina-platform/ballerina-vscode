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

import com.google.gson.Gson;
import com.google.gson.JsonElement;
import com.google.gson.reflect.TypeToken;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerUISchemaModel;
import io.ballerina.servicemodelgenerator.extension.connector.adapter.TriggerFunctionAdapter;
import io.ballerina.servicemodelgenerator.extension.model.Codedata;
import io.ballerina.servicemodelgenerator.extension.model.Function;
import io.ballerina.servicemodelgenerator.extension.model.Parameter;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import io.ballerina.servicemodelgenerator.extension.util.Constants;
import org.testng.Assert;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

import java.io.InputStream;
import java.io.InputStreamReader;
import java.lang.reflect.Type;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Corpus guard over every bundled trigger model's authored handler {@code layout}. Layout ids are resolved
 * in the webview, so a typo silently drops an input into the remainder instead of failing a build; this
 * moves that to build time. Ids resolve against the wire model, since the adapter lifts a
 * {@code COMPLEX_PAYLOAD}'s composition siblings into the function's {@code properties}. For a handler that
 * fans out into variants, an id need only resolve in one of them.
 *
 * @since 1.9.0
 */
public class TriggerLayoutTest {

    private static final String BUNDLED_REGISTRY_RESOURCE = "bundled_trigger_models.json";
    private static final Type REGISTRY_TYPE = new TypeToken<Map<String, JsonElement>>() { }.getType();

    /** The ids the designer reserves for its own units. Must stay in step with handlerLayout.ts. */
    private static final Set<String> RESERVED_IDS = Set.of(
            "$variant", "$description", "$name", "$documentation", "$parameters", "$returnType", "$headers");

    /** The one placement directive; {@code *}-prefixed because it names no unit. */
    private static final String REST_DIRECTIVE = "*rest";

    /** Every bundled module key, read off the registry. Fails hard on an empty registry. */
    @DataProvider(name = "bundledModules")
    public Object[][] bundledModules() {
        Map<String, JsonElement> registry;
        try (InputStream stream = TriggerModelReader.class.getClassLoader()
                .getResourceAsStream(BUNDLED_REGISTRY_RESOURCE)) {
            Assert.assertNotNull(stream, "bundled trigger model registry not found on the classpath");
            registry = new Gson().fromJson(
                    new InputStreamReader(stream, StandardCharsets.UTF_8), REGISTRY_TYPE);
        } catch (Exception e) {
            throw new AssertionError("could not read " + BUNDLED_REGISTRY_RESOURCE, e);
        }
        Assert.assertNotNull(registry, "bundled trigger model registry did not parse");
        Assert.assertFalse(registry.isEmpty(), "bundled trigger model registry is empty");
        return registry.keySet().stream().map(key -> new Object[]{key}).toArray(Object[][]::new);
    }

    @Test(dataProvider = "bundledModules")
    public void testEveryAuthoredLayoutIdResolves(String moduleName) {
        TriggerUISchemaModel model = TriggerModelReader.getInstance().getBundledTriggerModel(moduleName)
                .orElseThrow(() -> new AssertionError(moduleName + ": bundled model failed to load"));

        for (TriggerUISchemaModel.ServiceTypeModel serviceType : orEmpty(model.serviceTypes())) {
            for (TriggerUISchemaModel.FunctionModel handler : allHandlers(serviceType)) {
                checkLayout(moduleName, handler);
            }
        }
    }

    private void checkLayout(String moduleName, TriggerUISchemaModel.FunctionModel handler) {
        List<TriggerUISchemaModel.LayoutSection> layout = handler.layout();
        if (layout == null || layout.isEmpty()) {
            return;
        }
        String where = moduleName + "/" + handler.name();
        Set<String> addressable = addressableIds(handler);
        Set<String> claimed = new HashSet<>();
        Set<String> sectionIds = new HashSet<>();
        int restCount = 0;

        for (TriggerUISchemaModel.LayoutSection section : layout) {
            String sectionId = section.id() != null ? section.id().trim() : "";
            if (!sectionId.isEmpty()) {
                Assert.assertTrue(sectionIds.add(sectionId),
                        where + ": section id \"" + sectionId + "\" is reused by more than one section; each "
                                + "becomes a React key in the form and must be unique");
            }
            Assert.assertNotNull(section.fields(),
                    where + ": a layout section must declare `fields`; an empty section renders nothing");
            Assert.assertFalse(section.fields().isEmpty(),
                    where + ": a layout section must declare at least one field");
            for (String field : section.fields()) {
                Assert.assertNotNull(field, where + ": a layout field id must not be null");
                if (REST_DIRECTIVE.equals(field)) {
                    restCount++;
                    continue;
                }
                Assert.assertFalse(field.startsWith("*"),
                        where + ": \"" + field + "\" is not a layout directive; the only one is \""
                                + REST_DIRECTIVE + "\"");
                Assert.assertTrue(claimed.add(field),
                        where + ": \"" + field + "\" is claimed by more than one section; only the first "
                                + "mention would take effect");
                if (field.startsWith("$")) {
                    Assert.assertTrue(RESERVED_IDS.contains(field),
                            where + ": \"" + field + "\" is not a reserved layout id; expected one of "
                                    + new java.util.TreeSet<>(RESERVED_IDS));
                } else {
                    Assert.assertTrue(addressable.contains(field),
                            where + ": \"" + field + "\" names no parameter, property or binding group on "
                                    + "this handler; it would be silently skipped. Addressable here: "
                                    + addressable);
                }
            }
        }
        Assert.assertTrue(restCount <= 1,
                where + ": \"" + REST_DIRECTIVE + "\" may appear at most once; later placements are ignored");

        for (String id : addressable) {
            Assert.assertFalse(RESERVED_IDS.contains(id) || REST_DIRECTIVE.equals(id),
                    where + ": the field \"" + id + "\" collides with a reserved layout id, so a layout "
                            + "could never address it. Rename the field.");
        }
    }

    /** Property {@code codedata.type} values {@code handlerUnitsOf} in handlerLayout.ts renders as a unit. */
    private static final Set<String> ADDRESSABLE_PROPERTY_TYPES = Set.of(
            Constants.CD_TYPE_METADATA_FLAG, Constants.CD_TYPE_PAYLOAD_MODIFIER,
            Constants.CD_TYPE_COMPLEX_FUNCTION_ANNOTATION, Constants.CD_TYPE_ANNOTATION_ATTACHMENT);

    /**
     * Every bare id an author may write for this handler, unioned over its wire variants. Mirrors the
     * predicate {@code handlerUnitsOf} (handlerLayout.ts) uses to decide what it renders as a unit: a
     * plain, non-advanced, non-payload parameter (e.g. asb's {@code caller}) never becomes a unit there,
     * so it must not be addressable here either.
     */
    private Set<String> addressableIds(TriggerUISchemaModel.FunctionModel handler) {
        Set<String> ids = new LinkedHashSet<>();
        for (Function variant : TriggerFunctionAdapter.toFunctions(handler)) {
            for (Parameter parameter : orEmpty(variant.getParameters())) {
                if (!parameter.isAdvanced() && !isPayloadParameter(parameter)) {
                    continue;
                }
                if (parameter.getName() != null && parameter.getName().getValue() != null
                        && !parameter.getName().getValue().isBlank()) {
                    ids.add(parameter.getName().getValue());
                }
                if (parameter.getBindingGroup() != null) {
                    ids.add(parameter.getBindingGroup());
                }
            }
            if (variant.getProperties() != null) {
                for (Map.Entry<String, Value> property : variant.getProperties().entrySet()) {
                    Codedata codedata = property.getValue() != null ? property.getValue().getCodedata() : null;
                    if (codedata != null && ADDRESSABLE_PROPERTY_TYPES.contains(codedata.getType())) {
                        ids.add(property.getKey());
                    }
                }
            }
        }
        return ids;
    }

    /** Whether a parameter is a payload (data-binding) parameter; mirrors {@code isPayloadParameter} in
     * payloadComposer.ts. */
    private boolean isPayloadParameter(Parameter parameter) {
        if (Constants.DATA_BINDING.equals(parameter.getKind())) {
            return true;
        }
        Codedata codedata = parameter.getType() != null ? parameter.getType().getCodedata() : null;
        String type = codedata != null ? codedata.getType() : null;
        return Constants.CD_TYPE_PAYLOAD_TYPE.equals(type)
                || Constants.CD_TYPE_PAYLOAD_TYPE_INCLUDED_RECORD.equals(type);
    }

    private List<TriggerUISchemaModel.FunctionModel> allHandlers(TriggerUISchemaModel.ServiceTypeModel type) {
        List<TriggerUISchemaModel.FunctionModel> handlers = new ArrayList<>(orEmpty(type.functions()));
        handlers.addAll(orEmpty(type.schemaFunctions()));
        return handlers;
    }

    private <T> List<T> orEmpty(List<T> list) {
        return list == null ? List.of() : list;
    }
}
