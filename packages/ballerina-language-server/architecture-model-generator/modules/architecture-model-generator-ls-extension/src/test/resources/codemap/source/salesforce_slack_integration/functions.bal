import ballerina/http;
import ballerina/lang.regexp;
import ballerina/log;
import ballerina/time;

// Check if lead passes the filters
function shouldProcessLead(Lead lead) returns boolean {
    // Filter by lead source if configured
    if notificationConfig.filterLeadSources.length() > 0 {
        string? leadSource = lead.LeadSource;
        if leadSource is string {
            boolean sourceMatches = false;
            foreach string allowedSource in notificationConfig.filterLeadSources {
                if leadSource == allowedSource {
                    sourceMatches = true;
                    break;
                }
            }
            if !sourceMatches {
                return false;
            }
        } else {
            return false;
        }
    }

    // Filter by owner ID if configured
    if notificationConfig.filterOwnerIds.length() > 0 {
        string? ownerId = lead.OwnerId;
        if ownerId is string {
            boolean ownerMatches = false;
            foreach string allowedOwnerId in notificationConfig.filterOwnerIds {
                if ownerId == allowedOwnerId {
                    ownerMatches = true;
                    break;
                }
            }
            if !ownerMatches {
                return false;
            }
        } else {
            return false;
        }
    }

    return true;
}

// Normalize Salesforce date string to RFC 3339 (e.g. +0000 -> +00:00)
function normalizeSfDate(string date) returns string {
    // If ends with ±HHMM (no colon), insert colon before last 2 chars
    if date.length() >= 5 {
        string suffix = date.substring(date.length() - 5);
        if re `[+-]\d{4}`.isFullMatch(suffix) {
            return date.substring(0, date.length() - 2) + ":" + date.substring(date.length() - 2);
        }
    }
    return date;
}

// Normalize a date string to full RFC 3339 (handles date-only "YYYY-MM-DD")
function toRfc3339(string date) returns string {
    string normalized = normalizeSfDate(date);
    // If date-only (no 'T'), append midnight UTC
    if !normalized.includes("T") {
        return normalized + "T00:00:00.000Z";
    }
    return normalized;
}

// Calculate lead lifecycle duration in days
function calculateLifecycleDuration(string createdDate, string convertedDate) returns decimal|error {
    time:Utc createdUtc = check time:utcFromString(toRfc3339(createdDate));
    time:Utc convertedUtc = check time:utcFromString(toRfc3339(convertedDate));

    time:Seconds durationSeconds = time:utcDiffSeconds(convertedUtc, createdUtc);
    decimal durationDays = durationSeconds / 86400.0d;

    return durationDays;
}

// Get Salesforce instance URL for building links
function getSalesforceInstanceUrl() returns string {
    string baseUrl = salesforceConfig.baseUrl;
    regexp:RegExp pattern = re `^(https://[^/]+)`;
    regexp:Groups? groups = pattern.findGroups(baseUrl);

    if groups is regexp:Groups {
        string instanceUrl = groups[0].substring();
        return instanceUrl;
    }

    return baseUrl;
}

// Format the Slack message
function formatSlackMessage(LeadConversionDetails details, string? slackUserId) returns string {
    string message = notificationConfig.messageTemplate;

    // Replace template variables
    regexp:RegExp leadNamePattern = re `\{\{lead\.name\}\}`;
    message = leadNamePattern.replaceAll(message, details.leadName);

    regexp:RegExp companyPattern = re `\{\{lead\.company\}\}`;
    message = companyPattern.replaceAll(message, details.company);

    // Tag owner in Slack if user ID is available
    string ownerMention = slackUserId is string ? "<@" + slackUserId + ">" : details.ownerName;
    regexp:RegExp ownerPattern = re `\{\{lead\.owner\}\}`;
    message = ownerPattern.replaceAll(message, ownerMention);

    // Add conversion details if enabled
    if notificationConfig.includeConversionDetails {
        message = message + "\n\n*Conversion Details:*";
        message = message + "\n• *Account:* " + details.accountName;
        message = message + "\n• *Contact:* " + details.contactName;
        message = message + "\n• *Opportunity:* " + details.opportunityName;
        message = message + "\n• *Opportunity Link:* " + details.opportunityLink;

        // Format lifecycle duration
        int durationDays = <int>details.lifecycleDurationDays < 1 ? 1 : <int>details.lifecycleDurationDays;
        message = message + "\n• *Lead Lifecycle Duration:* " + durationDays.toString() + " days";
    }

    return message;
}

// Determine the target Slack channel based on team mapping
function determineSlackChannel(string? ownerId) returns string {
    if ownerId is () {
        return slackConfig.defaultChannel;
    }

    // Get owner details to find team
    string ownerQuery = string `SELECT Id, Name, UserRole.Name FROM User WHERE Id = '${ownerId}'`;
    stream<record {}, error?>|error ownerStream = salesforceClient->query(ownerQuery);
    if ownerStream is error {
        log:printError("Failed to query Salesforce for owner details", ownerStream);
        return slackConfig.defaultChannel;
    }

    record {|record {} value;|}|error? ownerResult = ownerStream.next();
    error? closeErr = ownerStream.close();
    if closeErr is error {
        log:printWarn("Failed to close Salesforce owner stream", closeErr);
    }

    if ownerResult is error {
        log:printError("Failed to read owner record from Salesforce stream", ownerResult);
        return slackConfig.defaultChannel;
    }
    if ownerResult is () {
        return slackConfig.defaultChannel;
    }

    record {} ownerRecord = ownerResult.value;

    // Try to match team from role name
    foreach TeamChannelMapping mapping in notificationConfig.teamChannelMappings {
        string teamName = mapping.teamName;

        // Check if role name contains team name
        if ownerRecord.hasKey("UserRole") {
            anydata userRoleData = ownerRecord.get("UserRole");
            if userRoleData is record {} {
                record {} userRole = userRoleData;
                if userRole.hasKey("Name") {
                    string|error roleName = userRole.get("Name").ensureType();
                    if roleName is error {
                        continue;
                    }
                    if roleName.toLowerAscii().includes(teamName.toLowerAscii()) {
                        return mapping.channel;
                    }
                }
            }
        }
    }

    return slackConfig.defaultChannel;
}

// Get Slack user ID from email
function getSlackUserIdFromEmail(string? email) returns string?|error {
    if email is () {
        return ();
    }

    // Use raw HTTP client — slack connector incorrectly types the user field as an array
    http:Response|error httpResponse = slackHttpClient->get("/api/users.lookupByEmail?email=" + email);
    if httpResponse is error {
        log:printWarn("Failed to lookup Slack user by email", 'error = httpResponse, email = email);
        return ();
    }

    json|error payload = httpResponse.getJsonPayload();
    if payload is error {
        log:printWarn("Failed to parse Slack lookupByEmail response", 'error = payload, email = email);
        return ();
    }

    boolean|error ok = payload.ok.ensureType();
    if ok is error || !ok {
        log:printWarn("Slack lookupByEmail returned not ok", email = email);
        return ();
    }

    string|error userId = payload.user.id.ensureType();
    if userId is error {
        log:printWarn("Slack user ID not found in response", email = email);
        return ();
    }

    return userId;
}
