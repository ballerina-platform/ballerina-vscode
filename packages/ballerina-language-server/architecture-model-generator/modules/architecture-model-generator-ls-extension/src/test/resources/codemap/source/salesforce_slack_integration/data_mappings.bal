import ballerina/time;

// Build lead conversion details from Salesforce data
function buildLeadConversionDetails(
    Lead lead,
    LeadOwner owner,
    ConvertedAccount account,
    ConvertedContact contact,
    ConvertedOpportunity opportunity
) returns LeadConversionDetails|error {

    string convertedDate = lead.ConvertedDate ?: lead.CreatedDate;
    decimal lifecycleDuration = check calculateLifecycleDuration(lead.CreatedDate, convertedDate);

    time:Utc convertedUtc = check time:utcFromString(toRfc3339(convertedDate));

    string instanceUrl = getSalesforceInstanceUrl();
    string opportunityLink = instanceUrl + "/" + opportunity.Id;

    LeadConversionDetails details = {
        leadId: lead.Id,
        leadName: lead.Name,
        company: lead.Company,
        ownerName: owner.Name,
        ownerId: owner.Id,
        leadSource: lead.LeadSource,
        accountName: account.Name,
        contactName: contact.Name,
        opportunityName: opportunity.Name,
        opportunityId: opportunity.Id,
        opportunityLink: opportunityLink,
        lifecycleDurationDays: lifecycleDuration,
        convertedTime: convertedUtc
    };

    return details;
}
