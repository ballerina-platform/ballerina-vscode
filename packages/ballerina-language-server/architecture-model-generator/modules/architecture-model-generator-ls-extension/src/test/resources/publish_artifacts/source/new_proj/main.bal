import ballerina/http;

public type Product record {|
    string id;
    string name;
    decimal price;
    int stock;
|};

configurable int port = 9093;

final map<Product> products = {
    "SKU-1": {id: "SKU-1", name: "Widget", price: 19.99, stock: 120},
    "SKU-2": {id: "SKU-2", name: "Gadget", price: 149.99, stock: 45},
    "SKU-3": {id: "SKU-3", name: "Sprocket", price: 5.50, stock: 500}
};

service /products on new http:Listener(port) {

    resource function get .() returns Product[] => products.toArray(); // this doesn't show up

    resource function get [string productId]() returns Product|http:NotFound {
        if products.hasKey(productId) {
            return products.get(productId);
        }
        return http:NOT_FOUND;
    }

    resource function post .(@http:Payload Product product) returns http:Created|http:Conflict {
        if products.hasKey(product.id) {
            return http:CONFLICT;
        }
        products[product.id] = product;
        return http:CREATED;
    }
}
