// Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com/) All Rights Reserved.

// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at

// http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.


/**
 * Instruction-based usage guide for Ballerina Langlibs (Language Libraries).
 * These instructions are included in the system prompt to guide code generation.
 */
export const LANGLIB_USAGE_INSTRUCTIONS = `
# Using Ballerina's Built-in Language Libraries

## Type Conversion

When you need to convert values from string type to another, use fromString() which works for int, float, decimal, boolean, and xml:
\`\`\`ballerina
// Converting strings to numbers
int age = check int:fromString("25");
float price = check float:fromString("19.99");
decimal exact = check decimal:fromString("10.50");

// Converting strings to boolean
boolean flag = check boolean:fromString("true");

// Converting strings to xml
xml bookName = check xml:fromString("<book>Hamlet</book><book>Sherlock Holmes</book>");
\`\`\`

Working with floats (supports NaN and Infinity):
\`\`\`ballerina
// Parsing strings to floats
// Special values
float notANumber = check float:fromString("NaN");
float infinity = check float:fromString("Infinity");
float negInfinity = check float:fromString("-Infinity");
\`\`\`

When working with JSON data, you can parse and convert in different ways:
\`\`\`ballerina
// Parsing JSON from a string
string jsonText = "{\"id\":12,\"name\":\"Alice\"}";
json data = check jsonText.fromJsonString();

// Converting JSON directly to a specific type
string jsonArray = "[1, 2, 3]";
int[] numbers = check jsonArray.fromJsonStringWithType();

// Converting JSON to a record type
string configText = "{\"port\":8080,\"timeout\":60}";
type Config record {| int port; int timeout; |};
Config config = check configText.fromJsonStringWithType(Config);
\`\`\`

To convert any value to a string for display or logging:
\`\`\`ballerina
map<int> scores = {Alice: 90, Bob: 85};
string output = scores.toString();
\`\`\`

To convert data to JSON format for APIs:
\`\`\`ballerina
record {string name; int age;} person = {name: "Alice", age: 30};
json result = person.toJson();
string jsonText = person.toJsonString();
\`\`\`

When you need to copy data, use clone() to make a modifiable copy:
\`\`\`ballerina
int[] original = [1, 2, 3];
int[] copy = original.clone();
copy.push(4);  // original stays [1, 2, 3]
\`\`\`

To convert between types while preserving data, use cloneWithType():
\`\`\`ballerina
json cfg = {port: 8080};
// Config is an owned shape (you control it), so a closed record is fine here.
type Config record {| int port; int timeout = 60; |};
Config config = check cfg.cloneWithType();

// Converting arrays
json[] arr = [1, 2, 3];
int[] numbers = check arr.cloneWithType();
\`\`\`

Important: cloneWithType() and fromJsonStringWithType() into a CLOSED record (record {| ... |}) fail at runtime if the source value carries ANY field the record does not declare. When binding JSON from an external system you do not control (cloud events, webhooks, third-party API responses), use an OPEN record (record { ... }) with optional fields for anything the provider may omit, so unmodeled fields land in the rest field instead of failing the conversion.

To validate that a value matches a specific type, use ensureType():
\`\`\`ballerina
json student = {name: "Jo", subjects: ["CS1212"]};
json[] subjects = check student.subjects.ensureType();
\`\`\`

## Working with Arrays

Counting elements in an array:
\`\`\`ballerina
int[] numbers = [1, 2, 3, 4, 5];
int count = numbers.length(); // 5
\`\`\`

Finding where an element is located (returns the index if found, or () if not found):
\`\`\`ballerina
int[] numbers = [10, 20, 30, 40];
int? position = numbers.indexOf(30); // 2
int? notFound = numbers.indexOf(99); // ()
\`\`\`

Adding and removing elements:
\`\`\`ballerina
int[] numbers = [1, 2, 3];
numbers.push(4); // [1, 2, 3, 4]
int last = numbers.pop(); // last = 4, numbers = [1, 2, 3]

numbers.unshift(0); // [0, 1, 2, 3]
int first = numbers.shift(); // first = 0, numbers = [1, 2, 3]
\`\`\`

Sorting arrays:
\`\`\`ballerina
int[] numbers = [3, 1, 4, 1, 5];
int[] sorted = numbers.sort(); // [1, 1, 3, 4, 5]
int[] descending = numbers.sort("descending"); // [5, 4, 3, 1, 1]
\`\`\`

## Working with Strings

Counting characters/code points in a string:
\`\`\`ballerina
string text = "Hello";
int length = text.length(); // 5
\`\`\`

Joining strings together with a separator:
\`\`\`ballerina
string result = string:'join(", ", "apple", "banana", "orange");
// "apple, banana, orange"
\`\`\`

Comparing strings alphabetically (returns negative if first is smaller, 0 if equal, positive if first is larger):
\`\`\`ballerina
int result1 = "apple".codePointCompare("banana"); // negative number
int result2 = "apple".codePointCompare("apple"); // 0
int result3 = "banana".codePointCompare("apple"); // positive number
\`\`\`

Concatenating multiple strings together:
\`\`\`ballerina
string greeting = "Hello".concat(" ", "World"); // "Hello World"
string full = "".concat("apple", "banana", "cherry"); // "applebananacherry"
string path = "/home".concat("/", "user", "/", "documents"); // "/home/user/documents"
\`\`\`

Checking how a string starts or ends:
\`\`\`ballerina
boolean starts = "Hello World".startsWith("Hello"); // true
boolean ends = "Hello World".endsWith("World"); // true
\`\`\`

Converting between bytes and text using UTF-8:
\`\`\`ballerina
// String to bytes
string text = "Hello";
byte[] bytes = text.toBytes(); // [72, 101, 108, 108, 111]

// Bytes to string
byte[] data = [72, 101, 108, 108, 111];
string result = check string:fromBytes(data); // "Hello"
\`\`\`

Working with characters/code points (Unicode character codes):
\`\`\`ballerina
// Character to code point
int code = string:toCodePointInt("A"); // 65

// Code point to character
string char = check string:fromCodePointInt(65); // "A"

// String to array of code points
int[] codes = "Hello".toCodePointInts(); // [72, 101, 108, 108, 111]

// Array of code points to string
string text = check string:fromCodePointInts([72, 101, 108, 108, 111]); // "Hello"

// Get code point at a specific position
int code = "Hello".getCodePoint(0); // 72
\`\`\`

Checking if a string contains a substring:
\`\`\`ballerina
boolean found = "Hello World".includes("World"); // true
boolean notFound = "Hello World".includes("Goodbye"); // false
boolean foundFromIndex = "Hello World".includes("o", 5); // true (finds "o" in "World")
\`\`\`

Finding the position of a substring (returns index or () if not found):
\`\`\`ballerina
int? position = "Hello World".indexOf("World"); // 6
int? notFound = "Hello World".indexOf("Goodbye"); // ()
int? fromIndex = "Hello World".indexOf("o", 5); // 7
\`\`\`

Extracting part of a string:
\`\`\`ballerina
string text = "Hello World";
string sub1 = text.substring(0, 5); // "Hello"
string sub2 = text.substring(6); // "World"
\`\`\`

Changing ASCII case:
\`\`\`ballerina
string upper = "hello".toUpperAscii(); // "HELLO"
string lower = "HELLO".toLowerAscii(); // "hello"
\`\`\`

Trimming whitespace:
\`\`\`ballerina
string trimmed = "  hello  ".trim(); // "hello"
\`\`\`

Working with Regular Expressions:
Regular expressions provide powerful pattern matching capabilities for string operations.

**IMPORTANT:** To use regular expressions, you must import the regexp module at the top of your file:
\`\`\`ballerina
import ballerina/lang.regexp;
\`\`\`

To use regular expressions, you need to import the regexp module:
\`\`\`ballerina
import ballerina/lang.regexp;
\`\`\`

Creating a regular expression pattern:
\`\`\`ballerina
// Using re template
string:RegExp digitPattern = re \`[0-9]+\`;

// Building from a string at runtime
string:RegExp pattern = check regexp:fromString("[0-9]+");
\`\`\`

Finding matches in text:
\`\`\`ballerina
string:RegExp pattern = re \`World\`;

// Find first match
regexp:Span? match = pattern.find("Hello World"); // returns match info

// Find all matches
string:RegExp digits = re \`[0-9]+\`;
regexp:Span[] matches = digits.findAll("a1b23c456"); // finds "1", "23", "456"
\`\`\`

Using capture groups to extract parts:
\`\`\`ballerina
string:RegExp pattern = re \`([a-z]+)([0-9]+)\`;
regexp:Groups? groups = pattern.findGroups("abc123");
if groups is regexp:Groups {
    string fullMatch = groups[0].substring(); // "abc123"
    string letters = groups[1].substring(); // "abc"
    string numbers = groups[2].substring(); // "123"
}
\`\`\`

Validating that text fully matches a pattern:
\`\`\`ballerina
string:RegExp pattern = re \`[0-9]+\`;
boolean valid = pattern.isFullMatch("123"); // true
boolean invalid = pattern.isFullMatch("12a3"); // false
\`\`\`

Replacing text using patterns:
\`\`\`ballerina
string:RegExp pattern = re \`[0-9]+\`;

// Replace first match
string result = pattern.replace("a1b2", "X"); // "aXb2"

// Replace all matches
string result = pattern.replaceAll("a1b2", "X"); // "aXbX"
\`\`\`

Splitting text by a pattern:
\`\`\`ballerina
string:RegExp pattern = re \`,\\s*\`;
string[] parts = pattern.split("a, b, c"); // ["a", "b", "c"]
\`\`\`

## Working with Maps

Counting entries in a map:
\`\`\`ballerina
map<int> scores = {Alice: 90, Bob: 85, Carol: 92};
int count = scores.length(); // 3
\`\`\`

Getting a value by key (panics if key doesn't exist):
\`\`\`ballerina
map<int> scores = {Alice: 90, Bob: 85};
int aliceScore = scores.get("Alice"); // 90
\`\`\`

Checking if a key exists:
\`\`\`ballerina
map<int> scores = {Alice: 90, Bob: 85};
boolean hasAlice = scores.hasKey("Alice"); // true
boolean hasCarol = scores.hasKey("Carol"); // false
\`\`\`

Getting all keys or values:
\`\`\`ballerina
map<int> scores = {Alice: 90, Bob: 85, Carol: 92};
string[] names = scores.keys(); // ["Alice", "Bob", "Carol"]
int[] allScores = scores.toArray(); // [90, 85, 92]
\`\`\`

Removing entries from a map:
\`\`\`ballerina
map<int> scores = {Alice: 90, Bob: 85};

// Remove and return value (panics if key doesn't exist)
int removed = scores.remove("Alice"); // 90

// Safely remove (returns () if key doesn't exist)
int? value = scores.removeIfHasKey("Carol"); // ()

// Remove all entries
scores.removeAll(); // {}
\`\`\`

## Working with Numbers

Working with integers:
\`\`\`ballerina
// Converting to hex
string hex = (255).toHexString(); // "ff"

// Parsing hex strings
int value = check int:fromHexString("ff"); // 255
\`\`\`

## Working with Errors

Getting information from errors:
\`\`\`ballerina
error err = error("Connection failed", message = "Timeout", code = 500);

// Get the error message
string msg = err.message(); // "Connection failed"

// Get error details (returns a readonly record with detail fields)
map<value:Cloneable> & readonly detail = err.detail(); // {message: "Timeout", code: 500}
// Note: 'Cloneable' refers to values that can be deep-copied (readonly, xml, arrays, maps, tables)
// Note: 'readonly' means the value cannot be changed after creation

// Get the cause of an error (returns error or ())
error causeErr = error("Network issue");
error mainErr = error("Connection failed", causeErr);
error? cause = mainErr.cause(); // returns the Network issue error
\`\`\`

## Pausing Execution with lang.runtime

To pause the working thread, you need to import lang.runtime and use the sleep() function:

\`\`\`ballerina
import ballerina/lang.runtime;
runtime:sleep(2); // Pause for 2 seconds
\`\`\`

## Using Query Expressions

Query expressions let you work with collections (arrays, streams, tables) in a readable way, similar to SQL. Use query expressions to filter, transform, and process data.

Basic query to filter and transform:
\`\`\`ballerina
int[] numbers = [1, 2, 3, 4, 5, 6];

// Filter even numbers and double them
int[] evenDoubled = from int num in numbers
                    where num % 2 == 0
                    select num * 2;
// Result: [4, 8, 12]
\`\`\`

Query with records:
\`\`\`ballerina
type Person record {
    string name;
    int age;
};

Person[] people = [
    {name: "Alice", age: 25},
    {name: "Bob", age: 30},
    {name: "Carol", age: 22}
];

// Get names of people over 23
string[] names = from var person in people
                 where person.age > 23
                 select person.name;
// Result: ["Alice", "Bob"]
\`\`\`

Consuming streams with query expressions:
\`\`\`ballerina
// Process stream data using query
stream<int> numberStream = [1, 2, 3, 4, 5].toStream();

int[] filtered = from int num in numberStream
                 where num > 2
                 select num;
// Result: [3, 4, 5]
\`\`\`

## Working with XML

Constructing XML values:
\`\`\`ballerina
// Create XML elements
xml element = xml \`<book><title>The Great Gatsby</title></book>\`;

// Combine multiple XML values
xml books = xml \`<book>Book1</book>\` + xml \`<book>Book2</book>\`;

// Using xml:concat()
xml combined = xml:concat(
    xml \`<item>First</item>\`,
    xml \`<item>Second</item>\`
);
\`\`\`

Parsing XML from text:
\`\`\`ballerina
string xmlText = "<root><item>Value</item></root>";
xml parsed = check xml:fromString(xmlText);
\`\`\`

Getting information about XML:
\`\`\`ballerina
xml items = xml \`<a/><b/><c/>\`;
int count = items.length(); // 3
\`\`\`

For converting between XML and records, use the ballerina/data.xmldata module.
`;

/**
 * Get the langlib usage instructions to include in prompts
 */
export function getLanglibInstructions(): string {
    return LANGLIB_USAGE_INSTRUCTIONS;
}
