import axios from "axios";

const API_URL = "http://localhost:6002/api/v1";

async function runTests() {
  console.log("Starting manual API tests...");

  try {
    const ping = await axios.get(`${API_URL}`);
    console.log("API Ping:", ping.status === 200 ? "SUCCESS" : "FAILED");

    const venues = await axios.get(`${API_URL}/venues`);
    console.log("Fetch Venues:", venues.data.success ? "SUCCESS" : "FAILED");

    if (venues.data.data && venues.data.data.length > 0) {
      console.log(`Found ${venues.data.data.length} venues.`);
    }
  } catch (error: any) {
    console.error("Test failed:", error.response?.data || error.message);
  }
}

runTests();
