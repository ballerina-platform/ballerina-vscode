# The Ballerina extension for Visual Studio Code

The Ballerina VS Code extension offers the ability to visualize the bidirectional mapping between the syntax and graphical representation of your <a href="https://ballerina.io/" target="_blank">Ballerina</a> source code. 

Apart from the visual programming features described below, the Ballerina VS Code extension enhances the Ballerina development experience by providing a comprehensive set of other features, including code editing, debugging, code execution, and code deployment. For detailed information on them, go to the <a href="https://ballerina.io/learn/vs-code-extension/" target="_blank">Ballerina VS Code extension documentation</a>.

## Quick start

For instructions on installing the Ballerina VS Code extension, go to <a href="https://ballerina.io/learn/vs-code-extension/get-started/#install-the-ballerina-extension" target="_blank">Install the extension</a>.

## Features

The VS Code extension allows you to design and develop your Ballerina program using a graphical representation of the code. This graphical view displays the logic and network interaction of a function or a service resource, which makes it easy to understand the source. 

### Ballerina Visualizer View

The Ballerina Visualizer View offers a high-level overview of Ballerina projects based solely on the source code to understand the components of the project and how they interact. 

<img src="https://github.com/wso2/ballerina-plugin-vscode/blob/main/resources/images/ballerina-visualizer.png?raw=true" width="100%" />

### Service Designer View

The Ballerina VS Code extension enables the intuitive creation of Ballerina services (<a href="https://ballerina.io/learn/vs-code-extension/design-the-services/http-api-designer/" target="_blank">HTTP</a> and <a href="https://ballerina.io/learn/vs-code-extension/design-the-services/graphql-api-designer/" target="_blank">GraphQL</a>) without deep familiarity with syntax and configurations.

<img src="https://github.com/wso2/ballerina-plugin-vscode/blob/main/resources/images/service-designer.png?raw=true" width="50%" />

### Sequence Diagram View

The <a href="https://ballerina.io/learn/vs-code-extension/implement-the-code/sequence-diagram-view/" target="_blank">Sequence Diagram View</a> provides a graphical user interface that allows users to visualize and construct program logic by capturing the sequence, concurrency, endpoints, and interactions within the code.

<img src="https://github.com/wso2/ballerina-plugin-vscode/blob/main/resources/images/sequence-diagram.png?raw=true" width="100%" />

### Flow Diagram View

The Flow Diagram View provides a graphical user interface that allows users to visualize and construct program logic by capturing the flow, concurrency, endpoints, and interactions within the code.

<img src="https://github.com/wso2/ballerina-plugin-vscode/blob/main/resources/images/flow-diagram.png?raw=true" width="100%" />

### Data Mapper

The <a href="https://ballerina.io/learn/vs-code-extension/implement-the-code/data-mapper/" target="_blank">Data Mapper</a> facilitates effortless data mapping through an intuitive interface by simplifying complexity and enabling users to concentrate on business logic.

<img src="https://github.com/wso2/ballerina-plugin-vscode/blob/main/resources/images/data-mapper.png?raw=true" width="100%" />

## Documentation

The <a href="https://ballerina.io/learn/vs-code-extension/" target="_blank">Ballerina VS Code extension documentation</a> describes the functionalities of this extension in detail.

## Configure 

You can configure the Ballerina VS Code extension to get a custom user experience. For more details, see <a href="https://ballerina.io/learn/vs-code-extension/configure-the-extension/" target="_blank">Configure the extension</a>.

## Troubleshoot

For troubleshooting, see the Ballerina output. To view the Ballerina output tab, click **View**, click **Output,** and select **Ballerina** from the output list. It provides additional information if the plugin fails to detect a Ballerina distribution.  

You can also enable <a href="https://ballerina.io/learn/vs-code-extension/configure-the-extension/#advanced-configurations" target="_blank">debug logs</a> from the Ballerina extension settings to view any issues arising from the extension features.

## BI end-to-end tests

BI Playwright tests are located in `e2e-test/e2e-playwright-tests`.

From this directory (`workspaces/ballerina/ballerina-extension`):
- Run `pnpm run e2e-test:bi` to execute BI Playwright tests.
- Run `pnpm run e2e-test:bi:download-prerelease` to run BI tests after downloading prerelease VSIXs.

<!-- Temporary marker for an e2e control run (PR to be closed). -->
