import ballerina/time;

// Configuration types
type TeamChannelMapping record {|
    string teamName;
    string channel;
|};

// Salesforce Lead related types
type Lead record {|
    string Id;
    string Name;
    string Company;
    string? LeadSource;
    string? OwnerId;
    string? ConvertedAccountId;
    string? ConvertedContactId;
    string? ConvertedOpportunityId;
    boolean IsConverted;
    string CreatedDate;
    string? ConvertedDate;
    anydata...;
|};

type LeadOwner record {|
    string Id;
    string Name;
    string? Email;
    anydata...;
|};

type ConvertedAccount record {|
    string Id;
    string Name;
    anydata...;
|};

type ConvertedContact record {|
    string Id;
    string Name;
    anydata...;
|};

type ConvertedOpportunity record {|
    string Id;
    string Name;
    anydata...;
|};

// Message formatting types
type LeadConversionDetails record {|
    string leadId;
    string leadName;
    string company;
    string ownerName;
    string? ownerId;
    string? leadSource;
    string accountName;
    string contactName;
    string opportunityName;
    string opportunityId;
    string opportunityLink;
    decimal lifecycleDurationDays;
    time:Utc convertedTime;
|};
