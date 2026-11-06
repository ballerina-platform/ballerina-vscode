import ballerina/http as mysql;
import ballerinax/mysql as db;
import ballerinax/mysql.driver as _;

public function main() returns error? {
    mysql:Client h = check new ("http://localhost:9090");
    db:Client c = check new ();
}
