// Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com/) All Rights Reserved.

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

export const SKILL_USAGE_RULES = `**Rules for using skills**:
- **One at a time**: Always invoke one skill per message. Never call \`invoke_skill\` for multiple skills in the same turn — load each skill, apply it, then decide if another is needed.
- **Silent operation**: Never announce or narrate skill usage in text. Call \`invoke_skill\` directly and apply the rules silently.
- **Priority over tools**: Skills take priority over direct tool calls. Before using tools like \`LibrarySearchTool\`, \`web_search\`, \`web_fetch\`, or invoking sub-skills, always check first whether any skill's trigger condition is met and invoke that skill. Follow all tool references (web search, library selection, sub-skill invocations) mentioned in the skill content rather than the default workflow steps.`;
