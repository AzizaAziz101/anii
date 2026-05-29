export const maxDuration = 30;

const FOCUS = {
  'UX/UI':        'visual hierarchy, hero impact, gradient effects, glassmorphism cards, scroll-reveal animations present and correct, floating elements, hover states on all interactive elements, consistent spacing scale (8px grid), color contrast WCAG AA, mobile responsiveness, hamburger menu works, typography scale and readability',
  'Security':     'XSS prevention, no innerHTML with unsanitized user input, form input validation with error feedback, CSP readiness, no hardcoded credentials, safe event handler patterns',
  'Code Quality': 'semantic HTML5 landmarks, DRY CSS with custom properties, IntersectionObserver properly implemented, no console.log left in, clean JS structure, no render-blocking patterns, Google Font loaded correctly',
  'SEO':          'title tag relevant and descriptive, meta description present, exactly one H1, all sections have headings in correct hierarchy, lang attribute on html, Open Graph meta tags, descriptive alt texts or aria-labels on SVGs, smooth scroll on html element',
  'Excellence':   'unique brand identity derived from the topic, wow factor in the hero, creative use of gradients/glows/shapes, micro-interactions that delight, copy that sounds like real marketing not placeholder text, overall professional agency-level polish',
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
        max_tokens: 768,
        stream: false,
        system: `You are a brutally honest ${reviewer} expert at a top-tier web agency. You give specific, code-level critique — never vague. Output valid JSON only — no other text.`,
        messages: [{
          role: 'user',
          content: `Review this website code as a ${reviewer} expert.

SCORING GUIDE:
- 90–100: Agency-level, no meaningful issues
- 75–89:  Good but noticeable gaps
- 60–74:  Mediocre, missing key elements
- below 60: Real problems hurting UX or functionality

Focus for ${reviewer}: ${focus}

Website goal: "${description}"

${codeBlock}

IMPORTANT: critical_issues must be SPECIFIC and CODE-LEVEL.
Bad example: "Add hover animations to cards"
Good example: ".feature-card is missing transition: transform 0.3s ease and a :hover { transform: translateY(-8px) } rule"
Bad example: "Improve the hero section"
Good example: "Hero .hero-title has no gradient text — add background: linear-gradient(135deg, #f97316, #38bdf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent"

Return JSON only: {"score":<0-100>,"critical_issues":["specific code-level issue 1","specific code-level issue 2"],"suggestions":["suggestion"]}`,
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
        critical_issues: Array.isArray(parsed.critical_issues) ? parsed.critical_issues.slice(0, 7) : [],
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 3) : [],
      });
    }

    return res.json({ score: 72, critical_issues: [], suggestions: [] });
  } catch (_) {
    return res.json({ score: 72, critical_issues: [], suggestions: [] });
  }
}
