# Component Diagram - Project Documentation

## Overview

The Component Diagram is a React-based visualization library that renders Ballerina application architecture diagrams. It visualizes the relationships between listeners, services, connections, and automation components using the `@projectstorm/react-diagrams` library.

## Technology Stack

### Core Dependencies
- **React 18.2.0**: UI framework
- **@projectstorm/react-diagrams (v7.x)**: Diagramming engine for creating interactive node-based diagrams
  - `@projectstorm/geometry`
  - `@projectstorm/react-canvas-core`
  - `@projectstorm/react-diagrams-core`
  - `@projectstorm/react-diagrams-defaults`
  - `@projectstorm/react-diagrams-routing`
- **Dagre 0.8.5**: Graph layout algorithm for automatic node positioning
- **Emotion**: CSS-in-JS styling solution
- **TypeScript 5.8.3**: Type safety

### Internal Dependencies
- `@wso2/ballerina-core`: Core interfaces and types for Ballerina components
- `@wso2/ui-toolkit`: Shared UI components
- `@wso2/bi-diagram`: Base diagram utilities

## Data Model

### Input: CDModel

The diagram accepts a `CDModel` as input, defined in `@wso2/ballerina-core`:

```typescript
export type CDModel = {
    automation?: CDAutomation;
    connections: CDConnection[];
    listeners: CDListener[];
    services: CDService[];
};
```

### Component Types

#### 1. CDAutomation
Represents automated workflows that can connect to multiple connections.

```typescript
export type CDAutomation = {
    name: string;
    displayName: string;
    location: CDLocation;
    connections: string[];      // UUIDs of connected connections
    uuid: string;
};
```

#### 2. CDConnection
Represents external connections (databases, APIs, etc.).

```typescript
export type CDConnection = {
    symbol: string;
    location: CDLocation;
    scope: string;
    uuid: string;
    enableFlowModel: boolean;   // Controls visibility in diagram
    sortText: string;           // For ordering
    icon?: string;
    kind?: string;
};
```

#### 3. CDListener
Represents HTTP, GraphQL, or other protocol listeners that receive incoming requests.

```typescript
export type CDListener = {
    symbol: string;
    location: CDLocation;
    attachedServices: string[]; // UUIDs of services attached to this listener
    kind: string;
    type: string;
    args: CDArg[];
    uuid: string;
    icon: string;
    enableFlowModel: boolean;
    sortText: string;
};
```

#### 4. CDService
Represents services with functions (remote functions and resource functions).

```typescript
export type CDService = {
    location: CDLocation;
    attachedListeners: string[];
    connections: string[];
    functions: CDFunction[];
    remoteFunctions: CDFunction[];
    resourceFunctions: CDResourceFunction[];
    absolutePath: string;
    type: string;               // e.g., "http:Service", "graphql:Service", "ai:Service"
    icon: string;
    uuid: string;
    enableFlowModel: boolean;
    sortText: string;
    displayName?: string;
};
```

#### 5. CDFunction & CDResourceFunction
Represent operations within services.

```typescript
export type CDFunction = {
    name: string;
    location: CDLocation;
    connections?: string[];     // UUIDs of connections used by this function
};

export type CDResourceFunction = {
    accessor: string;           // "get", "subscribe", etc.
    path: string;
    location: CDLocation;
    connections?: string[];
};
```

## Architecture

### Directory Structure

```
src/
├── components/
│   ├── Controls/              # Zoom and pan controls
│   ├── Diagram.tsx            # Main diagram component
│   ├── DiagramCanvas.tsx      # Canvas container
│   ├── DiagramContext.tsx     # React context for state management
│   ├── NodeLink/              # Custom link implementation
│   ├── NodePort/              # Custom port implementation
│   ├── nodes/
│   │   ├── ConnectionNode/    # Connection node (databases, APIs, etc.)
│   │   ├── EntryNode/         # Service/Automation node
│   │   │   └── components/    # Specialized widgets for different service types
│   │   │       ├── AIServiceWidget.tsx
│   │   │       ├── GraphQLServiceWidget.tsx
│   │   │       └── GeneralWidget.tsx
│   │   └── ListenerNode/      # Listener node (HTTP, GraphQL listeners)
├── resources/
│   ├── constants.ts           # Constants and configuration
│   ├── dagre/                 # Graph layout engine
│   └── icons/                 # SVG icon components
├── stories/                   # Storybook stories with sample data
├── test/                      # Jest tests
└── utils/
    ├── diagram.ts             # Diagram utilities (layout, linking, etc.)
    └── types.ts               # TypeScript type definitions
```

## Component Architecture

### 1. Main Diagram Component (`Diagram.tsx`)

The root component that orchestrates the entire diagram rendering process.

**Key Responsibilities:**
- Initializes the diagram engine
- Transforms `CDModel` data into visual nodes and links
- Manages state (expanded nodes, GraphQL group visibility)
- Handles user interactions (node selection, expansion)
- Triggers auto-layout and zoom-to-fit

**Props:**
```typescript
export interface DiagramProps {
    project: CDModel;
    onListenerSelect: (listener: CDListener) => void;
    onServiceSelect: (service: CDService) => void;
    onFunctionSelect: (func: CDFunction | CDResourceFunction) => void;
    onAutomationSelect: (automation: CDAutomation) => void;
    onConnectionSelect: (connection: CDConnection) => void;
    onDeleteComponent: (component: CDListener | CDService | CDAutomation | CDConnection) => void;
}
```

### 2. Node Models

Each node type has a corresponding model that extends `@projectstorm/react-diagrams` `NodeModel`:

#### EntryNodeModel
- Represents services and automation
- Has dynamic height based on functions
- Contains multiple output ports (one per function + special ports)
- Supports GraphQL group ports for collapsed groups

**Port Types:**
- `in`: Input port for incoming connections
- `out`: Default output port
- Function-specific ports: One port per function for granular connections
- `view-all-resources`: Port for collapsed functions
- GraphQL group ports: `graphql-group-Query`, `graphql-group-Mutation`, `graphql-group-Subscription`

#### ListenerNodeModel
- Represents HTTP/GraphQL listeners
- Simple structure with in/out ports
- Connects to services

#### ConnectionNodeModel
- Represents external connections (databases, APIs)
- Simple structure with in/out ports
- Target for service functions and automation

### 3. Node Widgets

React components that render the visual representation of nodes:

- **EntryNodeWidget**: Routes to specialized widgets based on service type
  - **AIServiceWidget**: For `ai:Service` types
  - **GraphQLServiceWidget**: For `graphql:Service` types with Query/Mutation/Subscription grouping
  - **GeneralServiceWidget**: Default for HTTP and other services
  
- **ListenerNodeWidget**: Renders listener nodes with icon and metadata
- **ConnectionNodeWidget**: Renders connection nodes with icon and symbol

### 4. Node Factories

Factory pattern implementations for creating node instances:
- `EntryNodeFactory`
- `ListenerNodeFactory`
- `ConnectionNodeFactory`

Registered with the diagram engine to handle node instantiation.

### 5. Custom Link & Port Components

#### NodePortModel
Custom port implementation for connection points on nodes.

#### NodeLinkModel
Custom link implementation for connections between nodes.
- Supports source/target node tracking
- Custom styling and routing

### 6. DiagramContext

React Context API for state management across the diagram:

```typescript
export interface DiagramContextState {
    project: CDModel;
    expandedNodes: Set<string>;
    graphQLGroupOpen?: Record<string, GQLState>;
    onListenerSelect: (listener: CDListener) => void;
    onServiceSelect: (service: CDService) => void;
    onFunctionSelect: (func: CDFunction | CDResourceFunction) => void;
    onAutomationSelect: (automation: CDAutomation) => void;
    onConnectionSelect: (connection: CDConnection) => void;
    onDeleteComponent: (component: CDListener | CDService | CDAutomation | CDConnection) => void;
    onToggleNodeExpansion: (nodeId: string) => void;
    onToggleGraphQLGroup?: (serviceUuid: string, group: "Query" | "Subscription" | "Mutation") => void;
}
```

## Rendering Flow

### 1. Initialization
```
Diagram Component Mount
  ↓
Generate Diagram Engine (registerFactories)
  ↓
Create Initial Diagram Model
```

### 2. Data Transformation (`getDiagramData`)

```
CDModel Input
  ↓
┌─────────────────────────────────────┐
│ 1. Filter & Sort Connections        │
│    - Filter out autogenerated (_*)  │
│    - Filter enableFlowModel=false   │
│    - Sort by sortText               │
│    - Create ConnectionNodeModel     │
└─────────────────────────────────────┘
  ↓
┌─────────────────────────────────────┐
│ 2. Process Services                 │
│    - Sort by sortText               │
│    - Create EntryNodeModel          │
│    - Partition functions            │
│      (visible vs hidden)            │
│    - Calculate node height          │
│    - Create function connections    │
└─────────────────────────────────────┘
  ↓
┌─────────────────────────────────────┐
│ 3. Process Automation (if exists)   │
│    - Create EntryNodeModel          │
│    - Link to connections            │
└─────────────────────────────────────┘
  ↓
┌─────────────────────────────────────┐
│ 4. Process Listeners                │
│    - Create ListenerNodeModel       │
│    - Link to attached services      │
└─────────────────────────────────────┘
  ↓
Return { nodes, links }
```

### 3. Layout & Rendering

```
drawDiagram(nodes, links)
  ↓
Create New DiagramModel
  ↓
Add Nodes & Links
  ↓
Set Model in Engine
  ↓
Auto-distribute (Dagre Layout)
  ↓
Zoom to Fit
  ↓
Repaint Canvas
```

### 4. Auto-Distribution Algorithm

The `autoDistribute` function positions nodes in a three-column layout:

```
Column 1: Listeners     Column 2: Services/Automation    Column 3: Connections
  (leftmost)                  (center)                      (rightmost)
     
┌──────────┐           ┌──────────────┐              ┌──────────────┐
│ Listener │─────────▶ │   Service    │─────────────▶│  Connection  │
└──────────┘           └──────────────┘              └──────────────┘
                              │
                              │
                              ▼
                       ┌──────────────┐              ┌──────────────┐
                       │ Automation   │─────────────▶│  Connection  │
                       └──────────────┘              └──────────────┘
```

**Positioning Logic:**
- **Listeners**: Positioned at average Y-coordinate of attached services
- **Services/Automation**: Y-position calculated based on content height
- **Connections**: Fixed X-position in rightmost column

## Key Features

### 1. Function Visibility Management

Services can have many functions. The diagram implements smart visibility:

**Regular Services:**
- Show all functions if ≤ 3 functions
- Show first 2 functions + "View All" button if > 3 functions
- Expand to show all on "View All" click

**GraphQL Services:**
- Group functions by type: Query, Subscription, Mutation
- Each group can be independently expanded/collapsed
- Group headers show counts
- Default: Query open, Subscription/Mutation collapsed

### 2. Dynamic Node Height Calculation

Heights are dynamically calculated based on content:

```typescript
calculateEntryNodeHeight(numFunctions: number, isExpanded: boolean)
  - BASE_HEIGHT: 72px
  - FUNCTION_HEIGHT: 48px per function
  - VIEW_ALL_BUTTON_HEIGHT: 40px (if needed)

calculateGraphQLNodeHeight(visible, hidden, groupStates)
  - Calculates per-group heights
  - Accounts for collapsed groups
  - Includes group headers
```

### 3. Granular Connection Links

Instead of connecting entire services to connections, the diagram creates **function-level links**:

```
Service Node
  ├─ Function A  ──────▶ Connection X
  ├─ Function B  ──────▶ Connection Y
  └─ Function C  ──────▶ Connection Z
```

This provides precise visibility into which functions use which connections.

### 4. GraphQL Special Handling

GraphQL services have unique rendering:

**Group Headers:**
- Query (accessor: "get")
- Subscription (accessor: "subscribe")
- Mutation (no accessor, just name)

**Collapsed State:**
When a group is collapsed:
- Functions are hidden
- Links connect to group header port
- Header shows total count

### 5. Interactive Features

- **Node Selection**: Click nodes to trigger callbacks
- **Function Expansion**: Expand/collapse function lists
- **Zoom Controls**: Zoom in/out, fit to screen
- **Pan**: Drag canvas to pan

## Utility Functions

### `diagram.ts`

Key utility functions:

#### `generateEngine()`
Creates and configures the diagram engine with custom factories.

#### `autoDistribute(engine)`
Implements three-column layout algorithm.

#### `sortItems(items)`
Sorts services/connections by `sortText`:
- Format: `"filename.bal<number>"`
- Example: `"main.bal10"`, `"utils.bal5"`

#### `createNodesLink(sourceNode, targetNode)`
Creates a link between two nodes using their default ports.

#### `createPortNodeLink(port, node)`
Creates a link from a specific port to a node.

#### `calculateEntryNodeHeight(numFunctions, isExpanded)`
Calculates dynamic height for regular services.

#### `calculateGraphQLNodeHeight(visible, hidden, groupStates)`
Calculates dynamic height for GraphQL services.

## Constants

From `constants.ts`:

```typescript
export enum NodeTypes {
    LISTENER_NODE = "listener-node",
    ENTRY_NODE = "entry-node",
    CONNECTION_NODE = "connection-node",
}

// Sizing
export const ENTRY_NODE_WIDTH = 240;
export const ENTRY_NODE_HEIGHT = 64;
export const CON_NODE_WIDTH = 200;
export const CON_NODE_HEIGHT = 64;
export const LISTENER_NODE_WIDTH = 200;
export const LISTENER_NODE_HEIGHT = 64;

// Spacing
export const NODE_GAP_Y = 100;
export const NODE_GAP_X = 160;
```

## State Management

### Component-Level State

**In `Diagram.tsx`:**
- `diagramEngine`: Singleton diagram engine instance
- `diagramModel`: Current diagram model
- `expandedNodes`: Set of UUIDs for expanded service nodes
- `graphQLGroupOpen`: Map of service UUID to group visibility state

### Global State (via Context)

The `DiagramContext` provides:
- Current project data
- Expansion states
- Event handlers for user interactions

## React-Diagrams Integration

### Architecture Pattern

```
DiagramEngine (Singleton)
  ↓
DiagramModel (Graph Container)
  ↓
Layers
  ├─ NodeLayer (Default)
  │   └─ Nodes (EntryNode, ListenerNode, ConnectionNode)
  └─ LinkLayer (Default)
      └─ Links (NodeLink)
```

### Factory Registration

```typescript
engine.getPortFactories().registerFactory(new NodePortFactory());
engine.getLinkFactories().registerFactory(new NodeLinkFactory());
engine.getNodeFactories().registerFactory(new ListenerNodeFactory());
engine.getNodeFactories().registerFactory(new EntryNodeFactory());
engine.getNodeFactories().registerFactory(new ConnectionNodeFactory());
```

### Widget Pattern

Each node type follows the pattern:
1. **Model**: Extends `NodeModel`, holds data and ports
2. **Factory**: Implements factory pattern for model instantiation
3. **Widget**: React component for visual representation

## Event Flow

### User Clicks Node

```
User Clicks Node Widget
  ↓
Widget's onClick Handler
  ↓
DiagramContext Callback
  ↓
Parent Component (VSCode Extension)
  ↓
Open Definition / Show Properties
```

### User Expands Functions

```
User Clicks "Show More"
  ↓
onToggleNodeExpansion(nodeId)
  ↓
Update expandedNodes State
  ↓
Trigger useEffect
  ↓
Regenerate Diagram Data
  ↓
Redraw Diagram
```

## Testing

### Test Setup
- **Framework**: Jest 29.7.0
- **React Testing Library**: For component testing
- **Snapshot Tests**: Verify visual consistency

### Sample Data
Located in `src/stories/`:
- `1-empty.json`: Empty project
- `2-only-automation.json`: Automation only
- `3-simple-service.json`: Single HTTP service
- `4-multiple-services.json`: Multiple services
- `5-connection-complex.json`: Complex connections
- `6-ai-agent-complex.json`: AI service example
- `7-graphql-complex.json`: GraphQL service example
- `8-multiple-connections-complex.json`: Multiple connections

## Build & Development

### Scripts

```bash
# Development
npm run watch          # Watch mode for development
npm run storybook      # Run Storybook on port 6006

# Build
npm run build          # Compile TypeScript
npm run copy:assets    # Copy static assets

# Testing
npm run test           # Run Jest tests
npm run test:watch     # Watch mode for tests

# Linting
npm run lint:fix       # Fix ESLint issues
```

### Output

Built files are output to `lib/` directory:
- `lib/index.js`: Main entry point
- `lib/index.d.ts`: TypeScript definitions
- `lib/components/`: Compiled components
- `lib/resources/`: Assets and constants

## Key Algorithms

### 1. Function Partitioning (Regular Services)

```typescript
function partitionRegularServiceFunctions(
    service: CDService,
    expandedNodes: Set<string>
): { visible: CDFunction[], hidden: CDFunction[] } {
    const all = [...remoteFunctions, ...resourceFunctions];
    
    if (all.length <= SHOW_ALL_THRESHOLD || expandedNodes.has(service.uuid)) {
        return { visible: all, hidden: [] };
    }
    
    return {
        visible: all.slice(0, PREVIEW_COUNT),
        hidden: all.slice(PREVIEW_COUNT)
    };
}
```

### 2. Function Partitioning (GraphQL Services)

```typescript
function partitionGraphQLServiceFunctions(
    service: CDService,
    expandedNodes: Set<string>,
    groupOpen: GQLState
): { visible: GQLFuncListType, hidden: GQLFuncListType } {
    // Group functions by Query/Mutation/Subscription
    const grouped = functions.reduce((acc, fn) => {
        const group = getGraphQLGroupLabel(fn.accessor, fn.name);
        acc[group].push(fn);
        return acc;
    }, { Query: [], Mutation: [], Subscription: [] });
    
    // For each group, determine visible vs hidden
    Object.keys(grouped).forEach(group => {
        if (!groupOpen[group]) {
            hidden[group] = grouped[group];  // All hidden if collapsed
        } else {
            // Apply preview logic
            const items = grouped[group];
            const expanded = expandedNodes.has(service.uuid + group);
            
            if (items.length <= SHOW_ALL_THRESHOLD || expanded) {
                visible[group] = items;
            } else {
                visible[group] = items.slice(0, PREVIEW_COUNT);
                hidden[group] = items.slice(PREVIEW_COUNT);
            }
        }
    });
    
    return { visible, hidden };
}
```

### 3. Auto-Distribution Algorithm

```typescript
function autoDistribute(engine: DiagramEngine) {
    const listenerX = 250;
    const entryX = listenerX + LISTENER_NODE_WIDTH + NODE_GAP_X;
    const connectionX = entryX + ENTRY_NODE_WIDTH + NODE_GAP_X;
    
    // Position listeners at average Y of attached services
    listenerNodes.forEach(listener => {
        const serviceNodes = getAttachedServices(listener);
        const avgY = calculateAverageY(serviceNodes);
        listener.setPosition(listenerX, avgY);
    });
    
    // Keep entry nodes at their calculated Y positions
    entryNodes.forEach(entry => {
        entry.setPosition(entryX, entry.getY());
    });
    
    // Position connections in rightmost column
    connectionNodes.forEach(connection => {
        connection.setPosition(connectionX, connection.getY());
    });
}
```

## Extension Points

To extend the diagram:

### 1. Add New Node Type

1. Create model in `src/components/nodes/NewNode/NewNodeModel.ts`
2. Create widget in `src/components/nodes/NewNode/NewNodeWidget.tsx`
3. Create factory in `src/components/nodes/NewNode/NewNodeFactory.tsx`
4. Register factory in `generateEngine()` in `utils/diagram.ts`
5. Add node type to `NodeTypes` enum in `constants.ts`

### 2. Add New Service Type

1. Check for service type in `EntryNodeWidget.tsx`
2. Create new widget in `src/components/nodes/EntryNode/components/`
3. Route to new widget based on `service.type`

### 3. Customize Layout

Modify `autoDistribute()` function in `utils/diagram.ts` to implement custom positioning logic.

### 4. Add New Link Style

Extend `NodeLinkModel` and `NodeLinkWidget` to support custom visual styles.

## Performance Considerations

1. **Debounced Repaint**: Diagram repaints are debounced to avoid excessive re-renders
2. **Selective Re-rendering**: Only affected nodes are redrawn on state changes
3. **Zoom Caching**: Zoom and offset positions can be cached in localStorage
4. **Lazy Expansion**: Functions are only rendered when visible

## Known Limitations

1. Nodes are locked (`NODE_LOCKED = false` in constants) - user cannot drag nodes
2. Auto-layout uses fixed column positions (3-column layout)
3. Large diagrams (>50 nodes) may experience performance degradation
4. GraphQL support is limited to Query/Mutation/Subscription patterns

## Future Enhancements

Potential areas for improvement:
- Dagre-based automatic layout (currently has partial support)
- Custom routing for links (currently uses default routing)
- Minimap for large diagrams
- Export to PNG/SVG
- Collapse/expand all nodes
- Search and highlight functionality
- Undo/redo support

---

## Quick Start

```tsx
import { Diagram } from "@wso2/component-diagram";

const model: CDModel = {
    automation: { /* ... */ },
    connections: [ /* ... */ ],
    listeners: [ /* ... */ ],
    services: [ /* ... */ ]
};

function App() {
    return (
        <Diagram
            project={model}
            onListenerSelect={(listener) => console.log(listener)}
            onServiceSelect={(service) => console.log(service)}
            onFunctionSelect={(func) => console.log(func)}
            onAutomationSelect={(automation) => console.log(automation)}
            onConnectionSelect={(connection) => console.log(connection)}
            onDeleteComponent={(component) => console.log(component)}
        />
    );
}
```

---

**Last Updated**: November 15, 2025  
**Version**: 1.0.0  
**Maintained By**: WSO2 LLC

