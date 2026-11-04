/* AI features: generate sections, rewrite copy, fill CMS collections, write custom code and A/B variant copy.
 * Each workspace brings its own model: Claude (default, via the Anthropic SDK) or any other provider through an
 * OpenAI-compatible API. Keys are stored encrypted and only used here. */
import Anthropic from '@anthropic-ai/sdk';
import { Router } from 'express';
import { one } from './db';
import { fail, HttpError, needProject, rateLimit, requireAuth } from './http';
import { decrypt, encrypt } from './security';

export interface ProviderDef { id: string; label: string; baseUrl?: string; keyRequired: boolean; models: string[]; keyHint: string; docs: string }

/** Supported providers. Model lists are suggestions; any model id the provider accepts can be typed in. */
export const PROVIDERS: ProviderDef[] = [
  { id: 'anthropic', label: 'Anthropic Claude (recommended)', keyRequired: true, keyHint: 'sk-ant-…', docs: 'https://console.anthropic.com/settings/keys',
    models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'] },
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', keyRequired: true, keyHint: 'sk-…', docs: 'https://platform.openai.com/api-keys', models: [] },
  { id: 'google', label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', keyRequired: true, keyHint: 'AIza…', docs: 'https://aistudio.google.com/apikey', models: [] },
  { id: 'mistral', label: 'Mistral', baseUrl: 'https://api.mistral.ai/v1', keyRequired: true, keyHint: '', docs: 'https://console.mistral.ai/api-keys', models: [] },
  { id: 'groq', label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', keyRequired: true, keyHint: 'gsk_…', docs: 'https://console.groq.com/keys', models: [] },
  { id: 'openrouter', label: 'OpenRouter (hundreds of models)', baseUrl: 'https://openrouter.ai/api/v1', keyRequired: true, keyHint: 'sk-or-…', docs: 'https://openrouter.ai/keys', models: [] },
  { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', keyRequired: true, keyHint: 'sk-…', docs: 'https://platform.deepseek.com/api_keys', models: [] },
  { id: 'xai', label: 'xAI Grok', baseUrl: 'https://api.x.ai/v1', keyRequired: true, keyHint: 'xai-…', docs: 'https://console.x.ai', models: [] },
  { id: 'together', label: 'Together AI', baseUrl: 'https://api.together.xyz/v1', keyRequired: true, keyHint: '', docs: 'https://api.together.ai/settings/api-keys', models: [] },
  { id: 'ollama', label: 'Ollama (self-hosted)', baseUrl: 'http://localhost:11434/v1', keyRequired: false, keyHint: 'No key needed', docs: 'https://ollama.com', models: [] },
  { id: 'custom', label: 'Custom (OpenAI-compatible)', keyRequired: false, keyHint: 'Optional', docs: '', models: [] },
];
/** Kept for the older settings screen. */
export const AI_MODELS = PROVIDERS[0].models.map((id) => ({ id, label: id }));

export interface ProviderConfig { keyEnc?: string; model?: string; baseUrl?: string }
export interface AiConfig { active?: string; providers?: Record<string, ProviderConfig> }

/** The workspace's AI configuration, with the original single Claude key folded in. */
export async function aiConfigFor(orgId: string): Promise<AiConfig> {
  const org = await one('select ai_key_enc, ai_model, ai_config from orgs where id = $1', [orgId]);
  const cfg: AiConfig = { ...(org?.ai_config || {}) };
  cfg.providers = { ...(cfg.providers || {}) };
  if (org?.ai_key_enc && !cfg.providers.anthropic?.keyEnc) cfg.providers.anthropic = { keyEnc: org.ai_key_enc, model: org.ai_model };
  if (!cfg.active) cfg.active = cfg.providers.anthropic?.keyEnc ? 'anthropic' : Object.keys(cfg.providers)[0];
  return cfg;
}

/** Public view of the configuration: never includes keys. */
export async function aiStatus(orgId: string) {
  const cfg = await aiConfigFor(orgId);
  const providers = Object.fromEntries(Object.entries(cfg.providers || {}).map(([id, p]) => [id, { hasKey: !!p.keyEnc, model: p.model || '', baseUrl: p.baseUrl || '' }]));
  const active = cfg.active && isUsable(cfg.active, cfg.providers?.[cfg.active]) ? cfg.active : null;
  return { active, providers, enabled: !!active };
}
const isUsable = (id: string, p?: ProviderConfig) => {
  const def = PROVIDERS.find((x) => x.id === id);
  return !!def && !!p && (!def.keyRequired || !!p.keyEnc) && (id !== 'custom' || !!p.baseUrl) && (id === 'anthropic' || !!p.model);
};

export async function saveProvider(orgId: string, id: string, patch: { apiKey?: string | null; model?: string; baseUrl?: string; makeActive?: boolean }) {
  const def = PROVIDERS.find((x) => x.id === id);
  if (!def) fail(400, 'Unknown provider');
  const cfg = await aiConfigFor(orgId);
  const cur = { ...(cfg.providers![id] || {}) };
  if (patch.apiKey === null) {
    // Disconnect: forget the provider entirely.
    delete cfg.providers![id];
    if (cfg.active === id) cfg.active = undefined;
    await one('update orgs set ai_config = $1, ai_key_enc = case when $2::boolean then null else ai_key_enc end where id = $3 returning id',
      [JSON.stringify(cfg), id === 'anthropic', orgId]);
    return;
  }
  if (patch.apiKey?.trim()) {
    if (id === 'anthropic' && !/^sk-ant-/.test(patch.apiKey.trim())) fail(400, 'That does not look like an Anthropic API key (they start with sk-ant-)');
    cur.keyEnc = encrypt(patch.apiKey.trim());
  }
  if (patch.model !== undefined) cur.model = patch.model.trim();
  if (patch.baseUrl !== undefined) {
    const u = patch.baseUrl.trim();
    if (u && !/^https?:\/\//.test(u)) fail(400, 'The base URL must start with http:// or https://');
    cur.baseUrl = u;
  }
  cfg.providers![id] = cur;
  if (patch.makeActive) cfg.active = id;
  if (patch.apiKey === null && cfg.active === id) cfg.active = undefined;
  await one('update orgs set ai_config = $1, ai_key_enc = case when $2::boolean then null else ai_key_enc end where id = $3 returning id',
    [JSON.stringify(cfg), id === 'anthropic' && patch.apiKey === null, orgId]);
}

type Effort = 'low' | 'medium' | 'high';
type JsonSchema = { type: 'object'; properties: Record<string, unknown>; required: string[]; additionalProperties: false; [key: string]: unknown };
interface AskOptions { system: string; prompt: string; schema: JsonSchema; effort: Effort }

/** Asks the workspace's model for JSON matching `schema`. */
export async function askJSON<T>(orgId: string, opts: AskOptions): Promise<T> {
  const cfg = await aiConfigFor(orgId);
  const id = cfg.active;
  const p = id ? cfg.providers?.[id] : undefined;
  if (!id || !isUsable(id, p)) fail(400, 'AI is not connected for this workspace. An admin can add a model in Workspace settings → AI models.');
  return id === 'anthropic' ? askClaude<T>(p!, opts) : askOpenAICompatible<T>(id!, p!, opts);
}

/** Claude through the Anthropic SDK, with structured outputs. Streams so long outputs don't hit request timeouts. */
async function askClaude<T>(p: ProviderConfig, opts: AskOptions): Promise<T> {
  const client = new Anthropic({ apiKey: decrypt(p.keyEnc!) });
  const model = p.model || 'claude-opus-5-5';
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
    if (e instanceof Anthropic.AuthenticationError) throw new HttpError(400, 'The Anthropic API key for this workspace was rejected. Update it in Workspace settings → AI models.');
    if (e instanceof Anthropic.PermissionDeniedError) throw new HttpError(400, `This API key can't use ${model}. Choose another model in Workspace settings → AI models.`);
    if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, 'Claude is rate limited for this API key. Wait a moment and try again.');
    if (e instanceof Anthropic.BadRequestError) throw new HttpError(400, `Claude couldn't process this request: ${e.message}`);
    if (e instanceof Anthropic.APIError) throw new HttpError(502, `Claude is unavailable right now (${e.status ?? 'network error'}). Try again.`);
    if (e instanceof SyntaxError) throw new HttpError(502, 'Claude returned something that was not valid JSON. Try again.');
    throw e;
  }
}

/** Pulls a JSON object out of a model reply that may be wrapped in a code fence or prose. */
function extractJSON(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{'), end = body.lastIndexOf('}');
  return JSON.parse(start >= 0 && end > start ? body.slice(start, end + 1) : body);
}

/** Any provider with an OpenAI-compatible chat completions API (OpenAI, Gemini, Mistral, Groq, OpenRouter, Ollama…). */
async function askOpenAICompatible<T>(id: string, p: ProviderConfig, opts: AskOptions): Promise<T> {
  const def = PROVIDERS.find((x) => x.id === id)!;
  const base = (p.baseUrl || def.baseUrl || '').replace(/\/$/, '');
  const label = def.label.replace(/ \(.*\)$/, '');
  const system = `${opts.system}\n\nReply with a single JSON object and nothing else. It must match this JSON Schema:\n${JSON.stringify(opts.schema)}`;
  const body = (withFormat: boolean) => JSON.stringify({
    model: p.model,
    messages: [{ role: 'system', content: system }, { role: 'user', content: opts.prompt }],
    ...(withFormat ? { response_format: { type: 'json_object' } } : {}),
  });
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (p.keyEnc) headers.Authorization = `Bearer ${decrypt(p.keyEnc)}`;
  if (id === 'openrouter') { headers['HTTP-Referer'] = 'https://blockyard.app'; headers['X-Title'] = 'Blockyard'; }
  const call = (withFormat: boolean) => fetch(`${base}/chat/completions`, { method: 'POST', headers, body: body(withFormat), signal: AbortSignal.timeout(180_000) });
  let res: Response;
  try {
    res = await call(true);
    // Some models don't support JSON mode; ask again without it and parse the reply.
    if (res.status === 400) res = await call(false);
  } catch (e) {
    const cause = (e as { cause?: { code?: string } }).cause?.code;
    const hint = cause && /CERT|SSL|TLS/.test(cause) ? ' A proxy is intercepting HTTPS: set NODE_EXTRA_CA_CERTS on the server to trust its certificate.' : ' Check the base URL and that the service is running.';
    throw new HttpError(502, `Couldn't reach ${label} at ${base}${cause ? ` (${cause})` : ''}.${hint}`);
  }
  const data = await res.json().catch(() => ({})) as { error?: { message?: string } | string; choices?: { message?: { content?: string }; finish_reason?: string }[] };
  if (!res.ok) {
    const msg = typeof data.error === 'string' ? data.error : data.error?.message || res.statusText;
    if (res.status === 401 || res.status === 403) throw new HttpError(400, `${label} rejected the API key: ${msg}`);
    if (res.status === 404) throw new HttpError(400, `${label} doesn't know the model “${p.model}”: ${msg}`);
    if (res.status === 429) throw new HttpError(429, `${label} is rate limited for this key. Wait a moment and try again.`);
    throw new HttpError(502, `${label} returned an error (${res.status}): ${msg}`);
  }
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new HttpError(502, `${label} returned an empty response`);
  try { return extractJSON(content) as T; } catch { throw new HttpError(502, `${label} returned something that was not valid JSON. Try again or pick a stronger model.`); }
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

/** Rewrites headings and calls to action for the B side of an A/B test. */
ai.post('/:projectId/variant-copy', async (req, res) => {
  const project = await projectFor(req);
  const texts = (Array.isArray(req.body?.texts) ? req.body.texts : []).slice(0, 40) as { id: string; text: string; kind: string }[];
  if (!texts.length) fail(400, 'This page has no headings or buttons to rewrite');
  const out = await askJSON<{ texts: { id: string; text: string }[] }>(project.org_id, {
    system: `You are a conversion copywriter creating variant B of a landing page for an A/B test.
Rewrite headings, paragraphs near the top and button labels to be clearer and more compelling, keeping the meaning, language and roughly the same length.
Keep every id unchanged. Return every item, even ones you leave as they are.`,
    effort: 'low',
    schema: obj({ texts: { type: 'array', items: obj({ id: str('Unchanged id'), text: str('New text') }) } }),
    prompt: `Goal of the test: ${String(req.body?.goal || 'more clicks on the main call to action')}\n\n${JSON.stringify(texts)}`,
  });
  res.json(out);
});
