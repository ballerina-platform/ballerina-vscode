isolated function searchApproval(string query) returns boolean {
    return query.length() > 100;
}

isolated function sharedApproval(string orderId) returns boolean => true;
