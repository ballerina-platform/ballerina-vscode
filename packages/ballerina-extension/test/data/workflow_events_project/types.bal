public type OrderInput record {|
    string orderId;
    int quantity;
|};

public type PaymentData record {|
    decimal amount;
    string method;
|};

public type ShipmentData record {|
    string trackingId;
|};

public type OrderEvents record {|
    future<PaymentData> paymentReceived;
    future<ShipmentData> shipmentReady;
|};
