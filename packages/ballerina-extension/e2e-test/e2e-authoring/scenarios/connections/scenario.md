# Connectors
Connectors are in the architecture diagram view 

## Steps

| # | Action | Verification |
|---|--------|-------------|
| 1 | Start from automation project, Navigate to the flow diagram by clicking the automation in the architecture diagram and click add connection and create http client | Verify Connection popup opens  |
| 2 | Fill http client form and save it | Verify it shows in the side panel |
| 3 | Add a get method from the http client | Verify the http node is shown in the connection |
| 4 | Click the httpClient and edit url ( or anything ) and save it | Verify the generated source is correct and correctly saved |
| 5 | Click add connection and click add using open API spec, choose a yaml file and create the connection | verify the connector is generated |
| 6 | Navigate to architecture diagram view by clicking home button | Verify two connectors are shown one with the connection line and other without it |
| 7 | Click the three dot button and click delete button | Verify the connector is removed |