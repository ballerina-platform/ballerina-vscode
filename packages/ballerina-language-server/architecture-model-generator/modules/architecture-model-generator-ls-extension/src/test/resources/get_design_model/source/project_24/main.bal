import ballerina/ai;
import vmod.providers;

final ai:Agent agent = check new (systemPrompt = {role: "a", instructions: "b"}, model = providers:model, tools = []);
