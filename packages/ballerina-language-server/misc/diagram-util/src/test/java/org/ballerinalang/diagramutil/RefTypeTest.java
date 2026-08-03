/*
 * Copyright (c) 2025, WSO2 Inc. (http://wso2.com) All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package org.ballerinalang.diagramutil;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.SymbolKind;
import io.ballerina.projects.BuildOptions;
import io.ballerina.projects.ModuleId;
import io.ballerina.projects.PackageCompilation;
import io.ballerina.projects.Project;
import io.ballerina.projects.directory.ProjectLoader;
import org.ballerinalang.diagramutil.connector.models.connector.ReferenceType;
import org.ballerinalang.diagramutil.connector.models.connector.reftypes.RefType;
import org.testng.Assert;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

/**
 * Test for Reference-Based Types.
 */
public class RefTypeTest {

    protected final Gson gson = new GsonBuilder().setPrettyPrinting().disableHtmlEscaping().create();

    @DataProvider(name = "data-provider")
    public Object[][] getConfigsList() throws IOException {
        Path testDataDir = TestUtil.RES_DIR.resolve("RefTypeTest/TestData");
        return Files.list(testDataDir)
                .filter(path -> path.toString().endsWith(".json"))
                .map(path -> new Object[]{path})
                .toArray(Object[][]::new);
    }

    @Test(dataProvider = "data-provider")
    public void getRefTypeForSymbol(Path jsonPath) throws IOException {

        String jsonContent = Files.readString(jsonPath);
        JsonObject jsonObject = JsonParser.parseString(jsonContent).getAsJsonObject();
        String sourcePath = jsonObject.get("source").getAsString();
        String typeSymbolName = jsonObject.get("typeSymbolName").getAsString();
        Path balSourcePath = TestUtil.RES_DIR.resolve(sourcePath);
        Path inputFile = TestUtil.createTempProject(balSourcePath);


        // Tests must never pull from Central; resolve only from the build-provisioned Ballerina home.
        Project project = ProjectLoader.loadProject(inputFile, BuildOptions.builder().setOffline(true).build());
        Optional<ModuleId> optionalModuleId = project.currentPackage().moduleIds().stream().findFirst();
        if (optionalModuleId.isEmpty()) {
            Assert.fail("Failed to retrieve the module ID");
        }
        ModuleId moduleId = optionalModuleId.get();
        PackageCompilation packageCompilation = project.currentPackage().getCompilation();
        SemanticModel semanticModel = packageCompilation.getSemanticModel(moduleId);
        Symbol typeSymbol = semanticModel.moduleSymbols().stream()
            .filter(symbol -> symbol.getName().isPresent() &&
                    symbol.getName().get().equals(typeSymbolName))
            .findFirst()
            .orElseThrow(() -> new RuntimeException("Type symbol '" + typeSymbolName + "' not found"));
        List<Symbol> typeDefSymbols = semanticModel.moduleSymbols().stream()
                .filter(symbol -> symbol.kind() == SymbolKind.TYPE_DEFINITION)
                .toList();
        RefType refType = ReferenceType.fromSemanticSymbol(typeSymbol, typeDefSymbols);
        String refTypeJson = gson.toJson(refType).concat(System.lineSeparator());
        String expectedRefTypeJson = gson.toJson(jsonObject.get("refType")).concat(System.lineSeparator());
        if (!refTypeJson.equals(expectedRefTypeJson)) {
//            updateConfig(jsonPath, refTypeJson);
            Assert.fail(
                    String.format("Reference type JSON does not match.\n Expected : %s\n Received %s",
                            expectedRefTypeJson, refTypeJson));
        }
    }

    protected void updateConfig(Path configJsonPath, String objString) throws IOException {
        String jsonContent = Files.readString(configJsonPath);
        JsonObject jsonObject = JsonParser.parseString(jsonContent).getAsJsonObject();
        JsonElement newRefType = JsonParser.parseString(objString);
        jsonObject.add("refType", newRefType);
        Files.writeString(configJsonPath, gson.toJson(jsonObject));
    }


}
