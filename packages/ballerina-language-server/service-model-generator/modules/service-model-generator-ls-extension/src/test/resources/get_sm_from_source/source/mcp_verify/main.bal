import ballerina/mcp;

listener mcp:Listener mcpListener = check new (9090);

service mcp:Service /mcp on mcpListener {
    # Get weather forecast for upcoming days
    #
    # + location - city name
    # + return - forecast text
    remote function getWeatherForecast(string location) returns string {
        return "forecast";
    }
}
