import ballerinax/trigger.shopify;
import ballerinax/stripe;

shopifyListenerConfig listenerConfig = {
    apiSecretKey: shopifyConfig.apiSecretKey
};

listener shopify:Listener shopifyListener = new(listenerConfig, 9090);

stripe:ConnectionConfig configuration = {
    auth: {
        token: stripeConfig.secretKey
    }
};

stripe:Client stripe = check new (configuration);
