public type Order record {
    string orderId;
    string customerId;
    OrderStatus status;
    string createdAt;
    decimal totalAmount;
    string currency;
    Address shippingAddress;
    Address billingAddress;
    OrderLine[] orderLines;
    Payment[] payments;
    Shipment[] shipments;
};

public type OrderCreatePayload record {|
    string customerId;
    string currency;
    Address shippingAddress;
    Address billingAddress;
    OrderLinePayload[] orderLines;
    PaymentInfo paymentInfo;
|};

public type OrderLinePayload record {|
    string sku;
    int quantity;
|};

public type OrderLine record {|
    string lineId;
    string sku;
    int quantity;
    decimal unitPrice;
    decimal lineTotal;
|};

public type Address record {|
    string line1;
    string? line2;
    string city;
    string state;
    string zipCode;
    string country;
|};

public type Payment record {|
    string paymentId;
    string status;
    decimal amount;
|};

public type PaymentInfo record {|
    string paymentMethodToken;
    decimal amount;
|};

public type Shipment record {|
    string shipmentId;
    string trackingNumber;
    string carrier;
    string status;
|};

public type OrderStatus "PENDING"|"CONFIRMED"|"AWAITING_PAYMENT"|"FULFILLING"|"SHIPPED"|"DELIVERED"|"CANCELLED"|"RETURNED"|"FAILED";
