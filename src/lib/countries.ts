export interface Country { name: string; flag: string; code: string; symbol: string; currency: string }
export const COUNTRIES: Country[] = [
  { name: "Sri Lanka", flag: "🇱🇰", code: "LKR", symbol: "Rs.", currency: "Sri Lankan Rupee" },
  { name: "India", flag: "🇮🇳", code: "INR", symbol: "₹", currency: "Indian Rupee" },
  { name: "Maldives", flag: "🇲🇻", code: "MVR", symbol: "Rf", currency: "Maldivian Rufiyaa" },
  { name: "United Arab Emirates", flag: "🇦🇪", code: "AED", symbol: "AED", currency: "UAE Dirham" },
  { name: "Singapore", flag: "🇸🇬", code: "SGD", symbol: "S$", currency: "Singapore Dollar" },
  { name: "Australia", flag: "🇦🇺", code: "AUD", symbol: "A$", currency: "Australian Dollar" },
  { name: "United Kingdom", flag: "🇬🇧", code: "GBP", symbol: "£", currency: "British Pound" },
  { name: "United States", flag: "🇺🇸", code: "USD", symbol: "$", currency: "US Dollar" },
];
export const findCountry = (name: string) => COUNTRIES.find((c) => c.name === name) ?? COUNTRIES[0];
