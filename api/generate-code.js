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

  const isTailwind = cssMode === 'tailwind';
  const isMulti    = pageMode === 'multi';

  const cssInstr = isTailwind
    ? `Use Tailwind CSS via CDN. In the HTML <head>, add:
  <script src="https://cdn.tailwindcss.com"></script>
  <script>tailwind.config = { theme: { extend: { /* custom brand colors, animations */ } } }</script>
  Add a <style> block for custom @keyframes and any CSS not covered by Tailwind utilities.`
    : `Use vanilla CSS in a separate style.css file linked with <link rel="stylesheet" href="style.css">.`;

  const pageInstr = isMulti
    ? `Multi-page: create index.html + additional pages (about.html, contact.html, etc.) as needed. All pages share the same navbar, footer, and style.css.`
    : `Single-page: one index.html with all sections. Smooth-scroll anchor navigation.`;

  const SYSTEM = `You are a world-class UI/UX designer and frontend developer. You create visually stunning websites that look like they were made by a top design agency.

═══ MANDATORY DESIGN STANDARDS ═══

1. VISUAL DEPTH & ATMOSPHERE
   • Hero: min-height 100vh, layered gradient background (2–3 overlapping radial or mesh gradients), large decorative SVG or CSS shape, animated floating element
   • Background textures: use radial-gradient dots, grid lines, or star fields as subtle patterns — not plain flat colors
   • Glassmorphism cards: background rgba(255,255,255,0.05–0.08), border 1px solid rgba(255,255,255,0.1), backdrop-filter blur(12px)
   • Glow effects: box-shadow with spread in the brand color at 20–40% opacity on key elements
   • Gradient overlays: linear/radial gradients on section backgrounds to create depth

2. ANIMATIONS (all mandatory)
   • Scroll-reveal: every non-hero section uses IntersectionObserver — elements start opacity:0 translateY(40px), transition to opacity:1 translateY(0) over 0.7s with staggered delays
   • Floating hero visual: @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-20px)} } — 6s ease-in-out infinite
   • Gradient text on key headline words: background: linear-gradient(135deg, color1, color2); -webkit-background-clip:text; -webkit-text-fill-color:transparent
   • Card hover: transform translateY(-8px), box-shadow upgrade — 0.3s ease transition
   • Animated CTA button: glow pulse or gradient sweep on hover
   • Navbar: transparent → frosted glass (backdrop-filter blur + semi-transparent bg) on scroll via JS
   • Working hamburger menu for mobile: 3 bars that animate to X with CSS transitions

3. PAGE STRUCTURE (include all applicable sections)
   • NAVBAR: sticky top, logo + nav links + CTA button, hamburger for mobile
   • HERO: full-viewport, badge/pill label, huge headline (gradient text on key word), subheadline, 2 CTA buttons, animated visual/illustration
   • STATS: 3–5 large animated counter numbers with labels (e.g. "500+ Clients", "99% Uptime")
   • FEATURES / SERVICES: 3–6 glassmorphism cards in CSS grid, each with icon (inline SVG), title, description
   • ABOUT / HOW IT WORKS: alternating text+visual layout, timeline, or step-by-step process
   • TESTIMONIALS: 2–3 quote cards with avatar (CSS gradient circle + initials), name, role
   • CTA BANNER: full-width gradient section with headline + button
   • CONTACT: form with name, email, message fields + styled submit button with validation feedback
   • FOOTER: logo, nav columns, social icons, copyright

4. TYPOGRAPHY
   • Import a Google Font — pick one that matches the brand feel (Inter, Plus Jakarta Sans, Sora, DM Sans, etc.)
   • Headlines: font-size clamp(2.5rem, 5vw, 5rem), font-weight 800–900, letter-spacing -0.03em, tight line-height
   • Body: 1.05–1.1rem, line-height 1.7–1.75, slightly muted color
   • Section labels: small uppercase tracking-widest in the accent color above each heading

5. COLOR SYSTEM
   • Derive a unique, purposeful palette from the website topic — do NOT use generic blue/gray
   • Define CSS custom properties: --color-bg, --color-surface, --color-border, --color-text, --color-muted, --color-accent, --color-accent-2
   • Dark theme unless topic clearly demands light
   • Use the accent color for borders, icons, badge labels, underlines, button hover glows

6. CONTENT
   • Invent a believable company/product name, tagline, team members with roles, stats, testimonials, service descriptions
   • All text must be topically relevant — zero Lorem Ipsum
   • Write compelling marketing copy, not placeholder text

7. TECHNICAL
   • Fully responsive — mobile-first, never breaks below 320px
   • Semantic HTML5: <header>, <nav>, <main>, <section>, <article>, <footer>
   • All images replaced with inline SVG illustrations, CSS shapes, or CSS gradient backgrounds
   • Form validation with visible error/success states in JS
   • smooth-behavior: smooth on <html>

Output ONLY file blocks in this exact format — zero explanations, zero markdown outside the blocks:
---FILE: filename.ext---
[complete file content]
---END FILE---`;

  let userPrompt = `Build a stunning, complete website for:

"${description.trim()}"

${cssInstr}
${pageInstr}

Design brief: Study the description carefully. Derive the brand colors, typography mood, illustration style, and copy tone directly from the topic. Every design decision must feel purposeful and tailored — not generic.`;

  if (feedback.length > 0) {
    userPrompt += `\n\n⚠️ CRITICAL — fix ALL of these issues from the previous version:\n${feedback.map((x, i) => `${i + 1}. ${x}`).join('\n')}`;
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
        max_tokens: 8000,
        stream: true,
        system: SYSTEM,
        messages: [{ role: 'user', content: userPrompt }],
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
