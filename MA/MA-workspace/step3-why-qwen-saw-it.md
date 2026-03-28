# Step 3: Why Qwen Could "See" It (And Why I Can't)

## The Most Likely Reason

When your app used Qwen, it was probably doing **one of these things automatically**:

1. **Injecting file contents into the system prompt** — The app read your workspace files and prepended them to every message sent to Qwen. You never saw this happening; it was invisible to you.

2. **Passing a "context" payload** — Some local LLM tools (LM Studio, Ollama frontends, custom wrappers) attach file contents as extra context when calling the model API. This is configured per-model or per-session.

3. **Qwen's local integration had a plugin/tool active** — If the tool had a "read file" or "workspace" plugin enabled for Qwen's session, it could fetch files on demand. That plugin may not be enabled for the Claude/Sonnet session.

4. **You showed Qwen the content earlier in that same conversation** — Models only "remember" what's in the current conversation window. If you pasted the code earlier with Qwen, it was in context. Starting a new session with me means that's gone.

---

## What Is NOT Happening

- Qwen does not have magical file-system access that I lack
- I am not "broken" or "less capable" — I simply haven't been given the data
- This is **not a Claude limitation** — it is a **context delivery problem**

---

## The Simple Test

Ask yourself:
> "Did I paste the code into the chat with Qwen, or did Qwen just... know it?"

If Qwen "just knew it" without you pasting — **your app was injecting it silently.**
If you pasted it with Qwen — **you need to paste it here too.**

---

## How to Fix It Right Now

**Option A — Paste the content here:**
Just copy and paste your file(s) into this chat. I will read them and help you immediately.

**Option B — Check your app's context settings:**
Look for settings like:
- "Include workspace in context"
- "Attach files to system prompt"
- "Enable file tools for this model"

Make sure those are enabled for the Claude/Sonnet model, not just Qwen.

**Option C — Check your system prompt:**
If you have access to the system prompt your app sends, look for `{{file}}`, `{{context}}`, `{{workspace}}` — template variables that may not be resolving correctly when using Claude.

---

## Bottom Line

Your code is fine. Your app is fine. The model switch exposed a **silent dependency** — the app was feeding Qwen data it isn't feeding me. Once we fix that delivery, I can help you fully.
