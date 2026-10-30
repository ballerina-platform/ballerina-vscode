import ballerina/uuid;
import ballerina/time;

# Generates a new random UUID v4 string.
#
# + return - UUID string
public function generateId() returns string {
    return uuid:createType4AsString();
}

# Returns the current UTC time as an ISO 8601 string.
#
# + return - timestamp string
public function getCurrentTimestamp() returns string {
    return time:utcToString(time:utcNow());
}

# Calculates the total price for a line item.
#
# + unitPrice - price per unit
# + quantity  - number of units
# + return    - line total
public function calculateLineTotal(decimal unitPrice, int quantity) returns decimal {
    return unitPrice * <decimal>quantity;
}
