# PromptForm (React + Vite)

Security and environment variables

- Secrets must never be committed to this repository.
- .env files are ignored by git via [.gitignore](PromptForm-rewrite/.gitignore).
- An accidentally committed .env was removed and the repository history was rewritten to purge it.
- If any key was exposed, rotate it in the provider dashboard immediately.

How to configure environment values

- Backend-only secrets (like GEMINI_API_KEY) belong on the server process (Node/Express) and should be loaded with dotenv or your hosting provider’s secret manager.
- The frontend does not need GEMINI_API_KEY. Do not put secrets in Vite client env files.
- A template is provided at [.env.example](PromptForm-rewrite/.env.example). Copy it to your server project as needed and fill in real values there.

Local development

1) Run your backend (expected at http://localhost:3001)
   - The frontend fetches:
     - POST /generate-form
     - POST /generate-form-from-image
   - Ensure your backend reads GEMINI_API_KEY from its environment (not checked into git).

2) Run the frontend
   - npm install
   - npm run dev
   - Open the Vite dev server URL printed to the terminal.

If you accidentally commit a secret again

- Revoke the leaked key with your provider.
- Ensure .env rules exist in .gitignore.
- Remove the file from git index: git rm --cached .env
- Commit and push.
- Rewrite history (e.g., git filter-repo or filter-branch) and force-push.

---

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
