export interface Country {
  code: string
  name: string
  continent: string
}

export const CONTINENTS = [
  'América do Sul',
  'América do Norte',
  'América Central e Caribe',
  'Europa',
  'Ásia',
  'África',
  'Oceania',
] as const

export const COUNTRIES: Country[] = [
  // América do Sul
  { code: 'BR', name: 'Brasil', continent: 'América do Sul' },
  { code: 'AR', name: 'Argentina', continent: 'América do Sul' },
  { code: 'CL', name: 'Chile', continent: 'América do Sul' },
  { code: 'CO', name: 'Colômbia', continent: 'América do Sul' },
  { code: 'PE', name: 'Peru', continent: 'América do Sul' },
  { code: 'UY', name: 'Uruguai', continent: 'América do Sul' },
  { code: 'PY', name: 'Paraguai', continent: 'América do Sul' },
  { code: 'BO', name: 'Bolívia', continent: 'América do Sul' },
  { code: 'EC', name: 'Equador', continent: 'América do Sul' },
  { code: 'VE', name: 'Venezuela', continent: 'América do Sul' },
  { code: 'GY', name: 'Guiana', continent: 'América do Sul' },
  { code: 'SR', name: 'Suriname', continent: 'América do Sul' },

  // América do Norte
  { code: 'US', name: 'Estados Unidos', continent: 'América do Norte' },
  { code: 'CA', name: 'Canadá', continent: 'América do Norte' },
  { code: 'MX', name: 'México', continent: 'América do Norte' },

  // América Central e Caribe
  { code: 'PA', name: 'Panamá', continent: 'América Central e Caribe' },
  { code: 'CR', name: 'Costa Rica', continent: 'América Central e Caribe' },
  { code: 'GT', name: 'Guatemala', continent: 'América Central e Caribe' },
  { code: 'HN', name: 'Honduras', continent: 'América Central e Caribe' },
  { code: 'SV', name: 'El Salvador', continent: 'América Central e Caribe' },
  { code: 'NI', name: 'Nicarágua', continent: 'América Central e Caribe' },
  { code: 'DO', name: 'República Dominicana', continent: 'América Central e Caribe' },
  { code: 'CU', name: 'Cuba', continent: 'América Central e Caribe' },
  { code: 'JM', name: 'Jamaica', continent: 'América Central e Caribe' },
  { code: 'PR', name: 'Porto Rico', continent: 'América Central e Caribe' },

  // Europa
  { code: 'PT', name: 'Portugal', continent: 'Europa' },
  { code: 'ES', name: 'Espanha', continent: 'Europa' },
  { code: 'GB', name: 'Reino Unido', continent: 'Europa' },
  { code: 'FR', name: 'França', continent: 'Europa' },
  { code: 'DE', name: 'Alemanha', continent: 'Europa' },
  { code: 'IT', name: 'Itália', continent: 'Europa' },
  { code: 'NL', name: 'Países Baixos', continent: 'Europa' },
  { code: 'BE', name: 'Bélgica', continent: 'Europa' },
  { code: 'CH', name: 'Suíça', continent: 'Europa' },
  { code: 'IE', name: 'Irlanda', continent: 'Europa' },
  { code: 'SE', name: 'Suécia', continent: 'Europa' },
  { code: 'NO', name: 'Noruega', continent: 'Europa' },
  { code: 'DK', name: 'Dinamarca', continent: 'Europa' },
  { code: 'FI', name: 'Finlândia', continent: 'Europa' },
  { code: 'PL', name: 'Polônia', continent: 'Europa' },
  { code: 'AT', name: 'Áustria', continent: 'Europa' },
  { code: 'GR', name: 'Grécia', continent: 'Europa' },
  { code: 'RO', name: 'Romênia', continent: 'Europa' },
  { code: 'UA', name: 'Ucrânia', continent: 'Europa' },

  // Ásia
  { code: 'CN', name: 'China', continent: 'Ásia' },
  { code: 'JP', name: 'Japão', continent: 'Ásia' },
  { code: 'IN', name: 'Índia', continent: 'Ásia' },
  { code: 'KR', name: 'Coreia do Sul', continent: 'Ásia' },
  { code: 'SG', name: 'Singapura', continent: 'Ásia' },
  { code: 'AE', name: 'Emirados Árabes Unidos', continent: 'Ásia' },
  { code: 'SA', name: 'Arábia Saudita', continent: 'Ásia' },
  { code: 'IL', name: 'Israel', continent: 'Ásia' },
  { code: 'TR', name: 'Turquia', continent: 'Ásia' },
  { code: 'TH', name: 'Tailândia', continent: 'Ásia' },
  { code: 'VN', name: 'Vietnã', continent: 'Ásia' },
  { code: 'ID', name: 'Indonésia', continent: 'Ásia' },
  { code: 'MY', name: 'Malásia', continent: 'Ásia' },
  { code: 'PH', name: 'Filipinas', continent: 'Ásia' },
  { code: 'HK', name: 'Hong Kong', continent: 'Ásia' },
  { code: 'TW', name: 'Taiwan', continent: 'Ásia' },

  // África
  { code: 'ZA', name: 'África do Sul', continent: 'África' },
  { code: 'EG', name: 'Egito', continent: 'África' },
  { code: 'NG', name: 'Nigéria', continent: 'África' },
  { code: 'MA', name: 'Marrocos', continent: 'África' },
  { code: 'KE', name: 'Quênia', continent: 'África' },
  { code: 'AO', name: 'Angola', continent: 'África' },
  { code: 'MZ', name: 'Moçambique', continent: 'África' },
  { code: 'GH', name: 'Gana', continent: 'África' },

  // Oceania
  { code: 'AU', name: 'Austrália', continent: 'Oceania' },
  { code: 'NZ', name: 'Nova Zelândia', continent: 'Oceania' },
]

export function findCountry(code?: string): Country | undefined {
  return code ? COUNTRIES.find((c) => c.code === code) : undefined
}
