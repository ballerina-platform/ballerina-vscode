import "./reviewDiffThemes.css";

const REVIEW_THEME_CLASSES = [
    "review-theme-light-2026",
    "review-theme-dark-2026",
    "review-theme-light-vs",
    "review-theme-dark-vs",
    "review-theme-light-modern",
    "review-theme-dark-modern",
    "review-theme-hc-light",
    "review-theme-hc-dark",
];

const THEME_CLASS_BY_NAME = {
    Light_Theme: "review-theme-light-vs",
    Dark_Theme: "review-theme-dark-vs",
    Light_2026: "review-theme-light-2026",
    Dark_2026: "review-theme-dark-2026",
    Light_Visual_Studio: "review-theme-light-vs",
    Dark_Visual_Studio: "review-theme-dark-vs",
    Light_Modern: "review-theme-light-modern",
    Dark_Modern: "review-theme-dark-modern",
    Light_High_Contrast: "review-theme-hc-light",
    Dark_High_Contrast: "review-theme-hc-dark",
};

export const parameters = {
    actions: { argTypesRegex: "^on[A-Z].*" },
    controls: {
        matchers: {
            color: /(background|color)$/i,
            date: /Date$/,
        },
    },
};

export const decorators = [
    (Story, context) => {
        const theme = context.globals.theme || "Light_2026";
        const themeClass = THEME_CLASS_BY_NAME[theme] || THEME_CLASS_BY_NAME.Light_2026;
        const isLight = themeClass.includes("light");
        const isHighContrast = themeClass.includes("hc-");
        const themeKind = isHighContrast ? (isLight ? "4" : "3") : (isLight ? "1" : "2");

        if (isLight) {
            import("../.storybook/lightTheme.css");
        } else {
            import("../.storybook/darkTheme.css");
        }
        import("@vscode/codicons/dist/codicon.css");

        document.body.classList.remove("review-diff-theme", ...REVIEW_THEME_CLASSES);
        document.body.classList.add("review-diff-theme", themeClass);
        document.documentElement.style.setProperty("--vscode-theme-kind", themeKind);

        return <Story />;
    },
];

export const globalTypes = {
    theme: {
        name: "Theme",
        description: "Global theme for components",
        defaultValue: "Light_2026",
        toolbar: {
            icon: "circlehollow",
            items: [
                { value: "Light_2026", title: "Light 2026" },
                { value: "Dark_2026", title: "Dark 2026" },
                { value: "Light_Visual_Studio", title: "Light (Visual Studio)" },
                { value: "Dark_Visual_Studio", title: "Dark (Visual Studio)" },
                { value: "Light_Modern", title: "Light Modern" },
                { value: "Dark_Modern", title: "Dark Modern" },
                { value: "Light_High_Contrast", title: "Light High Contrast" },
                { value: "Dark_High_Contrast", title: "Dark High Contrast" },
            ],
        },
    },
};
