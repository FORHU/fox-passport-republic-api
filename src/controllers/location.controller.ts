import { Request, Response } from "express";
import { Country, City } from "country-state-city";

export const getAllCountries = async (req: Request, res: Response) => {
  try {
    const countries = Country.getAllCountries().map(country => ({
      name: country.name,
      isoCode: country.isoCode,
    }));
    
    res.status(200).json({
      status: "success",
      data: { countries }
    });
  } catch (error) {
    console.error("Error fetching countries:", error);
    res.status(500).json({ status: "error", message: "Failed to fetch countries" });
  }
};

export const getCitiesByCountry = async (req: Request, res: Response) => {
  try {
    const { countryCode } = req.params;
    
    if (!countryCode) {
      return res.status(400).json({ status: "error", message: "Country code is required" });
    }

    // `getCitiesOfCountry` returns an array of cities. We only map what we need.
    const cities = City.getCitiesOfCountry(countryCode)?.map(city => ({
      name: city.name,
      stateCode: city.stateCode,
    })) || [];

    res.status(200).json({
      status: "success",
      data: { cities }
    });
  } catch (error) {
    console.error("Error fetching cities:", error);
    res.status(500).json({ status: "error", message: "Failed to fetch cities" });
  }
};

export const searchLocations = async (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string || "").trim().toLowerCase();
    
    if (q.length < 2) {
      return res.status(200).json({ status: "success", data: { locations: [] } });
    }

    // Allow user to type "Country, City" and still match the city
    const parts = q.split(",");
    const cityQuery = parts[parts.length - 1].trim();

    const allCities = City.getAllCities();
    const matched = new Set<string>();

    for (let i = 0; i < allCities.length; i++) {
      const city = allCities[i];
      if (city.name.toLowerCase().includes(cityQuery)) {
        const country = Country.getCountryByCode(city.countryCode);
        if (country) {
          // If they typed a country part, ensure it matches
          if (parts.length > 1) {
             const countryQuery = parts[0].trim();
             if (!country.name.toLowerCase().includes(countryQuery)) {
                continue;
             }
          }
          matched.add(`${country.name}, ${city.name}`);
        }
        if (matched.size >= 10) break;
      }
    }

    if (matched.size < 10 && parts.length === 1) {
      const allCountries = Country.getAllCountries();
      for (let i = 0; i < allCountries.length; i++) {
        if (allCountries[i].name.toLowerCase().includes(q)) {
          matched.add(allCountries[i].name);
          if (matched.size >= 10) break;
        }
      }
    }

    res.status(200).json({
      status: "success",
      data: { locations: Array.from(matched) }
    });
  } catch (error) {
    console.error("Error searching locations:", error);
    res.status(500).json({ status: "error", message: "Failed to search locations" });
  }
};
