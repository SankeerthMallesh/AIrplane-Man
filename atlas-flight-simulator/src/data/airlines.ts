/**
 * Six ORIGINAL fictional airlines. Names, codes, callsigns and logos are invented for this
 * project; any resemblance to real carriers is unintentional. Two-letter codes are prefixed
 * with "X" style combos and flagged `codeIsFictional` — they are not IATA assignments.
 */
export type LogoKind = 'aurora-star' | 'forge-flame' | 'celestial-orbit' | 'ocean-crown' | 'nova-rise' | 'solstice-sun';
export type FuselageStyle = 'cheatline' | 'swoosh' | 'belly-wrap' | 'twin-stripe';

export interface LiveryPalette {
  readonly fuselageTop: string;
  readonly belly: string;
  readonly stripe: string;
  readonly stripe2: string;
  readonly tailBase: string;
  readonly tailGradient: string;
  readonly logoPrimary: string;
  readonly logoSecondary: string;
  readonly engine: string;
  readonly engineLip: string;
  readonly wingAccent: string;
  readonly stabilizer: string;
  readonly titles: string;
}

export interface Airline {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly codeIsFictional: true;
  readonly callsign: string;
  readonly flightNumber: string;
  readonly registration: string;
  readonly description: string;
  readonly personality: string;
  readonly slogan: string;
  readonly fleet: string;
  readonly logo: LogoKind;
  readonly style: FuselageStyle;
  readonly palette: LiveryPalette;
  readonly uiAccent: string;
}

export const AIRLINES: readonly Airline[] = [
  {
    id: 'aurora-pacific', name: 'Aurora Pacific Air', code: 'XA', codeIsFictional: true, callsign: 'AURORA',
    flightNumber: 'AUR 107', registration: 'N220AP',
    description: 'Premium trans-Pacific international carrier.', personality: 'Refined, modern and technology-focused.',
    slogan: 'Follow the light.', fleet: 'AJ-220 long-range variant, 2-class premium cabin',
    logo: 'aurora-star', style: 'cheatline', uiAccent: '#8fd8ff',
    palette: {
      fuselageTop: '#f4f7fb', belly: '#13203d', stripe: '#8fd8ff', stripe2: '#c7ced8', tailBase: '#0f1a33', tailGradient: '#24426e',
      logoPrimary: '#c9f0ff', logoSecondary: '#8fd8ff', engine: '#13203d', engineLip: '#c7ced8', wingAccent: '#8fd8ff', stabilizer: '#13203d', titles: '#13203d',
    },
  },
  {
    id: 'skyforge', name: 'Skyforge Airways', code: 'XF', codeIsFictional: true, callsign: 'FORGE',
    flightNumber: 'FRG 412', registration: 'N220SF',
    description: 'Modern international carrier.', personality: 'Bold, modern and energetic.',
    slogan: 'Built to fly.', fleet: 'AJ-220 high-density, 186 seats',
    logo: 'forge-flame', style: 'swoosh', uiAccent: '#ff7a1a',
    palette: {
      fuselageTop: '#f5f5f3', belly: '#2b2d31', stripe: '#ff7a1a', stripe2: '#3a3d42', tailBase: '#2b2d31', tailGradient: '#45484f',
      logoPrimary: '#ff7a1a', logoSecondary: '#ffd2a8', engine: '#2b2d31', engineLip: '#ff7a1a', wingAccent: '#ff7a1a', stabilizer: '#2b2d31', titles: '#2b2d31',
    },
  },
  {
    id: 'celestial-global', name: 'Celestial Global', code: 'XC', codeIsFictional: true, callsign: 'CELESTIAL',
    flightNumber: 'CEL 9', registration: 'N220CG',
    description: 'Premium long-haul airline.', personality: 'Elegant, sophisticated and luxurious.',
    slogan: 'Among the stars.', fleet: 'AJ-220 business-class configuration, 120 seats',
    logo: 'celestial-orbit', style: 'belly-wrap', uiAccent: '#d9bf86',
    palette: {
      fuselageTop: '#f7f3ec', belly: '#3a1f5c', stripe: '#d9bf86', stripe2: '#5a3a86', tailBase: '#2c1648', tailGradient: '#5a3a86',
      logoPrimary: '#e8d19c', logoSecondary: '#f7f3ec', engine: '#3a1f5c', engineLip: '#d9bf86', wingAccent: '#d9bf86', stabilizer: '#2c1648', titles: '#3a1f5c',
    },
  },
  {
    id: 'pacific-crown', name: 'Pacific Crown', code: 'XP', codeIsFictional: true, callsign: 'PACIFIC CROWN',
    flightNumber: 'PCR 58', registration: 'N220PC',
    description: 'Premium regional and international carrier.', personality: 'Relaxed, polished and ocean-inspired.',
    slogan: 'The ocean, crowned.', fleet: 'AJ-220 regional variant, 168 seats',
    logo: 'ocean-crown', style: 'twin-stripe', uiAccent: '#2bb5ad',
    palette: {
      fuselageTop: '#f8f6f1', belly: '#f8f6f1', stripe: '#0f8f8a', stripe2: '#ff7f66', tailBase: '#0f8f8a', tailGradient: '#2bc4bb',
      logoPrimary: '#f8f6f1', logoSecondary: '#ff7f66', engine: '#0f8f8a', engineLip: '#f8f6f1', wingAccent: '#ff7f66', stabilizer: '#0f8f8a', titles: '#0b6f6b',
    },
  },
  {
    id: 'nova-atlantic', name: 'Nova Atlantic', code: 'XN', codeIsFictional: true, callsign: 'NOVA',
    flightNumber: 'NVA 21', registration: 'N220NA',
    description: 'Transatlantic airline.', personality: 'Innovative, confident and international.',
    slogan: 'A new world, daily.', fleet: 'AJ-220 extended-range, 172 seats',
    logo: 'nova-rise', style: 'swoosh', uiAccent: '#3ad6ff',
    palette: {
      fuselageTop: '#f6f8fc', belly: '#1d3fa8', stripe: '#3ad6ff', stripe2: '#b8c2d4', tailBase: '#1d3fa8', tailGradient: '#2f67e0',
      logoPrimary: '#ffffff', logoSecondary: '#3ad6ff', engine: '#1d3fa8', engineLip: '#b8c2d4', wingAccent: '#3ad6ff', stabilizer: '#1d3fa8', titles: '#1d3fa8',
    },
  },
  {
    id: 'solstice-air', name: 'Solstice Air', code: 'XS', codeIsFictional: true, callsign: 'SOLSTICE',
    flightNumber: 'SOL 300', registration: 'N220SL',
    description: 'Contemporary global airline.', personality: 'Warm, modern and approachable.',
    slogan: 'Every day, the longest day.', fleet: 'AJ-220 standard, 180 seats',
    logo: 'solstice-sun', style: 'belly-wrap', uiAccent: '#ffb02e',
    palette: {
      fuselageTop: '#fbf7ee', belly: '#2f2f33', stripe: '#ffb02e', stripe2: '#b07a3c', tailBase: '#2f2f33', tailGradient: '#4a4038',
      logoPrimary: '#ffb02e', logoSecondary: '#e0a060', engine: '#2f2f33', engineLip: '#ffb02e', wingAccent: '#ffb02e', stabilizer: '#2f2f33', titles: '#2f2f33',
    },
  },
];

export function findAirline(id: string): Airline | undefined {
  return AIRLINES.find((a) => a.id === id);
}
