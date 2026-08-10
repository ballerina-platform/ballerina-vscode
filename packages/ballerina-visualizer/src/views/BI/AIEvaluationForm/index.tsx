/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Codicon, Icon, RadioButtonGroup, ThemeColors, Typography, View, ViewContent } from "@wso2/ui-toolkit";
import styled from "@emotion/styled";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { FormField, FormImports, FormValues, Parameter } from "@wso2/ballerina-side-panel";
import { LineRange, FunctionParameter, TestFunction, ValueProperty, Annotation, getPrimaryInputType, EvalsetItem, AvailableNode, FlowNode, Property as FlowProperty, AddOrUpdateTestFunctionRequest, isEvalTemplateCall } from "@wso2/ballerina-core";
import { EVENT_TYPE } from "@wso2/ballerina-core";
import { TitleBar } from "../../../components/TitleBar";
import { TopNavigationBar } from "../../../components/TopNavigationBar";
import { FormHeader } from "../../../components/FormHeader";
import ArtifactForm from "../Forms/ArtifactForm";
import { getImportsForProperty } from "../../../utils/bi";
import { CardSelector } from "./CardSelector";
import { LoadingView } from "../../../components/LoadingView";
import { RelativeLoader } from "../../../components/RelativeLoader";
import { TemplateModal } from "./TemplateModal";
import { TemplateConfigCard } from "./TemplateConfigCard";
import { EvalsetFileControl } from "./EvalsetFileControl";
import { resolveEvalsetPath } from "./evalsetUtils";
import { suggestEvaluationName } from "./evaluationName";
import {
    FormSection, GrowingContent, HintText, MonospaceHint, SectionLabel,
    StatusRow, TemplateIconTile, TitleRow, cardBox
} from "./styles";
import {
    DataSourceMode, DataSourceParam, EVALSET_FIELD_KEY, QUERIES_FIELD_KEY, TEMPLATE_FIELD_PREFIX,
    buildQueriesField, carryOverArguments, findAgentArgument, findDataSourceParam,
    generateTemplateFields, isDataSourceSatisfied, isTemplateField, templateNeedsEvalset
} from "./templateUtils";

const FormContainer = styled.div`
    display: flex;
    flex-direction: column;
    max-width: 600px;
    margin-bottom: 20px;

    .side-panel-body {
        overflow: visible;
    }

    .radio-button-group {
        margin-top: 8px;
        margin-bottom: -12px;
    }

    .dropdown-container {
        margin-top: 12px;
    }
`;

const Container = styled.div`
    padding-bottom: 48px;
`;

const FullHeightView = styled(View)`
    display: flex;
    flex-direction: column;
    height: 100vh;
`;

const FullHeightViewContent = styled(ViewContent)`
    display: flex;
    flex: 1;
`;

const CenteredMessage = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    width: 100%;
    padding: 40px;
    text-align: center;
`;

const TemplatePicker = styled.div`
    align-self: stretch;
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    margin: 8px 0;
`;

const FormLoadingSlot = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
`;

const LoadingSlot = styled.div`
    display: grid;
    width: 100%;
    min-height: 148px;
    box-sizing: border-box;
    place-items: center;
    padding: 16px;
    border: 1px dashed var(--vscode-panel-border);
    border-radius: 8px;
`;

const EmptyTemplateSlot = styled.button`
    ${cardBox}
    align-items: center;
    justify-content: space-between;
    min-height: 112px;
    border: 1px solid var(--vscode-button-background);
    background-color: color-mix(in srgb, var(--vscode-button-background) 5%, transparent);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: border-color 0.15s ease, background-color 0.15s ease;

    &:hover {
        background-color: color-mix(in srgb, var(--vscode-button-background) 10%, transparent);
    }

    &:focus-visible {
        outline: 1px solid var(--vscode-contrastActiveBorder);
        outline-offset: 2px;
    }
`;

const CustomEvalsetControls = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
    padding-bottom: 16px;

    > * {
        margin-top: 0;
    }
`;

const ChooseTemplateAction = styled.span`
    display: inline-flex;
    align-items: center;
    flex: 0 0 auto;
    padding: 8px 12px;
    color: var(--vscode-button-foreground);
    border-radius: 4px;
    background-color: var(--vscode-button-background);
    font-size: 13px;
    font-weight: 500;
`;


const NAME_FIELD_KEY = 'functionName';

type EvalTemplatePayload = NonNullable<AddOrUpdateTestFunctionRequest['evalTemplate']>;

type EditShape = 'template' | 'template-with-custom' | 'custom' | 'ambiguous' | 'unresolvable';

const flattenFlowNodes = (nodes: FlowNode[] = []): FlowNode[] =>
    nodes.flatMap(node => [node, ...(node.branches || []).flatMap(branch => flattenFlowNodes(branch.children))]);

const isBaseField = (field: FormField): boolean =>
    !isTemplateField(field) && field.key !== QUERIES_FIELD_KEY;

const readConfigField = (testFunction: TestFunction | undefined, originalName: string): any =>
    testFunction?.annotations?.find(annotation => annotation.name === 'Config')?.fields
        ?.find(field => field.originalName === originalName)?.value;

const resolveEditMode = (testFunction?: TestFunction): string =>
    String(readConfigField(testFunction, 'dataProviderMode') || '') === 'evalSet' ? 'evalSet' : 'function';

interface TestFunctionDefProps {
    projectPath: string;
    functionName?: string;
    filePath?: string;
    serviceType?: string;
    isVersionSupported?: boolean;
}

export function AIEvaluationForm(props: TestFunctionDefProps) {
    const { projectPath, functionName, filePath, serviceType, isVersionSupported = true } = props;
    const { rpcClient } = useRpcContext();
    const [formFields, setFormFields] = useState<FormField[]>([]);
    const [testFunction, setTestFunction] = useState<TestFunction>();
    const [targetLineRange, setTargetLineRange] = useState<LineRange>();
    const [dataProviderMode, setDataProviderMode] = useState<string>('template');
    const [evalsetOptions, setEvalsetOptions] = useState<Array<{ value: string; content: string }>>([]);
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [selectedEvalsetFile, setSelectedEvalsetFile] = useState<string>('');
    const [evalsetsLoadError, setEvalsetsLoadError] = useState<boolean>(false);
    const [evalTemplates, setEvalTemplates] = useState<AvailableNode[]>([]);
    const [selectedTemplate, setSelectedTemplate] = useState<AvailableNode>();
    const [templateNode, setTemplateNode] = useState<FlowNode>();
    const [showTemplateCatalog, setShowTemplateCatalog] = useState(false);
    const [isSelectingTemplate, setIsSelectingTemplate] = useState(false);
    const [templateLoadError, setTemplateLoadError] = useState<string>();
    const [dataSourceMode, setDataSourceMode] = useState<DataSourceMode>('evalset');
    const [evalQueries, setEvalQueries] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const bootstrapRunRef = useRef(0);
    const [editShape, setEditShape] = useState<EditShape>();
    const [detectedSymbol, setDetectedSymbol] = useState<string>();
    const [takenNames, setTakenNames] = useState<string[]>([]);
    const [agentValue, setAgentValue] = useState<string>('');
    const [customName, setCustomName] = useState<string>();
    const isEditing = serviceType === 'UPDATE_TEST';
    const formTitle = isEditing ? 'Update AI Evaluation' : 'Create New AI Evaluation';
    const formSubtitle = isEditing
        ? 'Update an existing AI evaluation'
        : 'Create a new AI evaluation for your integration';
    const customUsesEvalset = dataProviderMode === 'evalSet';
    const dataSourceParam = useMemo(
        () => (templateNode ? findDataSourceParam(templateNode) : undefined),
        [templateNode]);
    const isTemplateMode = dataProviderMode === 'template';
    const agentArgument = useMemo(() => findAgentArgument(templateNode), [templateNode]);
    const agentFieldKey = agentArgument && `${TEMPLATE_FIELD_PREFIX}${agentArgument.key}`;

    const suggestedName = useMemo(() => isEditing ? undefined : suggestEvaluationName({
        template: isTemplateMode ? selectedTemplate : undefined,
        hasAgent: Boolean(agentArgument),
        agentValue,
        takenNames
    }), [isEditing, isTemplateMode, selectedTemplate, agentArgument, agentValue, takenNames]);

    const evalsetField = useMemo(
        () => formFields.find(field => field.key === EVALSET_FIELD_KEY),
        [formFields]);

    const handleNameChange = useCallback((next: string | boolean) => {
        const name = String(next ?? '');
        setCustomName(name.trim() === '' ? undefined : name);
    }, []);

    const derivedName = isEditing ? undefined : customName ?? suggestedName;
    const fields = useMemo(() => formFields.map(field => field.key === NAME_FIELD_KEY
        ? { ...field, value: derivedName ?? field.value, onValueChange: handleNameChange }
        : field), [formFields, derivedName, handleNameChange]);

    const isSaveDisabled = useMemo(() => {
        if (dataProviderMode === 'evalSet') {
            return !selectedEvalsetFile;
        }
        if (dataProviderMode !== 'template') {
            return false;
        }
        if (!selectedTemplate) {
            return serviceType !== 'UPDATE_TEST';
        }
        return !isDataSourceSatisfied({
            dataSourceParam, dataSourceMode, evalSetFile: selectedEvalsetFile, queries: evalQueries
        });
    }, [dataProviderMode, selectedEvalsetFile, selectedTemplate, dataSourceParam, dataSourceMode,
        evalQueries, serviceType]);

    const applyFieldVisibility = (fields: FormField[], mode: string,
        hasTemplate = Boolean(selectedTemplate)): FormField[] => {
        const isChoosingTemplate = !isEditing && mode === 'template' && !hasTemplate;
        return fields.map(field => {
            if (isChoosingTemplate) {
                return { ...field, hidden: true };
            }
            if (isTemplateField(field) || field.key === QUERIES_FIELD_KEY
                || field.key === EVALSET_FIELD_KEY) {
                return { ...field, hidden: true };
            }
            if (field.key === NAME_FIELD_KEY) {
                return { ...field, hidden: !isEditing && mode === 'template' && !hasTemplate };
            }
            if (field.key === 'dataProvider') {
                return { ...field, hidden: mode !== 'function' };
            }
            return { ...field, hidden: field.key === 'params' };
        });
    };

    const handleFieldChange = (fieldKey: string, value: any) => {
        if (fieldKey === EVALSET_FIELD_KEY) {
            setSelectedEvalsetFile(value || '');
        }
        if (fieldKey === QUERIES_FIELD_KEY) {
            setEvalQueries(Array.isArray(value) ? value : []);
        }
        if (fieldKey === agentFieldKey) {
            setAgentValue(String(value ?? ''));
        }
    };

    const handleDataSourceModeChange = (mode: DataSourceMode) => {
        setDataSourceMode(mode);
    };

    const updateFieldVisibility = (mode: string) => {
        setFormFields(prevFields => applyFieldVisibility(prevFields, mode));
    };

    const updateTargetLineRange = () =>
        rpcClient
            .getBIDiagramRpcClient()
            .getEndOfFile({ filePath })
            .then((linePosition) => {
                setTargetLineRange({
                    startLine: linePosition,
                    endLine: linePosition
                });
            });

    useEffect(() => {
        bootstrap();
    }, [functionName]);

    const loadEvalTemplates = async (): Promise<AvailableNode[]> => {
        try {
            const res = await rpcClient.getBIDiagramRpcClient().search({ filePath, searchKind: 'EVAL_TEMPLATE' });
            const templates = res.categories.flatMap(category => category.items)
                .filter((item): item is AvailableNode => 'codedata' in item);
            setEvalTemplates(templates);
            setTemplateLoadError(undefined);
            return templates;
        } catch (error) {
            console.error('Failed to load evaluation templates:', error);
            setEvalTemplates([]);
            setTemplateLoadError('Unable to load evaluation templates. Please check whether the ballerina/ai.eval package is available.');
            return [];
        }
    };

    const selectEvalTemplate = async (template: AvailableNode) => {
        setIsSelectingTemplate(true);
        setTemplateLoadError(undefined);
        try {
            const res = await rpcClient.getBIDiagramRpcClient().getNodeTemplate({
                filePath,
                position: { line: 0, offset: 0 },
                id: template.codedata
            });
            const node = carryOverArguments(res.flowNode, templateNode);
            const dsParam = findDataSourceParam(node);
            const keepMode = dsParam?.kind === 'union' && dataSourceMode === 'queries';
            const mode: 'evalset' | 'queries' = dsParam?.kind === 'union'
                ? (keepMode || evalsetOptions.length === 0 ? 'queries' : 'evalset')
                : 'evalset';
            setSelectedTemplate(template);
            setTemplateNode(node);
            setAgentValue(findAgentArgument(node)?.value || '');
            setDataSourceMode(mode);
            if (mode !== 'queries') {
                setEvalQueries([]);
            }
            setEditShape(isEditing ? 'template' : undefined);
            setTemplateLoadError(undefined);
            setDataProviderMode('template');
            setFormFields(current => applyFieldVisibility(
                assembleTemplateFields(current, node, dsParam, mode === 'queries' ? evalQueries : []),
                'template', true));
        } catch (error) {
            console.error('Failed to load evaluation template form:', error);
            setTemplateLoadError('Unable to load the selected template. Please try again.');
        } finally {
            setIsSelectingTemplate(false);
        }
    };

    const bootstrap = async () => {
        const run = ++bootstrapRunRef.current;
        setIsLoading(true);
        try {
            const [options, templates] = await Promise.all([
                loadEvalsets(), loadEvalTemplates(), loadTakenNames(), updateTargetLineRange()]);
            if (bootstrapRunRef.current !== run) {
                return;
            }
            if (isEditing) {
                await loadFunction(options, templates);
            } else {
                loadEmptyForm(options);
            }
        } finally {
            if (bootstrapRunRef.current === run) {
                setIsLoading(false);
            }
        }
    };

    const loadTakenNames = async () => {
        try {
            const res = await rpcClient.getTestManagerRpcClient().getTestFunctionNames({ projectPath });
            setTakenNames(res.names.filter(name => name !== functionName));
        } catch (error) {
            console.error('Failed to load existing test function names:', error);
            setTakenNames([]);
        }
    };

    const loadEvalsets = async (): Promise<Array<{ value: string; content: string }>> => {
        try {
            const res = await rpcClient.getTestManagerRpcClient().getEvalsets({ projectPath });
            const options = res.evalsets.map((evalset: EvalsetItem) => ({
                value: evalset.filePath,
                content: `${evalset.name}`
            }));
            setEvalsetOptions(options);
            setEvalsetsLoadError(false);
            return options;
        } catch (error) {
            console.error('Failed to load evalsets:', error);
            setEvalsetOptions([]);
            setEvalsetsLoadError(true);
            return [];
        }
    };

    const openEvalset = useCallback(async (evalsetFile: string) => {
        if (!evalsetFile) {
            return;
        }
        const fsPath = resolveEvalsetPath(projectPath, evalsetFile);
        await rpcClient.getCommonRpcClient().executeCommand({
            commands: ['ballerina.openEvalsetViewer', { fsPath }]
        });
    }, [projectPath, rpcClient]);

    const createEvalset = async () => {
        await rpcClient.getCommonRpcClient().executeCommand({
            commands: ['ballerina.createNewEvalset']
        });
        await loadEvalsets();
    };

    const detectTemplateFromSource = async (fn: TestFunction, templates: AvailableNode[]): Promise<{
        shape: EditShape;
        node?: FlowNode;
        template?: AvailableNode;
        symbol?: string;
    }> => {
        const lineRange = fn?.codedata?.lineRange;
        if (!lineRange) {
            return { shape: 'custom' };
        }
        try {
            const res = await rpcClient.getBIDiagramRpcClient().getFlowModel({
                filePath,
                startLine: lineRange.startLine,
                endLine: lineRange.endLine,
                forceAssign: true
            });
            const nodes = flattenFlowNodes(res.flowModel?.nodes);
            const calls = nodes.filter(isEvalTemplateCall);
            if (calls.length === 0) {
                return { shape: 'custom' };
            }
            if (calls.length > 1) {
                return { shape: 'ambiguous' };
            }
            const call = calls[0];
            const symbol = call.codedata?.symbol;
            const template = templates.find(item => item.codedata.symbol === symbol);
            if (!template || Object.keys(call.properties || {}).length === 0) {
                return { shape: 'unresolvable', symbol, node: call };
            }
            const statements = nodes.filter(node => node.codedata?.node !== 'EVENT_START');
            return {
                shape: statements.length > 1 ? 'template-with-custom' : 'template',
                node: call,
                template,
                symbol
            };
        } catch (error) {
            console.error('Failed to read the evaluation body:', error);
            return { shape: 'custom' };
        }
    };

    const loadFunction = async (options = evalsetOptions, templates = evalTemplates) => {
        const res = await rpcClient.getTestManagerRpcClient().getTestFunction({ functionName, filePath });
        setTestFunction(res.function);

        const detected = await detectTemplateFromSource(res.function, templates);
        setEditShape(detected.shape);
        setDetectedSymbol(detected.symbol);

        const isTemplate = detected.shape === 'template' || detected.shape === 'template-with-custom';
        const mode = isTemplate || detected.shape === 'unresolvable' ? 'template' : resolveEditMode(res.function);
        const dsParam = isTemplate && detected.node ? findDataSourceParam(detected.node) : undefined;
        const dsMode: 'evalset' | 'queries' =
            String(readConfigField(res.function, 'dataProviderMode')) === 'queries' ? 'queries' : 'evalset';
        const queries = (readConfigField(res.function, 'queries') as string[]) || [];

        setDataProviderMode(mode);
        setDataSourceMode(dsMode);
        setEvalQueries(queries);
        if (isTemplate) {
            setSelectedTemplate(detected.template);
            setTemplateNode(detected.node);
            setAgentValue(findAgentArgument(detected.node)?.value || '');
        }

        let formFields = generateFormFields(res.function, options);
        setSelectedEvalsetFile(String(formFields.find(f => f.key === EVALSET_FIELD_KEY)?.value || ''));

        if (isTemplate && detected.node) {
            formFields = assembleTemplateFields(formFields, detected.node, dsParam, queries);
        }

        setFormFields(applyFieldVisibility(formFields, mode));
    }

    const loadEmptyForm = (options = evalsetOptions) => {
        const emptyTestFunction = getEmptyTestFunctionModel();
        setTestFunction(emptyTestFunction);
        let formFields = generateFormFields(emptyTestFunction, options);
        setSelectedEvalsetFile(String(formFields.find(f => f.key === EVALSET_FIELD_KEY)?.value || ''));

        const mode = 'template';
        setDataProviderMode(mode);

        formFields = applyFieldVisibility(formFields, mode);
        setFormFields(formFields);
    }

    const isTemplateRecognised = editShape === 'template' || editShape === 'template-with-custom';

    const buildEvalTemplatePayload = (data: FormValues): EvalTemplatePayload | undefined => {
        if (dataProviderMode !== 'template' || !selectedTemplate || !templateNode) {
            return undefined;
        }
        const parameters: Record<string, string> = {};
        Object.entries(templateNode.properties || {}).forEach(([key, property]) => {
            const templateProperty = property as FlowProperty;
            if (templateProperty.hidden || dataSourceParam?.paramName === (templateProperty.codedata?.originalName || key)) {
                return;
            }
            const originalName = templateProperty.codedata?.originalName || key;
            parameters[originalName] = String(data[`${TEMPLATE_FIELD_PREFIX}${key}`] ?? templateProperty.value ?? '');
        });
        const dataSource = dataSourceParam ? {
            paramName: dataSourceParam.paramName,
            mode: dataSourceMode,
            ...(dataSourceMode === 'evalset'
                ? { evalSetFile: selectedEvalsetFile }
                : { queries: (Array.isArray(data[QUERIES_FIELD_KEY]) ? data[QUERIES_FIELD_KEY] : evalQueries) as string[] })
        } : undefined;
        return {
            symbol: selectedTemplate.codedata.symbol || '',
            parameters,
            ...(dataSource && { dataSource })
        };
    };

    const onFormSubmit = async (data: FormValues, formImports: FormImports) => {
        setIsSaving(true);
        const formData = {
            ...data,
            dataProviderMode: dataProviderMode
        };
        const updatedTestFunction = fillFunctionModel(formData, formImports);
        const evalTemplate = buildEvalTemplatePayload(data);
        if (serviceType === 'UPDATE_TEST') {
            await rpcClient.getTestManagerRpcClient().updateTestFunction({
                function: updatedTestFunction,
                filePath,
                ...(evalTemplate && isTemplateRecognised && { evalTemplate })
            });
        } else {
            await rpcClient.getTestManagerRpcClient().addTestFunction({
                function: updatedTestFunction,
                filePath,
                ...(evalTemplate && { evalTemplate })
            });
        }
        try {
            const res = await rpcClient.getTestManagerRpcClient().getTestFunction(
                { functionName: updatedTestFunction.functionName.value, filePath });
            const nodePosition = {
                startLine: res.function.codedata.lineRange.startLine.line,
                startColumn: res.function.codedata.lineRange.startLine.offset,
                endLine: res.function.codedata.lineRange.endLine.line,
                endColumn: res.function.codedata.lineRange.endLine.offset
            };
            rpcClient.getVisualizerRpcClient().openView(
                { type: EVENT_TYPE.OPEN_VIEW, location: { position: nodePosition, documentUri: filePath } })
        }
        catch (error) {
            console.error('Failed to open function in diagram:', error);
            setIsSaving(false);
        }
    };

    // Helper function to modify and set the visual information
    const handleParamChange = (param: Parameter) => {
        const name = `${param.formValues['variable']}`;
        const type = `${param.formValues['type']}`;
        const defaultValue = Object.keys(param.formValues).indexOf('defaultable') > -1 && `${param.formValues['defaultable']}`;
        let value = `${type} ${name}`;
        if (defaultValue) {
            value += ` = ${defaultValue}`;
        }
        return {
            ...param,
            key: name,
            value: value
        }
    };

    const generateFormFields = (testFunction: TestFunction, options = evalsetOptions): FormField[] => {
        const fields: FormField[] = [];
        if (testFunction.functionName) {
            fields.push({
                ...generateFieldFromProperty('functionName', testFunction.functionName),
                type: 'IDENTIFIER',
                types: [{ fieldType: 'IDENTIFIER', scope: 'Global', selected: true }]
            });
        }
        if (testFunction.parameters) {
            fields.push({
                key: `params`,
                label: 'Parameters',
                type: 'PARAM_MANAGER',
                optional: true,
                editable: true,
                enabled: true,
                advanced: true,
                hidden: true,
                documentation: '',
                value: '',
                paramManagerProps: {
                    paramValues: generateParamFields(testFunction.parameters),
                    formFields: paramFields,
                    handleParameter: handleParamChange
                },
                types: [{ fieldType: "PARAM_MANAGER", selected: false }]
            });
        }
        if (testFunction.annotations) {
            const configAnnotation = getTestConfigAnnotation(testFunction.annotations);
            if (configAnnotation && configAnnotation.fields) {
                const minPassRateField = configAnnotation.fields.find(f => f.originalName === 'minPassRate');
                if (minPassRateField) {
                    const generatedField = generateFieldFromProperty('minPassRate', minPassRateField);
                    fields.push({
                        ...generatedField,
                        documentation: generatedField.documentation || 'Minimum percentage of runs that must pass for the evaluation to succeed',
                        type: 'SLIDER',
                        types: [{ fieldType: 'SLIDER', selected: false }],
                        sliderProps: {
                            min: 0,
                            max: 100,
                            step: 1,
                            showValue: true,
                            showMarkers: true,
                            valueFormatter: (value: number) => `${value}%`
                        }
                    });
                }

                const evalSetFileField = configAnnotation.fields.find(f => f.originalName === 'evalSetFile');
                if (evalSetFileField) {
                    const generatedField = generateFieldFromProperty('evalSetFile', evalSetFileField);
                    const defaultValue = generatedField.value || (options.length > 0 ? options[0].value : '');
                    fields.push({
                        ...generatedField,
                        value: defaultValue,
                        type: 'SINGLE_SELECT',
                        types: [{ fieldType: 'SINGLE_SELECT', selected: false }],
                        itemOptions: options
                    });
                }

                for (const field of configAnnotation.fields) {
                    if (field.originalName === 'dataProviderMode' ||
                        field.originalName === 'minPassRate' ||
                        field.originalName === 'evalSetFile' ||
                        field.originalName === 'queries') {
                        continue;
                    }

                    // Special handling for groups and dependsOn - use EXPRESSION_SET
                    if (field.originalName === 'groups' || field.originalName === 'dependsOn') {
                        fields.push({
                            ...generateFieldFromProperty(field.originalName, field),
                            type: 'EXPRESSION_SET',
                            advanced: true,
                            types: [{ fieldType: 'EXPRESSION_SET', selected: false }]
                        });
                        continue;
                    }

                    // Special handling for expression fields - ensure they use EXPRESSION type
                    if (field.originalName === 'before' || field.originalName === 'after' ||
                        field.originalName === 'runs' || field.originalName === 'dataProvider') {
                        fields.push({
                            ...generateFieldFromProperty(field.originalName, field),
                            type: 'EXPRESSION',
                            advanced: true,
                            types: [{ fieldType: 'EXPRESSION', selected: false }]
                        });
                        continue;
                    }

                    // Special handling for enabled - use FLAG
                    if (field.originalName === 'enabled') {
                        fields.push({
                            ...generateFieldFromProperty(field.originalName, field),
                            type: 'FLAG',
                            advanced: true,
                            types: [{ fieldType: 'FLAG', selected: false }]
                        });
                        continue;
                    }

                    fields.push(generateFieldFromProperty(field.originalName, field));
                }
            }
        }
        return fields;
    }

    const getTestConfigAnnotation = (annotations: Annotation[]): Annotation | undefined => {
        for (const annotation of annotations) {
            if (annotation.name === 'Config') {
                return annotation;
            }
        }
        return;
    }

    const generateParamFields = (parameters: FunctionParameter[]): Parameter[] => {
        const params: Parameter[] = [];
        let id = 0;
        for (const param of parameters) {
            const key = param.variable.value;
            const type = param.type.value;

            const value = `${type} ${key}`;
            params.push({
                id: id,
                formValues: {
                    variable: key,
                    type: type,
                    defaultable: param.defaultValue ? param.defaultValue.value : ''
                },
                key: key,
                value: value,
                icon: '',
                identifierEditable: param.variable?.editable,
                identifierRange: param.variable?.codedata?.lineRange
            });

            id++;
        }
        return params
    }

    const generateFieldFromProperty = (key: string, property: ValueProperty): FormField => {
        const fieldType = getPrimaryInputType(property.types)?.fieldType;

        // Convert decimal (0-1) to percentage (0-100) for minPassRate display
        let displayValue = property.value;
        if (key === 'minPassRate') {
            const decimalValue = parseFloat(property.value);
            displayValue = String(Math.round((isNaN(decimalValue) ? 1 : decimalValue) * 100));
        }

        const baseField: FormField = {
            key: key,
            label: property.metadata.label,
            type: fieldType,
            optional: property.optional,
            editable: property.editable,
            advanced: property.advanced,
            enabled: true,
            documentation: property.metadata.description,
            value: displayValue,
            codedata: property.codedata,
            types: [{ fieldType: fieldType, selected: false }]
        };

        // Add slider-specific configuration for minPassRate
        if (key === 'minPassRate' && fieldType === 'SLIDER') {
            baseField.sliderProps = {
                min: 0,
                max: 100,
                step: 1,
                showValue: true,
                showMarkers: true,
                valueFormatter: (value: number) => `${value}%`
            };
        }

        return baseField;
    }

    const assembleTemplateFields = (base: FormField[], node: FlowNode,
        dsParam?: DataSourceParam, queries: string[] = []): FormField[] => {
        const baseFields = base.filter(isBaseField);
        let fields = baseFields;
        if (dsParam) {
            const index = baseFields.findIndex(field => field.key === EVALSET_FIELD_KEY);
            const queriesField = buildQueriesField(queries);
            fields = index >= 0
                ? [...baseFields.slice(0, index + 1), queriesField, ...baseFields.slice(index + 1)]
                : [...baseFields, queriesField];
        }
        return [...fields, ...generateTemplateFields(node, dsParam?.paramName)];
    };

    const fillFunctionModel = (formValues: FormValues, formImports: FormImports): TestFunction => {
        let tmpTestFunction = testFunction;
        if (!tmpTestFunction) {
            tmpTestFunction = {};
        }

        if (formValues['functionName']) {
            tmpTestFunction.functionName.value = formValues['functionName'];
        }

        if (formValues['returnType']) {
            tmpTestFunction.returnType.value = formValues['returnType'];
            tmpTestFunction.returnType.imports = getImportsForProperty('returnType', formImports);
        }

        if (formValues['params']) {
            const params = formValues['params'];
            const paramList: FunctionParameter[] = [];
            for (const param of params) {
                const paramFormValues = param.formValues;
                const variable = paramFormValues['variable'];
                const type = paramFormValues['type'];
                const typeImports = getImportsForProperty('params', formImports);
                const defaultValue = paramFormValues['defaultable'];
                let emptyParam = getEmptyParamModel();
                emptyParam.variable.value = variable;
                emptyParam.type.value = type;
                emptyParam.type.imports = typeImports;
                emptyParam.defaultValue.value = defaultValue;
                paramList.push(emptyParam);
            }
            tmpTestFunction.parameters = paramList;
        }

        let annots = tmpTestFunction.annotations;
        for (const annot of annots) {
            if (annot.name == 'Config') {
                let configAnnot = annot;
                let fields = configAnnot.fields;
                for (const field of fields) {
                    if (field.originalName == 'groups') {
                        field.value = formValues['groups'];
                    }
                    if (field.originalName == 'enabled') {
                        field.value = formValues['enabled'];
                    }
                    if (field.originalName == 'dependsOn') {
                        field.value = formValues['dependsOn'] || [];
                    }
                    if (field.originalName == 'before') {
                        field.value = formValues['before'] || "";
                    }
                    if (field.originalName == 'after') {
                        field.value = formValues['after'] || "";
                    }
                    if (field.originalName == 'runs') {
                        field.value = formValues['runs'] || "1";
                    }
                    if (field.originalName == 'minPassRate') {
                        // Convert percentage (0-100) to decimal (0-1)
                        const percentageValue = formValues['minPassRate'] ?? 100;
                        field.value = String(Number(percentageValue) / 100);
                    }
                    if (field.originalName == 'dataProviderMode') {
                        field.value = formValues['dataProviderMode'] || "function";
                    }
                    if (field.originalName == 'dataProvider') {
                        if (formValues['dataProviderMode'] === 'function') {
                            field.value = formValues['dataProvider'] || "";
                        }
                        // Preserve existing dataProvider value when in evalSet mode
                        // (backend creates it from evalSetFile)
                    }
                    if (field.originalName == 'evalSetFile') {
                        if (formValues['dataProviderMode'] === 'evalSet' ||
                            (formValues['dataProviderMode'] === 'template' && templateNeedsEvalset(selectedTemplate))) {
                            field.value = String(formValues[EVALSET_FIELD_KEY] || selectedEvalsetFile || "");
                        }
                        // Preserve existing evalSetFile value when in function mode
                    }
                }
            }
        }

        return tmpTestFunction;
    }

    const getEmptyParamModel = (): FunctionParameter => {
        return {
            type: {
                value: "string",
                optional: false,
                editable: true,
                advanced: false,
                types: [{ fieldType: "TYPE", selected: false }]
            },
            variable: {
                value: "b",
                optional: false,
                editable: true,
                advanced: false,
                types: [{ fieldType: "IDENTIFIER", selected: false }]
            },
            defaultValue: {
                value: "\"default\"",
                optional: false,
                editable: true,
                advanced: false,
                types: [{ fieldType: "EXPRESSION", selected: false }]
            },
            optional: false,
            editable: true,
            advanced: false
        }

    }

    const getEmptyTestFunctionModel = (): TestFunction => {
        return {
            functionName: {
                metadata: {
                    label: "AI Evaluation Name",
                    description: "Name of the AI evaluation"
                },
                value: "",
                optional: false,
                editable: true,
                advanced: false,
                types: [{ fieldType: "IDENTIFIER", selected: false }]
            },
            returnType: {
                metadata: {
                    label: "Return Type",
                    description: "Return type of the function"
                },
                optional: true,
                editable: true,
                advanced: true,
                types: [{ fieldType: "TYPE", selected: false }],
            },
            parameters: [],
            annotations: [
                {
                    metadata: {
                        label: "Config",
                        description: "AI Evaluation Configurations"
                    },
                    org: "ballerina",
                    module: "test",
                    name: "Config",
                    fields: [
                        {
                            metadata: {
                                label: "Enabled",
                                description: "Enable/Disable the evaluation"
                            },
                            originalName: "enabled",
                            value: true,
                            optional: true,
                            editable: true,
                            advanced: true,
                            types: [{ fieldType: "FLAG", selected: false }]
                        },
                        {
                            metadata: {
                                label: "Groups",
                                description: "Groups to run"
                            },
                            types: [{ fieldType: "EXPRESSION_SET", selected: false }],
                            originalName: "groups",
                            value: ["evaluations"],
                            optional: true,
                            editable: true,
                            advanced: true
                        },
                        {
                            metadata: {
                                label: "Depends On",
                                description: "List of test function names that this test depends on"
                            },
                            types: [{ fieldType: "EXPRESSION_SET", selected: false }],
                            originalName: "dependsOn",
                            value: [],
                            optional: true,
                            editable: true,
                            advanced: true
                        },
                        {
                            metadata: {
                                label: "Before Function",
                                description: "Function to execute before this test"
                            },
                            types: [{ fieldType: "EXPRESSION", selected: false }],
                            originalName: "before",
                            value: "",
                            optional: true,
                            editable: true,
                            advanced: true
                        },
                        {
                            metadata: {
                                label: "After Function",
                                description: "Function to execute after this test"
                            },
                            types: [{ fieldType: "EXPRESSION", selected: false }],
                            originalName: "after",
                            value: "",
                            optional: true,
                            editable: true,
                            advanced: true
                        },
                        {
                            metadata: {
                                label: "Runs",
                                description: "Number of times to execute this test"
                            },
                            types: [{ fieldType: "EXPRESSION", selected: false }],
                            originalName: "runs",
                            value: "1",
                            optional: true,
                            editable: true,
                            advanced: true
                        },
                        {
                            metadata: {
                                label: "Minimum Pass Rate (%)",
                                description: "Minimum percentage of runs that must pass (0-100)"
                            },
                            types: [{ fieldType: "SLIDER", selected: false }],
                            originalName: "minPassRate",
                            value: "0.9",
                            optional: true,
                            editable: true,
                            advanced: false
                        },
                        {
                            metadata: {
                                label: "",
                                description: "Choose how to provide test data"
                            },
                            types: [{ fieldType: "STRING", selected: false }],
                            originalName: "dataProviderMode",
                            value: "template",
                            optional: true,
                            editable: true,
                            advanced: true
                        },
                        {
                            metadata: {
                                label: "Data Provider",
                                description: "Function that provides test data"
                            },
                            types: [{ fieldType: "EXPRESSION", selected: false }],
                            originalName: "dataProvider",
                            value: "",
                            optional: true,
                            editable: true,
                            advanced: true
                        },
                        {
                            metadata: {
                                label: "Evalset File",
                                description: "Select an evalset for test data"
                            },
                            types: [{ fieldType: "STRING", selected: false }],
                            originalName: "evalSetFile",
                            value: "",
                            optional: true,
                            editable: true,
                            advanced: false
                        }
                    ]
                }
            ],
            editable: true
        }
    }

    const paramFields: FormField[] = [
        {
            key: `variable`,
            label: 'Name',
            type: 'string',
            optional: false,
            editable: true,
            enabled: true,
            documentation: '',
            value: '',
            types: [{ fieldType: "IDENTIFIER", selected: false }]
        },
        {
            key: `type`,
            label: 'Type',
            type: 'TYPE',
            optional: false,
            editable: true,
            enabled: true,
            documentation: '',
            value: '',
            types: [{ fieldType: "TYPE", selected: false }]
        },
        {
            key: `defaultable`,
            label: 'Default Value',
            type: 'string',
            optional: true,
            advanced: true,
            editable: true,
            enabled: true,
            documentation: '',
            value: '',
            types: [{ fieldType: "STRING", selected: false }]
        }
    ];

    const cardOptions = [
        {
            value: 'template',
            title: 'From Template',
            description: 'Use a prebuilt evaluator for a common AI evaluation pattern.',
            icon: <Icon name="bi-data-table" sx={{ fontSize: "20px", width: "20px", height: "20px" }} />
        },
        {
            value: 'custom',
            title: 'Custom',
            description: 'Implement custom evaluation logic, with or without evalset data.',
            icon: <Icon name="bi-config" sx={{ fontSize: "20px", width: "20px", height: "20px" }} />
        }
    ];

    const handleCardSelectorChange = (value: string) => {
        if (value !== 'template') {
            clearTemplateSelection();
        }
        const mode = value === 'template' ? 'template' : 'function';
        setDataProviderMode(mode);
        updateFieldVisibility(mode);
    };

    const handleCustomEvalsetChange = (usesEvalset: boolean) => {
        const mode = usesEvalset ? 'evalSet' : 'function';
        setDataProviderMode(mode);
        updateFieldVisibility(mode);
    };

    const clearTemplateSelection = () => {
        setSelectedTemplate(undefined);
        setTemplateNode(undefined);
        setAgentValue('');
        setShowTemplateCatalog(false);
        setFormFields(fields => fields.filter(isBaseField));
    };

    const templateFields = useMemo(
        () => formFields.filter(isTemplateField).map(field => ({ ...field, hidden: false })),
        [formFields]);

    // Show upgrade message if version is not supported
    if (isVersionSupported === false) {
        return (
            <FullHeightView>
                <TopNavigationBar projectPath={projectPath} />
                <TitleBar title="AI Evaluation" subtitle="Version upgrade required" />
                <FullHeightViewContent padding>
                    <CenteredMessage>
                        <Typography variant="h3" sx={{ margin: '0 0 12px' }}>
                            Please upgrade your Ballerina version
                        </Typography>
                        <HintText style={{ maxWidth: '500px' }}>
                            AI Evaluation features require Ballerina version 2201.13.2 or higher.
                            Please upgrade your Ballerina installation to use this feature.
                        </HintText>
                    </CenteredMessage>
                </FullHeightViewContent>
            </FullHeightView>
        );
    }

    return (
        <View>
            <TopNavigationBar projectPath={projectPath} />
            <TitleBar title="AI Evaluation" subtitle={formSubtitle} />
            <ViewContent padding>
                <Container>
                    <FormHeader title={formTitle} />
                    <FormContainer>
                        {(isLoading || !targetLineRange) && (
                            <FormLoadingSlot>
                                <LoadingView message="Loading form data..." />
                            </FormLoadingSlot>
                        )}
                        {!isLoading && targetLineRange && (
                            <ArtifactForm
                                fileName={filePath}
                                fields={fields}
                                targetLineRange={targetLineRange}
                                onSubmit={onFormSubmit}
                                preserveFieldOrder={false}
                                bottomFields={[NAME_FIELD_KEY]}
                                hideInfoBanner
                                onChange={handleFieldChange}
                                isSaving={isSaving}
                                disableSaveButton={isSaveDisabled}
                                injectedComponents={[
                                    {
                                        component: <>
                                            {!isEditing && (
                                                <CardSelector
                                                    title="How would you like to build this evaluation?"
                                                    options={cardOptions}
                                                    value={dataProviderMode === 'template' ? 'template' : 'custom'}
                                                    onChange={handleCardSelectorChange}
                                                />
                                            )}
                                            {!isEditing && !isTemplateMode && (
                                                <CustomEvalsetControls>
                                                    <FormSection>
                                                        <RadioButtonGroup
                                                            label="Use an evalset?"
                                                            orientation="horizontal"
                                                            value={customUsesEvalset ? 'evalSet' : 'none'}
                                                            options={[
                                                                { id: 'evalset-none', value: 'none', content: 'No evalset' },
                                                                { id: 'evalset-use', value: 'evalSet', content: 'Use evalset' }
                                                            ]}
                                                            onChange={(e) => handleCustomEvalsetChange(e.target.value === 'evalSet')}
                                                        />
                                                    </FormSection>
                                                    {/* Rendered here rather than as a plain field so the select stays
                                                        with the question that asks for it. */}
                                                    {customUsesEvalset && evalsetField && (
                                                        <FormSection>
                                                            <EvalsetFileControl
                                                                field={evalsetField}
                                                                hasEvalsets={evalsetOptions.length > 0}
                                                                selectedEvalsetFile={selectedEvalsetFile}
                                                                emptyState={{
                                                                    icon: <Icon name={evalsetsLoadError ? "bi-error" : "bi-data-table"}
                                                                        sx={{ fontSize: "16px", width: "16px", height: "16px" }} />,
                                                                    title: evalsetsLoadError ? 'Failed to load evalsets' : 'No evalset files found',
                                                                    description: evalsetsLoadError ? (
                                                                        <>Could not load evalsets for this project. Try reopening this view, then select an evalset.</>
                                                                    ) : (
                                                                        <>Export traces from a conversation with an agent to create an evalset.
                                                                            You can also create an empty evalset below, then add test threads in the evalset editor.</>
                                                                    ),
                                                                    canCreate: !evalsetsLoadError,
                                                                }}
                                                                onCreateEvalset={createEvalset}
                                                                onOpenEvalset={openEvalset}
                                                            />
                                                        </FormSection>
                                                    )}
                                                </CustomEvalsetControls>
                                            )}
                                            {isEditing && editShape === 'unresolvable' && (
                                                <StatusRow>
                                                    <TemplateIconTile>
                                                        <Icon name="bi-error" sx={{ fontSize: "20px", width: "20px", height: "20px" }} />
                                                    </TemplateIconTile>
                                                    <GrowingContent>
                                                        <TitleRow>
                                                            Built from template <code>{detectedSymbol}</code>
                                                        </TitleRow>
                                                        <HintText>
                                                            Template details are unavailable, so its settings can't be edited here.
                                                            Check that the ballerina/ai.eval package is available and declared in Ballerina.toml.
                                                        </HintText>
                                                        {templateNode && (
                                                            <MonospaceHint>{templateNode.codedata?.sourceCode}</MonospaceHint>
                                                        )}
                                                    </GrowingContent>
                                                </StatusRow>
                                            )}
                                            {isEditing && (editShape === 'custom' || editShape === 'ambiguous') && (
                                                <StatusRow>
                                                    <TemplateIconTile>
                                                        <Icon name="bi-config" sx={{ fontSize: "20px", width: "20px", height: "20px" }} />
                                                    </TemplateIconTile>
                                                    <GrowingContent>
                                                        <TitleRow>Custom evaluation</TitleRow>
                                                        <HintText>
                                                            {editShape === 'ambiguous'
                                                                ? 'This evaluation calls more than one ai.eval function, so it can\'t be edited as a template.'
                                                                : 'The logic for this evaluation is written by hand.'}
                                                        </HintText>
                                                    </GrowingContent>
                                                </StatusRow>
                                            )}
                                            {isTemplateMode && editShape !== 'unresolvable' && (
                                                <TemplatePicker>
                                                    <SectionLabel style={{ marginBottom: '8px' }}>
                                                        {selectedTemplate ? 'Evaluation template' : 'Choose an evaluation template'}
                                                    </SectionLabel>
                                                    {isSelectingTemplate ? (
                                                        <LoadingSlot>
                                                            <RelativeLoader message="Loading template..." />
                                                        </LoadingSlot>
                                                    ) : selectedTemplate && templateNode ? (
                                                        <TemplateConfigCard
                                                            template={selectedTemplate}
                                                            templateFields={templateFields}
                                                            dataSourceParam={dataSourceParam}
                                                            dataSourceMode={dataSourceMode}
                                                            onDataSourceModeChange={handleDataSourceModeChange}
                                                            agentFieldKey={agentFieldKey}
                                                            evalsetField={evalsetField}
                                                            queriesField={formFields.find(field => field.key === QUERIES_FIELD_KEY)}
                                                            hasEvalsets={evalsetOptions.length > 0}
                                                            selectedEvalsetFile={selectedEvalsetFile}
                                                            onCreateEvalset={createEvalset}
                                                            onOpenEvalset={openEvalset}
                                                            onChangeTemplate={() => setShowTemplateCatalog(true)}
                                                        />
                                                    ) : (
                                                        <EmptyTemplateSlot type="button"
                                                            onClick={() => setShowTemplateCatalog(true)}
                                                            aria-haspopup="dialog"
                                                            aria-label="Choose an evaluation template">
                                                            <GrowingContent>
                                                                <TitleRow>Choose a template to continue</TitleRow>
                                                                <HintText>
                                                                    {templateLoadError
                                                                        || (evalTemplates.length > 0
                                                                            ? `Start with one of ${evalTemplates.length} rule-based and LLM-as-judge checks`
                                                                            : 'Start with a rule-based or LLM-as-judge check')}
                                                                </HintText>
                                                            </GrowingContent>
                                                            <ChooseTemplateAction>
                                                                <Codicon name="search" iconSx={{ fontSize: 14 }}
                                                                    sx={{ height: 14, marginRight: 6 }} />
                                                                Choose Template
                                                            </ChooseTemplateAction>
                                                        </EmptyTemplateSlot>
                                                    )}
                                                    {/* The dialog is already gone by the time a fetch can
                                                        fail, so its error surfaces here. The empty slot
                                                        shows it inline, so only report it alongside a
                                                        card that survived the failed change. */}
                                                    {templateLoadError && selectedTemplate && !isSelectingTemplate && (
                                                        <HintText style={{ color: ThemeColors.ERROR }}>
                                                            {templateLoadError}
                                                        </HintText>
                                                    )}
                                                    {editShape === 'template-with-custom' && (
                                                        <HintText>
                                                            This evaluation also contains custom code. Saving updates only the{' '}
                                                            <code>eval:{detectedSymbol}(…)</code> call.
                                                        </HintText>
                                                    )}
                                                </TemplatePicker>
                                            )}
                                            {showTemplateCatalog && (
                                                <TemplateModal
                                                    templates={evalTemplates}
                                                    templateLoadError={templateLoadError}
                                                    selectedTemplate={selectedTemplate}
                                                    onSelectTemplate={selectEvalTemplate}
                                                    onClose={() => setShowTemplateCatalog(false)}
                                                />
                                            )}
                                        </>,
                                        index: 0
                                    }
                                ]}
                            />
                        )}
                    </FormContainer>
                </Container>
            </ViewContent>
        </View>
    );
}
