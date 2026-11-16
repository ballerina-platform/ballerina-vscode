isolated function sendEmailApproval(string to, string subject) returns boolean {
    return !to.endsWith("@example.com");
}

isolated function sharedApproval(string orderId) returns boolean {
    return true;
}

isolated function calledApproval(string id) returns boolean {
    return id != "";
}

isolated function auditCheck(string id) returns boolean => calledApproval(id);
