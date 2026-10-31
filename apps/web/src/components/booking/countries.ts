// ISO 3166-1 alpha-2 codes offered in the booking form. Display names come from Intl.DisplayNames (localised).
export const COUNTRY_CODES = (
  "AE AR AT AU BE BR CA CH CL CN CO CZ DE DK EG ES FI FR GB GR HK HU ID IE IL IN IT JP KH KR LA LK MM MX MY NL NO NP NZ PE PH PK PL PT QA RO RU SA SE SG TH TR TW UA US VN ZA"
).split(" ");

export function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}
