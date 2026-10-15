module.exports = {
    sourceMaps: true,
    presets: [
        "@babel/preset-env",
        ["@babel/preset-typescript", { allowDeclareFields: true }],
        ["@babel/preset-react", { runtime: "automatic" }],
    ],
};
