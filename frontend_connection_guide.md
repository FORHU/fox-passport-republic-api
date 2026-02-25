# Frontend Connection Guide (TEST Project)

This guide helps you connect your frontend project (TEST) running on port 3000 to this backend API.

## API Configuration

- **Base URL**: `http://localhost:3002/api/v1`
- **Socket.IO URL**: `http://localhost:3002`

## Connecting with Fetch

```javascript
const API_URL = "http://localhost:3002/api/v1";

const fetchData = async () => {
  try {
    const response = await fetch(`${API_URL}/venues`); // Example: Fetching venues
    const data = await response.json();
    console.log(data);
  } catch (error) {
    console.error("Error fetching data:", error);
  }
};
```

## Connecting with Axios

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: "http://localhost:3002/api/v1",
  withCredentials: true // Required if you're using sessions or cookies
});

// Example request
api.get('/venues').then(res => console.log(res.data));
```

## CORS Policy

The backend is configured to allow requests from `http://localhost:3000` (your TEST project port). This is controlled by the `FRONTEND_URL` variable in your `.env` file.
