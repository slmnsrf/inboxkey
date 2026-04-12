declare module 'country-telephone-data' {
  interface CountryData {
    name: string
    iso2: string
    dialCode: string
    priority: number
    format: string
  }

  export const allCountries: CountryData[]
}
