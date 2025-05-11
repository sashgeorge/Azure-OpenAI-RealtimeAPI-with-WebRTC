import os
import logging
from aiohttp import web
import aiohttp
import asyncio

from azure.search.documents import SearchClient
from azure.core.credentials import AzureKeyCredential
from azure.search.documents.models import VectorizableTextQuery
from dotenv import load_dotenv 


load_dotenv(override=True) # take environment variables from .env.

APP_ROOT = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(APP_ROOT, 'Static')

# Load open ai environment variables
WEBRTC_URL = os.environ.get("AZURE_OPENAI_WEBRTC_URL")
SESSIONS_URL = os.environ.get("AZURE_OPENAI_WEBRTC_SESSIONS_URL")
API_KEY = os.environ.get("AZURE_OPENAI_API_KEY")
DEPLOYMENT = os.environ.get("AZURE_OPENAI_DEPLOYMENT")
VOICE = os.environ.get("AZURE_OPENAI_VOICE")

# Azure Search configuration
SEARCH_ENDPOINT=os.environ.get("AZURE_SEARCH_ENDPOINT")
SEARCH_INDEX=os.environ.get("AZURE_SEARCH_INDEX")
SEMANTIC_CONFIGURATION=os.environ.get("AZURE_SEARCH_SEMANTIC_CONFIGURATION") or None
IDENTIFIER_FIELD=os.environ.get("AZURE_SEARCH_IDENTIFIER_FIELD") or "chunk_id"
CONTENT_FIELD=os.environ.get("AZURE_SEARCH_CONTENT_FIELD") or "chunk"
EMBEDDING_FIELD=os.environ.get("AZURE_SEARCH_EMBEDDING_FIELD") or "text_vector"
TITLE_FIELD=os.environ.get("AZURE_SEARCH_TITLE_FIELD") or "title"
USE_VECTOR_QUERY=(os.getenv("AZURE_SEARCH_USE_VECTOR_QUERY", "true") == "true")
SEARCH_API_KEY=os.environ.get("AZURE_SEARCH_API_KEY") 

# Create a SearchClient using your endpoint, index, and api_key credential
credential = AzureKeyCredential(SEARCH_API_KEY)
search_client = SearchClient(endpoint=SEARCH_ENDPOINT, index_name=SEARCH_INDEX, credential=credential)


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

routes = web.RouteTableDef()

@routes.get('/')
async def index(request):
    return web.FileResponse(os.path.join(STATIC_DIR, 'index.html'))

@routes.get('/{filename:.+\\.js}')
async def serve_js(request):
    filename = request.match_info['filename']
    file_path = os.path.normpath(os.path.join(STATIC_DIR, filename))

    # Security check to prevent directory traversal
    if not file_path.startswith(STATIC_DIR):
        logger.warning(f"Directory traversal attempt for JS file: {filename}")
        return web.Response(status=403, text="Forbidden")

    if os.path.isfile(file_path):
        return web.FileResponse(file_path)
    else:
        logger.warning(f"JS file not found at path: {file_path}. Requested filename: {filename}. CWD: {os.getcwd()}")
        return web.Response(status=404, text="Not Found")

@routes.get('/{filename:.+\\.css}')
async def serve_css(request):
    filename = request.match_info['filename']
    file_path = os.path.normpath(os.path.join(STATIC_DIR, filename))

    # Security check to prevent directory traversal
    if not file_path.startswith(STATIC_DIR):
        logger.warning(f"Directory traversal attempt for CSS file: {filename}")
        return web.Response(status=403, text="Forbidden")

    if os.path.isfile(file_path):
        return web.FileResponse(file_path)
    else:
        logger.warning(f"CSS file not found at path: {file_path}. Requested filename: {filename}. CWD: {os.getcwd()}")
        return web.Response(status=404, text="Not Found")

@routes.post('/chunks')
async def get_chunks(request):
    # query_text = await request.json().get("userquery")
    data = await request.json()
    query_text = data.get('userquery')
    #print in yellow
    print(f"\033[93mSearching for '{query_text}' in the knowledge base.\033[0m")

    # Hybrid query using Azure AI Search with (optional) Semantic Ranker
    vector_queries = []
    if USE_VECTOR_QUERY:
        vector_queries.append(VectorizableTextQuery(text=query_text, k_nearest_neighbors=50, fields=EMBEDDING_FIELD))
    search_results =  search_client.search(
        search_text=query_text, 
        query_type="semantic" if SEMANTIC_CONFIGURATION else "simple",
        semantic_configuration_name=SEMANTIC_CONFIGURATION,
        top=5,
        vector_queries=vector_queries,
        select=", ".join([str(IDENTIFIER_FIELD), str(CONTENT_FIELD)])
    )

    result = ""
    for r in search_results:
        result += f"[{r[IDENTIFIER_FIELD]}]: {r[CONTENT_FIELD]}\n-----\n"
        # print(f"[{r[IDENTIFIER_FIELD]}]: {r[CONTENT_FIELD]}\n-----\n")

    # Print the result in yellow
    print(f"\033[93mSearch result:\n{result}\033[0m")
    return web.Response(text=result)


@routes.post('/start-session')
async def start_session(request):
    payload = {
        "model": DEPLOYMENT,
        "voice": VOICE
    }
    headers = {
        "api-key": API_KEY,
        "Content-Type": "application/json"
    }
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(SESSIONS_URL, json=payload, headers=headers) as resp:
                if resp.status != 200:
                    error_text = await resp.text()
                    logger.error(f"Session API error: {error_text}")
                    return web.json_response({"error": "API request failed", "details": error_text}, status=500)
                data = await resp.json()
                session_id = data.get("id")
                ephemeral_key = data.get("client_secret", {}).get("value")
                logger.info(f"Ephemeral key: {ephemeral_key}")
                return web.json_response({"session_id": session_id, "ephemeral_key": ephemeral_key})
    except Exception as e:
        logger.exception("Error fetching ephemeral key:")
        return web.json_response({"error": str(e)}, status=500)

@routes.post('/webrtc-sdp')
async def webrtc_sdp(request):
    data = await request.json()
    ephemeral_key = data['ephemeral_key']
    offer_sdp = data['offer_sdp']
    headers = {
        "Authorization": f"Bearer {ephemeral_key}",
        "Content-Type": "application/sdp"
    }
    url = f"{WEBRTC_URL}?model={DEPLOYMENT}"

#print() in yellow
    print(f"WebRTC SDP exchange URL: {url}")
    print(f"WebRTC SDP exchange headers: {headers}")
    # print(f"WebRTC SDP exchange offer_sdp: {offer_sdp}")
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, data=offer_sdp, headers=headers) as resp:
                #check if the response is anything other than 200s
                if resp.status < 200 or resp.status >= 300:
                    error_text = await resp.text()
                    logger.error(f"WebRTC SDP exchange failed: {error_text}")
                    return web.json_response({"error": "WebRTC SDP exchange failed", "details": error_text}, status=500)
                answer_sdp = await resp.text()
                return web.json_response({'answer_sdp': answer_sdp})
    except Exception as e:
        logger.exception("Error in WebRTC SDP exchange:")
        return web.json_response({"error": str(e)}, status=500)

async def create_app() -> web.Application:
    app = web.Application()
    app.add_routes(routes)
    return app


if __name__ == '__main__':
    web.run_app(create_app(), port=8080, host='127.0.0.1')
