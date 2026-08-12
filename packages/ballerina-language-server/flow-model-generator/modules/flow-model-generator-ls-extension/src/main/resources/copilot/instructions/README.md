# Custom Library Instructions for Copilot 
This directory contains custom instructions to enhance the performance specific library usages of WSO2 Integrator Copilot.


## How to Contribute

1. Try out Copilot using the library you want to contribute instructions for without any custom instructions. 
2. If you find that the results are not satisfactory or can be improved with some specific instructions, you can contribute here.
3. Create a new directory with the exact name of the library under this path. 
4. Follow the existing samples and extension points as explained below.
5. Execute ./gradlew clean pack -x check -x test and you should see jar inside build/ folder.
6. Point to this jar from vscode settings.json -"ballerina.langServerPath": "/xx/ballerina-language-server/build/ballerina-language-server-1.3.0.jar",

## Extension Points

### Library instructions
File name - library.md

Overall usage instructions about the library.

### Service writing instructions
File name - service.md

Instructions specific to writing services using the library. For fixed services which has a json, its automatically covered but for the generic triggers, you have to give instructions here.

### Test Generation instructions
File name - test.md

Instructions specific to generating tests for the library service usage.

## Notes
- All these extension points are optional. This will only be added on top of the overall information about the library. 
- You should only add the instructions if the copilot doesn't already provide satisfactory results without them.
- Keep in mind that all these information will be sent to the LLM if the library was selected for the usecase. 
- So things like Best practices can be included here but make sure to keep the instructions to the minimum to avoid cognitive overload.
