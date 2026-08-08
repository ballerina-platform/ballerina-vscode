function ${replyFn}(${alias}:Messages notification) {
    foreach ${alias}:InboundMessage message in notification.messages {
        string replyText;
        string? text = message.text;
        if text is () {
            replyText = "Sorry, I can only handle text messages right now.";
        } else {
            string|error result = ${agent}${run}(text, sessionId = "${sessionPrefix}:" + ${sessionExpr});
            if result is error {
                log:printError("Agent run failed", result, sender = message.'from);
                replyText = "Sorry, something went wrong. Please try again.";
            } else {
                replyText = result;
            }
        }
        ${alias}:TextMessage payload = {to: message.'from, text: {body: replyText, previewUrl: false}};
        ${alias}:MessageResponsePayload|${alias}:Error sent =
                ${clientVar}->sendMessage(notification.phoneNumberId, payload);
        if sent is ${alias}:Error {
            log:printError("WhatsApp send failed", sent);
        }
    }
}
