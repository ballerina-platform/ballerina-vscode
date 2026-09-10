import ballerina/http;
import ballerinax/salesforce;
import ballerinax/slack;

// Salesforce client initialization
final salesforce:Client salesforceClient = check new ({
    baseUrl: salesforceConfig.baseUrl,
    auth: {
        clientId: salesforceConfig.clientId,
        clientSecret: salesforceConfig.clientSecret,
        refreshToken: salesforceConfig.refreshToken,
        refreshUrl: salesforceConfig.refreshUrl
    }
});

// Slack client initialization
final slack:Client slackClient = check new ({
    auth: {
        token: slackConfig.token
    }
});

// Raw Slack HTTP client for APIs with broken connector type bindings
final http:Client slackHttpClient = check new ("https://slack.com", {
    auth: {token: slackConfig.token}
});
