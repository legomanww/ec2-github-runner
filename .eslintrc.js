module.exports = {
    "env": {
        "browser": true,
        "es2021": true
    },
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        'eslint-config-prettier'
    ],
    "overrides": [
        {
            "env": {
                "node": true
            },
            "files": [
                ".eslintrc.{js,cjs}"
            ],
            "parserOptions": {
                "sourceType": "script"
            }
        }
    ],
    "parserOptions": {
        "ecmaVersion": "latest",
        "sourceType": "module"
    },
    "rules": {
        "@typescript-eslint/semi": ["error", "always"],
        "@typescript-eslint/comma-dangle": ["warn", {
            "arrays": "always-multiline",
            "objects": "always-multiline",
            "imports": "always-multiline",
            "exports": "always-multiline",
        }],
        "@typescript-eslint/space-before-function-paren": ["error", {
            "anonymous": "always",
            "named": "never",
            "asyncArrow": "always"
        }],
        "@typescript-eslint/consistent-type-imports": "off",
        "@typescript-eslint/member-delimiter-style": ["error", {
            "multiline": {
                "delimiter": "semi",
                "requireLast": true
            },
            "singleline": {
                "delimiter": "semi",
                "requireLast": false
            },
            "multilineDetection": "brackets"
        }],
        "@typescript-eslint/no-unused-vars": [
            "warn",
            {
              argsIgnorePattern: "^_",
              varsIgnorePattern: "^_",
              caughtErrorsIgnorePattern: "^_",
            },
          ],
    }
}
