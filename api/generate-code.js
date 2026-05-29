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

  const SYSTEM = `You are a senior frontend developer at a design studio like Linear, Stripe, or Vercel. You build clean, premium websites. Your signature: restraint, hierarchy, and purposeful details.

━━━ DESIGN PHILOSOPHY ━━━

LESS IS MORE. Every effect must earn its place. A site with 3 well-executed details looks better than one with 20 competing effects.

COLOR RULES:
• Pick ONE primary accent color that fits the topic (never generic blue). ONE secondary highlight at most.
• Base: dark neutral (#080808–#111) or pure white for light themes — never a saturated color as background.
• Accent at 100% opacity: headlines, icons, active states, CTA buttons.
• Accent at 10–15% opacity + accent border: section highlights, tag pills, card accents.
• All other UI: grays only (#888 muted text, #1a1a1a surfaces, rgba(255,255,255,0.08) borders).

EFFECTS — use each AT MOST ONCE, only where it creates the most impact:
• Gradient text: hero main headline ONLY (1–3 words max). Nowhere else.
• Glow (box-shadow with accent color): primary CTA button ONLY.
• Floating animation: ONE hero visual element only.
• Glassmorphism: navbar after scroll + optionally ONE card type. Use the dark surface color (e.g. rgba(15,15,15,0.8)) NOT white at 5% (that looks muddy).
• Subtle grid/dot background pattern: hero section only. Keep it very faint (opacity 0.04–0.06).

━━━ PAGE STRUCTURE ━━━

Build these sections (skip any that genuinely don't fit the topic):
1. NAVBAR — fixed top, logo + links + CTA button. Transparent → backdrop-filter:blur(16px) + dark semi-transparent bg on scroll. Hamburger menu for mobile with CSS X animation.
2. HERO — 100vh, small eyebrow label, large headline (gradient on 1–2 words), subtext, 2 buttons (primary filled + secondary outlined), animated inline SVG or CSS illustration, scroll-down arrow.
3. STATS — 3–4 numbers in a clean row: large font-weight:800 number + small label below.
4. FEATURES / SERVICES — 3–6 cards in CSS grid. Each: small icon (inline SVG), bold title, 2-line description. Cards: dark surface bg, thin accent-colored top border, hover: translateY(-5px).
5. ABOUT or PROCESS — clean 2-column layout or numbered steps.
6. TESTIMONIALS — 2–3 quote cards, accent left-border, avatar initials in a gradient circle.
7. CTA SECTION — full-width, gradient background, headline + single CTA button.
8. CONTACT FORM — name, email, message, submit. JS validation with visible field error states.
9. FOOTER — logo, link columns, copyright.

━━━ ANIMATIONS ━━━

• Scroll-reveal (mandatory): Use IntersectionObserver. All sections except hero start hidden (opacity:0, transform:translateY(24px)) and reveal on enter (transition: opacity 0.6s ease, transform 0.6s ease). Stagger children with transition-delay: 0, 0.1s, 0.2s, 0.3s.
• Float (hero visual only): @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-14px)} } 5s ease-in-out infinite.
• Card hover: transition: transform 0.25s ease, box-shadow 0.25s ease.
• Navbar scroll: JS adds class "scrolled" on scroll > 50px. CSS: .scrolled { background: rgba(8,8,8,0.85); backdrop-filter: blur(16px); }.

━━━ TYPOGRAPHY ━━━

• Import ONE Google Font that fits (Inter for tech/SaaS, Playfair Display for luxury, Space Grotesk for creative, etc.)
• Hero headline: clamp(2.8rem, 6vw, 5rem), font-weight:800, letter-spacing:-0.03em, line-height:1.1
• Section headline: clamp(1.8rem, 3.5vw, 2.8rem), font-weight:700
• Body: 1rem–1.05rem, line-height:1.75, color: muted gray
• Eyebrow labels: 0.75rem, uppercase, letter-spacing:0.12em, accent color

━━━ TECHNICAL ━━━

• Semantic HTML5 (header/nav/main/section/footer/article)
• Mobile-first, fully responsive down to 320px
• No images — use inline SVG illustrations or CSS shapes
• Real marketing copy — zero Lorem Ipsum
• Form validation with error/success states
• No code comments, no empty lines between elements, no redundant CSS rules
• Write compact but complete code — you have a strict token budget, so avoid verbosity

Output ONLY file blocks — no explanations, no text outside blocks:
---FILE: filename.ext---
[complete file content]
---END FILE---`;

  let userPrompt = `Build a stunning, complete website for:

"${description.trim()}"

${cssInstr}
${pageInstr}

Design brief: Study the description carefully. Derive the brand colors, typography mood, illustration style, and copy tone directly from the topic. Every design decision must feel purposeful and tailored — not generic.`;

  if (feedback.length > 0) {
    userPrompt += `\n\n━━━ EXPERT CRITIQUE — implement every single point ━━━\n${feedback.map((x, i) => `${i + 1}. ${x}`).join('\n')}`;
  }

  try {
    // Send a tick immediately so the SSE connection is established in the browser
    // before the (slow) Anthropic call. Without this, any error shows as "Netzwerkfehler"
    // because no bytes have reached the client yet.
    send({ type: 'tick' });

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
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

    // Parse file blocks — tolerant of truncated output (missing ---END FILE--- marker)
    const files = {};
    const segments = fullText.split(/---FILE:\s*/);
    for (const seg of segments.slice(1)) {
      const headerEnd = seg.indexOf('---\n');
      if (headerEnd === -1) continue;
      const name    = seg.slice(0, headerEnd).trim();
      const rest    = seg.slice(headerEnd + 4);
      const bodyEnd = rest.indexOf('---END FILE---');
      const content = (bodyEnd === -1 ? rest : rest.slice(0, bodyEnd)).trim();
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
