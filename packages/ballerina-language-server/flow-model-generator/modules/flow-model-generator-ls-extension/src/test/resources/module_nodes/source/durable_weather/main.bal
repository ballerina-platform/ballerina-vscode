import ballerina/ai;
import ballerina/http;
import ballerina/workflow;

final ai:ModelProvider weatherModel = check ai:getDefaultModelProvider();
final http:Client weatherClient = check new ("https://api.open-meteo.com");
final http:Client airQualityClient = check new ("https://air-quality-api.open-meteo.com");

final workflow:DurableAgent weatherAgent = check new ({
    systemPrompt: {role: "UK weather assistant", instructions: "Fetch weather for the requested city."},
    model: weatherModel,
    activities: [{activity: fetchWeather, bindings: {weatherHttpClient: weatherClient}}],
    maxIter: 12
});

// A second module variable ensures variable sorting invokes the comparator.
final map<string> & readonly ukCities = {"london": "London"};

@workflow:Activity
function fetchWeather(http:Client weatherHttpClient, string cityName) returns string|error {
    return cityName;
}
