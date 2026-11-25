import ballerina/io;
public type Sale record {
    string item;
    int quantity;
    decimal price;
};

public type Grouped record {
    GroupedItems[] items;
};

public type GroupedItems record {
    string item;
    int totalQuantity;
    int totalPrice;
    int[] quantityArray;
};

public function main() {
    Sale[] sales = [
        {item: "apple", quantity: 10, price: 1.00},
        {item: "banana", quantity: 20, price: 0.50},
        {item: "apple", quantity: 15, price: 1.00},
        {item: "orange", quantity: 25, price: 1.50}
    ];

    Grouped groupedItems = {
        items: from var salesItem in sales
            let var quantity = salesItem.quantity
            select {}
    };
}
