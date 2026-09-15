import ballerina/log;
import ballerinax/salesforce;

// Deduplication cache to prevent processing the same lead conversion event twice
isolated map<boolean> processedLeadIds = {};

// Salesforce listener configuration
listener salesforce:Listener salesforceListener = new ({
    baseUrl: salesforceConfig.baseUrl,
    auth: {
        clientId: salesforceConfig.clientId,
        clientSecret: salesforceConfig.clientSecret,
        refreshToken: salesforceConfig.refreshToken,
        refreshUrl: salesforceConfig.refreshUrl
    }
});

// Service to listen to Salesforce Lead change events
service "/data/ChangeEvents" on salesforceListener {

    remote function onCreate(salesforce:EventData eventData) returns error? {
        log:printInfo("onCreate event received");
    }

    remote function onDelete(salesforce:EventData eventData) returns error? {
        log:printInfo("onDelete event received");
    }

    remote function onRestore(salesforce:EventData eventData) returns error? {
        log:printInfo("onRestore event received");
    }

    remote function onUpdate(salesforce:EventData eventData) returns error? {
        log:printInfo("onUpdate event received");
        error? result = processLeadConversion(eventData);
        if result is error {
            log:printError("Lead conversion processing failed", 'error = result);
        }
    }
}

function processLeadConversion(salesforce:EventData eventData) returns error? {
        // Extract the changed data
        map<json> changedData = <map<json>>eventData.changedData;

        // Check if this is a lead conversion event
        if !changedData.hasKey("IsConverted") {
            return;
        }

        json isConvertedValue = changedData.get("IsConverted");
        boolean isConverted = isConvertedValue.toString() == "true";

        if !isConverted {
            return;
        }

        // Get the lead ID from metadata
        salesforce:ChangeEventMetadata metadata = check (eventData.metadata ?: error("Missing metadata")).ensureType();
        string leadId = metadata.recordId ?: "";

        if leadId == "" {
            log:printError("Missing recordId in Salesforce change event metadata");
            return;
        }

        // Deduplicate: skip if this lead was already processed (guards against duplicate events)
        lock {
            if processedLeadIds.hasKey(leadId) {
                log:printInfo("Duplicate lead conversion event, skipping", leadId = leadId);
                return;
            }
            processedLeadIds[leadId] = true;
        }

        // Query full lead details
        string leadQuery = string `SELECT Id, Name, Company, LeadSource, OwnerId, ConvertedAccountId, ConvertedContactId, ConvertedOpportunityId, IsConverted, CreatedDate, ConvertedDate FROM Lead WHERE Id = '${leadId}'`;

        stream<Lead, error?> leadStream = check salesforceClient->query(leadQuery);
        record {|Lead value;|}? leadResult = check leadStream.next();
        check leadStream.close();

        if leadResult is () {
            log:printError("Lead not found", leadId = leadId);
            return;
        }

        Lead lead = leadResult.value;

        // Apply filters
        if !shouldProcessLead(lead) {
            log:printInfo("Lead filtered out", leadId = leadId);
            return;
        }

        // Check if lead has all conversion data
        string? accountId = lead.ConvertedAccountId;
        string? contactId = lead.ConvertedContactId;
        string? opportunityId = lead.ConvertedOpportunityId;
        string? ownerId = lead.OwnerId;

        if accountId is () || contactId is () || opportunityId is () || ownerId is () {
            log:printError("Lead missing conversion data", leadId = leadId);
            return;
        }

        // Fetch owner details
        string ownerQuery = string `SELECT Id, Name, Email FROM User WHERE Id = '${ownerId}'`;
        stream<LeadOwner, error?> ownerStream = check salesforceClient->query(ownerQuery);
        record {|LeadOwner value;|}? ownerResult = check ownerStream.next();
        check ownerStream.close();

        if ownerResult is () {
            log:printError("Owner not found", ownerId = ownerId);
            return;
        }

        LeadOwner owner = ownerResult.value;

        // Fetch converted account details
        ConvertedAccount account = check salesforceClient->getById("Account", accountId);

        // Fetch converted contact details
        ConvertedContact contact = check salesforceClient->getById("Contact", contactId);

        // Fetch converted opportunity details
        ConvertedOpportunity opportunity = check salesforceClient->getById("Opportunity", opportunityId);

        // Build conversion details
        LeadConversionDetails conversionDetails = check buildLeadConversionDetails(
                lead,
                owner,
                account,
                contact,
                opportunity
        );

        // Get Slack user ID for tagging (if available)
        string? slackUserId = check getSlackUserIdFromEmail(owner.Email);

        // Determine target Slack channel
        string targetChannel = determineSlackChannel(ownerId);

        log:printInfo(targetChannel);

        // Format the message
        string slackMessage = formatSlackMessage(conversionDetails, slackUserId);

        // Send Slack notification
        _ = check slackClient->/chat\.postMessage.post({
            channel: targetChannel,
            text: slackMessage,
            mrkdwn: true
        });

        log:printInfo("Slack notification sent successfully",
                leadId = leadId,
                channel = targetChannel
        );
}
