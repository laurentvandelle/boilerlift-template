// The n8n instances this project deploys to. Each target reads its URL and API key from the environment:
// copy .env.example to .env and fill them in (n8n → Settings → n8n API for the key).
import { defineConfig } from 'boilerlift';

export default defineConfig({
  targets: {
    dev: {
      url: process.env.N8N_URL,
      apiKey: process.env.N8N_API_KEY,
      workflows: './workflows',
    },
  },
});
