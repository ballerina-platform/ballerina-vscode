import React from "react";
import { Story, Meta } from "@storybook/react/types-6-0";
import { Diagram, DiagramProps } from "../components/Diagram";
import { mergeFlowModelsForDiff } from "../utils/diff";
import { Flow } from "../utils/types";

import model1 from "./1-start.json";
import diffOldModel from "./8-diff-old.json";
import diffNewModel from "./8-diff-new.json";

export default {
    title: "BI/Diagram",
    component: Diagram,
} as Meta;

const Template: Story<DiagramProps> = (args: JSX.IntrinsicAttributes & DiagramProps) => <Diagram {...args} />;

export const Start = Template.bind({});
Start.args = {
    model: model1,
};

// Unified review-diff diagram with an edited variable and replaced function call,
// covering modified, removed and added state presentations in one visual fixture.
export const ReviewDiff = Template.bind({});
ReviewDiff.args = {
    model: mergeFlowModelsForDiff(diffOldModel as unknown as Flow, diffNewModel as unknown as Flow),
    readOnly: true,
};
