# Ballerina Language Server

[![codecov](https://codecov.io/gh/ballerina-platform/ballerina-vscode/branch/main/graph/badge.svg?flag=language-server)](https://codecov.io/gh/ballerina-platform/ballerina-vscode?flags%5B0%5D=language-server)

A Language Server Implementation for [Ballerina](https://ballerina.io/); a general purpose, concurrent and strongly typed programming language with both textual and graphical syntax, optimized for integration. With this implementation we expose the language support for Ballerina in various IDEs by adhering to the [Language Server Protocol](https://microsoft.github.io/language-server-protocol/).

## Features
In the current implementation we support following language features.
 * *Auto completion*
 
 ![alt text](./docs/images/endpointActions.gif?raw=true "Auto Completion")
 * *Hover provider*
 
 ![alt text](./docs/images/hover.gif?raw=true "Hover Provider")
 * *Signature Help*
 
 ![alt text](./docs/images/SignatureHelp.gif?raw=true "Signature Help")
 * *Go to Definition*
 
 ![alt text](./docs/images/GotoDef.gif?raw=true "Go to Definition")
 * *Diagnostics*
 
 ![alt text](./docs/images/semanticsAndSyntactics.gif?raw=true "Diagnostics")
  * *Code Action*
  
  ![alt text](./docs/images/addImport.gif?raw=true "Code Action")
  * *Goto Implementation*
  
  ![alt text](./docs/images/gotoImplementation.gif?raw=true "Goto Implementation")
 
## Installation
You can find the Language server integrated VSCode plugin for Ballerina at [marketplace](https://marketplace.visualstudio.com/items?itemName=ballerina.ballerina). Also Language server support for [Ballerina Composer](https://github.com/ballerina-platform/ballerina-lang/tree/master/composer) has been integrated to composer itself.

## User Guide
You can find the Language Server User Guide [here](https://github.com/ballerina-platform/ballerina-lang/blob/master/language-server/docs/UserGuide.md)

## Language Server Extensions Development Guide
You can find the Language Server Extensions Development Guide [here](https://github.com/ballerina-platform/ballerina-lang/blob/master/docs/language-server/ExtensionPoints.md)

## Test Coverage

Every module's `test` task emits JaCoCo execution data. `createCodeCoverageReport` merges
all of it into one report and logs the overall percentage:

```bash
./gradlew test createCodeCoverageReport   # full suite, then the report
./gradlew createCodeCoverageReport        # report from the last run's data, no rebuild
```

The output looks like this (illustrative figures — a report only reflects the tests that
actually ran, so only a full `test` run gives the project's real coverage):

```text
INSTRUCTION  coverage:  nn.nn% (171187/375097)
BRANCH       coverage:  nn.nn% (14382/38765)
LINE         coverage:  nn.nn% (36348/84510)
```

Modules whose tests did not run still contribute their lines to the denominator with nothing
covered, which is correct for a full run but means a partial run under-reports.

The report lands in `.jacoco/reports/jacoco/` — `report.xml` is what CI uploads to Codecov
under the `language-server` flag, and `html/index.html` is the browsable per-class breakdown.
Because the task never depends on `test`, a suite that fails partway still yields a report
for whatever ran. CI also attaches the whole directory as the `ls-coverage-<branch>` artifact.

Codecov thresholds are informational (see `codecov.yml` at the repository root): coverage is
reported on pull requests but never fails a build.

## How to Contribute
Ballerina Language Server is currently work in progress and feel free to follow the [issue tracker](https://github.com/ballerina-platform/ballerina-lang/issues?q=is%3Aopen+is%3Aissue+label%3AComponent%2FLanguageServer) for up coming features and feature requests.

## Contact Us
Managed By [WSO2 Inc.](https://wso2.com/)
Discord server: [Ballerina](https://discord.gg/ballerinalang)
