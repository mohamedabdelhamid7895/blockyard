/* Claude features: generate sections, rewrite copy, fill CMS collections and write custom code.
 * Each workspace brings its own Anthropic API key, stored encrypted and only used here. */
import Anthropic from '@anthropic-ai/sdk';
import { Router } from 'express';
import { one } from './db';
import { fail, HttpError, needProject, rateLimit, requireAuth } from './http';
import { decrypt } from './security';

export const AI_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 — best quality (default)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 — faster, lower cost' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 — fastest, lowest cost' },
];

type Effort = 'low' | 'medium' | 'high';
type JsonSchema = { type: 'object'; properties: Record<string, unknown>; required: string[]; additionalProperties: false; [key: string]: unknown };

async function clientFor(orgId: string) {
  const org = await one('select ai_key_enc, ai_model from orgs where id = $1', [orgId]);
  if (!org?.ai_key_enc) fail(400, 'Claude is not connected for this workspace. An admin can add an Anthropic API key in Workspace settings → Claude.');
  return { client: new Anthropic({ apiKey: decrypt(org!.ai_key_enc) }), model: org!.ai_model as string };
}

/** Asks Claude for JSON matching `schema`. Streams so long outputs don't hit request timeouts. */
export async function askJSON<T>(orgId: string, opts: { system: string; prompt: string; schema: JsonSchema; effort: Effort }): Promise<T> {
  const { client, model } = await clientFor(orgId);
  try {
    const stream = client.beta.messages.stream({
      model,
      max_tokens: 64000,
      // Opus and Sonnet can retry a declined request on Anthropic's recommended fallback model. Haiku has no server-side fallback.
      ...(model.includes('haiku') ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }),
      output_config: { effort: opts.effort, format: { type: 'json_schema', schema: opts.schema } },
      system: opts.system,
      messages: [{ role: 'user', content: opts.prompt }],
    });
    const msg = await stream.finalMessage();
    if (msg.stop_reason === 'refusal') throw new HttpError(422, 'Claude declined this request. Try rephrasing it.');
    if (msg.stop_reason === 'max_tokens') throw new HttpError(422, 'The response was too long. Try asking for something smaller.');
    const text = msg.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') throw new HttpError(502, 'Claude returned an empty response');
    return JSON.parse(text.text) as T;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new HttpError(400, 'The Anthropic API key for this workspace was rejected. Update it in Workspace settings → Claude.');
    if (e instanceof Anthropic.PermissionDeniedError) throw new HttpError(400, `This API key can't use ${model}. Choose another model in Workspace settings → Claude.`);
    if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, 'Claude is rate limited for this API key. Wait a moment and try again.');
    if (e instanceof Anthropic.BadRequestError) throw new HttpError(400, `Claude couldn't process this request: ${e.message}`);
    if (e instanceof Anthropic.APIError) throw new HttpError(502, `Claude is unavailable right now (${e.status ?? 'network error'}). Try again.`);
    if (e instanceof SyntaxError) throw new HttpError(502, 'Claude returned something that was not valid JSON. Try again.');
    throw e;
  }
}

const obj = (properties: Record<string, unknown>): JsonSchema =>
  ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const str = (description: string) => ({ type: 'string', description });

export const SECTION_SYSTEM = `You design sections for websites built in Blockyard, a visual website builder like Webflow.
Return one section as HTML and CSS that Blockyard will convert into editable elements and classes.

HTML rules:
- One top-level element: <section>, <header>, <nav> or <footer>. Put the content in a <div class="container"> inside it.
- Use semantic tags: h1-h6, p, a, img, ul/li, blockquote, form, input, textarea, button.
- Give every element that needs styling a class. No inline styles, no <script>, no <style>, no ids except for anchor links.
- Keep text in leaf elements (a heading or paragraph holds text only, no nested tags).
- Images: use https://placehold.co/<width>x<height> with a short ?text= label, and write useful alt text.
- Buttons are links with a class containing "button".

CSS rules:
- Only class selectors: .name, combo classes like .card.is-featured, and :hover, :active, :focus on those.
- No element, id, descendant, child or attribute selectors, no CSS variables, no !important.
- Use lowercase-hyphenated class names that are specific to this section (pricing-card, not card).
- Desktop styles first, then responsive overrides only inside @media (max-width: 991px), @media (max-width: 767px) and @media (max-width: 479px).
- Use longhand properties for spacing (padding-top, margin-bottom…) so each value is editable.
- Do not restyle classes listed as existing unless the request asks for it; reuse them freely without redefining them.`;

export const ai = Router();
ai.use(requireAuth);

async function projectFor(req: { user?: { id: string }; params: { projectId: string } }) {
  const { project } = await needProject(req.user!.id, req.params.projectId);
  rateLimit(`ai:${project.org_id}`, 30, 60_000);
  return project;
}

ai.post('/:projectId/section', async (req, res) => {
  const project = await projectFor(req);
  const prompt = String(req.body?.prompt || '').trim();
  if (!prompt) fail(400, 'Describe the section you want');
  const existing = (Array.isArray(req.body?.existingClasses) ? req.body.existingClasses : []).slice(0, 200).join(', ');
  const out = await askJSON<{ html: string; css: string; summary: string }>(project.org_id, {
    system: SECTION_SYSTEM,
    effort: 'medium',
    schema: obj({ html: str('The section markup'), css: str('The stylesheet for the section'), summary: str('One short sentence describing what was made') }),
    prompt: `Site: ${String(req.body?.siteName || project.name)}\nExisting classes: ${existing || 'none'}\nBrand notes: ${String(req.body?.brand || 'none')}\n\nCreate this section:\n${prompt}`,
  });
  res.json(out);
});

ai.post('/:projectId/text', async (req, res) => {
  const project = await projectFor(req);
  const text = String(req.body?.text || '');
  const instruction = String(req.body?.instruction || 'Improve this text').slice(0, 500);
  const out = await askJSON<{ text: string }>(project.org_id, {
    system: 'You edit copy for websites. Follow the instruction and return only the new text, in the same language as the original unless asked otherwise. Keep it plain text with no markdown or surrounding quotes.',
    effort: 'low',
    schema: obj({ text: str('The rewritten text') }),
    prompt: `Element: ${String(req.body?.element || 'text')}\nInstruction: ${instruction}\n\nOriginal text:\n${text}`,
  });
  res.json(out);
});

ai.post('/:projectId/cms-items', async (req, res) => {
  const project = await projectFor(req);
  const fields = (Array.isArray(req.body?.fields) ? req.body.fields : []) as { slug: string; name: string; type: string }[];
  if (!fields.length) fail(400, 'The collection has no fields');
  const count = Math.min(Math.max(Number(req.body?.count) || 3, 1), 20);
  const itemSchema = obj(Object.fromEntries(fields.map((f) => [f.slug, str(`${f.name} (${f.type})`)])));
  const out = await askJSON<{ items: Record<string, string>[] }>(project.org_id, {
    system: `You write realistic content for CMS collections in a website builder.
Field formats: slug is lowercase-hyphenated and unique; date is YYYY-MM-DD; number is digits only; color is a hex code;
link is a full https URL; image is https://placehold.co/1200x800 with a short ?text= label; richtext is plain paragraphs separated by blank lines.`,
    effort: 'low',
    schema: obj({ items: { type: 'array', items: itemSchema } }),
    prompt: `Collection: ${String(req.body?.collectionName || 'Items')}\nTopic or instructions: ${String(req.body?.topic || 'Fill it with sensible example content')}\nWrite ${count} items.\nAvoid these existing slugs: ${(req.body?.existingSlugs || []).join(', ') || 'none'}`,
  });
  res.json({ items: out.items.slice(0, count) });
});

ai.post('/:projectId/code', async (req, res) => {
  const project = await projectFor(req);
  const where = String(req.body?.kind || 'embed');
  const out = await askJSON<{ code: string; explanation: string }>(project.org_id, {
    system: `You write custom code for a website builder. The code goes ${
      where === 'head' ? 'inside <head> (meta tags, styles, analytics, scripts that must load early)'
        : where === 'body' ? 'before </body> (scripts that run after the page loads)'
        : 'into a Code Embed element in the page body (HTML, with <style> or <script> if needed)'}.
Return complete, working code with no markdown fences. Prefer plain HTML, CSS and vanilla JavaScript.`,
    effort: 'medium',
    schema: obj({ code: str('The code to insert'), explanation: str('One or two sentences on what the code does and anything to fill in') }),
    prompt: `Request: ${String(req.body?.prompt || '')}\n\nCurrent code (may be empty):\n${String(req.body?.current || '').slice(0, 20000)}`,
  });
  res.json(out);
});
