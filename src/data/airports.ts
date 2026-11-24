/**
 * Airport and runway reference data.
 *
 * SOURCE: OurAirports open data (airports.csv / runways.csv, public domain),
 * https://ourairports.com/data/ — retrieved 2026-11-23. Runway end coordinates are the
 * published runway-end positions; true headings are derived at runtime from those
 * coordinates (see world/Runway.ts), not from the magnetic designators.
 *
 * geoidUndulationM: APPROXIMATE EGM96 geoid height (ellipsoid − MSL) at the airport. It is only
 * used to convert MSL elevations to WGS84 ellipsoidal height for Google 3D Tiles alignment and
 * is refined at runtime by a ground raycast when tiles are active. Not survey-grade.
 */
export interface RunwayEndData {
  readonly ident: string;
  readonly latitudeDeg: number;
  readonly longitudeDeg: number;
  readonly elevationFt: number;
  readonly displacedThresholdFt: number;
}

export type RunwaySurface = 'asphalt' | 'concrete' | 'pem';

export interface RunwayData {
  readonly id: string;
  readonly lengthFt: number;
  readonly widthFt: number;
  readonly surface: RunwaySurface;
  readonly ends: readonly [RunwayEndData, RunwayEndData];
}

export interface AirportData {
  readonly icao: string;
  readonly iata: string;
  readonly name: string;
  readonly city: string;
  readonly country: string;
  readonly latitudeDeg: number;
  readonly longitudeDeg: number;
  readonly elevationFt: number;
  readonly geoidUndulationM: number;
  readonly runways: readonly RunwayData[];
  readonly defaultRunwayEnd: string;
  readonly description: string;
  readonly terrain: 'urban-coastal' | 'urban' | 'island';
  readonly source: string;
}

const SRC = 'OurAirports open data (public domain), retrieved 2026-11-23';

const end = (ident: string, latitudeDeg: number, longitudeDeg: number, elevationFt: number, displacedThresholdFt = 0): RunwayEndData =>
  ({ ident, latitudeDeg, longitudeDeg, elevationFt, displacedThresholdFt });

export const AIRPORTS: readonly AirportData[] = [
  {
    icao: 'KJFK', iata: 'JFK', name: 'John F. Kennedy International Airport', city: 'New York', country: 'United States',
    latitudeDeg: 40.639447, longitudeDeg: -73.779317, elevationFt: 13, geoidUndulationM: -32.7,
    defaultRunwayEnd: '04L', terrain: 'urban-coastal', source: SRC,
    description: 'Jamaica Bay gateway to New York, with four runways in two parallel pairs.',
    runways: [
      { id: '04L/22R', lengthFt: 12079, widthFt: 200, surface: 'pem', ends: [end('04L', 40.622002, -73.785599, 12, 463), end('22R', 40.6488, -73.764702, 13, 2696)] },
      { id: '04R/22L', lengthFt: 8400, widthFt: 200, surface: 'asphalt', ends: [end('04R', 40.6254005, -73.7703018, 13), end('22L', 40.6451988, -73.7548981, 13)] },
      { id: '13L/31R', lengthFt: 10000, widthFt: 200, surface: 'pem', ends: [end('13L', 40.657799, -73.790199, 13, 905), end('31R', 40.6437, -73.7593, 13, 1030)] },
      { id: '13R/31L', lengthFt: 14511, widthFt: 200, surface: 'pem', ends: [end('13R', 40.648399, -73.816704, 13, 2043), end('31L', 40.627899, -73.771599, 13, 3263)] },
    ],
  },
  {
    icao: 'KLAX', iata: 'LAX', name: 'Los Angeles International Airport', city: 'Los Angeles', country: 'United States',
    latitudeDeg: 33.942501, longitudeDeg: -118.407997, elevationFt: 125, geoidUndulationM: -35.6,
    defaultRunwayEnd: '25R', terrain: 'urban-coastal', source: SRC,
    description: 'Four parallel east–west runways ending at the Pacific coastline of Santa Monica Bay.',
    runways: [
      { id: '6L/24R', lengthFt: 8926, widthFt: 150, surface: 'concrete', ends: [end('6L', 33.949119, -118.431187, 112), end('24R', 33.952112, -118.401954, 117)] },
      { id: '6R/24L', lengthFt: 10859, widthFt: 150, surface: 'concrete', ends: [end('6R', 33.94682, -118.434693, 108, 530), end('24L', 33.95047, -118.399063, 111, 800)] },
      { id: '7L/25R', lengthFt: 12894, widthFt: 150, surface: 'concrete', ends: [end('7L', 33.935556, -118.422089, 119, 830), end('25R', 33.939881, -118.379794, 94, 950)] },
      { id: '7R/25L', lengthFt: 11095, widthFt: 200, surface: 'concrete', ends: [end('7R', 33.933659, -118.419074, 118), end('25L', 33.937371, -118.3827, 95)] },
    ],
  },
  {
    icao: 'RJTT', iata: 'HND', name: 'Tokyo Haneda Airport', city: 'Tokyo', country: 'Japan',
    latitudeDeg: 35.549678, longitudeDeg: 139.786958, elevationFt: 35, geoidUndulationM: 36.7,
    defaultRunwayEnd: '34R', terrain: 'urban-coastal', source: SRC,
    description: 'Reclaimed-land airport on Tokyo Bay with four runways, one built partly on piers.',
    runways: [
      { id: '04/22', lengthFt: 8202, widthFt: 200, surface: 'asphalt', ends: [end('04', 35.549015, 139.761274, 19), end('22', 35.567459, 139.777114, 35)] },
      { id: '05/23', lengthFt: 8202, widthFt: 200, surface: 'asphalt', ends: [end('05', 35.524003, 139.803464, 46), end('23', 35.540598, 139.822125, 55)] },
      { id: '16L/34R', lengthFt: 11024, widthFt: 200, surface: 'asphalt', ends: [end('16L', 35.565897, 139.786553, 22, 1280), end('34R', 35.539694, 139.805136, 28, 1180)] },
      { id: '16R/34L', lengthFt: 9843, widthFt: 200, surface: 'asphalt', ends: [end('16R', 35.559986, 139.769067, 20, 1577), end('34L', 35.5366, 139.785669, 18)] },
    ],
  },
  {
    icao: 'EGLL', iata: 'LHR', name: 'London Heathrow Airport', city: 'London', country: 'United Kingdom',
    latitudeDeg: 51.470748, longitudeDeg: -0.459909, elevationFt: 83, geoidUndulationM: 45.9,
    defaultRunwayEnd: '27L', terrain: 'urban', source: SRC,
    description: 'Two long parallel east–west runways west of central London.',
    runways: [
      { id: '09L/27R', lengthFt: 12799, widthFt: 164, surface: 'asphalt', ends: [end('09L', 51.47749, -0.489439, 79, 1007), end('27R', 51.477681, -0.433227, 78)] },
      { id: '09R/27L', lengthFt: 12001, widthFt: 164, surface: 'asphalt', ends: [end('09R', 51.46478, -0.486808, 75, 1013), end('27L', 51.464957, -0.434048, 77)] },
    ],
  },
  {
    icao: 'TNCM', iata: 'SXM', name: 'Princess Juliana International Airport', city: 'Simpson Bay', country: 'Sint Maarten',
    latitudeDeg: 18.041, longitudeDeg: -63.108898, elevationFt: 13, geoidUndulationM: -42.0,
    defaultRunwayEnd: '10', terrain: 'island', source: SRC,
    description: 'Caribbean island runway famous for low approaches over Maho Beach.',
    runways: [
      { id: '10/28', lengthFt: 7546, widthFt: 148, surface: 'asphalt', ends: [end('10', 18.039389, -63.1197, 13, 310), end('28', 18.042464, -63.098216, 9)] },
    ],
  },
];

export function findAirport(iata: string): AirportData | undefined {
  return AIRPORTS.find((a) => a.iata === iata);
}

export interface RunwaySelection {
  readonly runway: RunwayData;
  /** Index of the end the aircraft departs FROM (aligned toward the other end). */
  readonly endIndex: 0 | 1;
}

export function findRunwayEnd(airport: AirportData, ident: string): RunwaySelection | undefined {
  for (const runway of airport.runways) {
    if (runway.ends[0].ident === ident) return { runway, endIndex: 0 };
    if (runway.ends[1].ident === ident) return { runway, endIndex: 1 };
  }
  return undefined;
}

export function listRunwayEnds(airport: AirportData): string[] {
  return airport.runways.flatMap((r) => [r.ends[0].ident, r.ends[1].ident]);
}
