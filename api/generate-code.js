export const maxDuration = 60;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    send({ type: 'error', message: 'ANTHROPIC_API_KEY not configured' });
    return res.end();
  }

  const { description, cssMode = 'css', pageMode = 'single', feedback = [] } = req.body || {};
  if (!description?.trim()) {
    send({ type: 'error', message: 'description required' });
    return res.end();
  }

  const cssInstr = cssMode === 'tailwind'
    ? 'Use Tailwind CSS via CDN (<script src="https://cdn.tailwindcss.com"></script>). No separate CSS file.'
    : 'Use vanilla CSS in a separate style.css file.';

  const pageInstr = pageMode === 'multi'
    ? 'Multi-page: create index.html plus needed pages (about.html, contact.html, etc.). All share one style.css.'
    : 'Single-page: one index.html only. Sections with smooth-scroll navigation.';

  let prompt = `Create a complete, production-ready website for:
"${description.trim()}"

CSS: ${cssInstr}
Structure: ${pageInstr}
Requirements: modern polished design, fully responsive, vanilla JS only, real content (no Lorem Ipsum), smooth animations, professional color scheme.`;

  if (feedback.length > 0) {
    prompt += `\n\nFIX ALL THESE ISSUES FROM THE PREVIOUS VERSION:\n${feedback.map((x, i) => `${i + 1}. ${x}`).join('\n')}`;
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 7000,
        stream: true,
        system: `You are a world-class frontend developer. Output ONLY file blocks — no explanations, no preamble.

Format:
---FILE: filename.ext---
[complete file content]
---END FILE---`,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!upstream.ok) {
      send({ type: 'error', message: `Claude API ${upstream.status}: ${await upstream.text()}` });
      return res.end();
    }

    const reader = upstream.body.getReader();
    const dec = new TextDecoder();
    let fullText = '';
    let lineBuf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      lineBuf += dec.decode(value, { stream: true });
      const lines = lineBuf.split('\n');
      lineBuf = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (!raw || raw === '[DONE]') continue;
        try {
          const obj = JSON.parse(raw);
          if (obj.type === 'content_block_delta' && obj.delta?.type === 'text_delta') {
            fullText += obj.delta.text;
            send({ type: 'tick' }); // keep connection alive
          }
        } catch (_) {}
      }
    }

    // Parse file blocks
    const files = {};
    const regex = /---FILE:\s*(.+?)---\n([\s\S]*?)---END FILE---/g;
    let m;
    while ((m = regex.exec(fullText)) !== null) {
      const name = m[1].trim();
      const content = m[2].trim();
      if (name && content) files[name] = content;
    }
    if (!Object.keys(files).length) {
      const html = fullText.match(/<!DOCTYPE html[\s\S]*/i);
      files['index.html'] = html ? html[0].trim() : fullText.trim();
    }

    send({ type: 'files', files });
  } catch (err) {
    send({ type: 'error', message: err.message });
  }

  res.end();
}
