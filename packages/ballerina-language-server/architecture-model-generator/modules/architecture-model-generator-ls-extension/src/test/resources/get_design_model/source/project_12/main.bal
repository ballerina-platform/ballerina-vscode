import ballerinax/trigger.hubspot;

listener hubspot:Listener hubspotListener = new ({clientSecret: "secret", callbackURL: "http://localhost:8090"});

service hubspot:CompanyService on hubspotListener {
    remote function onCompanyCreation(hubspot:WebhookEvent event) returns error? {
    }

    remote function onCompanyDeletion(hubspot:WebhookEvent event) returns error? {
    }

    remote function onCompanyPropertychange(hubspot:WebhookEvent event) returns error? {
    }

    remote function onCompanyAssociationchange(hubspot:WebhookEvent event) returns error? {
    }

    remote function onCompanyMerge(hubspot:WebhookEvent event) returns error? {
    }

    remote function onCompanyRestore(hubspot:WebhookEvent event) returns error? {
    }
}
