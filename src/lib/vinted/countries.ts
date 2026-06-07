import type { VintedCountry } from '@/types'

export interface CountryConfig {
  code: VintedCountry
  domain: string
  name: string
  currency: string
  flag: string
}

export const COUNTRY_CONFIGS: Record<VintedCountry, CountryConfig> = {
  it: { code: 'it', domain: 'https://www.vinted.it', name: 'Italia', currency: 'EUR', flag: '🇮🇹' },
  fr: { code: 'fr', domain: 'https://www.vinted.fr', name: 'Francia', currency: 'EUR', flag: '🇫🇷' },
  de: { code: 'de', domain: 'https://www.vinted.de', name: 'Germania', currency: 'EUR', flag: '🇩🇪' },
  es: { code: 'es', domain: 'https://www.vinted.es', name: 'Spagna', currency: 'EUR', flag: '🇪🇸' },
  pl: { code: 'pl', domain: 'https://www.vinted.pl', name: 'Polonia', currency: 'PLN', flag: '🇵🇱' },
  be: { code: 'be', domain: 'https://www.vinted.be', name: 'Belgio', currency: 'EUR', flag: '🇧🇪' },
  nl: { code: 'nl', domain: 'https://www.vinted.nl', name: 'Olanda', currency: 'EUR', flag: '🇳🇱' },
  uk: { code: 'uk', domain: 'https://www.vinted.co.uk', name: 'UK', currency: 'GBP', flag: '🇬🇧' },
  pt: { code: 'pt', domain: 'https://www.vinted.pt', name: 'Portogallo', currency: 'EUR', flag: '🇵🇹' },
  at: { code: 'at', domain: 'https://www.vinted.at', name: 'Austria', currency: 'EUR', flag: '🇦🇹' },
  cz: { code: 'cz', domain: 'https://www.vinted.cz', name: 'Rep. Ceca', currency: 'CZK', flag: '🇨🇿' },
}

export const ALL_COUNTRIES = Object.keys(COUNTRY_CONFIGS) as VintedCountry[]

export function getCountryConfig(country: VintedCountry): CountryConfig {
  return COUNTRY_CONFIGS[country]
}
