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
import org.testng.Assert;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_LISTENER_CONFIG;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_LISTENER_TYPE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_LISTENER_VAR_NAME;

/**
 * Corpus guard over every bundled trigger model's authored listener form. Companion to
 * {@link TriggerLayoutTest}, and for the same reason: the init form is resolved by string-matched
 * {@code codedata}, so a mis-shaped tree degrades silently where a build failure would have named the file.
 *
 * <p>Four invariants: one listener form per model, since {@code findListenerChoice} takes the first; every
 * {@code LISTENER_VAR_NAME} states its {@code ballerinaType}, which is what the generator emits; listener-type
 * branches are pairwise distinct, since that name is how a declared listener is matched to its branch; and no
 * key is declared both inside and outside the listener form, which would render two inputs for one field.
 *
 * @since 1.10.0
 */
public class TriggerListenerChoiceTest {

    /** Every corpus module key. Fails hard on an empty corpus. */
    @DataProvider(name = "bundledModules")
    public Object[][] bundledModules() {
        List<GeneratedTriggerCorpus.Entry> entries = GeneratedTriggerCorpus.all();
        Assert.assertFalse(entries.isEmpty(), "generated trigger corpus is empty");
        return entries.stream().map(entry -> new Object[]{entry.key()}).toArray(Object[][]::new);
    }

    @Test(dataProvider = "bundledModules")
    public void testAtMostOneListenerFormPerModel(String moduleName) {
        List<TriggerUISchemaModel.Property> found = new ArrayList<>();
        collectByCodedataType(initProperties(moduleName), CD_TYPE_LISTENER_CONFIG, found);
        Assert.assertTrue(found.size() <= 1, moduleName + ": " + found.size() + " `" + CD_TYPE_LISTENER_CONFIG
                + "` nodes. findListenerChoice takes the first, so any other is authored and never wired up"
                + " to the project's existing listeners.");
    }

    @Test(dataProvider = "bundledModules")
    public void testEveryListenerVarNameNamesItsType(String moduleName) {
        List<TriggerUISchemaModel.Property> varNames = new ArrayList<>();
        collectByCodedataType(initProperties(moduleName), CD_TYPE_LISTENER_VAR_NAME, varNames);
        for (TriggerUISchemaModel.Property varName : varNames) {
            Assert.assertNotNull(ballerinaTypeOf(varName), moduleName + ": a `" + CD_TYPE_LISTENER_VAR_NAME
                    + "` field states no `ballerinaType`, so the generator would fall back to a bare"
                    + " `<protocol>:Listener` — a type this connector may not have.");
        }
    }

    @Test(dataProvider = "bundledModules")
    public void testListenerTypeBranchesAreDistinct(String moduleName) {
        List<TriggerUISchemaModel.Property> selectors = new ArrayList<>();
        collectByCodedataType(initProperties(moduleName), CD_TYPE_LISTENER_TYPE, selectors);
        for (TriggerUISchemaModel.Property selector : selectors) {
            List<TriggerUISchemaModel.Property> branches = orEmpty(selector.choices());
            Assert.assertTrue(branches.size() >= 2, moduleName + ": a `" + CD_TYPE_LISTENER_TYPE + "` choice"
                    + " with " + branches.size() + " branch(es) is a selector with nothing to select."
                    + " A single-listener connector must omit it entirely.");
            Set<String> seen = new LinkedHashSet<>();
            for (TriggerUISchemaModel.Property branch : branches) {
                List<TriggerUISchemaModel.Property> varNames = new ArrayList<>();
                collectByCodedataType(branch.properties(), CD_TYPE_LISTENER_VAR_NAME, varNames);
                collectInChoices(branch, CD_TYPE_LISTENER_VAR_NAME, varNames);
                Assert.assertEquals(varNames.size(), 1, moduleName + ": a `" + CD_TYPE_LISTENER_TYPE
                        + "` branch holds " + varNames.size() + " listener-name fields; it must hold exactly"
                        + " one, since that field is what identifies the branch.");
                String type = simpleName(ballerinaTypeOf(varNames.get(0)));
                Assert.assertNotNull(type, moduleName + ": a `" + CD_TYPE_LISTENER_TYPE + "` branch states no"
                        + " `ballerinaType`, so it cannot be told apart from its siblings.");
                Assert.assertTrue(seen.add(type), moduleName + ": two `" + CD_TYPE_LISTENER_TYPE
                        + "` branches both describe `" + type + "`. Matching a declared listener back to its"
                        + " branch would be ambiguous with no way to break the tie.");
            }
        }
    }

    @Test(dataProvider = "bundledModules")
    public void testNoFieldIsDeclaredBothInsideAndOutsideTheListenerForm(String moduleName) {
        Map<String, TriggerUISchemaModel.Property> initProperties = initProperties(moduleName);
        List<TriggerUISchemaModel.Property> listenerForms = new ArrayList<>();
        collectByCodedataType(initProperties, CD_TYPE_LISTENER_CONFIG, listenerForms);
        if (listenerForms.isEmpty()) {
            return;
        }
        Set<String> outside = new LinkedHashSet<>(initProperties.keySet());
        outside.removeIf(key -> {
            TriggerUISchemaModel.Codedata codedata = initProperties.get(key).codedata();
            return codedata != null && CD_TYPE_LISTENER_CONFIG.equals(codedata.type());
        });
        for (TriggerUISchemaModel.Property listenerForm : listenerForms) {
            for (String key : keysWithin(listenerForm)) {
                Assert.assertFalse(outside.contains(key), moduleName + ": `" + key + "` is declared both"
                        + " inside the listener form and beside it. The form would show two inputs for one"
                        + " field, and generation would quietly use the one inside. Pick one: beside the"
                        + " choice if every listener shares it, inside a listener's branch if only that"
                        + " listener gives it meaning.");
            }
        }
    }

    // ---- helpers -------------------------------------------------------------------------------

    /** Every property key anywhere inside a subtree, choices included. */
    private Set<String> keysWithin(TriggerUISchemaModel.Property root) {
        Set<String> keys = new LinkedHashSet<>();
        collectKeys(root.properties(), keys);
        for (TriggerUISchemaModel.Property choice : orEmpty(root.choices())) {
            if (choice != null) {
                keys.addAll(keysWithin(choice));
            }
        }
        return keys;
    }

    private void collectKeys(Map<String, TriggerUISchemaModel.Property> properties, Set<String> keys) {
        if (properties == null) {
            return;
        }
        properties.forEach((key, property) -> {
            keys.add(key);
            if (property != null) {
                keys.addAll(keysWithin(property));
            }
        });
    }

    private Map<String, TriggerUISchemaModel.Property> initProperties(String key) {
        GeneratedTriggerCorpus.Entry entry = GeneratedTriggerCorpus.get(key);
        TriggerUISchemaModel model = TriggerModelReader.getInstance()
                .getGeneratedTriggerModel(entry.org(), entry.module(), entry.version())
                .orElseThrow(() -> new AssertionError(key + ": generated model failed to load"));
        Assert.assertNotNull(model.initProperties(), key + ": a generated model states an init form");
        return model.initProperties();
    }

    /** Every node in the subtree whose {@code codedata.type} or {@code codedata.argType} matches. */
    private void collectByCodedataType(Map<String, TriggerUISchemaModel.Property> properties, String wanted,
                                       List<TriggerUISchemaModel.Property> into) {
        if (properties == null) {
            return;
        }
        for (TriggerUISchemaModel.Property property : properties.values()) {
            if (property == null) {
                continue;
            }
            TriggerUISchemaModel.Codedata codedata = property.codedata();
            if (codedata != null
                    && (wanted.equals(codedata.type()) || wanted.equals(codedata.argType()))) {
                into.add(property);
            }
            collectByCodedataType(property.properties(), wanted, into);
            collectInChoices(property, wanted, into);
        }
    }

    private void collectInChoices(TriggerUISchemaModel.Property property, String wanted,
                                  List<TriggerUISchemaModel.Property> into) {
        for (TriggerUISchemaModel.Property choice : orEmpty(property.choices())) {
            if (choice == null) {
                continue;
            }
            TriggerUISchemaModel.Codedata codedata = choice.codedata();
            if (codedata != null
                    && (wanted.equals(codedata.type()) || wanted.equals(codedata.argType()))) {
                into.add(choice);
            }
            collectByCodedataType(choice.properties(), wanted, into);
            collectInChoices(choice, wanted, into);
        }
    }

    /** The first non-blank {@code ballerinaType} among a field's rendering candidates, as the generator reads it. */
    private String ballerinaTypeOf(TriggerUISchemaModel.Property property) {
        for (TriggerUISchemaModel.PropertyType type : orEmpty(property.types())) {
            if (type != null && type.ballerinaType() != null && !type.ballerinaType().isBlank()) {
                return type.ballerinaType();
            }
        }
        return null;
    }

    /** {@code mcp:StreamableHttpListener -> StreamableHttpListener}, matching the generator's own trim. */
    private String simpleName(String qualified) {
        if (qualified == null) {
            return null;
        }
        int colon = qualified.lastIndexOf(':');
        return colon < 0 ? qualified : qualified.substring(colon + 1);
    }

    private <T> List<T> orEmpty(List<T> list) {
        return list == null ? List.of() : list;
    }
}
