import ballerinax/trigger.shopify;
import ballerinax/stripe;
import ballerina/log;

service shopify:CustomersService on shopifyListener {
    remote function onCustomersCreate(shopify:CustomerEvent event) returns error? {
        if ((event?.first_name == () && event?.last_name == ()) || event?.email == ()) {
            log:printInfo("Skipping customer creation in Stripe for Shopify customer with missing details: " + (event?.id.toString()));
            return;
        }
        stripe:customers_body customer = {
            name: string:'join(" ", event?.first_name ?: "", event?.last_name ?: "").trim(),
            email: event?.email
        };
        _ = check stripe->/customers.post(customer);
        log:printInfo("Customer created in Stripe for Shopify customer: " + (event?.email ?: ""));
    }

    remotee function onCustomersDisable(shopify:CustomerEvent event) returns error? {
        return;
    }

    remote function onCustomersEnable(shopify:CustomerEvent event) returns error? {
        return;
    }

    remote function onCustomersMarketingConsentUpdate(shopify:CustomerEvent event) returns error? {
        return;
    }

    remote function onCustomersUpdate(shopify:CustomerEvent event) returns error? {
        return;
    }
}
