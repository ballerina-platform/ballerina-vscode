// The package root also exports the form editors, which cannot load under Jest, so tests see only these modules.
// LoadMoreButton loads on first use, so suites that need only formatMethodName do not load the UI toolkit.
module.exports = {
    ...require('../../../ballerina-side-panel/src/utils/formatMethodName.ts'),
    get LoadMoreButton() {
        return require('../../../ballerina-side-panel/src/components/LoadMoreButton.tsx').LoadMoreButton;
    },
};
