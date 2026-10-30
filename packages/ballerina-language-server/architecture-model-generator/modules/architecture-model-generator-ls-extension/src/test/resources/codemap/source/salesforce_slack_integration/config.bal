configurable record {
    string baseUrl;
    string clientId;
    string clientSecret;
    string refreshToken;
    string refreshUrl;
} salesforceConfig = ?;

configurable record {
    string token;
    string defaultChannel;
} slackConfig = ?;

configurable record {
    string messageTemplate = "🎉 Lead Converted!\n*Lead:* {{lead.name}}\n*Company:* {{lead.company}}\n*Owner:* {{lead.owner}}";
    string[] filterLeadSources = [];
    string[] filterOwnerIds = [];
    TeamChannelMapping[] teamChannelMappings = [];
    boolean includeConversionDetails = true;
} notificationConfig = ?;
