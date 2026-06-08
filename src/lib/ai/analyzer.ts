/**
 * AI Analyzer — usa Claude Haiku per valutare i listing Vinted
 *
 * Modello: claude-haiku-4-5-20251001 (più economico)
 * Costo stimato: ~$0.001-0.003 per listing analizzato
 */

import Anthropic from '@anthropic-ai/sdk'
import type { VintedListing, AnalysisResult, Task } from '@/types'
import { CATEGORY_PROMPTS, BASE_SYSTEM_PROMPT } from './prompts'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

/**
 * Analizza un listing Vinted con Claude Haiku.
 * Restituisce score (1-10) e analisi dettagliata.
 */
export async function analyzeListing(
  listing: VintedListing,
  task: Task
): Promise<AnalysisResult> {
  const categoryPrompt = CATEGORY_PROMPTS[task.category] ?? CATEGORY_PROMPTS.general

  const userPrompt = buildUserPrompt(listing, task)

  const systemPrompt = [
    BASE_SYSTEM_PROMPT,
    categoryPrompt,
    task.ai_prompt_extra ? `\nISTRUZIONI AGGIUNTIVE SPECIFICHE:\n${task.ai_prompt_extra}` : '',
  ].join('\n\n')

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt }
      ],
    })

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('')

    return parseAIResponse(text)

  } catch (err) {
    console.error('AI analysis error:', err)
    // In caso di errore AI, ritorna score neutro (non blocca il processo)
    return {
      score: 5,
      reasoning: 'Analisi AI non disponibile al momento.',
      highlights: [],
      warnings: ['Analisi AI fallita — valutare manualmente'],
      investment_value: 'medium',
    }
  }
}

function buildUserPrompt(listing: VintedListing, task: Task): string {
  const hasPrice = listing.price_numeric > 0
  const hasSellerData = listing.user.feedback_reputation > 0 || listing.user.feedback_count > 0

  const priceStr = hasPrice
    ? `€${listing.price_numeric.toFixed(2)} ${listing.currency}`
    : 'non disponibile (valuta dal titolo/descrizione)'

  const budgetNote = (task.price_min || task.price_max)
    ? ` [budget target: €${task.price_min ?? 0}–€${task.price_max ?? '∞'}]`
    : ''

  const sellerStr = hasSellerData
    ? `Rating ${listing.user.feedback_reputation.toFixed(1)}/5 · ${listing.user.feedback_count} recensioni`
    : 'Venditore nuovo o dati non disponibili'

  return `Analizza questo listing Vinted:

TITOLO: ${listing.title}
PREZZO: ${priceStr}${budgetNote}
PAESE: ${listing.country.toUpperCase()}
DESCRIZIONE: ${listing.description || '(nessuna descrizione)'}
${listing.brand_title ? `BRAND: ${listing.brand_title}` : ''}
${listing.size_title ? `TAGLIA/FORMATO: ${listing.size_title}` : ''}

VENDITORE:
- Username: ${listing.user.login || '(sconosciuto)'}
- ${sellerStr}
${listing.user.item_count ? `- Oggetti in vendita: ${listing.user.item_count}` : ''}

POPOLARITÀ: ${listing.favourite_count} ♥ preferiti

ISTRUZIONI IMPORTANTI:
- Se il prezzo non è disponibile, basa la valutazione su titolo e descrizione
- "investment_value: skip" SOLO per: lotti senza prezzo chiaro, condizioni pessime dichiarate, possibili fake evidenti, annunci fuori categoria
- Un venditore senza recensioni è neutro (nuovo utente), non motivo di skip
- Concentrati sull'oggetto stesso: è raro? In buone condizioni? Prezzo ragionevole?

Rispondi ESATTAMENTE in questo formato JSON (nessun testo fuori dal JSON):
{
  "score": <numero 1-10>,
  "reasoning": "<2-3 frasi sull'oggetto, basandoti sui dati disponibili>",
  "highlights": ["<punto positivo 1>", "<punto positivo 2>"],
  "warnings": ["<avviso solo se c'è un vero problema>"],
  "investment_value": "<high|medium|low|skip>"
}`
}

function parseAIResponse(text: string): AnalysisResult {
  try {
    // Rimuovi eventuali backtick o testo extra
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found in response')

    const parsed = JSON.parse(jsonMatch[0])

    return {
      score: Math.min(10, Math.max(1, parseInt(parsed.score) || 5)),
      reasoning: String(parsed.reasoning ?? ''),
      highlights: Array.isArray(parsed.highlights) ? parsed.highlights.map(String) : [],
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : [],
      investment_value: ['high', 'medium', 'low', 'skip'].includes(parsed.investment_value)
        ? parsed.investment_value
        : 'medium',
    }
  } catch {
    return {
      score: 5,
      reasoning: text.slice(0, 200),
      highlights: [],
      warnings: [],
      investment_value: 'medium',
    }
  }
}
