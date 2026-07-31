/*
 *  Copyright (c) 2023, WSO2 LLC. (http://www.wso2.com) All Rights Reserved.
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

package io.ballerina.architecturemodelgenerator.extension.persist;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import io.ballerina.architecturemodelgenerator.core.ArchitectureModel;
import io.ballerina.architecturemodelgenerator.core.Constants;
import io.ballerina.architecturemodelgenerator.core.diagnostics.ArchitectureModelDiagnostic;
import io.ballerina.architecturemodelgenerator.core.diagnostics.DiagnosticMessage;
import io.ballerina.architecturemodelgenerator.core.diagnostics.DiagnosticUtils;
import io.ballerina.architecturemodelgenerator.core.generators.entity.EntityModelGenerator;
import io.ballerina.architecturemodelgenerator.core.model.entity.Entity;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.projects.BuildOptions;
import io.ballerina.projects.PackageCompilation;
import io.ballerina.projects.Project;
import io.ballerina.projects.directory.SingleFileProject;
import org.ballerinalang.annotation.JavaSPIService;
import org.ballerinalang.langserver.commons.service.spi.ExtendedLanguageServerService;
import org.eclipse.lsp4j.jsonrpc.services.JsonRequest;
import org.eclipse.lsp4j.jsonrpc.services.JsonSegment;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * The extended service for generation solution architecture model.
 *
 * @since 1.0.0
 */
@JavaSPIService("org.ballerinalang.langserver.commons.service.spi.ExtendedLanguageServerService")
@JsonSegment("persistERGeneratorService")
public class PersistERModelGeneratorService implements ExtendedLanguageServerService {

    @Override
    public Class<?> getRemoteInterface() {
        return getClass();
    }

    @JsonRequest
    public CompletableFuture<PersistERModelResponse> getPersistERModels(PersistERModelRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            PersistERModelResponse response = new PersistERModelResponse();

            Path path = Path.of(request.getDocumentUri());
            AtomicBoolean hasDiagnosticErrors = new AtomicBoolean(false);
            Map<String, Entity> entities = new HashMap<>();
            try {
                // Persist model file should be loaded as a single file project. Tests (ls.test.offline) force offline
                // resolution so compilation never pulls from Central; production keeps the default behaviour.
                Project project = PackageUtil.isOffline()
                        ? SingleFileProject.load(path, BuildOptions.builder().setOffline(true).build())
                        : SingleFileProject.load(path);
                PackageCompilation currentPackageCompilation = project.currentPackage().getCompilation();
                EntityModelGenerator entityModelGenerator =
                        new EntityModelGenerator(currentPackageCompilation,
                                project.currentPackage().getDefaultModule());

                entities = entityModelGenerator.generate();
                if (currentPackageCompilation.diagnosticResult().hasErrors()) {
                    hasDiagnosticErrors.set(true);
                    List<ArchitectureModelDiagnostic> diagnostics = new ArrayList<>();
                    currentPackageCompilation.diagnosticResult().errors().forEach(diagnostic -> {
                        ArchitectureModelDiagnostic architectureModelDiagnostic =
                                new ArchitectureModelDiagnostic(diagnostic.diagnosticInfo().code(),
                                        diagnostic.diagnosticInfo().messageFormat(),
                                        diagnostic.diagnosticInfo().severity(), diagnostic.location(), null);
                        diagnostics.add(architectureModelDiagnostic);
                    });
                    response.addDiagnostics(diagnostics);
                }
            } catch (Exception e) {
                hasDiagnosticErrors.set(true);
                DiagnosticMessage message = DiagnosticMessage.failedToResolveBallerinaPackage(path.toString(),
                        e.getMessage(), Arrays.toString(e.getStackTrace()));
                response.addDiagnostics
                        (DiagnosticUtils.getDiagnosticResponse(List.of(message), response.getDiagnostics()));
            }

            ArchitectureModel architectureModel = new ArchitectureModel(Constants.MODEL_VERSION, null, null, null,
                    response.getDiagnostics(), new HashMap<>(), entities, null, hasDiagnosticErrors.get(), null);
            Gson gson = new GsonBuilder().serializeNulls().create();
            JsonObject persistERModel = (JsonObject) gson.toJsonTree(architectureModel);

            response.setPersistERModels(persistERModel);
            return response;
        });
    }
}
