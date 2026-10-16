import ballerina/workflow;

@workflow:Activity
function validateClaim(ExpenseClaim expenseClaim) returns boolean {
    return expenseClaim.amount > 0d;
}

@workflow:Activity
function payClaim(ExpenseClaim expenseClaim) {
}
