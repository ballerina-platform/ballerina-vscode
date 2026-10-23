import ballerina/ai;

ai:SystemPrompt systemPrompt = {role: "Assistant", instructions: string `Answer clearly.`};
final ai:Agent promptVarAgent = check new (systemPrompt = systemPrompt, model = check ai:getDefaultModelProvider());

string role = "Tutor";
string tutorInstructions = string `Explain step by step.`;
final ai:Agent fieldVarAgent = check new (systemPrompt = {role, instructions: tutorInstructions}, model = check ai:getDefaultModelProvider());

ai:SystemPrompt tutorPrompt = {role, instructions: tutorInstructions};
final ai:Agent nestedVarAgent = check new (systemPrompt = tutorPrompt, model = check ai:getDefaultModelProvider());

configurable string reviewerRole = "Reviewer";
final ai:Agent configurableAgent = check new (systemPrompt = {role: reviewerRole, instructions: string `Review code.`}, model = check ai:getDefaultModelProvider());

string topic = "math";
string teachInstructions = string `Teach ${topic}.`;
final ai:Agent templateAgent = check new (systemPrompt = {role: "Teacher", instructions: teachInstructions}, model = check ai:getDefaultModelProvider());

function buildPrompt() returns ai:SystemPrompt => {role: "Assistant", instructions: string `Answer clearly.`};
final ai:Agent functionAgent = check new (systemPrompt = buildPrompt(), model = check ai:getDefaultModelProvider());

final ai:Agent spreadAgent = check new (systemPrompt = {...systemPrompt}, model = check ai:getDefaultModelProvider());

final ai:Agent quotedKeyAgent = check new (systemPrompt = {"role": "Analyst", "instructions": string `Summarize data.`}, model = check ai:getDefaultModelProvider());

string payNote = "Pay ${amount} now";
final ai:Agent dollarLiteralAgent = check new (systemPrompt = {role: payNote, instructions: string `Pay.`}, model = check ai:getDefaultModelProvider());
