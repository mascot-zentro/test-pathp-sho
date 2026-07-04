// Pathao pricing rates (from Kathmandu Inside Ringroad) — used as fallback
// when the live pricePlan API call fails. Rates are for Normal / Package.
// Weight tiers: ≤0.5kg, ≤1kg, 1+kg (per additional kg above 1).

type WeightTier = { upToHalf: number; upToOne: number; perExtraKg: number };

const RATES: Record<string, WeightTier> = {
  "Kathmandu (Inside Ringroad)": { upToHalf: 120, upToOne: 130, perExtraKg: 50 },
  Kavre:                          { upToHalf: 150, upToOne: 160, perExtraKg: 50 },
  Sankhu:                         { upToHalf: 150, upToOne: 160, perExtraKg: 50 },
  Budhanilkantha:                 { upToHalf: 150, upToOne: 160, perExtraKg: 50 },
  Tokha:                          { upToHalf: 150, upToOne: 160, perExtraKg: 50 },
  Chandragiri:                    { upToHalf: 150, upToOne: 160, perExtraKg: 50 },
  Chapagaun:                      { upToHalf: 150, upToOne: 160, perExtraKg: 50 },
  Godawari:                       { upToHalf: 150, upToOne: 160, perExtraKg: 50 },
  Lubhu:                          { upToHalf: 150, upToOne: 160, perExtraKg: 50 },
  Bhaktapur:                      { upToHalf: 150, upToOne: 160, perExtraKg: 50 },
  Kritipur:                       { upToHalf: 150, upToOne: 160, perExtraKg: 50 },
  Dharmasthali:                   { upToHalf: 150, upToOne: 160, perExtraKg: 50 },
  Pharping:                       { upToHalf: 150, upToOne: 160, perExtraKg: 50 },
  Nagarkot:                       { upToHalf: 150, upToOne: 160, perExtraKg: 50 },
  Pokhara:                        { upToHalf: 150, upToOne: 160, perExtraKg: 50 },
  Bhairahawa:                     { upToHalf: 150, upToOne: 160, perExtraKg: 50 },
  Butwal:                         { upToHalf: 150, upToOne: 160, perExtraKg: 50 },
  Chitwan:                        { upToHalf: 150, upToOne: 160, perExtraKg: 50 },
  Biratnagar:                     { upToHalf: 150, upToOne: 160, perExtraKg: 50 },
  Itahari:                        { upToHalf: 165, upToOne: 175, perExtraKg: 50 },
  Birtamode:                      { upToHalf: 170, upToOne: 180, perExtraKg: 50 },
  Hetauda:                        { upToHalf: 150, upToOne: 160, perExtraKg: 50 },
  Birgunj:                        { upToHalf: 150, upToOne: 160, perExtraKg: 50 },
  Nepalgunj:                      { upToHalf: 180, upToOne: 190, perExtraKg: 50 },
  Damak:                          { upToHalf: 170, upToOne: 180, perExtraKg: 50 },
  Surkhet:                        { upToHalf: 190, upToOne: 200, perExtraKg: 50 },
  Damauli:                        { upToHalf: 190, upToOne: 200, perExtraKg: 50 },
  Bardibas:                       { upToHalf: 170, upToOne: 180, perExtraKg: 50 },
  Janakpur:                       { upToHalf: 180, upToOne: 190, perExtraKg: 50 },
  Dhangadhi:                      { upToHalf: 190, upToOne: 200, perExtraKg: 50 },
  Rajbiraj:                       { upToHalf: 190, upToOne: 200, perExtraKg: 50 },
  Dharan:                         { upToHalf: 170, upToOne: 180, perExtraKg: 50 },
  Dhankuta:                       { upToHalf: 190, upToOne: 200, perExtraKg: 50 },
  Kawasoti:                       { upToHalf: 170, upToOne: 180, perExtraKg: 50 },
  Kapilbastu:                     { upToHalf: 200, upToOne: 210, perExtraKg: 50 },
  Sarlahi:                        { upToHalf: 190, upToOne: 200, perExtraKg: 50 },
  Gorkha:                         { upToHalf: 190, upToOne: 200, perExtraKg: 50 },
  Kushma:                         { upToHalf: 190, upToOne: 200, perExtraKg: 50 },
  Syangja:                        { upToHalf: 190, upToOne: 200, perExtraKg: 50 },
  Nuwakot:                        { upToHalf: 190, upToOne: 200, perExtraKg: 50 },
  Besisahar:                      { upToHalf: 190, upToOne: 200, perExtraKg: 50 },
  Dang:                           { upToHalf: 190, upToOne: 200, perExtraKg: 50 },
  Gaighat:                        { upToHalf: 180, upToOne: 190, perExtraKg: 50 },
  Mahendranagar:                  { upToHalf: 190, upToOne: 200, perExtraKg: 50 },
  Bardaghat:                      { upToHalf: 170, upToOne: 180, perExtraKg: 50 },
  Kotihawa:                       { upToHalf: 170, upToOne: 180, perExtraKg: 50 },
  Baglung:                        { upToHalf: 190, upToOne: 200, perExtraKg: 50 },
  Sindhuli:                       { upToHalf: 190, upToOne: 200, perExtraKg: 50 },
  Beni:                           { upToHalf: 200, upToOne: 210, perExtraKg: 50 },
  Dhading:                        { upToHalf: 190, upToOne: 200, perExtraKg: 50 },
  Palpa:                          { upToHalf: 180, upToOne: 190, perExtraKg: 50 },
  Illam:                          { upToHalf: 190, upToOne: 200, perExtraKg: 50 },
  Gulmi:                          { upToHalf: 205, upToOne: 215, perExtraKg: 50 },
  Manthali:                       { upToHalf: 205, upToOne: 215, perExtraKg: 50 },
  Taplejung:                      { upToHalf: 390, upToOne: 400, perExtraKg: 50 },
  Phidim:                         { upToHalf: 390, upToOne: 400, perExtraKg: 50 },
  Sankhuwasabha:                  { upToHalf: 390, upToOne: 400, perExtraKg: 50 },
  Bhojpur:                        { upToHalf: 390, upToOne: 400, perExtraKg: 50 },
  Okhaldhunga:                    { upToHalf: 390, upToOne: 400, perExtraKg: 50 },
  Tehrathum:                      { upToHalf: 390, upToOne: 400, perExtraKg: 50 },
  "Charikot (Dolakha)":           { upToHalf: 390, upToOne: 400, perExtraKg: 50 },
  Solukhumbu:                     { upToHalf: 390, upToOne: 400, perExtraKg: 50 },
  "Ramechhap Bazar":              { upToHalf: 390, upToOne: 400, perExtraKg: 50 },
  Melamchi:                       { upToHalf: 390, upToOne: 400, perExtraKg: 50 },
  Jomsom:                         { upToHalf: 390, upToOne: 400, perExtraKg: 50 },
  Myagdi:                         { upToHalf: 390, upToOne: 400, perExtraKg: 50 },
  Pyuthan:                        { upToHalf: 390, upToOne: 400, perExtraKg: 50 },
  "Jumla (Khalanga)":             { upToHalf: 390, upToOne: 400, perExtraKg: 50 },
  "Talcha Airport":               { upToHalf: 390, upToOne: 400, perExtraKg: 50 },
  Dailekh:                        { upToHalf: 390, upToOne: 400, perExtraKg: 50 },
  Jajarkot:                       { upToHalf: 390, upToOne: 400, perExtraKg: 50 },
  "Simikot(Humla)":               { upToHalf: 390, upToOne: 400, perExtraKg: 50 },
  "Chainpur (bajhang)":           { upToHalf: 390, upToOne: 400, perExtraKg: 50 },
  "Dadeldhura (Amargadi)":        { upToHalf: 390, upToOne: 400, perExtraKg: 50 },
  "Dipayal bazar (Doti)":         { upToHalf: 390, upToOne: 400, perExtraKg: 50 },
  "Salyan (Khalanga)":            { upToHalf: 390, upToOne: 400, perExtraKg: 50 },
  "Chandranigahapur (Rautahat)":  { upToHalf: 390, upToOne: 400, perExtraKg: 50 },
  "Gaur (Rautahat)":              { upToHalf: 390, upToOne: 400, perExtraKg: 50 },
  "Nijgadh (Bara)":               { upToHalf: 390, upToOne: 400, perExtraKg: 50 },
};

// Default for unknown cities — use the most common non-Kathmandu rate
const DEFAULT_RATE: WeightTier = { upToHalf: 150, upToOne: 160, perExtraKg: 50 };

export function getFallbackDeliveryFee(cityName: string, weightKg: number): number {
  const normalized = cityName.trim();
  const rate = RATES[normalized] ?? DEFAULT_RATE;

  if (weightKg <= 0.5) return rate.upToHalf;
  if (weightKg <= 1) return rate.upToOne;
  // 1+ kg: base rate for first kg + 50 per additional kg (rounded up)
  const extraKg = Math.ceil(weightKg - 1);
  return rate.upToOne + extraKg * rate.perExtraKg;
}
