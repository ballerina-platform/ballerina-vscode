function ${replyFn}(${alias}:Message message) {
    string replyText;
    string? text = message.text;
    if text is () {
        replyText = "Sorry, I can only handle text messages right now.";
    } else {
        string|error result = ${agent}${run}(text, sessionId = "${sessionPrefix}:" + ${sessionExpr});
        if result is error {
            log:printError("Agent run failed", result);
            replyText = "Sorry, something went wrong. Please try again.";
        } else {
            replyText = result;
        }
    }
    ${alias}:Message|error sent = ${clientVar}->sendMessage(message.chat.id, replyText);
    if sent is error {
        log:printError("Telegram send failed", sent);
    }
}
