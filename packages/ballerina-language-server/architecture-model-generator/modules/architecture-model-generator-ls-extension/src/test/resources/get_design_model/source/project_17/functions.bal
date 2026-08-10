// The reply function a generated trigger `start`s. Reaches the agent one hop from the entry point.
function replyToMessage(string query) {
    string|error result = chatAgent.run(query);
    if result is error {
        return;
    }
}
