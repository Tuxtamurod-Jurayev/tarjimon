import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'local-translate-proxy',
      configureServer(server) {
        server.middlewares.use('/api/translate', async (req, res) => {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

          if (req.method === 'OPTIONS') {
            res.statusCode = 200;
            res.end();
            return;
          }

          try {
            const urlObj = new URL(req.url, 'http://localhost');
            let text = urlObj.searchParams.get('text');
            let sl = urlObj.searchParams.get('sl') || 'en';
            let tl = urlObj.searchParams.get('tl') || 'uz';

            if (req.method === 'POST') {
              let body = '';
              for await (const chunk of req) {
                body += chunk;
              }
              if (body) {
                try {
                  const parsed = JSON.parse(body);
                  text = parsed.text || text;
                  sl = parsed.sl || sl;
                  tl = parsed.tl || tl;
                } catch {
                  // ignore json parse error
                }
              }
            }

            if (!text || text.trim().length === 0) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Text required' }));
              return;
            }

            const gtUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`;
            const response = await fetch(gtUrl);
            const data = await response.json();
            const translatedText = data[0].map(item => item[0]).join('');

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ translatedText }));
          } catch (err) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message }));
          }
        });
      }
    }
  ],
  build: {
    chunkSizeWarningLimit: 2500
  }
});
