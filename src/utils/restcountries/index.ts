import axios from "axios";

export const getCountryData = async (countryName: string) => {
  try {
    const response: any = await axios.get(`https://restcountries.com/v3.1/name/${countryName}`);
    const [country] = response.data;

    const flag = country.flags.png;
    const name = country.name.common;
    const dialingCode = `${country.idd.root}${country.idd.suffixes[0]}`;
    const currencies = country.currencies[Object.keys(country.currencies)[0]];
    const currencySign = currencies.symbol;
    const currency = Object.keys(country.currencies)[0];
    const cca2 = country.cca2;

    return {
      cca2,
      country_name: name,
      flag_url: flag,
      country_code: dialingCode,
      currency,
      currency_sign: currencySign,
    };
  } catch (error) {
    console.error("Error fetching country data:", error);
  }
};
