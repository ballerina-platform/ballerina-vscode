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
import java.util.Map;

/**
 * Verifies the schema-driven source generator's listener-argument collection (CHOICE + GROUP_SECTION
 * aware) against the connector-agnostic codedata walk.
 *
 * @since 1.8.0
 */
public class SchemaDrivenSourceGeneratorTest {

    private final Gson gson = new Gson();

    @Test
    public void testChoiceAndGroupSectionListener() throws Exception {
        // HubSpot ships a CHOICE (create-new vs use-existing) whose create-new branch nests the
        // listener params in a GROUP_SECTION. The generator must resolve the choice, build the
        // config record from the group's CONFIG_FIELD children as positional arg 1, and place the
        // nested listenOn as positional arg 2 — not flatten everything into map order.
        Path creationPath = resource("connector_models/hubspot/resources/service-creation.json");
        ServiceInitModel creation = gson.fromJson(
                Files.readString(creationPath, StandardCharsets.UTF_8), ServiceInitModel.class);

        // The prefix is `hubspot`, the module's natural last-segment: this overload has no target file
        // to check for a collision against (e.g. a base `ballerinax/hubspot` import already bound to
        // `hubspot`), so it emits the plain, unaliased prefix — the generated alias is a fallback the
        // file-aware path takes only once it actually observes that collision.
        String listener = SchemaDrivenSourceGenerator.buildListenerDeclaration(creation);
        Assert.assertEquals(listener,
                "listener hubspot:Listener hubspotListener = "
                        + "new ({clientSecret: clientSecretValue, callbackURL: callbackUrlValue}, 8090);",
                "config record must be positional arg 1 (from the group) and listenOn positional arg 2");

        String block = SchemaDrivenSourceGenerator.buildServiceBlockForTrigger(creation, null);
        Assert.assertTrue(block.contains("service hubspot:CompanyService on hubspotListener {"),
                "service descriptor must come from the SERVICE_TYPE_DESCRIPTOR field, got:\n" + block);
    }

    @Test
    public void testUseExistingListenerAttachesWithoutDeclaration() throws Exception {
        // Filled submission with the "use existing" branch selected: the service must attach to the
        // chosen listener (KEY_EXISTING_LISTENER) and NOT emit a new listener declaration.
        Path creationPath = resource("connector_models/hubspot/resources/service-creation-existing.json");
        ServiceInitModel creation = gson.fromJson(
                Files.readString(creationPath, StandardCharsets.UTF_8), ServiceInitModel.class);

        String block = SchemaDrivenSourceGenerator.buildServiceBlockForTrigger(creation, null);
        Assert.assertFalse(block.contains("listener hubspot:Listener"),
                "no new listener should be declared when attaching to an existing one, got:\n" + block);
        Assert.assertTrue(block.contains("service hubspot:ContactService on myHubspotListener {"),
                "service must attach to the selected existing listener, got:\n" + block);
    }

    @Test
    public void testCreateNewListenerWithAllOptionalParamsBlankStillDeclaresListener() throws Exception {
        Path creationPath = resource("connector_models/smb/resources/service-creation-blank-listener.json");
        ServiceInitModel creation = gson.fromJson(
                Files.readString(creationPath, StandardCharsets.UTF_8), ServiceInitModel.class);

        String block = SchemaDrivenSourceGenerator.buildServiceBlockForTrigger(creation, null);
        Assert.assertTrue(block.contains("listener smb:Listener smbListener = new ();"),
                "an empty-arg listener declaration must still be emitted, got:\n" + block);
        Assert.assertTrue(block.contains("on smbListener {"),
                "the service must attach to the declared listener, got:\n" + block);
    }

    @Test
    public void testListenerVarNameBallerinaTypeOverridesDefaultListenerTypeName() throws Exception {
        // MSSQL CDC's listener type is `mssql:CdcListener`, not `mssql:Listener` (the assumed default
        // for every other connector). The listenerVarName field's IDENTIFIER type carries the real
        // type via `ballerinaType`, and the generator must use it instead of `<protocol>:Listener`.
        Path creationPath = resource("connector_models/mssql_cdc/resources/service-creation.json");
        ServiceInitModel creation = gson.fromJson(
                Files.readString(creationPath, StandardCharsets.UTF_8), ServiceInitModel.class);

        String listener = SchemaDrivenSourceGenerator.buildListenerDeclaration(creation);
        Assert.assertTrue(listener.startsWith("listener mssql:CdcListener mssqlCdcListener = new ("),
                "listener type must come from listenerVarName's ballerinaType hint, got:\n" + listener);
    }

    @Test
    public void testTextSetFieldRendersAsArrayLiteralFromValues() throws Exception {
        // MSSQL CDC's `databaseNames` is a TEXT_SET: the UI submits its entries via `values` (a list),
        // leaving `value` empty. The generic leaf-rendering path must fall back to `values` and emit
        // an array literal, or the field silently drops out of the generated record.
        Path creationPath = resource("connector_models/mssql_cdc/resources/service-creation.json");
        ServiceInitModel creation = gson.fromJson(
                Files.readString(creationPath, StandardCharsets.UTF_8), ServiceInitModel.class);

        String listener = SchemaDrivenSourceGenerator.buildListenerDeclaration(creation);
        Assert.assertTrue(listener.contains("databaseNames: [\"db1\", \"db2\"]"),
                "TEXT_SET field must render as an array literal from `values`, got:\n" + listener);
    }

    @Test
    public void testCdcOperationFlagsFoldIntoOptionsSkippedOperations() throws Exception {
        // MSSQL CDC's Insert/Update/Delete checkboxes are CDC_OPERATION_ENABLE flags: a deselected
        // one (value "false") contributes its op-code to `options.skippedOperations`, and an enabled
        // one contributes nothing. The fixture leaves Insert on, Update/Delete off, so only "u"/"d"
        // must appear — folded into a fresh `options` argument (the user left options empty).
        Path creationPath = resource("connector_models/mssql_cdc/resources/service-creation.json");
        ServiceInitModel creation = gson.fromJson(
                Files.readString(creationPath, StandardCharsets.UTF_8), ServiceInitModel.class);

        String listener = SchemaDrivenSourceGenerator.buildListenerDeclaration(creation);
        Assert.assertEquals(listener,
                "listener mssql:CdcListener mssqlCdcListener = new (database = {hostname: \"localhost\", "
                        + "port: 1433, username: \"sa\", password: \"pass\", databaseNames: [\"db1\", \"db2\"]}, "
                        + "options = {skippedOperations: [\"u\", \"d\"]});",
                "deselected CDC operations must fold into a trailing options.skippedOperations arg");
        Assert.assertFalse(listener.contains("enableCreate") || listener.contains("enableUpdate"),
                "CDC operation flags must not emit as their own listener args, got:\n" + listener);
    }

    @Test
    public void testMysqlCdcListenerDeclaration() throws Exception {
        // MySQL CDC: databases -> database.includedDatabases (a TEXT_SET, optional), no schemas/
        // databaseInstance, port 3306, listener type mysql:CdcListener, and Update/Delete deselected.
        Path creationPath = resource("connector_models/mysql_cdc/resources/service-creation.json");
        ServiceInitModel creation = gson.fromJson(
                Files.readString(creationPath, StandardCharsets.UTF_8), ServiceInitModel.class);

        String listener = SchemaDrivenSourceGenerator.buildListenerDeclaration(creation);
        Assert.assertEquals(listener,
                "listener mysql:CdcListener mysqlCdcListener = new (database = {hostname: \"localhost\", "
                        + "port: 3306, username: \"sa\", password: \"pass\", includedDatabases: [\"db1\"]}, "
                        + "options = {skippedOperations: [\"u\", \"d\"]});");
    }

    @Test
    public void testPostgresqlCdcListenerDeclaration() throws Exception {
        // PostgreSQL CDC: a single required databaseName (TEXT, not a set), schemas ->
        // database.includedSchemas, port 5432, listener type postgresql:CdcListener, and a fourth
        // Truncate operation flag (deselected here alongside Update/Delete).
        Path creationPath = resource("connector_models/postgresql_cdc/resources/service-creation.json");
        ServiceInitModel creation = gson.fromJson(
                Files.readString(creationPath, StandardCharsets.UTF_8), ServiceInitModel.class);

        String listener = SchemaDrivenSourceGenerator.buildListenerDeclaration(creation);
        Assert.assertEquals(listener,
                "listener postgresql:CdcListener postgresqlCdcListener = new (database = {hostname: "
                        + "\"localhost\", port: 5432, username: \"sa\", password: \"pass\", databaseName: "
                        + "\"mydb\", includedSchemas: [\"public\"]}, options = {skippedOperations: "
                        + "[\"u\", \"d\", \"t\"]});");
    }

    @Test
    public void testCdcFlagWithoutPathAndUnqualifiedListenerType() throws Exception {
        // The add-service submission for CDC uses a flat layout where the operation flags carry
        // CDC_OPERATION_ENABLE with only an originalName (no dotted path), and listenerVarName's type
        // hint is unqualified ("CdcListener"). The generator must (a) module-prefix the listener type
        // and (b) still fold the deselected flags into options.skippedOperations by convention.
        Path creationPath = resource("connector_models/mssql_cdc_flat/resources/service-creation.json");
        ServiceInitModel creation = gson.fromJson(
                Files.readString(creationPath, StandardCharsets.UTF_8), ServiceInitModel.class);

        String listener = SchemaDrivenSourceGenerator.buildListenerDeclaration(creation);
        Assert.assertTrue(listener.startsWith("listener mssql:CdcListener mssqlCdcListener = new ("),
                "unqualified listener type must be module-prefixed, got:\n" + listener);
        Assert.assertTrue(listener.contains("options = {skippedOperations: [\"u\"]}"),
                "a path-less CDC flag must still fold into options.skippedOperations, got:\n" + listener);
    }

    @Test
    public void testFtpProtocolChoiceEmitsOwnValueAsListenerArg() {
        // FTP's `protocol` field is itself a CHOICE (FTP/SFTP/FTPS), unlike a structural CHOICE such
        // as ASB's entityConfig whose real value comes entirely from its children's own dotted paths.
        // A CHOICE branch tagged ENUM_VALUE (see ftp.json) means the parent's own selected value is a
        // real listener arg that must be emitted, not just a branch selector.
        ServiceInitModel model = TriggerModelReader.getInstance().getBundledServiceInitModel("ftp").orElseThrow();
        String listener = SchemaDrivenSourceGenerator.buildListenerDeclaration(model);
        Assert.assertTrue(listener.contains("protocol = ftp:FTP"),
                "the default-selected FTP branch must emit `protocol = ftp:FTP`, got:\n" + listener);
        Assert.assertFalse(listener.contains("auth ="),
                "No Authentication (the default) must not emit an `auth` arg, got:\n" + listener);
    }

    @Test
    public void testFtpsProtocolChoiceAndSecureSocket() {
        // FTPS was missing from the schema-driven model entirely (the pre-migration hardcoded builder
        // supported it). Selecting it must emit `protocol = ftp:FTPS` plus the advanced
        // `secureSocket` field.
        ServiceInitModel model = TriggerModelReader.getInstance().getBundledServiceInitModel("ftp").orElseThrow();
        Value protocol = listenerConfigProperties(model).get("protocol");
        selectChoiceByValue(protocol, "FTPS");
        Value ftps = selectedChoice(protocol);
        ftps.getProperties().get("secureSocket").setValue("{cert: \"/path/to/cert.crt\"}");

        String listener = SchemaDrivenSourceGenerator.buildListenerDeclaration(model);
        Assert.assertTrue(listener.contains("protocol = ftp:FTPS"),
                "selecting FTPS must emit `protocol = ftp:FTPS`, got:\n" + listener);
        // ftp:AuthConfiguration nests secureSocket under `auth` (see module-ballerina-ftp's
        // commons.bal) — it is not a top-level ListenerConfiguration field, so the correct emission
        // folds it into the `auth` record rather than emitting a standalone `secureSocket = {...}` arg.
        Assert.assertTrue(listener.contains("auth = {secureSocket: {cert: \"/path/to/cert.crt\"}}"),
                "FTPS's secureSocket must be emitted under `auth`, got:\n" + listener);
    }

    @Test
    public void testSftpSupportsBasicAuthenticationAlongsideCertificateAuth() {
        // The pre-migration hardcoded builder's SFTP branch offered No Auth / Basic Auth / Certificate
        // Auth as alternatives; the schema-driven model previously hardcoded private-key auth as the
        // only option. Selecting Basic Authentication for SFTP must fold into
        // `auth.credentials.{username,password}`.
        ServiceInitModel model = TriggerModelReader.getInstance().getBundledServiceInitModel("ftp").orElseThrow();
        Value protocol = listenerConfigProperties(model).get("protocol");
        selectChoiceByValue(protocol, "SFTP");
        Value sftp = selectedChoice(protocol);
        Value auth = sftp.getProperties().get("auth");
        selectChoiceByLabel(auth, "Basic Authentication");

        String listener = SchemaDrivenSourceGenerator.buildListenerDeclaration(model);
        Assert.assertTrue(listener.contains("protocol = ftp:SFTP"),
                "selecting SFTP must emit `protocol = ftp:SFTP`, got:\n" + listener);
        Assert.assertTrue(listener.contains("auth = {credentials: {username: \"user\", password: \"password\"}}"),
                "SFTP's Basic Authentication choice must render auth.credentials, got:\n" + listener);
    }

    @Test
    public void testMcpServiceConfigNestsInfoRecordFromDottedPaths() {
        // MCP's init form carries the annotation-bound `serviceName`/`version` fields under the dotted
        // paths info.name/info.version (they address mcp:StreamableHttpServiceConfig's nested `info`
        // record, not top-level fields). A dotted SERVICE_ANNOTATION path must nest into a mapping
        // constructor, not render as a literal `info.name: ...` key — which is not valid Ballerina
        // mapping-field syntax.
        ServiceInitModel model = TriggerModelReader.getInstance().getBundledServiceInitModel("mcp").orElseThrow();
        String block = SchemaDrivenSourceGenerator.buildServiceBlockForTrigger(model, null);
        Assert.assertTrue(
                block.contains("@mcp:StreamableHttpServiceConfig {info: {name: \"MCP Service\", "
                        + "version: \"1.0.0\"}}"),
                "info.name/info.version must nest under a single info record, got:\n" + block);
    }

    @Test
    public void testProtocolEmittedFromEnabledBranchWhenParentValueCleared() {
        // Regression: on submit the front end signals a picked radio via the enabled branch's own value,
        // and does not always echo the parent CHOICE's `value` back. Clearing the parent value (leaving
        // only the enabled SFTP branch) must still emit `protocol = ftp:SFTP`.
        ServiceInitModel model = TriggerModelReader.getInstance().getBundledServiceInitModel("ftp").orElseThrow();
        Value protocol = listenerConfigProperties(model).get("protocol");
        protocol.setValue("");
        for (Value branch : protocol.getChoices()) {
            branch.setEnabled("SFTP".equals(branch.getValue()));
        }

        String listener = SchemaDrivenSourceGenerator.buildListenerDeclaration(model);
        Assert.assertTrue(listener.contains("protocol = ftp:SFTP"),
                "protocol must come from the enabled branch even when the parent value is blank, got:\n" + listener);
    }

    /** Drills into the FTP model's `listener` -> create-new -> `listenerConfig` properties map. */
    private static Map<String, Value> listenerConfigProperties(ServiceInitModel model) {
        Value listener = model.getProperties().get("listener");
        Value createNew = listener.getChoices().getFirst();
        return createNew.getProperties().get("listenerConfig").getProperties();
    }

    private static void selectChoiceByValue(Value choiceField, String value) {
        // Mirrors the UI picking a radio: the enabled branch carries the selection (its own value is what
        // gets emitted). The parent `value` is set too for good measure, but the generator reads the
        // enabled branch (see testProtocolEmittedFromEnabledBranchWhenParentValueCleared).
        choiceField.setValue(value);
        for (Value choice : choiceField.getChoices()) {
            choice.setEnabled(value.equals(choice.getValue()));
        }
    }

    private static void selectChoiceByLabel(Value choiceField, String label) {
        for (Value choice : choiceField.getChoices()) {
            choice.setEnabled(label.equals(choice.getMetadata().label()));
        }
    }

    private static Value selectedChoice(Value choiceField) {
        return choiceField.getChoices().stream().filter(Value::isEnabled).findFirst().orElseThrow();
    }

    private Path resource(String name) throws Exception {
        return Paths.get(getClass().getClassLoader().getResource(name).toURI());
    }
}
