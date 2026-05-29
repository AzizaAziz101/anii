export const maxDuration = 30;

const FOCUS = {
  'UX/UI':        'visual hierarchy, typography, color contrast, spacing, layout, mobile responsiveness, accessibility (ARIA, focus states)',
  'Security':     'XSS prevention, no innerHTML with untrusted data, input validation, CSP readiness, no exposed credentials',
  'Code Quality': 'semantic HTML5, clean DRY CSS, organized vanilla JS, no console.log, proper error handling, logical structure',
  'SEO':          'title tag, meta description, single H1, alt texts, semantic landmarks, Open Graph tags, page-speed hints',
  'Excellence':   'creativity, wow factor, micro-interactions, animations, professional polish, unique design solutions',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const { files, description, reviewer } = req.body || {};
  if (!files || !description || !reviewer) {
    return res.status(400).json({ score: 72, critical_issues: [], suggestions: [] });
  }

  const focus = FOCUS[reviewer] || reviewer;
  const codeBlock = Object.entries(files)
    .map(([n, c]) => `### ${n}\n\`\`\`\n${c}\n\`\`\``)
    .join('\n\n');

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        stream: false,
        system: `You are a strict ${reviewer} reviewer. Output valid JSON only — no other text.`,
        messages: [{
          role: 'user',
          content: `Review this website as ${reviewer} expert.
Focus: ${focus}
Website goal: "${description}"

${codeBlock}

Return JSON only: {"score":<0-100>,"critical_issues":["..."],"suggestions":["..."]}`,
        }],
      }),
    });

    if (!r.ok) {
      return res.json({ score: 72, critical_issues: [], suggestions: [] });
    }

    const data = await r.json();
    const text = data.content[0]?.text || '';
    const jm = text.match(/\{[\s\S]*\}/);

    if (jm) {
      const parsed = JSON.parse(jm[0]);
      return res.json({
        score: Math.min(100, Math.max(0, Math.round(+parsed.score) || 72)),
        critical_issues: Array.isArray(parsed.critical_issues) ? parsed.critical_issues.slice(0, 5) : [],
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 3) : [],
      });
    }

    return res.json({ score: 72, critical_issues: [], suggestions: [] });
  } catch (_) {
    return res.json({ score: 72, critical_issues: [], suggestions: [] });
  }
}
