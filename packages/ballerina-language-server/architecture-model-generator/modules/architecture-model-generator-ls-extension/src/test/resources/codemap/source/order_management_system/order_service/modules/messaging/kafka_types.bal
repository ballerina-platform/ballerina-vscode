public type OrderCreatedEvent record {|
    string eventId;
    string eventType = "OrderCreated";
    string timestamp;
    OrderCreatedEventData data;
|};

public type OrderCreatedEventData record {|
    string orderId;
    string customerId;
    string currency;
    decimal totalAmount;
    OrderLineEvent[] orderLines;
    PaymentInfoEvent paymentInfo;
|};

public type OrderLineEvent record {|
    string sku;
    int quantity;
|};

public type PaymentInfoEvent record {|
    string paymentMethodToken;
    decimal amount;
|};
