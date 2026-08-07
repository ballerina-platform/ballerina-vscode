import ballerinax/postgresql;

public final postgresql:Client dbClient = check new (
    host = host,
    port = port,
    username = username,
    password = password,
    database = database
);

public function closeClient() returns error? {
    return dbClient.close();
}
