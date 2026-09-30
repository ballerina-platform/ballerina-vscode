# salesforce_slack_integration - High Level Codebase Overview

---

## File Path: agents.bal

---

## File Path: config.bal

```ballerina
configurable record {
    string baseUrl;
    string clientId;
    string clientSecret;
    string refreshToken;
    string refreshUrl;
} salesforceConfig [L:1 - L:7]
configurable record {
    string token;
    string defaultChannel;
} slackConfig [L:9 - L:12]
configurable record {
    string messageTemplate = "🎉 Lead Converted!\n*Lead:* {{lead.name}}\n*Company:* {{lead.company}}\n*Owner:* {{lead.owner}}";
    string[] filterLeadSources = [];
    string[] filterOwnerIds = [];
    TeamChannelMapping[] teamChannelMappings = [];
    boolean includeConversionDetails = true;
} notificationConfig [L:14 - L:20]
```

---

## File Path: connections.bal

```ballerina
import ballerina/http [L:1 - L:1]
import ballerinax/salesforce [L:2 - L:2]
import ballerinax/slack [L:3 - L:3]
```

```ballerina
final salesforce:Client salesforceClient [L:6 - L:14]
final slack:Client slackClient [L:17 - L:21]
final http:Client slackHttpClient [L:24 - L:26]
```

---

## File Path: data_mappings.bal

```ballerina
import ballerina/time [L:1 - L:1]
```

```ballerina
function buildLeadConversionDetails(Lead lead, LeadOwner owner, ConvertedAccount account, ConvertedContact contact, ConvertedOpportunity opportunity) returns LeadConversionDetails|error [L:4 - L:37]
```

---

## File Path: functions.bal

```ballerina
import ballerina/http [L:1 - L:1]
import ballerina/lang.regexp [L:2 - L:2]
import ballerina/log [L:3 - L:3]
import ballerina/time [L:4 - L:4]
```

```ballerina
function shouldProcessLead(Lead lead) returns boolean [L:7 - L:47]
function normalizeSfDate(string date) returns string [L:50 - L:59]
function toRfc3339(string date) returns string [L:62 - L:69]
function calculateLifecycleDuration(string createdDate, string convertedDate) returns decimal|error [L:72 - L:80]
function getSalesforceInstanceUrl() returns string [L:83 - L:94]
function formatSlackMessage(LeadConversionDetails details, string? slackUserId) returns string [L:97 - L:126]
function determineSlackChannel(string? ownerId) returns string [L:129 - L:181]
function getSlackUserIdFromEmail(string? email) returns string?|error [L:184 - L:215]
```

---

## File Path: main.bal

```ballerina
import ballerina/log [L:1 - L:1]
import ballerinax/salesforce [L:2 - L:2]
```

```ballerina
isolated map<boolean> processedLeadIds [L:5 - L:5]
```

```ballerina
function processLeadConversion(salesforce:EventData eventData) returns error? [L:42 - L:160]
```

```ballerina
listener salesforce:Listener salesforceListener [L:8 - L:16]
```

```ballerina
service "/data/ChangeEvents" on salesforceListener { [L:19 - L:40]
    remote function onCreate(salesforce:EventData eventData) returns error? [L:21 - L:23]
    remote function onDelete(salesforce:EventData eventData) returns error? [L:25 - L:27]
    remote function onRestore(salesforce:EventData eventData) returns error? [L:29 - L:31]
    remote function onUpdate(salesforce:EventData eventData) returns error? [L:33 - L:39]
}
```

---

## File Path: types.bal

```ballerina
import ballerina/time [L:1 - L:1]
```

```ballerina
type TeamChannelMapping record [L:4 - L:7]
type Lead record [L:10 - L:23]
type LeadOwner record [L:25 - L:30]
type ConvertedAccount record [L:32 - L:36]
type ConvertedContact record [L:38 - L:42]
type ConvertedOpportunity record [L:44 - L:48]
type LeadConversionDetails record [L:51 - L:65]
```
