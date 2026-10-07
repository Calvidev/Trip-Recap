/** ICAO airline code → [IATA code, name]. Covers the carriers Flighty exports most often. */
export const AIRLINES: Record<string, [string, string]> = {
  AMX: ["AM", "Aeroméxico"], SLI: ["5D", "Aeroméxico Connect"], VIV: ["VB", "Viva Aerobus"], VOI: ["Y4", "Volaris"], MXA: ["MX", "Mexicana"],
  AAL: ["AA", "American Airlines"], UAL: ["UA", "United Airlines"], DAL: ["DL", "Delta Air Lines"], SWA: ["WN", "Southwest"], JBU: ["B6", "JetBlue"],
  ASA: ["AS", "Alaska Airlines"], NKS: ["NK", "Spirit"], FFT: ["F9", "Frontier"], HAL: ["HA", "Hawaiian Airlines"], SKW: ["OO", "SkyWest"],
  ENY: ["MQ", "Envoy"], RPA: ["YX", "Republic Airways"], ASH: ["YV", "Mesa Airlines"], EDV: ["9E", "Endeavor Air"], JIA: ["OH", "PSA Airlines"],
  ACA: ["AC", "Air Canada"], WJA: ["WS", "WestJet"], POE: ["PD", "Porter"],
  AVA: ["AV", "Avianca"], LAN: ["LA", "LATAM"], TAM: ["JJ", "LATAM Brasil"], CMP: ["CM", "Copa Airlines"], ARG: ["AR", "Aerolíneas Argentinas"],
  GLO: ["G3", "GOL"], AZU: ["AD", "Azul"], JAT: ["JA", "JetSMART"], VVC: ["VH", "Viva Air"],
  BAW: ["BA", "British Airways"], VIR: ["VS", "Virgin Atlantic"], EZY: ["U2", "easyJet"], RYR: ["FR", "Ryanair"], EIN: ["EI", "Aer Lingus"],
  AFR: ["AF", "Air France"], KLM: ["KL", "KLM"], DLH: ["LH", "Lufthansa"], EWG: ["EW", "Eurowings"], CFG: ["DE", "Condor"],
  SWR: ["LX", "Swiss"], AUA: ["OS", "Austrian"], BEL: ["SN", "Brussels Airlines"], IBE: ["IB", "Iberia"], VLG: ["VY", "Vueling"],
  AEA: ["UX", "Air Europa"], TAP: ["TP", "TAP Air Portugal"], ITY: ["AZ", "ITA Airways"], SAS: ["SK", "SAS"], FIN: ["AY", "Finnair"],
  NAX: ["DY", "Norwegian"], LOT: ["LO", "LOT"], WZZ: ["W6", "Wizz Air"], AEE: ["A3", "Aegean"], TRA: ["HV", "Transavia"],
  THY: ["TK", "Turkish Airlines"], PGT: ["PC", "Pegasus"], SXS: ["XQ", "SunExpress"], AJT: ["AJ", "AJet"],
  UAE: ["EK", "Emirates"], QTR: ["QR", "Qatar Airways"], ETD: ["EY", "Etihad"], SVA: ["SV", "Saudia"], ELY: ["LY", "El Al"],
  ETH: ["ET", "Ethiopian"], MSR: ["MS", "EgyptAir"], RAM: ["AT", "Royal Air Maroc"], SAA: ["SA", "South African"],
  ANA: ["NH", "ANA"], JAL: ["JL", "Japan Airlines"], KAL: ["KE", "Korean Air"], AAR: ["OZ", "Asiana"], CPA: ["CX", "Cathay Pacific"],
  SIA: ["SQ", "Singapore Airlines"], THA: ["TG", "Thai Airways"], MAS: ["MH", "Malaysia Airlines"], GIA: ["GA", "Garuda"], PAL: ["PR", "Philippine Airlines"],
  CCA: ["CA", "Air China"], CES: ["MU", "China Eastern"], CSN: ["CZ", "China Southern"], EVA: ["BR", "EVA Air"], CAL: ["CI", "China Airlines"],
  AIC: ["AI", "Air India"], IGO: ["6E", "IndiGo"], QFA: ["QF", "Qantas"], VOZ: ["VA", "Virgin Australia"], ANZ: ["NZ", "Air New Zealand"],
  AXM: ["AK", "AirAsia"], VJC: ["VJ", "VietJet"], HVN: ["VN", "Vietnam Airlines"],
};

export function airlineInfo(icao: string): { iata: string; name: string } {
  const a = AIRLINES[icao?.toUpperCase()];
  return a ? { iata: a[0], name: a[1] } : { iata: icao, name: icao };
}
