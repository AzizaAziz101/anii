export const maxDuration = 300;

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
    send({ type: 'error', message: 'ANTHROPIC_API_KEY is not configured in environment variables.' });
    return res.end();
  }

  const { description, cssMode = 'css', pageMode = 'single' } = req.body || {};
  if (!description || typeof description !== 'string' || !description.trim()) {
    send({ type: 'error', message: 'A website description is required.' });
    return res.end();
  }

  const claude = async (messages, system, maxTokens = 8192) => {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: maxTokens, stream: false, system, messages }),
    });
    if (!r.ok) throw new Error(`Anthropic API ${r.status}: ${await r.text()}`);
    const d = await r.json();
    return d.content[0].text;
  };

  const parseFiles = (text) => {
    const files = {};
    const regex = /---FILE:\s*(.+?)---\n([\s\S]*?)---END FILE---/g;
    let m;
    while ((m = regex.exec(text)) !== null) {
      const name = m[1].trim();
      const content = m[2].trim();
      if (name && content) files[name] = content;
    }
    if (!Object.keys(files).length) {
      const html = text.match(/<!DOCTYPE html[\s\S]*/i);
      files['index.html'] = html ? html[0].trim() : text.trim();
    }
    return files;
  };

  const REVIEWERS = [
    { name: 'UX/UI',        weight: 0.30, focus: 'visual hierarchy, typography, color contrast, spacing, layout, mobile responsiveness, accessibility (ARIA, focus states, color ratios)' },
    { name: 'Security',     weight: 0.25, focus: 'XSS prevention, no innerHTML with untrusted data, input validation, CSP readiness, no exposed credentials, safe event handling' },
    { name: 'Code Quality', weight: 0.20, focus: 'semantic HTML5, clean DRY CSS, organized vanilla JS, no console.log, proper error handling, logical file structure' },
    { name: 'SEO',          weight: 0.15, focus: 'title tag, meta description, single H1, alt texts, semantic landmarks, Open Graph tags, canonical URL, page-speed hints' },
    { name: 'Excellence',   weight: 0.10, focus: 'creativity, wow factor, micro-interactions, animations, professional polish, unique design solutions, performance optimizations' },
  ];

  try {
    let bestScore = 0;
    let bestFiles = null;
    let feedbackIssues = [];

    for (let loop = 1; loop <= 3; loop++) {
      send({ type: 'progress', loop, total: 3, stage: 'generating' });

      const cssInstr = cssMode === 'tailwind'
        ? 'Use Tailwind CSS via CDN (<script src="https://cdn.tailwindcss.com"></script>). No separate CSS file needed.'
        : 'Use vanilla CSS in a separate style.css file. Import it with <link rel="stylesheet" href="style.css">.';

      const pageInstr = pageMode === 'multi'
        ? 'Multi-page: create index.html plus additional pages (e.g. about.html, contact.html) as appropriate. Link them with <a href>. All pages share one style.css.'
        : 'Single-page: one index.html file only. Use sections with anchor navigation and smooth scrolling.';

      let userPrompt = `Create a complete, production-ready website for:

"${description.trim()}"

CSS setup: ${cssInstr}
Page structure: ${pageInstr}

Requirements:
- Modern, polished design that matches the described purpose and audience
- Fully mobile-responsive (mobile-first approach)
- All interactive elements working with vanilla JavaScript
- Real, meaningful content (no Lorem Ipsum)
- Smooth CSS animations and hover effects
- Professional color scheme, consistent spacing, good typography`;

      if (feedbackIssues.length) {
        userPrompt += `\n\nCRITICAL — you MUST fix ALL of these issues from the previous version:\n${feedbackIssues.map((x, i) => `${i + 1}. ${x}`).join('\n')}`;
      }

      const genText = await claude(
        [{ role: 'user', content: userPrompt }],
        `You are a world-class frontend developer. Output ONLY file blocks — no explanations, no markdown, no preamble.

Required format (exactly):
---FILE: filename.ext---
[complete file content]
---END FILE---

For multiple files, repeat this block.`,
        8192
      );

      const files = parseFiles(genText);
      const codeBlock = Object.entries(files)
        .map(([n, c]) => `### ${n}\n\`\`\`\n${c}\n\`\`\``)
        .join('\n\n');

      let weightedTotal = 0;
      const allCritical = [];

      for (const rev of REVIEWERS) {
        send({ type: 'progress', loop, total: 3, stage: 'reviewing', reviewer: rev.name });

        let score = 72;
        let critical = [];

        try {
          const rt = await claude(
            [{
              role: 'user',
              content: `You are reviewing website code as a ${rev.name} expert.

Focus strictly on: ${rev.focus}

Website goal: "${description.trim()}"

Code to review:
${codeBlock}

Respond with valid JSON only (no other text):
{"score": <integer 0-100>, "critical_issues": ["issue description", ...], "suggestions": ["suggestion", ...]}`,
            }],
            `You are a strict ${rev.name} expert reviewer. Output valid JSON only.`,
            1024
          );

          const jm = rt.match(/\{[\s\S]*\}/);
          if (jm) {
            const p = JSON.parse(jm[0]);
            score = Math.min(100, Math.max(0, Math.round(+p.score) || 72));
            critical = Array.isArray(p.critical_issues) ? p.critical_issues.slice(0, 5) : [];
          }
        } catch (_) {}

        allCritical.push(...critical);
        weightedTotal += score * rev.weight;

        send({ type: 'review_result', loop, reviewer: rev.name, score, critical_issues: critical, weight: rev.weight });
      }

      const totalScore = Math.round(weightedTotal);
      send({ type: 'loop_score', loop, score: totalScore });

      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestFiles = files;
      }

      if (totalScore >= 88 || loop === 3) {
        send({ type: 'done', files: bestFiles, finalScore: bestScore, loops: loop });
        break;
      }

      feedbackIssues = [...new Set(allCritical)].slice(0, 8);
    }
  } catch (err) {
    send({ type: 'error', message: err.message });
  }

  res.end();
}
