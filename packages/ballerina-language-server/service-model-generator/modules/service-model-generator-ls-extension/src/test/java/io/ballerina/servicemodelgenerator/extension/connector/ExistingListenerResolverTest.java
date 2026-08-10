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
import io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Verifies {@link ExistingListenerResolver} resolves an existing listener's config from the model
 * (create-new params as the field template) + the parsed source args — the generic equivalent of the
 * FTP/RabbitMQ per-connector extraction. The source-parse itself needs the LS; here the parsed args are
 * supplied directly to exercise the (pure) template-building and mapping.
 *
 * @since 1.8.0
 */
public class ExistingListenerResolverTest {

    @Test
    public void testResolveConfigFromModelAndParsedArgs() throws Exception {
        // create-new branch = choices[0] of the HubSpot configureListener CHOICE.
        Value createNewBranch = loadHubspotCreationModel().getProperties()
                .get("configureListener").getChoices().get(0);

        ExistingListenerResolver.ListenerTemplate template =
                ExistingListenerResolver.collectTemplate(createNewBranch);

        // A parsed `new ({clientSecret: "s", callbackURL: "c"}, 8090)`:
        LinkedHashMap<String, Object> record = new LinkedHashMap<>();
        record.put("clientSecret", "\"s\"");
        record.put("callbackURL", "\"c\"");
        ExistingListenerResolver.ParsedListener parsed = new ExistingListenerResolver.ParsedListener(
                List.of(ExistingListenerResolver.ParsedArg.record(record),
                        ExistingListenerResolver.ParsedArg.scalar("8090")),
                new LinkedHashMap<>());

        Map<String, Value> fields = ExistingListenerResolver.buildFieldsFromParsed(parsed, template);

        // Config-record fields (positional arg 1) resolved onto their templates, read-only.
        Assert.assertTrue(fields.containsKey("clientSecret"), "clientSecret resolved from the config record");
        Assert.assertEquals(fields.get("clientSecret").getValue(), "\"s\"");
        Assert.assertFalse(fields.get("clientSecret").isEditable(), "resolved config is read-only");
        Assert.assertEquals(fields.get("clientSecret").getMetadata().label(), "Client Secret",
                "label comes from the model template");
        Assert.assertTrue(fields.containsKey("callbackURL"));

        // Nested positional param (arg 2) resolved onto its template. It is `optional` in the model, but
        // resolved read-only fields must be optional=false or the UI (DropdownChoiceForm) hides them.
        Assert.assertTrue(fields.containsKey("listenOn"), "listenOn resolved from positional arg 2");
        Assert.assertEquals(fields.get("listenOn").getValue(), "8090");
        Assert.assertFalse(fields.get("listenOn").isEditable());
        Assert.assertFalse(fields.get("listenOn").isOptional(), "resolved fields must be non-optional to render");
        Assert.assertFalse(fields.get("clientSecret").isOptional());
    }

    @Test
    public void testSelectorHasNoOptionsSoNestedConfigRenders() {
        // Regression: the SINGLE_SELECT must expose choices via `items` and per-listener config via
        // `properties`, but must NOT carry `options` — otherwise the front end (isDropDownType) routes it
        // to the enum/expression editor and never renders the nested DropdownChoiceForm.
        Map<String, Value> perListener = new LinkedHashMap<>();
        perListener.put("a", new Value.ValueBuilder().value("a").build());
        perListener.put("b", new Value.ValueBuilder().value("b").build());

        Value selector = ExistingListenerResolver.assembleSelector(List.of("a", "b"), perListener, "hubspot");

        Assert.assertEquals(selector.getTypes().getFirst().fieldType(), Value.FieldType.SINGLE_SELECT);
        Assert.assertNull(selector.getTypes().getFirst().options(),
                "SINGLE_SELECT must have no options, else the nested config is hidden by the UI");
        Assert.assertEquals(selector.getItems(), List.of("a", "b"), "choices come from items");
        Assert.assertEquals(selector.getProperties().keySet(), perListener.keySet(),
                "per-listener config comes from properties");
        Assert.assertTrue(selector.isEditable(), "must be editable so DropdownChoiceForm is used");
    }

    @Test
    public void testFtpBasicAuthResolvesNestedAuthChoice() {
        Map<String, Value> template = createNewProperties("ftp");

        // new (protocol = ftp:FTP, host = "localhost", port = 21,
        //      auth = {credentials: {username: "user", password: "password"}})
        Map<String, Object> named = new LinkedHashMap<>();
        named.put("protocol", "ftp:FTP");
        named.put("host", "\"localhost\"");
        named.put("port", "21");
        named.put("auth", record("credentials",
                record("username", "\"user\"", "password", "\"password\"")));

        Map<String, Value> fields = ExistingListenerResolver.resolveIncludedFields(template, named);

        Assert.assertEquals(fields.get("host").getValue(), "\"localhost\"", "host resolved read-only");
        Assert.assertEquals(fields.get("port").getValue(), "21", "port resolved from the FTP branch");
        Assert.assertFalse(fields.containsKey("protocol"), "the enum selector itself is not shown as a field");
        Assert.assertFalse(fields.containsKey("listenerVarName"), "the var name is the dropdown, not a config field");

        Value auth = fields.get("auth");
        Assert.assertNotNull(auth, "the auth record is rebuilt as a CHOICE, not a raw blob");
        Assert.assertFalse(auth.isEditable(), "resolved auth is read-only");
        Value selected = enabledChoice(auth);
        Assert.assertEquals(selected.getMetadata().label(), "Basic Authentication");
        Assert.assertEquals(selected.getProperties().get("username").getValue(), "\"user\"");
        Assert.assertEquals(selected.getProperties().get("password").getValue(), "\"password\"");
    }

    @Test
    public void testFtpNoAuthArgumentSelectsNoAuthenticationBranch() {
        Map<String, Value> template = createNewProperties("ftp");

        // new (protocol = ftp:FTP, host = "localhost", port = 21) — no auth argument at all.
        Map<String, Object> named = new LinkedHashMap<>();
        named.put("protocol", "ftp:FTP");
        named.put("host", "\"localhost\"");
        named.put("port", "21");

        Map<String, Value> fields = ExistingListenerResolver.resolveIncludedFields(template, named);

        Value auth = fields.get("auth");
        Assert.assertNotNull(auth);
        Assert.assertEquals(enabledChoice(auth).getMetadata().label(), "No Authentication",
                "with no auth argument the empty branch is selected");
    }

    @Test
    public void testCdcDottedPathsResolveAndFlagsAreDropped() {
        Map<String, Value> template = createNewProperties("mysql");

        // new (database = {hostname: "localhost", port: 3306, username: "root", password: "pass"},
        //      options = {snapshotMode: "initial"}, livenessInterval = 10)
        Map<String, Object> named = new LinkedHashMap<>();
        named.put("database", record("hostname", "\"localhost\"", "port", "3306",
                "username", "\"root\"", "password", "\"pass\""));
        named.put("options", record("snapshotMode", "\"initial\""));
        named.put("livenessInterval", "10");

        Map<String, Value> fields = ExistingListenerResolver.resolveIncludedFields(template, named);

        Assert.assertEquals(fields.get("hostname").getValue(), "\"localhost\"", "database.hostname resolved");
        Assert.assertEquals(fields.get("port").getValue(), "3306", "database.port resolved");
        Assert.assertEquals(fields.get("username").getValue(), "\"root\"", "database.username resolved");
        Assert.assertEquals(fields.get("password").getValue(), "\"pass\"", "database.password resolved");
        Assert.assertEquals(fields.get("options").getValue(), "{snapshotMode: \"initial\"}",
                "a whole record-typed included field is rendered back as a record literal");
        Assert.assertEquals(fields.get("livenessInterval").getValue(), "10");

        // Values that cannot be resolved from the source are dropped, not shown empty.
        Assert.assertFalse(fields.containsKey("secureSocket"), "absent optional field is dropped");
        Assert.assertFalse(fields.containsKey("internalSchemaStorage"), "absent optional field is dropped");
        // CDC operation flags map to a derived skip-list, not an exact value -> dropped.
        Assert.assertFalse(fields.containsKey("enableCreate"), "CDC operation flags are dropped");
        Assert.assertFalse(fields.containsKey("enableUpdate"), "CDC operation flags are dropped");
    }

    @Test
    public void testSftpOverlappingAuthBranchesPreferFirstDeclaredOnExactTie() {
        // Regression/documentation test for a real ambiguity in the bundled schema itself (not a
        // hypothetical): SFTP's `auth` CHOICE declares three branches — No Authentication (0 leaves),
        // Basic Authentication (auth.credentials.{username,password} — password optional), and
        // Certificate Based Authentication (auth.privateKey.path, auth.credentials.username). The
        // latter two both declare 2 leaves AND both include auth.credentials.username. If the source
        // only has `auth = {credentials: {username: "user"}}` — e.g. a real Certificate-auth listener
        // whose privateKey.path is a variable reference the source-parser cannot resolve to a literal,
        // leaving only username extractable — both branches resolve exactly 1 field out of 2 declared:
        // an exact (score, leaves) tie. resolveRecordChoice has no signal to break this correctly; it
        // deterministically keeps whichever branch is declared first (Basic Authentication), which is
        // silently WRONG when the listener was actually configured for Certificate auth. This test
        // pins that current, known-imperfect behavior rather than changing it blind — see LS-2 review.
        Map<String, Value> template = createNewProperties("ftp");
        Value protocol = template.get("listenerConfig").getProperties().get("protocol");
        Value sftpBranch = protocol.getChoices().stream()
                .filter(c -> "SFTP".equals(c.getValue()))
                .findFirst().orElseThrow();
        Map<String, Value> sftpTemplate = sftpBranch.getProperties();

        Map<String, Object> named = new LinkedHashMap<>();
        named.put("auth", record("credentials", record("username", "\"user\"")));

        Map<String, Value> fields = ExistingListenerResolver.resolveIncludedFields(sftpTemplate, named);

        Value auth = fields.get("auth");
        Assert.assertNotNull(auth, "auth CHOICE must still render even on an exact tie");
        Assert.assertEquals(enabledChoice(auth).getMetadata().label(), "Basic Authentication",
                "on an exact (score, leaves) tie between overlapping branches, the first-declared branch "
                        + "wins by construction — even though the source may actually be Certificate auth "
                        + "with an unresolvable privateKey.path. Known heuristic limitation, not a bug fix "
                        + "target: change this assertion deliberately if the tie-break is ever revisited.");
    }

    @Test
    public void testSapJcoServerConfigChoiceAndNestedRepositoryDestinationResolve() {
        Value createNewBranch = sapJcoCreateNewBranch();
        ExistingListenerResolver.ListenerTemplate template = ExistingListenerResolver.collectTemplate(createNewBranch);

        // new (<jco:ServerConfig>{gwhost: "sap-gw.example.com", gwserv: "3300", progid: "JCO_LISTENER",
        //      repositoryDestination: {ashost: "sap.example.com", sysnr: "00", jcoClient: "100",
        //                              user: "admin", passwd: "pass"}})
        LinkedHashMap<String, Object> repositoryDestination = record(
                "ashost", "\"sap.example.com\"", "sysnr", "\"00\"", "jcoClient", "\"100\"",
                "user", "\"admin\"", "passwd", "\"pass\"");
        LinkedHashMap<String, Object> serverConfig = record(
                "gwhost", "\"sap-gw.example.com\"", "gwserv", "\"3300\"", "progid", "\"JCO_LISTENER\"",
                "repositoryDestination", repositoryDestination);
        ExistingListenerResolver.ParsedListener parsed = new ExistingListenerResolver.ParsedListener(
                List.of(ExistingListenerResolver.ParsedArg.record(serverConfig)), new LinkedHashMap<>());

        Map<String, Value> fields = ExistingListenerResolver.buildFieldsFromParsed(parsed, template);

        Value serverOrAdvancedConfig = fields.get("serverOrAdvancedConfig");
        Assert.assertNotNull(serverOrAdvancedConfig, "the positional castType CHOICE must resolve");
        Assert.assertFalse(serverOrAdvancedConfig.isEditable(), "resolved as read-only");
        Value serverConfigBranch = enabledChoice(serverOrAdvancedConfig);
        Assert.assertEquals(serverConfigBranch.getMetadata().label(), "Server Configuration",
                "ServerConfig's fields resolve, AdvancedConfig's don't -> ServerConfig branch wins");
        Assert.assertEquals(serverConfigBranch.getProperties().get("gwhost").getValue(), "\"sap-gw.example.com\"");
        Assert.assertEquals(serverConfigBranch.getProperties().get("progid").getValue(), "\"JCO_LISTENER\"");

        Value nestedChoice = serverConfigBranch.getProperties().get("repositoryDestination");
        Assert.assertNotNull(nestedChoice, "the nested, slot-less repositoryDestination CHOICE must resolve too");
        Value destinationConfigBranch = enabledChoice(nestedChoice);
        Assert.assertEquals(destinationConfigBranch.getMetadata().label(), "Destination Configurations");
        Assert.assertEquals(destinationConfigBranch.getProperties().get("ashost").getValue(), "\"sap.example.com\"");
        Assert.assertEquals(destinationConfigBranch.getProperties().get("user").getValue(), "\"admin\"");
    }

    @Test
    public void testSapJcoPositionalResolutionSurvivesIncludedFieldMerge() {
        // Regression: resolveIncludedFields also walks serverOrAdvancedConfig (against sap.jco's empty
        // named-arg map) and must not clobber buildFieldsFromParsed's already-correct positional result.
        Value createNewBranch = sapJcoCreateNewBranch();
        ExistingListenerResolver.ListenerTemplate template = ExistingListenerResolver.collectTemplate(createNewBranch);
        Map<String, Value> createNewProps = createNewBranch.getProperties();

        LinkedHashMap<String, Object> repositoryDestination = record(
                "ashost", "\"sap.example.com\"", "sysnr", "\"00\"", "jcoClient", "\"100\"",
                "user", "\"admin\"", "passwd", "\"pass\"");
        LinkedHashMap<String, Object> serverConfig = record(
                "gwhost", "\"sap-gw.example.com\"", "gwserv", "\"3300\"", "progid", "\"JCO_LISTENER\"",
                "repositoryDestination", repositoryDestination);
        ExistingListenerResolver.ParsedListener parsed = new ExistingListenerResolver.ParsedListener(
                List.of(ExistingListenerResolver.ParsedArg.record(serverConfig)), new LinkedHashMap<>());

        // Mirrors buildSelector's own merge order exactly.
        Map<String, Value> fields = new LinkedHashMap<>(
                ExistingListenerResolver.buildFieldsFromParsed(parsed, template));
        ExistingListenerResolver.resolveIncludedFields(createNewProps, parsed.named()).forEach(fields::putIfAbsent);

        Value serverConfigBranch = enabledChoice(fields.get("serverOrAdvancedConfig"));
        Assert.assertEquals(serverConfigBranch.getMetadata().label(), "Server Configuration");
        Assert.assertEquals(serverConfigBranch.getProperties().get("gwhost").getValue(), "\"sap-gw.example.com\"",
                "gwhost must survive the merge with resolveIncludedFields's (irrelevant, named-arg) result");
        Assert.assertEquals(serverConfigBranch.getProperties().get("progid").getValue(), "\"JCO_LISTENER\"");
        Value destinationBranch = enabledChoice(serverConfigBranch.getProperties().get("repositoryDestination"));
        Assert.assertEquals(destinationBranch.getProperties().get("ashost").getValue(), "\"sap.example.com\"",
                "the nested repositoryDestination CHOICE must keep its real resolved data, not be clobbered "
                        + "with resolveIncludedFields's empty re-resolution of the same key");
    }

    @Test
    public void testSapJcoRepositoryDestinationAsPlainIdResolvesDestinationIdBranch() {
        Value createNewBranch = sapJcoCreateNewBranch();
        ExistingListenerResolver.ListenerTemplate template = ExistingListenerResolver.collectTemplate(createNewBranch);

        // new (<jco:ServerConfig>{gwhost: "h", gwserv: "s", progid: "p", repositoryDestination: "MY_SAP_DEST"})
        LinkedHashMap<String, Object> serverConfig = record(
                "gwhost", "\"h\"", "gwserv", "\"s\"", "progid", "\"p\"",
                "repositoryDestination", "\"MY_SAP_DEST\"");
        ExistingListenerResolver.ParsedListener parsed = new ExistingListenerResolver.ParsedListener(
                List.of(ExistingListenerResolver.ParsedArg.record(serverConfig)), new LinkedHashMap<>());

        Map<String, Value> fields = ExistingListenerResolver.buildFieldsFromParsed(parsed, template);

        Value nestedChoice = enabledChoice(fields.get("serverOrAdvancedConfig")).getProperties()
                .get("repositoryDestination");
        Value destinationIdBranch = enabledChoice(nestedChoice);
        Assert.assertEquals(destinationIdBranch.getMetadata().label(), "Destination ID");
        Assert.assertEquals(destinationIdBranch.getProperties().get("destinationId").getValue(), "\"MY_SAP_DEST\"");
    }

    @Test
    public void testSapJcoAdvancedConfigBranchRendersRawPropertiesMap() {
        Value createNewBranch = sapJcoCreateNewBranch();
        ExistingListenerResolver.ListenerTemplate template = ExistingListenerResolver.collectTemplate(createNewBranch);

        // new (<jco:AdvancedConfig>{"jco.server.gwhost": "h", "jco.server.progid": "p"})
        LinkedHashMap<String, Object> advancedConfig = record(
                "jco.server.gwhost", "\"h\"", "jco.server.progid", "\"p\"");
        ExistingListenerResolver.ParsedListener parsed = new ExistingListenerResolver.ParsedListener(
                List.of(ExistingListenerResolver.ParsedArg.record(advancedConfig)), new LinkedHashMap<>());

        Map<String, Value> fields = ExistingListenerResolver.buildFieldsFromParsed(parsed, template);

        Value branch = enabledChoice(fields.get("serverOrAdvancedConfig"));
        Assert.assertEquals(branch.getMetadata().label(), "Advanced Properties",
                "no field matches the ServerConfig shape -> AdvancedConfig's whole-map leaf wins");
        Assert.assertEquals(branch.getProperties().get("advancedConfig").getValue(),
                "{jco.server.gwhost: \"h\", jco.server.progid: \"p\"}");
    }

    private static Value sapJcoCreateNewBranch() {
        ServiceInitModel model = TriggerModelReader.getInstance()
                .getBundledServiceInitModel("sap.jco").orElseThrow();
        return model.getProperties().get("listener").getChoices().getFirst();
    }

    private static LinkedHashMap<String, Object> record(Object... keyValues) {
        LinkedHashMap<String, Object> record = new LinkedHashMap<>();
        for (int i = 0; i + 1 < keyValues.length; i += 2) {
            record.put((String) keyValues[i], keyValues[i + 1]);
        }
        return record;
    }

    private static Value enabledChoice(Value choice) {
        return choice.getChoices().stream().filter(Value::isEnabled).findFirst().orElseThrow();
    }

    /** The create-new branch's config fields for a bundled trigger model (choices[0] of the listener CHOICE). */
    private static Map<String, Value> createNewProperties(String moduleName) {
        ServiceInitModel model = TriggerModelReader.getInstance()
                .getBundledServiceInitModel(moduleName).orElseThrow();
        return model.getProperties().get("listener").getChoices().getFirst().getProperties();
    }

    private ServiceInitModel loadHubspotCreationModel() throws Exception {
        Path path = Paths.get(getClass().getClassLoader()
                .getResource("connector_models/hubspot/resources/service-creation.json").toURI());
        return new Gson().fromJson(Files.readString(path, StandardCharsets.UTF_8), ServiceInitModel.class);
    }
}
