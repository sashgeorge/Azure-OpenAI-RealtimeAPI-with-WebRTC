# WebRTC - Real-time Audio Azure OpenAI and Azure Search

This solution semonstrates web application that facilitates real-time audio and data exchange between a Python backend and a JavaScript frontend using **WebRTC**. It integrates with Azure OpenAI for advanced AI capabilities and Azure Search for efficient data retrieval.

**WebRTC protocol** is openAI recommendation for using Realtime API in production applications, as opposed to web sockets, since it is better equipped to handle variable connection states, and provides a number of convenient APIs for capturing user audio inputs and playing remote audio streams from the model.See the documentation here. https://platform.openai.com/docs/guides/realtime#connect-with-webrtc

## Features

*   **Real-time Audio Streaming**: Captures audio from the user's microphone and streams it to the backend via WebRTC.
*   **WebRTC Data Channel**: Enables bidirectional text-based communication between the frontend and backend.
*   **Azure OpenAI Integration**: Leverages Azure OpenAI services for processing and responding to user queries.
*   **Azure Search Integration**: Utilizes Azure Search to query a knowledge base and provide relevant information.
*   **Dynamic Configuration**: Frontend configuration is managed via a JavaScript file (`Static/config.js`).
*   **Python Backend**: Built with `aiohttp` for asynchronous request handling.
*   **Static File Serving**: Serves HTML, CSS, and JavaScript files from a `Static/` directory.
*   **Dockerized**: Includes a `Dockerfile` for easy containerization and deployment.

## Technologies Used

*   **Backend**:
    *   Python 3.12+
    *   `aiohttp`: Asynchronous HTTP client/server.
    *   `azure-search-documents`: Azure Cognitive Search client library.
    *   `azure-core`, `azure-identity`: Azure SDK core libraries.
    *   `python-dotenv`: For managing environment variables.
    *   `gunicorn`: WSGI HTTP server.
*   **Frontend**:
    *   HTML5
    *   CSS3
    *   JavaScript (ES6 Modules)
    *   WebRTC API
*   **Azure Services**:
    *   Azure OpenAI (for real-time transcription and AI models)
    *   Azure Cognitive Search (for querying knowledge base)
*   **Containerization**:
    *   Docker

## Setup and Installation

### Prerequisites

*   Python 3.12 or higher
*   pip (Python package installer)
*   A modern web browser that supports WebRTC (e.g., Chrome, Firefox)
*   Docker (optional, for containerized deployment)
*   Azure Account and configured Azure services (OpenAI, Search)

### Steps

1.  **Clone the repository (if applicable):**
    ```bash
    git clone <repository-url>
    cd <repository-directory>
    ```

2.  **Set up Python Environment:**
    It's recommended to use a virtual environment:
    ```bash
    python -m venv venv
    source venv/bin/activate  # On Windows: venv\Scripts\activate
    ```

3.  **Install Python Dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

4.  **Configure Environment Variables:**
    Create a `.env` file in the root directory by copying `env.Sample`:
    ```bash
    cp env.Sample .env
    ```
    Edit the `.env` file and fill in your Azure service credentials and endpoints:
    ```env
    AZURE_SEARCH_ENDPOINT=YOUR_AZURE_SEARCH_ENDPOINT
    AZURE_SEARCH_API_KEY=YOUR_AZURE_SEARCH_API_KEY
    AZURE_SEARCH_INDEX=YOUR_AZURE_SEARCH_INDEX
    AZURE_SEARCH_SEMANTIC_CONFIGURATION=YOUR_SEMANTIC_CONFIG_NAME
    AZURE_SEARCH_IDENTIFIER_FIELD="chunk_id"
    AZURE_SEARCH_CONTENT_FIELD="chunk"
    AZURE_SEARCH_TITLE_FIELD="title"
    AZURE_SEARCH_EMBEDDING_FIELD="text_vector"

    AZURE_OPENAI_WEBRTC_URL="https://YOUR_REGION.realtimeapi-preview.ai.azure.com/v1/realtimertc"
    AZURE_OPENAI_WEBRTC_SESSIONS_URL="https://<Replace with your deployment name>.openai.azure.com/openai/realtimeapi/sessions?api-version=2025-04-01-preview"
    AZURE_OPENAI_API_KEY=YOUR_AZURE_OPENAI_API_KEY
    AZURE_OPENAI_DEPLOYMENT="YOUR_AOAI_DEPLOYMENT_NAME" # e.g., gpt-4o-realtime-preview
    AZURE_OPENAI_VOICE="verse" # Desired voice for text-to-speech
    ```

## Running the Application

1.  **Start the Python Backend Server:**
    ```bash
    python app.py
    ```
    Alternatively, using Gunicorn (as specified in the Dockerfile):
    ```bash
    gunicorn app:create_app --worker-class aiohttp.GunicornWebWorker --bind 0.0.0.0:8080
    ```
    The application will typically be served on `http://localhost:8080` or `http://0.0.0.0:8080`.

2.  **Access the Application:**
    Open your web browser and navigate to `http://localhost:8080/Static/index.html`.

## Project Structure

```
.
├── Static/                     # Frontend static files
│   ├── index.html              # Main HTML page
│   ├── style.css               # CSS styles
│   ├── app.js                  # Main frontend JavaScript logic
│   └── config.js               # Frontend configuration
├── app.py                      # Main Python backend application
├── requirements.txt            # Python dependencies
├── Dockerfile                  # Docker configuration
├── env.Sample                  # Sample environment variables file
└── README.md                   # This file
```

## Configuration

### Frontend Configuration (`Static/config.js`)

The `Static/config.js` file contains client-side configurations, such as:

*   `VOICE`: Default voice for Azure OpenAI.
*   `VOICES`: List of available voices.
*   `TOOLS`: Definitions for functions that the AI model can call (e.g., `get_chunks`).
*   `SYSTEM_PROMPT`: The initial prompt or instructions given to the Azure OpenAI model.

This configuration is loaded by `Static/app.js` and used to initialize and control the behavior of the frontend application and its interaction with Azure services.

## API Endpoints (Backend - `app.py`)

*   **`POST /start-session`**: Initializes a WebRTC session with Azure OpenAI and returns an ephemeral key and session ID.
*   **`POST /webrtc-sdp`**: Handles the SDP offer/answer exchange for establishing the WebRTC peer connection.
*   **`POST /chunks`**: Called by the frontend when the AI requests to use the `get_chunks` tool. This endpoint queries Azure Search based on the `userquery` and returns relevant chunks of information.
*   **`GET /Static/{filename:.+}`**: Serves static files (HTML, CSS, JS) from the `Static/` directory.

## Docker

The application can be built and run using Docker.

1.  **Build the Docker Image:**
    From the project root directory:
    ```bash
    docker build -t webrtc-realtime-app .
    ```

2.  **Run the Docker Container:**
    ```bash
    docker run -p 8080:8080 -v $(pwd)/.env:/.env webrtc-realtime-app
    ```
    This command maps port 8080 of the container to port 8080 on the host and mounts your local `.env` file into the container. Ensure your `.env` file is correctly populated.

    Access the application at `http://localhost:8080/Static/index.html`.

## Deploy in Azure Container Apps (ACA)

    az containerapp up --resource-group <Your Resource Group Name> --name <ACA name> --ingress external --target-port 8080 --source .

---

This README provides a comprehensive guide to understanding, setting up, and running the application.
Adjust paths and commands as necessary based on your specific environment.
