# Database persist client.
public isolated client class Client {

    private final string host;
    private final int port;
    private final string user;
    private final string password;
    private final string database;

    public isolated function init(string host, int port, string user, string password, string database) returns error? {
        self.host = host;
        self.port = port;
        self.user = user;
        self.password = password;
        self.database = database;
    }

    # Get rows from purchases table.
    #
    # + targetType - Defines which fields to retrieve from the results
    # + minQuantity - Minimum quantity filter (required)
    # + maxPrice - Maximum price filter (defaultable)
    # + customerFilter - Customer name filter (defaultable)
    # + return - A collection of matching records or an error
    isolated resource function get purchases(int minQuantity, decimal maxPrice = 1000.0, PurchaseTargetType targetType = <>, string customerFilter = "") returns targetType[]|error = external;

    # Get row from purchases table.
    #
    # + purchaseId - The value of the primary key field purchase_id
    # + targetType - Defines which fields to retrieve from the result
    # + return - The matching record or an error
    isolated resource function get purchases/[int purchaseId](PurchaseTargetType targetType = <>) returns targetType|error = external;

    # Get rows from album_ratings table.
    #
    # + targetType - Defines which fields to retrieve from the results
    # + minRating - Minimum rating filter (defaultable)
    # + return - A collection of matching records or an error
    isolated resource function get albumratings(AlbumRatingTargetType targetType = <>, int minRating = 0) returns targetType[]|error = external;

    # Get row from album_ratings table.
    #
    # + albumId - The value of the primary key field album_id
    # + customerName - The value of the primary key field customer_name
    # + targetType - Defines which fields to retrieve from the result
    # + return - The matching record or an error
    isolated resource function get albumratings/[int albumId]/[string customerName](AlbumRatingTargetType targetType = <>) returns targetType|error = external;

    # Get rows from albums table.
    #
    # + targetType - Defines which fields to retrieve from the results
    # + genre - Genre filter (required)
    # + maxPrice - Maximum price filter (required)
    # + minStock - Minimum stock filter (defaultable)
    # + sortBy - Sort field (defaultable)
    # + return - A collection of matching records or an error
    isolated resource function get albums(string genre, decimal maxPrice, int minStock = 0, AlbumTargetType targetType = <>, string sortBy = "title") returns targetType[]|error = external;

    # Get row from albums table.
    #
    # + albumId - The value of the primary key field album_id
    # + targetType - Defines which fields to retrieve from the result
    # + return - The matching record or an error
    isolated resource function get albums/[int albumId](AlbumTargetType targetType = <>) returns targetType|error = external;

    # Get a row whose inferred type unions two live modules sharing a natural qualifier.
    #
    # + targetType - Defines which fields to retrieve from the result
    # + return - The matching record or an error
    isolated resource function get itemcollision(CollisionTargetType targetType = <>) returns targetType|error = external;

    # Get a row whose inferred type unions a live member with an error member from the colliding pair.
    #
    # + targetType2 - Defines which fields to retrieve from the result
    # + return - The matching record or an error
    isolated resource function get itemcollisionerr(CollisionWithErrorTargetType targetType2 = <>)
            returns targetType2 = external;
}
