import ballerinax/salesforce;

final salesforce:Client sfSales = check new ({baseUrl: "https://old.my.salesforce.com", auth: {tokenUrl: "https://old.my.salesforce.com/services/oauth2/token", clientId: "old-client", clientSecret: "old-secret"}});
