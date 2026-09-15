import ballerinax/edifact.d03a.supplychain.mORDERS;

public function main() returns error? {
    _ = check mORDERS:fromEdiString("");
}
