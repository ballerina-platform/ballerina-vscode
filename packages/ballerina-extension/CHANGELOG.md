# Changelog

All notable changes to the **Ballerina** extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/).


## [6.0.0](https://github.com/wso2/ballerina-vscode/compare/v5.12.0...v6.0.0) - 2026-10-13

### Added

- **Workflow Integration** — Introduced a durable workflow designer for long-running business processes, with human tasks, timers, wait-for-data events, activities created from connections, child workflows, and durable agentic workflows. Workflow artifacts are detected when deploying to the cloud.
- **AI Agents** — Added a Voice Agent Service, human-in-the-loop approval for agent tools, memory store display on agent nodes, multi-agent flow visualization in the trace viewer, and evaluation set viewing and reporting from the test explorer.
- **Knowledge Bases & RAG** — Added WSO2 Cloud Knowledge Bases and more data loaders, such as SharePoint, to the knowledge base and data loader panels.
- **Copilot Extensibility** — Added Skills (with built-in data mapping, workflow and agent-building skills), MCP server configuration at user and workspace scope, and `AGENTS.md` project instructions for WSO2 Integrator Copilot.
- **AI Model Providers** — Added AWS Bedrock bring-your-own-key support and EU region routing for the Copilot backend.
- **Event & File Triggers** — Added Solace, Oracle CDC, MySQL CDC, SAP ECC (JCo), HubSpot, SMB and Azure Storage Files triggers. Trigger forms are now generated from connector-owned metadata.
- **Library & Language Support** — Added library function lookup from Ballerina Central, Ballerina submodule support in search and helper panes, import aliases, package visibility when publishing libraries, and FreeMarker library support.

### Changed

- **Copilot-First Experience** — Copilot is now the primary surface on the integration overview page, with a floating Copilot orb, improved chat history and scrolling, server-side context compaction, and checkpoint restore. The assistant is named WSO2 Integrator Copilot.
- **Ballerina 2201.14.0 & Java 25** — The extension and bundled language server now target Ballerina 2201.14.0 and Java 25, and prompt to update dependencies locked before the Java 25 distribution.
- **Project & Integration Creation** — Simplified project creation, added package org/version configuration, and open new integrations directly after they are created.
- **Migration Wizard** — Added a keep-structure option, progress reporting, and improved AI enhancement prompts.
- **Packaging** — The Ballerina TextMate grammar and language server are now built and shipped from this repository.

### Fixed

- **Workflow Designer** — Fixed form hydration data loss, source-writing bugs, node deletion, palette sizing and rendering issues.
- **Copilot & Agent Reliability** — Fixed checkpoint restore damaging files, file edit tools skipping edits, agent mode leaking into new chats, and output-limit truncation handling.
- **Forms & Editors** — Fixed array/map editor diagnostics, enum and boolean dropdowns, optional field handling, expression editor completions, and configurable variable handling.
- **Service Designer & Try It** — Fixed connector version resolution, same-named Kafka service navigation, Fast Run on Java 25, and Try It detection for fast-run services.
- **Security** — Updated dependencies to address reported vulnerabilities.

## [5.12.0](https://github.com/wso2/vscode-extensions/compare/ballerina-5.8.2...ballerina-integrator-1.10.0) - 2026-05-18

### Added

- **Library Project Support** — Added stronger library-project workflows in workspaces, including improved classification, creation flow updates, and publishing support.
- **BI Copilot Capabilities** — Added Copilot tools and UX features such as plan/review improvements, evaluation support, config collection, and usage insights.
- **Data Mapper Coverage** — Expanded mapper capabilities with JSON/XML handling, richer type support, and improved submapping/importable-type flows.

### Changed

- **Cloud and Dev Environment Flow** — Improved integration flows for cloud/dev environments and related extension behavior.
- **Editor & Forms UX** — Refined expression editor, type/form editors, and side-panel interactions for better consistency and usability.
- **Project & Build Tooling** — Improved test coverage and build/tooling reliability across workspace and extension modules.

### Fixed

- **Form and Validation Stability** — Fixed inconsistencies in form behavior, diagnostics, and validation across editors.
- **Copilot & Agent Reliability** — Fixed multi-turn context, review-mode behavior, login/config edge cases, and tool-form related issues.
- **Service/Designer Reliability** — Resolved service designer, migration, resource-path, and artifact navigation issues.
- **Security & Dependencies** — Applied dependency upgrades and vulnerability fixes across extension components.

## [5.8.3](https://github.com/wso2/vscode-extensions/compare/ballerina-5.8.2...ballerina-5.8.3) - 2026-04-21

### Fixed

- **Test Explorer** - Render Ballerina test explorer icons only when a Ballerina project is opened.
- **Agent Default Model Provider Configuration** - Fixed default model provider configuration not added automatically when creating inline agents.

## [5.8.2](https://github.com/wso2/vscode-extensions/compare/ballerina-5.8.1...ballerina-5.8.2) - 2026-03-11

### Fixed

- **Model Updates** - Updated Haiku models to the 4.5 version for improved performance and capabilities.

## [5.8.1](https://github.com/wso2/vscode-extensions/compare/ballerina-integrator-1.7.0...ballerina-5.8.1) - 2026-02-25

### Fixed

- **Installation** — Enhanced Windows environment detection to properly identify Ballerina distributions on Windows.

## [5.8.0](https://github.com/wso2/vscode-extensions/compare/ballerina-5.7.3...ballerina-integrator-1.7.0) - 2026-02-14

### Added

- **Event Integration** — Introduced CDC for PostgreSQL support.
- **FTP Integration** — Added support for deprecated FTP functions.
- **Expression Editor** — Added SQL support for expression editing.

### Changed

- **Project Creation** — Refactored form layout and validation.
- **Service Management** — Improved Try-it flow and multiple Ballerina version detection; sorted HTTP resources in service designer and artifact views.
- **Form Validation** — Ensured form validation runs before language server diagnostics.

### Fixed

- **Installation** — Added warning for conflicting Ballerina installations.
- **UI Components** — Fixed resource configuration response reset, record config helper overflow, and Boolean/enum editor selection.
- **Type Editor** — Fixed recursive type creation issue.
- **Expression Editor** — Fixed completions for method access.
- **Security** — Updated dependencies to address vulnerabilities (CVE-2026-25128, CVE-2025-50537, CVE-2025-13465, CVE-2026-25547).

## [5.7.3](https://github.com/wso2/vscode-extensions/compare/ballerina-5.7.2...ballerina-5.7.3) - 2026-01-23

### Fixed

- **Expression Editor** — Fixed issue where text input with double quotes was not allowed.
- **Security** — Updated lodash to 4.17.23 to fix CVE-2025-13465 prototype pollution vulnerability.


## [5.7.2](https://github.com/wso2/vscode-extensions/compare/ballerina-5.7.1...ballerina-5.7.2) - 2026-01-22

### Fixed

- **BI Copilot** — Enhanced workspace support and improved review mode functionality in Ballerina Workspace environments.


## [5.7.1](https://github.com/wso2/vscode-extensions/compare/ballerina-integrator-1.6.0...ballerina-5.7.1) - 2026-01-21

### Fixed

- **Environment** — Fix comprehensive fallback JDK detection logic that checks JAVA_HOME environment variable.


## [5.7.0](https://github.com/wso2/vscode-extensions/compare/ballerina-integrator-1.5.4...ballerina-integrator-1.6.0) - 2026-01-20

### Added

- **AI Agent Mode** — Introduced a comprehensive Agent Mode with design capabilities, automatic code integration, task approval workflows, and diagnostic tools. Added support for dynamic OpenAPI connector generation and chat checkpoints.
- **Connectors** — Revamped the Connectors view with support for Persist and WSDL connections. Improved connector generation workflows.
- **Expression Editor** — Expanded expression support with new editors for String Templates, SQL expressions, booleans, numbers, enums, and maps.
- **Data Mapper** — Enhanced mapping capabilities with a "Group by" option, visual icons for mapping options, and support for all primitive type conversions.
- **CDC for Microsoft SQL Server** - Introduced Change Data Capture for Microsoft SQL Server under the event integration section.

### Changed

- **AI & Copilot** — Migrated to Devant authentication and improved chat state management. Enhanced Design Mode with better user communication, history persistence, and review modes.
- **Workspace Support** — Updated core commands (including `Type Diagram`, `Add Construct`, `Debug Integration`, and `Run`) to fully support multi-project and workspace environments.
- **Data Mapper** — Improved error handling, type compatibility, and the switching experience for reusable mappers.
- **Editor & UI** — Refactored form properties for better performance and consistency. Improved the Samples view and Project Explorer rendering.

### Fixed

- **General** — Resolved issues with `Ballerina: Pack` on Windows, proxy renaming, and Cloud Editor organization selection.
- **Data Mapper** — Fixed bugs related to undo functionality, sub-mapping rendering, output port states, and variable visibility in let-clauses.
- **Expression Editor** — Corrected issues with interpolation wrapping, record editor visibility, and input validation.
- **Security** — Updated dependencies to address known vulnerabilities.

## [5.6.4](https://github.com/wso2/vscode-extensions/compare/ballerina-integrator-1.5.3...ballerina-integrator-1.5.4) - 2025-12-05

### Fixed

- **Data Mapper** — Fixed the issue with focusing into inner array queries.
- **Security** — Updated dependencies to address security vulnerabilities (`CVE-2024-51999`).

## [5.6.3](https://github.com/wso2/vscode-extensions/compare/ballerina-integrator-1.5.2...ballerina-integrator-1.5.3) - 2025-12-01

### Changed

- **Data Mapper** — Improved completion support for the expression bar and clause editor. Re-enabled array aggregating options.

### Fixed

- **Data Mapper** — Fixed expression bar focusing, inline undo button, and crashes during mapping clearance.
- **AI Data Mapper** — Fixed error handling, output formatting, and compilation errors.

## [5.6.2](https://github.com/wso2/vscode-extensions/compare/ballerina-integrator-1.5.1...ballerina-integrator-1.5.2) - 2025-11-18

### Changed

- **Workspace & Project Management** — Improved workspace management with a new Workspace Overview, expanded tree view support, and multi-project migration capabilities. Integration management is enhanced, allowing additions and deletions directly from the overview. The build command and language server integration have also been updated for better multi-project support.
- **Editor & Configuration** — Updated the expression editor with an expanded view for a better editing experience. The service and record configuration views have been improved with better styling, diagnostics, and form support. Configuration editing is enhanced with a new configuration object editor, and the dependency pull flow now provides improved visual feedback.
- **AI Features** — Enhanced the AI Data Mapper to support multiple file uploads and updated the AI code generator for compatibility with Ballerina workspaces.
- **Editor & UX** — Improved the user experience for the expanded expression editor and component diagram. Refactored floating button styles in the expression editor for better theming, and improved chip styling for light themes.
- **Project & Configuration** — Enhanced feature compatibility validation across different Ballerina versions. Updated the package configurable view for better configuration management.

### Fixed

- **Expression Editor & Configuration Views** — Resolved multiple issues in the expression editor, including problems with completions, styles, and value synchronization in the record config view. Fixed popup stacking order and button alignment in configuration popups.
- **General UI & Editor** — Addressed UI glitches, including a helper pane overflow issue, incorrect tree item highlighting with diagnostics, and an infinite re-render bug in the print form. Fixed a language server project loading issue in workspace setups.
- **Security** — Updated dependencies to address security vulnerabilities (`CVE-2025-64718`, `CVE-2025-64756`).

## [5.6.1](https://github.com/wso2/vscode-extensions/compare/ballerina-integrator-1.5.0...ballerina-integrator-1.5.1) - 2025-11-12

### Fixed

- **Ballerina Version Compatibility** — The "New Project" and "Natural Programming functions" features are now only shown for Ballerina versions 2201.13.0 and above.


## [5.6.0](https://github.com/wso2/vscode-extensions/compare/ballerina-integrator-1.4.0...ballerina-integrator-1.5.0) - 2025-11-11

### Added

- **Editor** — Added support for [Ballerina workspaces](https://ballerina.io/learn/workspaces/). This allows you to seamlessly manage, navigate, and build multiple related Ballerina projects within a single VS Code window, greatly improving the development workflow for complex systems.

## [5.5.0](https://github.com/wso2/vscode-extensions/compare/ballerina-integrator-1.3.2...ballerina-integrator-1.4.0) - 2025-11-05

### Added

- **Service & Data Handling** — Introduced MCP AI and Solace Event integrations, redesigned Service and Event Integration flows with AI-powered payload generation, and introduced an LLM-based Data Mapper.
- **GraphQL Designer** — Added schema-based service generation, GraphQL-based type suggestions, `graphql:ID` annotation support, and documentation on GraphQL fields.
- **Expression Editor** — Enhanced the expression editor with improved syntax highlighting. The expression helper now offers distinct modes for both text and expression inputs.

### Changed

- **AI & Copilot** — Improved AI code generation formatting, step handling, and system prompts for better response structure.
- **Service Designer** — Revamped the view with more organized listener and service properties, enhanced with readable listener names, and refactored metadata display.
- **Data Mapper** — Improved breadcrumb labels and refactored preview behavior for output-side arrays.
- **UI & UX** — Enhanced the Helper Pane UI and navigation, and refactored the Resource form styles. Improved the Type Editor with type import capability and automatic generation of sample JSON for payload types.

### Fixed

- **Data Mapper** — Corrected issues with mappings generated for output header ports.
- **Service Designer** — Resolved an infinite re-render issue and fixed bugs in the API designer and MCP tool editing.
- **Expression Editor** — Fixed issues with constrained language in Windows PowerShell, delete key behavior, and text selection.
- **UI & UX** — Addressed UI glitches, including a popup movement issue when dragging the terminal, and fixed `undo/redo` stack reset conditions.
- **GraphQL** — Removed Union Types from GraphQL Input Types.
- **AI & Copilot** — Fixed invalid markdown characters in the chat window, file creation issues, and state management in the chat window. Resolved a bug where the reusable model provider form was not displaying correctly.

## [5.4.2](https://github.com/wso2/vscode-extensions/compare/ballerina-integrator-1.3.1...ballerina-integrator-1.3.2) - 2025-10-26

### Changed

- **Data Mapper** — Enabled reset and refresh options.

### Fixed

- **Editor** — Allowed artifact creation even when corresponding source files are missing.
- **Data Mapper** — Added support for mappings with built-in Ballerina sub-types (e.g., `int:Signed32`), fixed creation using types from sub-modules, enabled expression-bar completions for reusable mappers, and corrected link rendering for optional field access.
- **Type Browser** — Improved type filtering based on user queries.
- **Service Class Designer** — Enabled connection generation for clients created from WSDL files.

## [5.4.1](https://github.com/wso2/vscode-extensions/compare/ballerina-integrator-1.3.0...ballerina-integrator-1.3.1) - 2025-10-15

### Changed

- Enable undo/redo across extension views for a consistent editing experience.
- **BI forms** — fix type-diagram field rendering, improve read-only handling, and stabilize context menus.
- **Data Mapper** — improved productivity: auto-focus navigation, safer primitive mapping options, updated array-element APIs, and richer custom/transform requests.

### Fixed

- **Editor** — Fixed expression-bar focus, flow-diagram race conditions, service-navigation sync, context-menu triggers, and connector list navigation.
- **Data Mapper** — Fixed stale contexts, filter/map link rendering, ESC key handling, long-field type visibility, and query-view navigation.
- **Service Class Designer** — Fixed diagnostics, HTTP resource parameter editing, MCP client updates, and MI helper-pane sizing.

## [5.4.0] - 2025-09-19

### Major updates

- **Improved Data Mapper** — Improved performance for large, deeply nested records, more intuitive design, and a new expression editor for easier transformations.
- **Enhanced AI & Knowledge Base** — Added document generation, new knowledge-base management tools, smarter agent creation, and improved AI suggestions.
- **GraphQL Upgrades** — Support advanced configurations at service and field level, including context and metadata handling.
- **Connector & Project Experience** — Renamed Local Connectors to Custom Connectors, added new UI features, and improved project switching.
- **Editor & Language Server Enhancements** — Better editor usability, improved rendering, and expanded migration tool support.
- **Migration Tooling Support** — Support importing Mule projects and TIBCO projects to create Ballerina integrations.
- **New Expression & Type Helper Experience** — Enhanced UI for expression building with support for value suggestions, along with easier creation and usage of variables, configurable, and functions, making expression building more intuitive and efficient.

### Added

- **Data Mapper** — Support for enums/unions, constants, nested arrays, optional fields and transformation function mappings.
- **AI & Knowledge Base** — Document generation, chunking tools (Chunker, Dataloader), smarter agent creation with reusable model providers.
- **Connector Experience** — Local Connectors renamed to Custom Connectors, new tab-based UI, better multi-project switching, migration tool UI.
- **Type Diagram** — Optimized view for diagrams with high node count, added node deletion, and support for making types read-only via TypeEditor.
- **AWS Bedrock authentication support for BI Copilot**

### Changed

- **Mappings API** — Standardized field names (name, displayName), improved optionality handling.
- **AI & Authentication** — Now uses Devant login and integrates the Search API for template discovery.
- **Editor & Designer** — UI refinements, project names now sourced from ballerina.toml, and AI RAG nodes relocated to advanced settings.
- **UX Improvements** — Enhanced connector workflows, better record rendering, and more robust diagram/test coverage.
- **Collapsible Node-Palette** — Node palette groups are now collapsible and expandable for improved navigation.

### Fixed

- **Data Mapper** — Fixed issues with array handling, default values, reserved keyword responses, label consistency, and mapping deletion.
- **Flow Diagram & Editor** — Resolved readonly record rendering and improved service configuration synchronization.


## [5.3.1] - 2025-08-13

### Fixed

- Resolved issues affecting Inline Data Mapper functionality and flow diagram rendering.


## [5.3.0] - 2025-07-29

### Major Updates

- **Enhanced Inline Data Mapper:** Redesigned for improved user experience with AI-driven mapping suggestions and a sub-mapping form.
- **AI Copilot & RAG Workflows:** Upgraded AI Copilot now uses ballerina/ai packages, with low-code support added for advanced RAG workflows.

### Added

- **AI Capabilities:**
  - Support for Anthropic's Claude Sonnet v4 for code generation.
  - Added Vector Knowledge Base node for RAG workflows.
  - Configuration options for default AI model providers in the Flow Diagram.
- **Editor & IDE Features:**
  - New VSCode setting to manage the visibility of the Sequence Diagram.
  - Option to include the current organization in search results.

### Changed

- **Data Mapper:** Improved search, label positioning, and performance. Now refreshes automatically when code changes.
- **AI & Copilot:** Streamlined flows for user-friendliness and enhanced agent capabilities with new packages.
- **UI/UX:** Refined diagram rendering and title components for a more responsive interface.

### Fixed

- **Data Mapper:** Corrected rendering issues and various bugs in mapping generation and type resolution.
- **AI & Copilot:** Resolved re-rendering bugs and authentication flow issues.
- **Configuration:** Fixed issues with Config.toml management and fast-run command failures.
- **IDE Stability:** Addressed UI freezing, improved state management, and enhanced project handling in multi-root workspaces.


## [5.2.0] - 2025-07-14

### Major Features

- **Bundled Language Server** — Ballerina Language Server is now bundled with the extension, eliminating separate installation requirements and improving startup performance.
- **Configurable Editor v2** — Complete redesign of the configuration editor with enhanced UI/UX and improved functionality.
- **Type Editor Revamp** — A redesign of the type editor to improve feature discoverability and deliver a better user experience.

### Added

- Enhanced AI file upload support with additional file types for improved analysis capabilities.
- Documentation display in Signature Help for a better developer experience during code completion.
- Enhanced service resource creation with comprehensive validation system for base paths, resource action calls, reserved keywords, and new UX for creating HTTP responses.

### Changed

- **Integration Management**: Refactored artifacts management and navigation.
- **UI Components**: Improved Type Diagram and GraphQL designer visual presentation.
- **Developer Experience**: Enhanced renaming editor functionality; enhanced Form and Input Editor with Markdown support; updated imported types display as view-only nodes for clarity.

### Fixed

- **Extension Stability**: Resolved extension startup and activation issues for reliable performance.
- **Data Mapping & Visualization**: Fixed issues when working with complex data types from imported modules; improved visualization of array types and nested data structures; enhanced connection line display in design diagrams.
- **Testing & Debugging**: Fixed GraphQL testing functionality for seamless API testing; improved service testing support across different Ballerina versions; enhanced test explorer compatibility with legacy projects.
- **Configuration Management**: Resolved configuration file editing and creation issues; fixed form rendering problems that could cause UI freezing.
- **Cross-Platform Support**: Enhanced Windows compatibility for Java development kit integration; improved file path handling across different operating systems.
- **User Interface**: Fixed theme-related display issues in command interfaces.


## [5.1.3] - 2025-05-28

### Fixed

- Resolved issues with TryIt functionality for service paths containing special characters.
- Enhanced Data Mapper usability and visual presentation.
- Updated the record editor to correctly use `packageName`.
- Addressed display issues in type diagrams and improved service configuration options.


## [5.1.2] - 2025-05-18

### Added

- Added an onboarding guide in the AI Chat view to assist new users with getting started.
- Added support for the `Lock` node in Flow Diagram.
- Added experimental support for the `Match` node in Flow Diagram.

### Changed

- Refactored AI Chat login flow and command structure for improved navigation and organization.
- Enhanced project selection for BI projects within multi-root workspaces.
- Updated Node Icons to align with theme colors.

### Fixed

- Enhanced error handling in Ask command execution in AI Chat.
- Fixed issues in the Data Mapper, including incorrect rendering of link connectors for root mapping constructors, improved handling of union types with anydata in mapping outputs, and enabling query expression navigation within nested mappings.
- Resolved issues opening incomplete mappings through code lens navigation in the Data Mapper.
- Resolved issues with running tests via the test explorer.


## [5.0.0] - 2025-03-13

For more information, see the [release notes](https://wso2.com/ballerina/vscode/docs/release-notes/version-4.5.0/).

### Added

- Introduced all-new visual support for ballerina projects.


## [4.5.0] - 2023-08-21

For more information, see the [release note](https://wso2.com/ballerina/vscode/docs/release-notes/version-4.5.0/).

### Added

- Introduced XML import option to create records.

### Improved

- Added a link to quickly navigate to the central repository when a function is selected in the statement editor.
- Enabled editing of top-level constructs through the statement editor.
- Increased the size of the parameter configuration pane for better usability.
- Enhanced the behavior of the function parameter configuration in the statement editor, preventing it from jumping to the top after selecting a value.


## [4.4.0] - 2023-07-21

For more information, see the [release note](https://wso2.com/ballerina/vscode/docs/release-notes/version-4.4.0/).

### Added

- New release now supports opening ballerina gist files and repositories using the vscode URL command.

### Improved

- The GraphQL designer, Entity-relationship diagram and the Type diagram, now provide support for users to navigate to a specific node based on their selection in the field type.
- Ballerina debugger - Improved user experience.

### Bug Fixes

- Swagger View - Fix incorrect service display on Swagger View.


## [4.3.0] - 2023-06-16

For more information, see the [release note](https://wso2.com/ballerina/vscode/docs/release-notes/version-4.3.0/).

### Added

- Entity Relationship Diagram — a diagram that visualises the entities and their relationships defined in the Ballerina persist model.
- Config toml file creation — when you run a ballerina program with configurables now it creates the config toml file with required configurable values.

### Improved

- GraphQL Designer — Enable an option to filter between queries, mutations and subscriptions; improvements related to the GraphQL Designer UI.


## [3.3.7]

### Fixed

- [Lowcode diagram does not load in codespaces](https://github.com/wso2/ballerina-plugin-vscode/issues/401)


## [3.3.6]

### Added

- Data Mapper — [Add support for inputs, output types other than records](https://github.com/wso2/ballerina-plugin-vscode/issues/221)

### Improved

- [Add support for intermediate query clauses at function level](https://github.com/wso2/ballerina-plugin-vscode/issues/347)
- [Add support for let expressions in Data Mapper](https://github.com/wso2/ballerina-plugin-vscode/issues/349)
- [Ballerina data mapper FHIR record support](https://github.com/wso2/ballerina-plugin-vscode/issues/356)
- [Data Mapper - Add an edit option for output type in config panel](https://github.com/wso2/ballerina-plugin-vscode/issues/381)
- [Statement Editor - Add expression template for adding parenthesis for selected expressions](https://github.com/wso2/ballerina-plugin-vscode/issues/385)

### Fixed

- [Data mapper - cannot map a record to a record on the low code view](https://github.com/wso2/ballerina-plugin-vscode/issues/339)
- [Data Mapper - Links with transformed values from the input nodes are not displayed](https://github.com/wso2/ballerina-plugin-vscode/issues/369)
- [Data Mapper - Links associated with local variables are not displayed within query expressions](https://github.com/wso2/ballerina-plugin-vscode/issues/391)


## [3.3.5]

### Fixed

- [Broken links in readme](https://github.com/wso2/ballerina-plugin-vscode/issues/335)


## [3.3.4]

### Improved

- [Data Mapper - Display banner if DM function contains unsupported input/output types](https://github.com/wso2/ballerina-plugin-vscode/issues/217)
- [Data Mapper - Improve the transformer name suggestion by providing an non-existing name](https://github.com/wso2/ballerina-plugin-vscode/issues/218)
- [Data Mapper - Add support for mapping with query expressions for primitive type arrays](https://github.com/wso2/ballerina-plugin-vscode/issues/232)
- [Data Mapper - Automatically show the data mapper config panel if the input or output types are not supported](https://github.com/wso2/ballerina-plugin-vscode/issues/244)

### Fixed

- [Data Mapper - Failed to create mapping for a port that is already mapped with multiple ports](https://github.com/wso2/ballerina-plugin-vscode/issues/230)
- [Data Mapper - incorrect source is generated when map root of the input record within query expression](https://github.com/wso2/ballerina-plugin-vscode/issues/237)
- [Data Mapper - UI shows a valid transform function as invalid](https://github.com/wso2/ballerina-plugin-vscode/issues/239)
- [Data Mapper - Generates invalid source when there is an invalid expression body](https://github.com/wso2/ballerina-plugin-vscode/issues/242)
- [Oops embarassing error when trying to edit a ModuleVarDecl without initialization](https://github.com/wso2/ballerina-plugin-vscode/issues/285)
- [Data Mapper - Output type disappears when creating data mapping function](https://github.com/wso2/ballerina-plugin-vscode/issues/293)
- [Data Mapper - Data Mapper puts auto-gen input param name as Type Name](https://github.com/wso2/ballerina-plugin-vscode/issues/329)


## [3.3.3]

### Fixed

- Diagrams not loading with VS Code v1.73 issue


## [3.3.2]

### Improved

- The low-code diagram editor


## [3.3.1]

### Fixed

- Try it button not working for services with comments issue

### Improved


## [3.3.0]

For more information, see the [release note](https://github.com/wso2/ballerina-plugin-vscode/blob/main/docs/release-notes/3.3.0-release-note.md).

### Added

- Visual Data Mapper — Helps you write and visualize data transformations easily.
- GraphQL Tryit — Facilitates trying out the GraphQL services with the integrated client.
- Project Design View (Experimental) — Allows you to visualize service interactions in your project.

### Improved

- A new performance analyzer is introduced to help users identify performance of multiple execution paths.


## [3.2.0]

### Improved

- A new performance analyzer is introduced.


## [3.1.0]

### Added

- [Ballerina Notebook](https://github.com/wso2/ballerina-plugin-vscode/issues/183)

### Improved

- The low-code diagram editor - a new statement editor is introduced providing a better editing experience with suggestions.

### Fixed

- Swagger client send an invalid Content type header


## [3.0.2]

### Improved

- The low-code diagram editor

### Fixed

- [Swagger View](https://github.com/wso2/ballerina-plugin-vscode/issues/197)


## [3.0.1]

### Added

- [A palette command that creates the distribution format of the Ballerina package](https://github.com/wso2/ballerina-plugin-vscode/issues/180)

### Improved

- [The low-code diagram editor](https://github.com/wso2/ballerina-plugin-vscode/issues/186)
- [Executor options](https://github.com/wso2/ballerina-plugin-vscode/issues/168)

### Fixed

- Ballerina syntax highlighting issues: [#170](https://github.com/wso2/ballerina-plugin-vscode/issues/170), [#184](https://github.com/wso2/ballerina-plugin-vscode/issues/184), [#185](https://github.com/wso2/ballerina-plugin-vscode/issues/185), [#188](https://github.com/wso2/ballerina-plugin-vscode/issues/188), [#190](https://github.com/wso2/ballerina-plugin-vscode/issues/190), [#191](https://github.com/wso2/ballerina-plugin-vscode/issues/191)
- Diagram editor reflection on paste, undo, redo, etc. operations.
- Choreo login error at startup.


## [3.0.0]

### Added

- [The `Ballerina Low-Code` activity](https://github.com/wso2/ballerina-plugin-vscode/issues/118)
- [WSO2 Choreo](https://wso2.com/choreo/) integration
- Graphical editing capability
- The `Diagram Explorer` view
- [The Ballerina testing activity](https://github.com/wso2/ballerina-plugin-vscode/issues/119)
- [The readonly editor for Ballerina library source](https://github.com/wso2/ballerina-plugin-vscode/issues/97)
- [Ballerina semantic highlighting support](https://github.com/wso2/ballerina-plugin-vscode/issues/105)
- [The Swagger try out view](https://github.com/wso2/ballerina-plugin-vscode/issues/130)
- The Ballerina configurable editor
- AI driven real-time performance forecasting

### Improved

- Dynamic Language Server capability registration
- The Language Server client version
- Diagram and source parallel editing capability

### Fixed

- Ballerina syntax highlighting: [#120](https://github.com/wso2/ballerina-plugin-vscode/issues/120), [#121](https://github.com/wso2/ballerina-plugin-vscode/issues/121), [#122](https://github.com/wso2/ballerina-plugin-vscode/issues/122), [#123](https://github.com/wso2/ballerina-plugin-vscode/issues/123), [#126](https://github.com/wso2/ballerina-plugin-vscode/issues/126), [#128](https://github.com/wso2/ballerina-plugin-vscode/issues/128), [#129](https://github.com/wso2/ballerina-plugin-vscode/issues/129)


## [2.1.1]

### Improved

- Ballerina syntax highlighting via TextMate grammar

### Fixed

- Language Server's extended API compatibility with previous Ballerina runtimes (#108)
- Language Server client deactivation (#110)


## [2.1.0]

### Added

- A palette command that converts a JSON to a Ballerina record (#94)

### Improved

- The *vscode-languageclient* and other dependency versions

### Fixed

- Positioning on the examples view (#87)


## [2.0.0]

- Initial release
