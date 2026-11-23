// The package root also exports the form editors, which cannot load under Jest, so tests see only these modules.
// LoadMoreButton loads on first use, so suites that need only formatMethodName do not load the UI toolkit.
module.exports = {
    ...require('../../../ballerina-side-panel/src/utils/formatMethodName.ts'),
    // The form's field predicates load on first use too, so suites that never call them do not load ballerina-core.
    get PARAMETER_KINDS() {
        return require('../../../ballerina-side-panel/src/components/Form/utils.ts').PARAMETER_KINDS;
    },
    get isNodeTypeField() {
        return require('../../../ballerina-side-panel/src/components/Form/utils.ts').isNodeTypeField;
    },
    get LoadMoreButton() {
        return require('../../../ballerina-side-panel/src/components/LoadMoreButton.tsx').LoadMoreButton;
    },
    get UnsavedChangesContext() {
        return require('../../../ballerina-side-panel/src/context/unsavedChanges.tsx').UnsavedChangesContext;
    },
    get useReportUnsavedChanges() {
        return require('../../../ballerina-side-panel/src/context/unsavedChanges.tsx').useReportUnsavedChanges;
    },
    get useConfirmDiscard() {
        return require('../../../ballerina-side-panel/src/context/unsavedChanges.tsx').useConfirmDiscard;
    },
};
