import typescriptEslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
    {
        files: ['**/*.ts'],
    },
    {
        plugins: {
            '@typescript-eslint': typescriptEslint,
        },

        languageOptions: {
            parser: tsParser,
            ecmaVersion: 2022,
            sourceType: 'module',
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },

        rules: {
            '@typescript-eslint/naming-convention': [
                'warn',
                {
                    selector: 'import',
                    format: ['camelCase', 'PascalCase'],
                },
            ],

            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],

            curly: 'warn',
            eqeqeq: 'warn',
            'no-throw-literal': 'warn',
            semi: 'warn',
        },
    },
];
