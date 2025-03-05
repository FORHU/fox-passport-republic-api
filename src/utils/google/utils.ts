import axios, { AxiosResponse } from "axios";
import { GOOGLE_AUTH_URI, GOOGLE_REDIRECT_URI, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_URI } from "../../config";

interface GoogleAccessTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  id_token: string;
}

interface GoogleProfile {
  id: string;
  email: string;
  name: string;
  // Add more fields as needed
}

interface GoogleAutocompletePrediction {
  description: string;
  place_id: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

interface GoogleAutocompleteResponse {
  predictions: GoogleAutocompletePrediction[];
}

export const generateGoogleAuthURL = (): string => {
  const params = new URLSearchParams({
    redirect_uri: `${GOOGLE_REDIRECT_URI}`,
    client_id: GOOGLE_CLIENT_ID,
    access_type: "offline",
    response_type: "code",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/userinfo.profile", "https://www.googleapis.com/auth/userinfo.email"].join(" "),
  });

  return `${GOOGLE_AUTH_URI}?${params.toString()}`;
};

export async function googleGetAccessToken(code: string): Promise<GoogleAccessTokenResponse> {
  try {
    const { data }: AxiosResponse<GoogleAccessTokenResponse> = await axios.post("https://oauth2.googleapis.com/token", {
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      code,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    });
    return data;
  } catch (error: any) {
    // Handle error
    throw new Error(`Failed to get Google access token: ${error.message}`);
  }
}

export async function getGoogleProfile(access_token: string): Promise<GoogleProfile> {
  try {
    const { data }: AxiosResponse<GoogleProfile> = await axios.get("https://www.googleapis.com/oauth2/v1/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    return data;
  } catch (error: any) {
    // Handle error
    throw new Error(`Failed to get Google profile: ${error.message}`);
  }
}

export async function getAddressAutocomplete(input: string, country: string = "sg"): Promise<GoogleAutocompletePrediction[]> {
  if (!input) {
    throw new Error("Input field is required");
  }

  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error("Google Maps API key is missing");
  }

  try {
    const url = GOOGLE_MAPS_URI;

    const { data }: AxiosResponse<GoogleAutocompleteResponse> = await axios.get(url, {
      params: {
        input,
        key: GOOGLE_MAPS_API_KEY,
        components: `country:${country}`,
      },
    });

    return data.predictions;
  } catch (error: any) {
    console.error("Failed to fetch autocomplete addresses:", error.message);
    throw new Error(`Failed to fetch autocomplete addresses: ${error.message}`);
  }
}
