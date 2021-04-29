/* const config2 = {
  "presets": [
    "@babel/preset-typescript",

    [
      "@babel/preset-env", 
      {
        "modules": false,
        "corejs": 3,
        "useBuiltIns": "usage",
        //"include": ["es.promise.finally"],
        "targets": {
          "chrome": "56"
        }
      }
    ],

    //"@babel/preset-2015"
  ],
  "plugins": [
    ["@babel/plugin-proposal-class-properties", { "loose": true }],
    ["@babel/plugin-transform-typescript", {
      "allowNamespaces": true
    }]
  ]
};

const config3 = {
  "presets": [
    "@babel/preset-env",
    "@babel/preset-typescript"
  ],
  "plugins": [
    "@babel/plugin-proposal-class-properties",
    ["@babel/plugin-transform-typescript", {
      "allowNamespaces": true
    }]
  ]
};

module.exports = config2; */

module.exports = {
  presets: [
    ['@babel/preset-env', {targets: {node: 'current'}}],
    '@babel/preset-typescript',
  ]/* ,
  plugins: ["@babel/plugin-syntax-dynamic-import"] */
};
