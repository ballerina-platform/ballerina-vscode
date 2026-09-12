import ballerina/email;
import ballerina/workflow;
import ballerina/workflow.activity;

final email:SmtpClient smtpClient = check new ("smtp.example.com", "sender@example.com", "password");

# Calls the email builtin activity once per field entry mode: quoted string literals, expressions,
# and no field arguments at all. Each call must reopen in the mode it was written in and regenerate
# the same arguments.
@workflow:Workflow
function notifyCustomer(workflow:Context ctx, string recipient) returns error? {
    string subjectLine = "Order update";
    () _ = check ctx->callActivity(activity:sendEmail, {connection: smtpClient, to: "user@example.com", subject: "Order update", 'from: "no-reply@example.com", body: "Your order has shipped."});
    () _ = check ctx->callActivity(activity:sendEmail, {connection: smtpClient, to: recipient, subject: subjectLine, 'from: recipient, body: subjectLine});
    () _ = check ctx->callActivity(activity:sendEmail, {connection: smtpClient});
}
