public type OrderDbRow record {|
    string orderId;
    string customerId;
    string status;
    string createdAt;
    decimal totalAmount;
    string currency;
    json shippingAddress;
    json billingAddress;
    json orderLines;
|};

public type OrderInsertRecord record {|
    string orderId;
    string customerId;
    string status;
    string createdAt;
    decimal totalAmount;
    string currency;
    string shippingAddress;
    string billingAddress;
    string orderLines;
|};

public type OrderNotFoundError distinct error;
