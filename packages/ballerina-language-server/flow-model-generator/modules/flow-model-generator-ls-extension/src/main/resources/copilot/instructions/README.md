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

Instructions specific to writing services using the library.

**A service.md may state ONLY what neither `trigger-metadata.json` nor the semantic model can.**
A library with a trigger-metadata document no longer has this file *replace* its synthesized service
block — both are rendered, prose first, declaration second. So anything factual (types, presence,
accessors, path forms, annotations, data binding, the listener signature) is already emitted and must
not be restated here: two sources for one fact is how the two come to disagree, and a contradiction
inside a single section is worse than either source alone.

What belongs here, and nothing else:
- project conventions (e.g. "declare the listener at module level as a variable")
- compiler-plugin rules a document cannot express (e.g. "`@http:Payload` is optional for a lone
  record parameter")
- defaults and style preferences (e.g. "default the base path to `/graphql`")
- worked examples

Everything in this file is sent to the LLM verbatim, including any HTML comments — so keep
maintainer notes out of it and put them here instead.

### Test Generation instructions — retired

`test.md` is no longer read. No instance had existed since the curated corpus was removed, and test
conventions live in `ballerina/test`'s own `library.md`, which the test-writing prompt already names.
Do not add this file; nothing loads it.

## Notes
- All these extension points are optional. This will only be added on top of the overall information about the library. 
- You should only add the instructions if the copilot doesn't already provide satisfactory results without them.
- Keep in mind that all these information will be sent to the LLM if the library was selected for the usecase. 
- So things like Best practices can be included here but make sure to keep the instructions to the minimum to avoid cognitive overload.
