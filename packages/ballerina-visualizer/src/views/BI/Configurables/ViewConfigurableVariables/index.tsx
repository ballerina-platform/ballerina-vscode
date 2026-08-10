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
 */

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import styled from "@emotion/styled";
import { ConfigVariable, isSamePath } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Button, Codicon, Dropdown, ErrorBanner, Icon, SplitView, TextField, Tooltip, TreeView, TreeViewItem, Typography, View, ViewContent } from "@wso2/ui-toolkit";
import { AddForm } from "../AddConfigurableVariables";
import { TopNavigationBar } from "../../../../components/TopNavigationBar";
import { TitleBar } from "../../../../components/TitleBar";
import ConfigurableItem from "../ConfigurableItem";
import { RelativeLoader } from "../../../../components/RelativeLoader";

const Container = styled.div`
    width: 100%;
    padding: 10px 0px 10px 8px;
    height: calc(100vh - 220px);
    overflow-y: auto;
`;

const SearchStyle = {
    width: '100%',

    '& > vscode-text-field': {
        width: '100%',
        borderRadius: '5px'
    },
};

const EmptyReadmeContainer = styled.div`
    display: flex;
    margin: 80px 0px;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    height: 100%;
`;

const Description = styled(Typography)`
    color: var(--vscode-descriptionForeground);
`;

const TitleBoxShadow = styled.div`
    box-shadow: var(--vscode-scrollbar-shadow) 0 6px 6px -6px inset;
    height: 3px;
`;

const TitleContent = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
`;

const SearchContainer = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 15px;
    gap: 40px;
`;

const searchIcon = (<Codicon name="search" sx={{ cursor: "auto" }} />);

export interface ConfigProps {
    projectPath: string;
    fileName: string;
    testsConfigTomlPath?: string;
    org: string;
    addNew?: boolean;
}

interface CategoryWithModules {
    name: string;
    modules: string[];
}

type ConfigVariablesState = {
    [category: string]: {
        [module: string]: ConfigVariable[];
    };
};

interface PackageModuleState {
    category: string;
    module: string;
}

const Overlay = styled.div`
    position: fixed;
    width: 100vw;
    height: 100vh;
    background: var(--vscode-settings-rowHoverBackground);
    z-index: 1000;
`;

enum Environment {
    Application = 'Application',
    Test = 'Test',
}

const environmentOptions = [
    { content: Environment.Application, id: Environment.Application, value: Environment.Application },
    { content: Environment.Test, id: Environment.Test, value: Environment.Test },
];

export function ViewConfigurableVariables(props?: ConfigProps) {

    const { rpcClient } = useRpcContext();
    const [configVariables, setConfigVariables] = useState<ConfigVariablesState>({});
    const [errorMessage, setErrorMessage] = useState<string>('');
    const [isAddConfigVariableFormOpen, setAddConfigVariableFormOpen] = useState<boolean>(props?.addNew || false);
    const [searchValue, setSearchValue] = React.useState<string>('');
    const [categoriesWithModules, setCategoriesWithModules] = useState<CategoryWithModules[]>([]);
    const [selectedModule, setSelectedModule] = useState<PackageModuleState>(null);
    const integrationCategory = useRef<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isTestsContext, setIsTestsContext] = useState<boolean>(false);
    const isTestsContextRef = useRef<boolean>(false);
    const selectedModuleRef = useRef<PackageModuleState>(null);
    const [testConfigVariables, setTestConfigVariables] = useState<ConfigVariablesState>({});
    const [testCategoriesWithModules, setTestCategoriesWithModules] = useState<CategoryWithModules[]>([]);

    useEffect(() => {
        rpcClient
            .getBIDiagramRpcClient()
            .getProjectStructure()
            .then((res) => {
                const projectInfo = res.projects.find(project => isSamePath(project.projectPath, props.projectPath));
                if (!projectInfo) {
                    setIsLoading(false);
                    return;
                }
                integrationCategory.current = `${props.org}/${projectInfo.projectName}`;
                setIsLoading(true);
                getConfigVariables(true);
            });

    }, [props.projectPath]);

    useEffect(() => {
        isTestsContextRef.current = isTestsContext;
    }, [isTestsContext]);

    useEffect(() => {
        selectedModuleRef.current = selectedModule;
    }, [selectedModule]);

    useEffect(() => {
        rpcClient.onProjectContentUpdated(() => {
            if (isTestsContextRef.current) {
                getTestConfigVariables();
            } else {
                getConfigVariables();
            }
        });
    }, []);

    useEffect(() => {
        if (categoriesWithModules.length > 0 && !selectedModule && !isTestsContext) {
            const initialCategory = categoriesWithModules[0];
            const initialModule = initialCategory.modules[0];

            // Only set initial module if none is selected and not in tests context
            setSelectedModule({
                category: initialCategory.name,
                module: initialModule
            });
        }
    }, [categoriesWithModules, selectedModule, isTestsContext]);

    const getFilteredVariables = useCallback((variables: ConfigVariablesState) => {
        if (!searchValue || searchValue.trim() === '') {
            return variables;
        }

        const searchLower = searchValue.toLowerCase();
        const filteredData: ConfigVariablesState = {};

        Object.keys(variables).forEach(category => {
            const categoryModules: { [module: string]: ConfigVariable[] } = {};

            Object.keys(variables[category]).forEach(module => {
                const filteredVariables = variables[category][module].filter(variable =>
                    variable.properties.variable.value?.toString().toLowerCase().includes(searchLower)
                );

                if (filteredVariables.length > 0) {
                    categoryModules[module] = filteredVariables;
                }
            });

            if (Object.keys(categoryModules).length > 0) {
                filteredData[category] = categoryModules;
            }
        });

        return filteredData;
    }, [searchValue]);

    const filteredConfigVariables = useMemo(() => getFilteredVariables(configVariables), [getFilteredVariables, configVariables]);
    const filteredTestConfigVariables = useMemo(() => getFilteredVariables(testConfigVariables), [getFilteredVariables, testConfigVariables]);

    const filteredCategoriesWithModules = useMemo(() => {
        return Object.keys(filteredConfigVariables).map(category => ({
            name: category,
            modules: Object.keys(filteredConfigVariables[category])
        }));
    }, [filteredConfigVariables]);

    const filteredTestCategoriesWithModules = useMemo(() => {
        return Object.keys(filteredTestConfigVariables).map(category => ({
            name: category,
            modules: Object.keys(filteredTestConfigVariables[category])
        }));
    }, [filteredTestConfigVariables]);

    // Set selected module to first module in filtered results when search changes
    useEffect(() => {
        const filtered = isTestsContext ? filteredTestCategoriesWithModules : filteredCategoriesWithModules;
        if (searchValue && filtered.length > 0 && filtered[0].modules.length > 0) {
            const firstCategory = filtered[0];
            const firstModule = firstCategory.modules[0];
            setSelectedModule({
                category: firstCategory.name,
                module: firstModule
            });
        }
    }, [filteredCategoriesWithModules, filteredTestCategoriesWithModules, searchValue, isTestsContext]);

    const moduleWarningCount = useCallback((category: string, module: string) => {
        if (!configVariables?.[category]?.[module]) {
            return 0;
        }

        return configVariables[category][module].filter(variable => (
            !variable?.properties?.defaultValue?.value &&
            !variable?.properties?.configValue?.value
        )).length;
    }, [configVariables]);

    const categoryWarningCount = useCallback((category: string) => {
        if (!configVariables?.[category]) {
            return 0;
        }

        return Object.keys(configVariables[category]).reduce((total, module) => {
            return total + moduleWarningCount(category, module);
        }, 0);
    }, [configVariables, moduleWarningCount]);

    const handleSearch = (e: string) => {
        setSearchValue(e);
    }

    const handleModuleSelect = (category: string, module: string) => {
        setSelectedModule({ category, module });
    };

    const resolveNextSelectedModule = (
        categories: CategoryWithModules[],
        currentSelection: PackageModuleState,
        initialLoad: boolean = false
    ): PackageModuleState => {
        if (categories.length === 0) {
            return null;
        }

        const currentCategory = categories.find(category => category.name === currentSelection?.category);
        const currentModuleExists = !!currentCategory?.modules.includes(currentSelection?.module ?? '');
        const currentCategoryLevelSelection = currentSelection?.module === '' && !!currentCategory;

        if (currentSelection && (currentModuleExists || currentCategoryLevelSelection)) {
            return {
                category: currentSelection.category,
                module: currentSelection.module
            };
        }

        const firstCategoryWithModule = categories.find(category => category.modules.length > 0);
        const firstCategory = firstCategoryWithModule ?? categories[0];
        const fallbackModule = firstCategory.modules[0] ?? '';

        if (!currentSelection || initialLoad) {
            return {
                category: firstCategory.name,
                module: fallbackModule
            };
        }

        return {
            category: firstCategory.name,
            module: fallbackModule
        };
    };

    const handleEnvironmentChange = (value: string) => {
        if (value === Environment.Test) {
            setIsTestsContext(true);
            getTestConfigVariables();
        } else {
            setIsTestsContext(false);
            if (categoriesWithModules.length > 0) {
                const firstCat = categoriesWithModules[0];
                setSelectedModule({ category: firstCat.name, module: firstCat.modules[0] });
            }
        }
    };

    const handleOpenConfigFile = () => {
        let filePath: string;
        if (isTestsContext && props.testsConfigTomlPath) {
            // Pass the tests/ directory (strip the trailing "/Config.toml")
            filePath = props.testsConfigTomlPath.substring(0, props.testsConfigTomlPath.lastIndexOf('/'));
        } else {
            // openConfigToml expects a directory; projectPath is the project root
            filePath = props.projectPath;
        }
        rpcClient.getBIDiagramRpcClient().OpenConfigTomlRequest({ filePath });
    }

    const handleAddConfigVariableFormOpen = () => {
        setAddConfigVariableFormOpen(true);
    };

    const handleFormClose = () => {
        setAddConfigVariableFormOpen(false);
    };

    const handleFormSubmit = async () => {
        if (isTestsContext) {
            getTestConfigVariables();
        } else {
            getConfigVariables();
        }
    }

    const handleOnDeleteConfigVariable = async (index: number) => {
        if (!selectedModule) return;

        const activeVariables = isTestsContext ? testConfigVariables : configVariables;
        const activeFiltered = isTestsContext ? filteredTestConfigVariables : filteredConfigVariables;
        const variables = searchValue ?
            activeFiltered[selectedModule.category]?.[selectedModule.module] :
            activeVariables[selectedModule.category]?.[selectedModule.module];

        const variable = variables?.[index];
        if (!variable) return;

        rpcClient
            .getBIDiagramRpcClient()
            .deleteConfigVariableV2({
                configFilePath: props.fileName,
                configVariable: variable,
                packageName: selectedModule.category,
                moduleName: selectedModule.module
            })
            .then((response) => {
                if (response.textEdits) {
                    console.log("Successfully deleted configurable variable");
                } else {
                    console.error(">>> Error updating source code", response);
                }
            })
            .finally(() => {
                if (isTestsContext) {
                    getTestConfigVariables();
                } else {
                    getConfigVariables();
                }
            });
    };

    const getConfigVariables = async (initialLoad: boolean = false) => {

        let data: ConfigVariablesState = {};
        let errorMsg: string = '';

        try {
            const variables = await rpcClient
                .getBIDiagramRpcClient()
                .getConfigVariablesV2({
                    projectPath: ''
                });
            const raw = (variables as any).configVariables as ConfigVariablesState;
            errorMsg = (variables as any).errorMsg;
            // Exclude variables that have 'isTestConfig' in codedata.data — those belong to Tests only.
            // Modules and categories are always preserved even if all variables are filtered out,
            // so submodules appear in both Application and Test environments.
            const filtered: ConfigVariablesState = {};
            Object.keys(raw || {}).forEach(category => {
                const filteredModules: { [module: string]: ConfigVariable[] } = {};
                Object.keys(raw[category]).forEach(module => {
                    filteredModules[module] = raw[category][module].filter(
                        variable => !('isTestConfig' in (variable.codedata?.data || {}))
                    );
                });
                filtered[category] = filteredModules;
            });
            data = filtered;
        } catch (error) {
            // A rejected/hung langclient call (e.g. LS not yet ready) must not
            // leave isLoading stuck true forever — that hides the whole view,
            // including the title, with no visible error.
            console.error(">>> Error fetching config variables", error);
        }

        setConfigVariables(data);
        setErrorMessage(errorMsg);

        // Always refresh available categories/modules after fetching latest data.
        const extractedCategories = Object.keys(data).map(category => ({
            name: category,
            modules: Object.keys(data[category])
        }));
        setCategoriesWithModules(extractedCategories);

        // Preserve currently selected tab when still available after updates.
        // This is important for imported libraries where selection is category-level ("").
        const currentSelection = selectedModuleRef.current;
        setSelectedModule(resolveNextSelectedModule(extractedCategories, currentSelection, initialLoad));
        setIsLoading(false);
    };

    const getTestConfigVariables = async () => {
        setIsLoading(true);
        const variables = await rpcClient
            .getBIDiagramRpcClient()
            .getConfigVariablesV2({
                projectPath: ''
            });
        const data = (variables as any).configVariables as ConfigVariablesState;
        setTestConfigVariables(data || {});
        const categories = Object.keys(data || {}).map(category => ({
            name: category,
            modules: Object.keys(data[category])
        }));
        setTestCategoriesWithModules(categories);
        const currentSelection = selectedModuleRef.current;
        setSelectedModule(resolveNextSelectedModule(categories, currentSelection));
        setIsLoading(false);
    };

    const updateErrorMessage = (message: string) => {
        setErrorMessage(message);
    };

    const isTestsIntegrationModule = isTestsContext && selectedModule?.category === integrationCategory.current;
    const isTestsImportedLib = isTestsContext && selectedModule?.category && selectedModule.category !== integrationCategory.current;

    const categoryDisplay = !isTestsContext
        ? (selectedModule?.category === integrationCategory.current ? 'Integration' : selectedModule?.category)
        : isTestsIntegrationModule ? 'Tests : Integration'
            : isTestsImportedLib ? `Tests : ${selectedModule?.category}`
                : 'Tests';

    const title = selectedModule?.module
        ? `${categoryDisplay} : ${selectedModule.module}`
        : categoryDisplay;

    let renderVariables: ConfigVariablesState = isTestsContext ? testConfigVariables : configVariables;
    if (searchValue) {
        renderVariables = isTestsContext ? filteredTestConfigVariables : filteredConfigVariables;
    }

    const activeCategories = isTestsContext
        ? (searchValue ? filteredTestCategoriesWithModules : testCategoriesWithModules)
        : (searchValue ? filteredCategoriesWithModules : categoriesWithModules);

    return (
        <View>
            <TopNavigationBar projectPath={props.projectPath} />
            <TitleBar title="Configurable Variables" subtitle="View and manage configurable variables" hideUndoRedo={true} actions={
                <div style={{ display: "flex", gap: '8px', alignItems: 'center' }}>
                    {errorMessage &&
                        <Tooltip content={errorMessage}>
                            <Codicon name="error"
                                sx={{
                                    marginLeft: 5,
                                    color: 'var(--vscode-editorError-foreground)'
                                }}
                                iconSx={{
                                    fontSize: '16px'
                                }}
                            />
                        </Tooltip>
                    }
                    <Button appearance="secondary" onClick={handleOpenConfigFile}>
                        <Icon sx={{ marginRight: 5, paddingTop: '2px' }} name="editIcon" />Edit {isTestsContext ? 'tests/Config.toml' : 'Config.toml'}
                    </Button>
                    {props.testsConfigTomlPath && (
                        <Dropdown
                            id="environment-selector"
                            items={environmentOptions}
                            value={isTestsContext ? Environment.Test : Environment.Application}
                            onValueChange={handleEnvironmentChange}
                            sx={{ width: 120 }}
                        />
                    )}
                </div>
            } />
            {isAddConfigVariableFormOpen && <Overlay data-testid="config-overlay" />}
            <ViewContent padding>
                <div style={{ height: 'calc(100vh - 220px)' }}>
                    {/* Search bar and filters */}
                    <SearchContainer>
                        <TextField
                            sx={SearchStyle}
                            placeholder="Search Configurables"
                            value={searchValue}
                            onTextChange={handleSearch}
                            icon={{
                                iconComponent: searchIcon,
                                position: 'start',
                            }}
                        />
                    </SearchContainer>
                    <div style={{ width: "auto" }}>
                        {isLoading && <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "calc(100vh - 220px)" }}><RelativeLoader message="Loading configurable variables..." /></div>}
                        {!isLoading && <SplitView defaultWidths={[20, 80]}>
                            {/* Left side tree view */}
                            <div id={`package-treeview`} style={{ padding: "10px 0 50px 0" }}>
                                {/* Display integration category first */}
                                {activeCategories
                                    .filter(category => category.name === integrationCategory.current)
                                    .map((category) => (
                                        <TreeView
                                            key={category.name}
                                            rootTreeView
                                            id={category.name}
                                            expandByDefault={true}
                                            onSelect={() => {
                                                if (category.modules.length > 0) {
                                                    handleModuleSelect(category.name, category.modules[0]);
                                                }
                                            }}
                                            treeViewElementSX={{
                                                border: selectedModule?.category === category.name && selectedModule?.module === ""
                                                    ? '1px solid var(--vscode-focusBorder)'
                                                    : 'none'
                                            }}
                                            content={
                                                <div
                                                    style={{
                                                        display: 'flex',
                                                        height: '22px',
                                                        alignItems: 'center',
                                                    }}>
                                                    <Typography
                                                        variant="body3"
                                                        sx={{
                                                            fontWeight: selectedModule?.category === category.name && selectedModule?.module === ""
                                                                ? 'bold' : 'normal'
                                                        }}
                                                    >
                                                        Integration
                                                    </Typography>
                                                    {categoryWarningCount(category.name) > 0 && (
                                                        <div style={{ display: 'flex', alignItems: 'center' }}>
                                                            <Codicon name="warning"
                                                                sx={{
                                                                    marginLeft: 5,
                                                                    fontSize: '0.8em',
                                                                    color: 'var(--vscode-editorWarning-foreground)'
                                                                }}
                                                            />
                                                            <span
                                                                id={`integration-warning-count`}
                                                                style={{
                                                                    marginLeft: 3,
                                                                    color: 'var(--vscode-editorWarning-foreground)',
                                                                    fontSize: '0.85em'
                                                                }}>
                                                                {categoryWarningCount(category.name)}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            }
                                        >
                                            {category.modules.filter(moduleName => moduleName !== "").map((moduleName) => (
                                                <TreeViewItem
                                                    key={`${category.name}-${moduleName}`}
                                                    id={`${category.name}-${moduleName}`}
                                                    sx={{
                                                        backgroundColor: 'transparent',
                                                        paddingLeft: '35px',
                                                        height: '25px',
                                                        border: selectedModule?.category === category.name && selectedModule?.module === moduleName
                                                            ? '1px solid var(--vscode-focusBorder)'
                                                            : 'none'
                                                    }}
                                                    selectedId={`${category.name}-${moduleName}`}
                                                >
                                                    <div
                                                        style={{ display: 'flex', height: '20px', alignItems: 'center' }}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleModuleSelect(category.name, moduleName);
                                                        }}
                                                    >
                                                        <Typography
                                                            variant="body3"
                                                            sx={{
                                                                fontWeight: selectedModule?.category === category.name && selectedModule?.module === moduleName
                                                                    ? 'bold' : 'normal'
                                                            }}
                                                        >
                                                            {moduleName}
                                                        </Typography>
                                                        {moduleWarningCount(category.name, moduleName) > 0 && (
                                                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                                                <Codicon
                                                                    name="warning"
                                                                    sx={{
                                                                        marginLeft: 5,
                                                                        fontSize: '0.8em',
                                                                        color: 'var(--vscode-editorWarning-foreground)'
                                                                    }}
                                                                />
                                                                <span style={{ marginLeft: 3, color: 'var(--vscode-editorWarning-foreground)', fontSize: '0.85em' }}>
                                                                    {moduleWarningCount(category.name, moduleName)}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </TreeViewItem>
                                            ))}
                                        </TreeView>
                                    ))}

                                {/* Group all other categories under "Imported libraries" */}
                                {activeCategories
                                    .filter(category => category.name !== integrationCategory.current).length > 0 && (
                                        <TreeView
                                            rootTreeView
                                            id="imported-libraries"
                                            expandByDefault={true}
                                            content={
                                                <div
                                                    style={{
                                                        display: 'flex',
                                                        height: '22px',
                                                        alignItems: 'center',
                                                    }}>
                                                    <Typography
                                                        variant="body3"
                                                        sx={{
                                                            fontWeight: 'normal'
                                                        }}
                                                    >
                                                        Imported libraries
                                                    </Typography>
                                                </div>
                                            }
                                        >
                                            {/* Map all non-integration categories */}
                                            {activeCategories
                                                .filter(category => category.name !== integrationCategory.current)
                                                .map((category) => (
                                                    <TreeViewItem
                                                        key={category.name}
                                                        id={category.name}
                                                        sx={{
                                                            backgroundColor: 'transparent',
                                                            paddingLeft: '35px',
                                                            height: '25px',
                                                            border: selectedModule?.category === category.name
                                                                ? '1px solid var(--vscode-focusBorder)'
                                                                : 'none',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap',
                                                            boxSizing: 'border-box'
                                                        }}
                                                        selectedId={category.name}
                                                    >
                                                        <div
                                                            style={{
                                                                display: 'flex',
                                                                height: '22px',
                                                                alignItems: 'center'
                                                            }}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleModuleSelect(category.name, "");
                                                            }}
                                                        >
                                                            <Typography
                                                                variant="body3"
                                                                sx={{
                                                                    fontWeight: selectedModule?.category === category.name && selectedModule?.module === ""
                                                                        ? 'bold' : 'normal'
                                                                }}
                                                            >
                                                                {category.name}
                                                            </Typography>
                                                            {categoryWarningCount(category.name) > 0 && (
                                                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                                                    <Codicon name="warning"
                                                                        sx={{
                                                                            marginLeft: 5,
                                                                            fontSize: '0.8em',
                                                                            color: 'var(--vscode-editorWarning-foreground)'
                                                                        }}
                                                                    />
                                                                    <span
                                                                        id={`${category.name}-warning-count`}
                                                                        style={{
                                                                            marginLeft: 3,
                                                                            color: 'var(--vscode-editorWarning-foreground)',
                                                                            fontSize: '0.85em'
                                                                        }}>
                                                                        {categoryWarningCount(category.name)}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </TreeViewItem>
                                                ))}
                                        </TreeView>
                                    )}
                            </div>
                            {/* Right side view */}
                            <div style={{ height: '100%' }}>
                                <>
                                    {!renderVariables ?
                                        <ErrorBanner errorMsg={"Error fetching config variables"} />
                                        : searchValue && activeCategories.length === 0 ?
                                            <EmptyReadmeContainer>
                                                <Icon
                                                    name="searchIcon"
                                                    sx={{
                                                        fontSize: '3em',
                                                        color: 'var(--vscode-descriptionForeground)',
                                                        marginBottom: '10px'
                                                    }} />
                                                <Description variant="body2">
                                                    No configurable variables found matching "{searchValue}" in any module
                                                </Description>
                                                <Button appearance="secondary" onClick={() => setSearchValue('')}>
                                                    Clear Search
                                                </Button>
                                            </EmptyReadmeContainer>
                                            : <>
                                                <div
                                                    id="TitleDiv"
                                                    style={{
                                                        position: "sticky", top: 0, color: "var(--vscode-editor-foreground)",
                                                        backgroundColor: "var(--vscode-editor-background)"
                                                    }}>
                                                    <TitleContent>
                                                        <Typography
                                                            variant="h2"
                                                            sx={{
                                                                padding: "0px 0 0 20px",
                                                                margin: "10px 0px",
                                                                color: "var(--vscode-foreground)"
                                                            }}>
                                                            {title}
                                                        </Typography>
                                                        {/* Only show Add Config button at the top when the module has configurations */}
                                                        {selectedModule &&
                                                            renderVariables[selectedModule?.category]?.[selectedModule?.module]?.length > 0 &&
                                                            (selectedModule.category === integrationCategory.current) && (
                                                                <Button
                                                                    sx={{ display: 'flex', justifySelf: 'flex-end' }}
                                                                    appearance="primary"
                                                                    onClick={handleAddConfigVariableFormOpen}
                                                                >
                                                                    <Codicon name="add" sx={{ marginRight: 5 }} />Add Config
                                                                </Button>
                                                            )}
                                                    </TitleContent>
                                                    <TitleBoxShadow />
                                                </div>
                                                <Container>
                                                    {selectedModule && (
                                                        <>
                                                            {/* Check if the selected module exists in the variables */}
                                                            {renderVariables[selectedModule?.category] &&
                                                                renderVariables[selectedModule?.category][selectedModule?.module] && (
                                                                    <div key={`${selectedModule?.category}-${selectedModule?.module}`}>
                                                                        {renderVariables[selectedModule?.category][selectedModule?.module].length > 0 ? (
                                                                            /* Variables under this selected module */
                                                                            renderVariables[selectedModule?.category][selectedModule?.module].map((variable, index) => (
                                                                                <ConfigurableItem
                                                                                    key={`${selectedModule.category}-${selectedModule.module}-${index}`}
                                                                                    variable={variable}
                                                                                    integrationCategory={integrationCategory.current}
                                                                                    packageName={selectedModule.category}
                                                                                    moduleName={selectedModule.module}
                                                                                    index={index}
                                                                                    fileName={props.fileName}
                                                                                    isTestsContext={isTestsContext}
                                                                                    onDeleteConfigVariable={handleOnDeleteConfigVariable}
                                                                                    onFormSubmit={handleFormSubmit}
                                                                                    updateErrorMessage={updateErrorMessage}
                                                                                />
                                                                            ))
                                                                        ) : (
                                                                            // No variables in this module (not search related)
                                                                            <EmptyReadmeContainer>
                                                                                <Description variant="body2">
                                                                                    No configurable variables found in this module
                                                                                </Description>
                                                                                {selectedModule.category === integrationCategory.current && (
                                                                                    <Button
                                                                                        appearance="primary"
                                                                                        onClick={handleAddConfigVariableFormOpen}>
                                                                                        <Codicon name="add" sx={{ marginRight: 5 }} />
                                                                                        Add Config
                                                                                    </Button>
                                                                                )}
                                                                            </EmptyReadmeContainer>
                                                                        )}
                                                                    </div>
                                                                )
                                                            }
                                                        </>
                                                    )}
                                                    {isAddConfigVariableFormOpen && selectedModule &&
                                                        <AddForm
                                                            isOpen={isAddConfigVariableFormOpen}
                                                            onClose={handleFormClose}
                                                            onSubmit={handleFormSubmit}
                                                            title={`Add Configurable Variable`}
                                                            filename={props.fileName}
                                                            packageName={selectedModule.category}
                                                            moduleName={selectedModule.module}
                                                        />
                                                    }
                                                </Container >
                                            </>
                                    }
                                </>
                            </div>
                        </SplitView>}
                    </div>
                </div>
            </ViewContent>
        </View>
    );
}

export default ViewConfigurableVariables;
