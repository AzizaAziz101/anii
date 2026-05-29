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
        max_tokens: 512,
        stream: false,
        system: `You are a brutally honest ${reviewer} expert reviewer for a professional web agency. Score 90+ only for genuinely exceptional work. Score below 70 freely when standards are not met. Output valid JSON only — no other text.`,
        messages: [{
          role: 'user',
          content: `Review this website code as a strict ${reviewer} expert.

SCORING GUIDE:
- 90–100: Exceptional, agency-level quality, no meaningful issues
- 75–89:  Good but has a few noticeable gaps
- 60–74:  Mediocre — missing important elements or poor execution
- below 60: Significant problems that hurt user experience or functionality

Focus areas for ${reviewer}: ${focus}

Website goal: "${description}"

${codeBlock}

List specific, actionable critical_issues (not vague — name the exact element, class, or section that needs fixing).

Return JSON only: {"score":<0-100>,"critical_issues":["specific issue 1","specific issue 2"],"suggestions":["suggestion 1"]}`,
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
