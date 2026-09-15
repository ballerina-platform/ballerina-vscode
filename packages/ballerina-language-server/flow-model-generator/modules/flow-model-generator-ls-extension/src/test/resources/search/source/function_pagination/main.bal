import ballerina/url;
import ballerina/uuid;

// ballerina/uuid (16 indexed functions) and ballerina/url (2) are an uneven pair, and neither is part of the
// popular-function overlay that is added to every page regardless of offset - so the pages here reflect purely
// the fair-share pagination of the imported-module pool.
public function main() returns error? {
    string id = uuid:createType4AsString();
    _ = check url:encode(id, "UTF-8");
}
