/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 * 
 * THIS FILE INCLUDES AUTO GENERATED CODE
 */
import {
    ConnectorUpgradeAdvice,
    ConnectorUpgradeAdviceRequest,
    ConnectorUpgradeAdviceResponse,
    DIRECTORY_MAP,
    ExportOASRequest,
    PullConnectorUpgradeRequest,
    PullConnectorUpgradeResult,
    ExportOASResponse,
    GetOASSpecRequest,
    GetOASSpecResponse,
    FunctionFromSourceRequest,
    FunctionFromSourceResponse,
    FunctionModelRequest,
    FunctionModelResponse,
    FunctionSourceCodeRequest,
    HttpResourceModelRequest,
    HttpResourceModelResponse,
    ListenerModelFromCodeRequest,
    ListenerModelFromCodeResponse,
    ListenerModelRequest,
    ListenerModelResponse,
    ListenerSourceCodeRequest,
    ListenerSourceCodeResponse,
    ListenersRequest,
    ListenersResponse,
    OpenAPISpec,
    PayloadContext,
    ResourceReturnTypesRequest,
    ResourceSourceCodeResponse,
    ServiceDesignerAPI,
    ServiceInitSourceRequest,
    ServiceModelFromCodeRequest,
    ServiceModelFromCodeResponse,
    ServiceModelInitResponse,
    ServiceModelRequest,
    ServiceModelResponse,
    ServiceSourceCodeRequest,
    SourceEditResponse,
    TriggerModelsRequest,
    TriggerModelsResponse,
    UpdatedArtifactsResponse,
    ValidatePropertyRequest,
    ValidatePropertyResponse,
    ValidationResult,
    VisibleTypesResponse
} from "@wso2/ballerina-core";
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import { window, workspace } from "vscode";
import { extension } from "../../BalExtensionContext";
import { StateMachine } from "../../stateMachine";
import { pullAndBumpConnectors } from "../../features/project/connector-upgrade";
import { writeBallerinaFileDidOpen } from "../../utils/modification";
import { updateSourceCode } from "../../utils/source-utils";
import { generateExamplePayload } from "../../features/ai/payload-generator/payload_json";

/**
 * The ERROR-severity subset of a save-time validation response. Only these mean the language server
 * refused to generate source; WARNINGs accompany a successful generation and must not block it.
 */
function getBlockingValidationErrors(validationErrors?: ValidationResult[]): ValidationResult[] {
    return (validationErrors ?? []).filter((error) => error.severity === "ERROR");
}

/**
 * WARNING-severity findings the save-time gate returned alongside a successful generation. They do
 * not block the save, but the form still renders them, so they must ride on the success response
 * rather than being dropped once the ERROR check passes.
 */
function getValidationWarnings(validationErrors?: ValidationResult[]): ValidationResult[] {
    return (validationErrors ?? []).filter((error) => error.severity !== "ERROR");
}

export class ServiceDesignerRpcManager implements ServiceDesignerAPI {

    async exportOASFile(params: ExportOASRequest): Promise<ExportOASResponse> {
        return new Promise(async (resolve) => {
            const res: ExportOASResponse = { openSpecFile: null };
            const documentFilePath = params.documentFilePath ? params.documentFilePath : StateMachine.context().documentUri;
            const spec = await StateMachine.langClient().convertToOpenAPI({ documentFilePath }) as OpenAPISpec;
            if (spec.content) {
                // Convert the OpenAPI spec to a YAML string
                const yamlStr = yaml.dump(spec.content[0].spec);
                window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, openLabel: 'Select OAS Save Location' })
                    .then(uri => {
                        if (uri && uri[0]) {
                            const projectLocation = uri[0].fsPath;
                            // Construct the correct path for the output file
                            const filePath = path.join(projectLocation, `${spec.content[0]?.serviceName}_openapi.yaml`);

                            // Save the YAML string to the file
                            fs.writeFileSync(filePath, yamlStr, 'utf8');
                            // Set the response
                            res.openSpecFile = filePath;
                            // Open the file in a new VSCode document
                            workspace.openTextDocument(filePath).then(document => {
                                window.showTextDocument(document);
                            });
                        }
                    });
            } else {
                window.showErrorMessage(spec.error);
            }
            resolve(res);
        });
    }

    async getListeners(params: ListenersRequest): Promise<ListenersResponse> {
        return new Promise(async (resolve, reject) => {
            const context = StateMachine.context();
            try {
                const projectPath = path.join(StateMachine.context().projectPath);
                const targetFile = path.join(projectPath, `main.bal`);
                await this.ensureFileExists(targetFile);
                params.filePath = targetFile;
                const res: ListenersResponse = await context.langClient.getListeners(params);
                resolve(res);
            } catch (error) {
                console.log(error);
                reject(error);
            }
        });
    }

    async getListenerModel(params: ListenerModelRequest): Promise<ListenerModelResponse> {
        return new Promise(async (resolve, reject) => {
            const context = StateMachine.context();
            try {
                if (params.filePath) {
                    await this.ensureFileExists(params.filePath);
                }
                const res: ListenerModelResponse = await context.langClient.getListenerModel(params);
                resolve(res);
            } catch (error) {
                console.log(error);
                reject(error);
            }
        });
    }

    async addListenerSourceCode(params: ListenerSourceCodeRequest): Promise<UpdatedArtifactsResponse> {
        return new Promise(async (resolve, reject) => {
            const context = StateMachine.context();
            try {
                const projectPath = path.join(StateMachine.context().projectPath);
                const targetFile = path.join(projectPath, `main.bal`);
                await this.ensureFileExists(targetFile);
                params.filePath = targetFile;
                const res: ListenerSourceCodeResponse = await context.langClient.addListenerSourceCode(params);
                const artifacts = await updateSourceCode({ textEdits: res.textEdits, resolveMissingDependencies: true, artifactData: { artifactType: DIRECTORY_MAP.LISTENER }, description: params.listener.name + ' Creation' });
                const result: UpdatedArtifactsResponse = {
                    artifacts: artifacts
                };
                // Set timeout to resolve after 2 seconds if no notification received
                setTimeout(() => {
                    if (extension.hasPullModuleNotification) {
                        const waitForModuleResolution = new Promise<void>((resolve) => {
                            const checkInterval = setInterval(() => {
                                if (extension.hasPullModuleResolved) {
                                    clearInterval(checkInterval);
                                    resolve();
                                }
                            }, 100);
                        });
                        waitForModuleResolution.then(() => {
                            resolve(result);
                        });
                    } else {
                        resolve(result);
                    }
                }, 1000);
            } catch (error) {
                console.log(error);
                reject(error);
            }
        });
    }

    async updateListenerSourceCode(params: ListenerSourceCodeRequest): Promise<UpdatedArtifactsResponse> {
        return new Promise(async (resolve, reject) => {
            const context = StateMachine.context();
            try {
                const projectPath = path.join(StateMachine.context().projectPath);
                const targetFile = path.join(projectPath, `main.bal`);
                await this.ensureFileExists(targetFile);
                params.filePath = targetFile;
                const res: ListenerSourceCodeResponse = await context.langClient.updateListenerSourceCode(params);
                const artifacts = await updateSourceCode({ textEdits: res.textEdits, description: params.listener.name + ' Update' });
                const result: UpdatedArtifactsResponse = {
                    artifacts: artifacts
                };
                resolve(result);
            } catch (error) {
                console.log(error);
                reject(error);
            }
        });
    }

    async getServiceModel(params: ServiceModelRequest): Promise<ServiceModelResponse> {
        return new Promise(async (resolve, reject) => {
            const context = StateMachine.context();
            try {
                const projectPath = path.join(StateMachine.context().projectPath);
                const targetFile = path.join(projectPath, `main.bal`);
                await this.ensureFileExists(targetFile);
                params.filePath = targetFile;
                const res: ServiceModelResponse = await context.langClient.getServiceModel(params);
                resolve(res);
            } catch (error) {
                console.log(error);
                reject(error);
            }
        });
    }

    async addServiceSourceCode(params: ServiceSourceCodeRequest): Promise<UpdatedArtifactsResponse> {
        return new Promise(async (resolve, reject) => {
            const context = StateMachine.context();
            try {
                const projectPath = path.join(StateMachine.context().projectPath);
                const targetFile = path.join(projectPath, `main.bal`);
                await this.ensureFileExists(targetFile);
                params.filePath = targetFile;
                const res: ListenerSourceCodeResponse = await context.langClient.addServiceSourceCode(params);
                const artifacts = await updateSourceCode({ textEdits: res.textEdits, artifactData: { artifactType: DIRECTORY_MAP.SERVICE }, description: params.service.name + ' Creation' });
                let result: UpdatedArtifactsResponse = {
                    artifacts: artifacts
                };
                resolve(result);
            } catch (error) {
                console.log(error);
                reject(error);
            }
        });
    }

    async updateServiceSourceCode(params: ServiceSourceCodeRequest): Promise<UpdatedArtifactsResponse> {
        return new Promise(async (resolve, reject) => {
            const context = StateMachine.context();
            try {
                const projectPath = path.join(StateMachine.context().projectPath);
                const targetFile = path.join(projectPath, `main.bal`);
                await this.ensureFileExists(targetFile);
                params.filePath = targetFile;
                const res: ListenerSourceCodeResponse = await context.langClient.updateServiceSourceCode(params);
                const blockingErrors = getBlockingValidationErrors(res.validationErrors);
                if (blockingErrors.length > 0) {
                    resolve({ artifacts: [], validationErrors: blockingErrors });
                    return;
                }
                const artifacts = await updateSourceCode({ textEdits: res.textEdits, artifactData: { artifactType: DIRECTORY_MAP.SERVICE }, description: params.service.name + ' Update' });
                const result: UpdatedArtifactsResponse = {
                    artifacts: artifacts,
                    validationErrors: getValidationWarnings(res.validationErrors)
                };
                // Find the correct artifact by checking the position
                const lineRange = params.service.codedata.lineRange;
                const artifact = artifacts.find(artifact => artifact.position.startLine === lineRange.startLine.line && artifact.position.startColumn === lineRange.startLine.offset);
                if (artifact) {
                    result.artifacts = [artifact];
                }
                resolve(result);
            } catch (error) {
                console.log(error);
                reject(error);
            }
        });
    }

    async getServiceModelFromCode(params: ServiceModelFromCodeRequest): Promise<ServiceModelFromCodeResponse> {
        const context = StateMachine.context();
        try {
            return await context.langClient.getServiceModelFromCode(params);
        } catch (error) {
            console.log(error);
            throw error;
        }
    }

    async getHttpResourceModel(params: HttpResourceModelRequest): Promise<HttpResourceModelResponse> {
        const context = StateMachine.context();
        try {
            return await context.langClient.getHttpResourceModel(params);
        } catch (error) {
            console.log(error);
            throw error;
        }
    }

    async addResourceSourceCode(params: FunctionSourceCodeRequest): Promise<UpdatedArtifactsResponse> {
        return new Promise(async (resolve, reject) => {
            const context = StateMachine.context();
            try {
                const projectPath = path.join(StateMachine.context().projectPath);
                if (!params.filePath) {
                    const targetFile = path.join(projectPath, `main.bal`);
                    await this.ensureFileExists(targetFile);
                    params.filePath = targetFile;
                }
                const res: ResourceSourceCodeResponse = await context.langClient.addResourceSourceCode(params);
                const artifacts = await updateSourceCode({ textEdits: res.textEdits, artifactData: { artifactType: DIRECTORY_MAP.SERVICE }, description: 'Resource Creation' });
                const result: UpdatedArtifactsResponse = {
                    artifacts: artifacts
                };
                resolve(result);
            } catch (error) {
                console.log(error);
                reject(error);
            }
        });
    }

    async updateResourceSourceCode(params: FunctionSourceCodeRequest): Promise<UpdatedArtifactsResponse> {
        const context = StateMachine.context();
        try {
            const res: ResourceSourceCodeResponse = await context.langClient.updateResourceSourceCode(params);
            const blockingErrors = getBlockingValidationErrors(res.validationErrors);
            if (blockingErrors.length > 0) {
                return { artifacts: [], validationErrors: blockingErrors };
            }
            const artifacts = await updateSourceCode({ textEdits: res.textEdits, artifactData: params.artifactType ? { artifactType: params.artifactType } : null, description: 'Resource Update' });
            return {
                artifacts: artifacts,
                validationErrors: getValidationWarnings(res.validationErrors)
            };
        } catch (error) {
            console.log(error);
            throw error;
        }
    }

    async getListenerModelFromCode(params: ListenerModelFromCodeRequest): Promise<ListenerModelFromCodeResponse> {
        const context = StateMachine.context();
        try {
            return await context.langClient.getListenerFromSourceCode(params);
        } catch (error) {
            console.log(error);
            throw error;
        }
    }

    async addFunctionSourceCode(params: FunctionSourceCodeRequest): Promise<UpdatedArtifactsResponse> {
        const context = StateMachine.context();
        try {
            const res: ResourceSourceCodeResponse = await context.langClient.addFunctionSourceCode(params);
            const blockingErrors = getBlockingValidationErrors(res.validationErrors);
            if (blockingErrors.length > 0) {
                return { artifacts: [], validationErrors: blockingErrors };
            }
            const artifacts = await updateSourceCode({ textEdits: res.textEdits, artifactData: params.artifactType ? { artifactType: params.artifactType } : { artifactType: DIRECTORY_MAP.FUNCTION }, description: 'Function Creation' });
            return {
                artifacts: artifacts,
                validationErrors: getValidationWarnings(res.validationErrors)
            };
        } catch (error) {
            console.log(error);
            throw error;
        }
    }

    async getTriggerModels(params: TriggerModelsRequest): Promise<TriggerModelsResponse> {
        const context = StateMachine.context();
        try {
            return await context.langClient.getTriggerModels(params);
        } catch (error) {
            console.log(error);
            throw error;
        }
    }

    async searchTriggers(params: TriggerModelsRequest): Promise<TriggerModelsResponse> {
        return new Promise(async (resolve) => {
            const context = StateMachine.context();
            try {
                const res: TriggerModelsResponse = await context.langClient.searchTriggers(params);
                resolve(res);
            } catch (error) {
                console.log(error);
                resolve({ local: [] });
            }
        });
    }

    async getFunctionModel(params: FunctionModelRequest): Promise<FunctionModelResponse> {
        const context = StateMachine.context();
        try {
            return await context.langClient.getFunctionModel(params);
        } catch (error) {
            console.log(">>> error fetching function model", error);
            throw error;
        }
    }

    private async ensureFileExists(targetFile: string) {
        // Check if the file exists
        if (!fs.existsSync(targetFile)) {
            // Create the file and notify the language server
            await writeBallerinaFileDidOpen(targetFile, "\n");
            console.log(`>>> Created file at ${targetFile}`);
        }
    }

    async getResourceReturnTypes(params: ResourceReturnTypesRequest): Promise<VisibleTypesResponse> {
        const context = StateMachine.context();
        params.filePath = params.filePath || context.projectPath;
        try {
            return await context.langClient.getResourceReturnTypes(params);
        } catch (error) {
            console.log(">>> error fetching resource return types", error);
            throw error;
        }
    }

    async getFunctionFromSource(params: FunctionFromSourceRequest): Promise<FunctionFromSourceResponse> {
        const context = StateMachine.context();
        try {
            return await context.langClient.getFunctionFromSource(params);
        } catch (error) {
            console.log(">>> error fetching function model", error);
            throw error;
        }
    }

    async getServiceInitModel(params: ServiceModelRequest): Promise<ServiceModelInitResponse> {
        return new Promise(async (resolve, reject) => {
            const context = StateMachine.context();
            try {
                const projectDir = path.join(params.projectPath ?? StateMachine.context().projectPath);
                const targetFile = path.join(projectDir, `main.bal`);
                await this.ensureFileExists(targetFile);
                params.filePath = targetFile;
                const res: ServiceModelInitResponse = await context.langClient.getServiceInitModel(params);
                resolve(res);
            } catch (error) {
                console.log(error);
                reject(error);
            }
        });
    }

    async getConnectorUpgradeAdvice(params: ConnectorUpgradeAdviceRequest): Promise<ConnectorUpgradeAdviceResponse> {
        return new Promise(async (resolve, reject) => {
            const context = StateMachine.context();
            try {
                const projectDir = path.join(StateMachine.context().projectPath);
                const targetFile = path.join(projectDir, `main.bal`);
                await this.ensureFileExists(targetFile);
                params.filePath = targetFile;
                const res: ConnectorUpgradeAdviceResponse = await context.langClient.getConnectorUpgradeAdvice(params);
                resolve(res);
            } catch (error) {
                console.log(error);
                reject(error);
            }
        });
    }

    async pullConnectorUpgrade(params: PullConnectorUpgradeRequest): Promise<PullConnectorUpgradeResult> {
        const projectPath = StateMachine.context().projectPath;
        const advice: ConnectorUpgradeAdvice = {
            orgName: params.orgName,
            moduleName: params.moduleName,
            packageName: params.packageName,
            currentVersion: "",
            minSupportedVersion: params.targetVersion,
            breaking: false,
            explicitlyPinned: true,
        };
        const { succeeded } = await pullAndBumpConnectors([advice], projectPath);
        return { success: succeeded.length > 0 };
    }

    async createServiceAndListener(params: ServiceInitSourceRequest): Promise<UpdatedArtifactsResponse> {
        return new Promise(async (resolve, reject) => {
            const context = StateMachine.context();
            try {
                const projectDir = path.join(params.projectPath ?? StateMachine.context().projectPath);
                const targetFile = path.join(projectDir, `main.bal`);
                await this.ensureFileExists(targetFile);
                params.filePath = targetFile;
                const res: SourceEditResponse = await context.langClient.createServiceAndListener(params);

                // The save-time gate refused the model — no source was generated, so surface the
                // failures instead of reporting an empty success.
                const blockingErrors = getBlockingValidationErrors(res.validationErrors);
                if (blockingErrors.length > 0) {
                    resolve({ artifacts: [], validationErrors: blockingErrors });
                    return;
                }

                const edits = { textEdits: res.textEdits, resolveMissingDependencies: false };

                const artifacts = await updateSourceCode({ ...edits, artifactData: { artifactType: DIRECTORY_MAP.SERVICE }, description: 'Service and Listener Creation' });
                let result: UpdatedArtifactsResponse = {
                    artifacts: artifacts,
                    validationErrors: getValidationWarnings(res.validationErrors)
                };
                resolve(result);
            } catch (error) {
                console.log(error);
                reject(error);
            }
        });
    }

    /**
     * Live per-field validation. Called on a debounce while the user types, so a failure here is
     * never surfaced as an error: the caller simply gets no findings and keeps its client-side
     * rules, and the save-time gate remains the authority.
     */
    async validateProperty(params: ValidatePropertyRequest): Promise<ValidatePropertyResponse> {
        const context = StateMachine.context();
        try {
            return await context.langClient.validateProperty(params);
        } catch (error) {
            console.log(error);
            return { propertyPath: params.propertyPath, version: params.version, validationErrors: [] };
        }
    }

    async generateExamplePayloadJson(params: PayloadContext): Promise<object> {
        return await generateExamplePayload(params);
    }

    async getOASSpec(params: GetOASSpecRequest): Promise<GetOASSpecResponse> {
        try {
            const documentFilePath = params.documentFilePath || StateMachine.context().documentUri;
            const result = await StateMachine.langClient().convertToOpenAPI({ documentFilePath }) as OpenAPISpec;
            if (!result?.content?.length) { return { spec: null }; }
            let match = result.content[0];
            if (params.basePath) {
                const normalised = params.basePath.replace(/^\/+|\/+$/g, '').toLowerCase();
                const found = result.content.find(c => {
                    const serverUrl = c.spec?.servers?.[0]?.url;
                    let urlPathMatches = false;
                    if (serverUrl) {
                        try {
                            const pathname = new URL(serverUrl).pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
                            urlPathMatches = pathname === normalised;
                        } catch {
                            urlPathMatches = serverUrl.toLowerCase().replace(/^\/+|\/+$/g, '') === normalised;
                        }
                    }
                    return urlPathMatches || c.serviceName?.toLowerCase() === normalised;
                });
                if (found) { match = found; }
            }
            return { spec: match?.spec ?? null };
        } catch {
            return { spec: null };
        }
    }
}
