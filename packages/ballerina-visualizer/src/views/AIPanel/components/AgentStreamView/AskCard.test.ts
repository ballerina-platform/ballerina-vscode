/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

/**
 * @jest-environment node
 */

import type { ClarifyQuestion } from "@wso2/ballerina-core";
import { loadFixtures } from "@wso2/test-config/fixtures";
import { getAnswerLabel } from "./AskCard";

interface AnsweredCardFixture {
    description: string;
    cards: {
        name: string;
        questions: ClarifyQuestion[];
        answers: { question: string; answers: string[] }[];
    }[];
}

const answerCases = loadFixtures<AnsweredCardFixture>(__dirname, "fixtures", "answered-cards").flatMap((fixture) =>
    fixture.data.cards.flatMap((card) =>
        card.answers.flatMap((answered, i) =>
            answered.answers.map((answer) => [`${fixture.name}: ${card.name}: ${answer}`, card.questions[i], answer] as const)
        )
    )
);

describe("answered card", () => {
    it.each(answerCases)("%s shows the picked label, or the answer as typed", (_name, question, answer) => {
        const option = question?.options.find((o) => o.value === answer);
        expect(getAnswerLabel(question, answer)).toBe(option ? option.label : answer);
    });

    it("never shows an option value in place of its label", () => {
        for (const [, question, answer] of answerCases) {
            const values = new Set(question?.options.map((o) => o.value) ?? []);
            const labels = new Set(question?.options.map((o) => o.label) ?? []);
            const shown = getAnswerLabel(question, answer);
            expect(values.has(shown) && !labels.has(shown)).toBe(false);
        }
    });
});
