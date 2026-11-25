import ballerinax/salesforce;

final salesforce:Client sfSales = check new ({baseUrl: "https://acme.my.salesforce.com", auth: {tokenUrl: sfSalesAuthTokenUrl, clientId: "client", clientSecret: sfSalesAuthClientSecret}});
