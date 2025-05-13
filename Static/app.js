import { CONFIG } from './config.js';


const logMessage = (msg) => {
    const logContainer = document.getElementById("logContainerSystem");
    const p = document.createElement("p");
    p.textContent = msg;
    logContainer.appendChild(p);
};

let peerConnection = null;
let dataChannel = null;
let ephemeralKey = null;
let sessionId = null;

document.getElementById('startSessionBtn').addEventListener('click', async () => {
    document.getElementById("logContainer").innerHTML = '';
    document.getElementById("logContainerSystem").innerHTML = '';
    // Step 1: Start session and get ephemeral key
    const resp = await fetch('/start-session', { method: 'POST' });
    const data = await resp.json();
    if (!resp.ok) {
        logMessage('Session error: ' + (data.error || 'Unknown error'));
        return;
    }
    ephemeralKey = data.ephemeral_key;
    sessionId = data.session_id;
    logMessage('Ephemeral Key Received: ***' + ephemeralKey);
    logMessage('WebRTC Session Id = ' + sessionId);
    await startWebRTC();
});

// This function handles the transcript message received from the server
// It extracts the transcript from the message and updates the UI
async function handleTranscript(message) {
    const transcript = message.response?.output?.[0]?.content?.[0]?.transcript;
    if (transcript) {
        updateTranscript(transcript);
    }
}

function updateTranscript(message, type = 'assistant') {
    const p = document.createElement('p'); // Changed div to p
    p.className = `message ${type}-message`;
    p.textContent = message;
    // logMessage(message); // This line was already commented out
    
    const transcriptContainer = document.getElementById('logContainer'); 
    if (transcriptContainer.firstChild) {
        transcriptContainer.insertBefore(p, transcriptContainer.firstChild);
    } else {
        transcriptContainer.appendChild(p);
    }
}

async function handleChunksFunction(output) {
    try {
        const args = JSON.parse(output.arguments);
        // logMessage('Chunks function called with args: ' + args.userquery);
        const resp = await fetch('/chunks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userquery: args.userquery })
        });
        if (!resp.ok) {
            const error = await resp.text();
            logMessage('Chunks backend error: ' + error);
            return "Could not get chunks data";
        }

        const text = await resp.text();
        // text is an array of objects with id and content fields
        return text;
    } catch (error) {
        logMessage('Chunks Function Error: ' + error);
        
        return "Could not get chunks data";
    }
}

async function startWebRTC() {
    peerConnection = new RTCPeerConnection();
    const audioElement = document.getElementById('audioElement'); // Get existing audio element
    logMessage('WebRTC Peer Connection Created');
    peerConnection.ontrack = (event) => {
        audioElement.srcObject = event.streams[0];
    };
    const clientMedia = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioTrack = clientMedia.getAudioTracks()[0];
    peerConnection.addTrack(audioTrack);
    dataChannel = peerConnection.createDataChannel('realtime-channel');
    // logMessage('Data channel created');
    dataChannel.addEventListener('open', () => {
        // logMessage('Data channel is open');
        updateSession();
    });

    dataChannel.addEventListener('message', async (event) => {
        try {
            const message = JSON.parse(event.data);
            console.log('Received message:', message);

            switch (message.type) {
                case "response.output_item.done":
                    // Handle output item done
                    break;
                case "session.created":
                    logMessage("Session created: ");
                    // Send the initial message to the server for the Greeting
                    sendInitialMessage();
                    break;
                case 'response.done':
                    await handleTranscript(message);
                    const output = message.response?.output?.[0];
                    if (output?.type === 'function_call' && output?.call_id) {
                        // logMessage('Function call detected: ' + output.name);
                        let result;
                        if (output.name === 'get_chunks') {
                            result = await handleChunksFunction(output);
                        } else if (output.name === 'search_web') {
                            result = await handleSearchFunction(output); // Ensure handleSearchFunction is defined or remove if not used
                        }

                        if (result) {
                            const combinedResult = `${CONFIG.SYSTEM_PROMPT}\\n\\n${result}`;
                            // logMessage('Combined result: ' + combinedResult);
                            sendFunctionOutput(output.call_id, combinedResult);
                        }
                    }
                    break;
                // default:
                //     // logMessage('Received unhandled message type: ' + message.type);
                //     break;
            }
        } catch (error) {
            logMessage('Error parsing message: ' + error);
        }
    });
    
    dataChannel.addEventListener('close', () => {
        logMessage('Data channel is closed');
    });
    // SDP offer/answer exchange with backend
    // logMessage('Creating SDP offer...');
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    const sdpResp = await fetch('/webrtc-sdp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ephemeral_key: ephemeralKey, offer_sdp: offer.sdp })
    });
    const sdpData = await sdpResp.json();
    // logMessage('SDP response received = ' + JSON.stringify(sdpData, null, 2));
    if (!sdpResp.ok) {
        logMessage('SDP error: ' + (sdpData.error || 'Unknown error'));
        logMessage('SDP Status: ' + sdpResp.status);
        return;
    }
    await peerConnection.setRemoteDescription({ type: 'answer', sdp: sdpData.answer_sdp });
    
    const closeButton = document.getElementById('closeSessionBtn'); // Get existing close button
    closeButton.style.display = 'inline-block'; // Make it visible
    closeButton.onclick = stopSession;
}

function sendInitialMessage() {
        const startMessage = {
            type: "response.create",
            response: {
                modalities: ["text", "audio"],
                instructions: "Introduce Yourself." + CONFIG.SYSTEM_PROMPT,
            }
        };
        // logMessage("About to send greeting message: " + JSON.stringify(startMessage, null, 2));
        dataChannel.send(JSON.stringify(startMessage));
}

function updateSession() {
    // logMessage('Updating session...');
    if (!dataChannel) return;
    const event = {
        type: "session.update",
        session: {
            instructions: CONFIG.SYSTEM_PROMPT,
            voice: CONFIG.VOICE,
            tools: CONFIG.TOOLS,
            tool_choice: "auto"
        }
    };
    // logMessage("Sending session.update: " + JSON.stringify(event, null, 2));
    dataChannel.send(JSON.stringify(event));
}

function sendFunctionOutput(callId, data) {

    const event = {
        type: 'conversation.item.create',
        item: {
            type: 'function_call_output',
            call_id: callId,
            output: JSON.stringify(data)
        }
    };

    // logMessage("Sending session.update: " + JSON.stringify(event, null, 2));
    dataChannel.send(JSON.stringify(event));
    
    sendResponseCreate();
}

function sendResponseCreate() {
    const event = {
        type: 'response.create'
    };

    dataChannel.send(JSON.stringify(event));
}

function stopSession() {
    if (dataChannel) dataChannel.close();
    if (peerConnection) peerConnection.close();
    peerConnection = null;
    logMessage("Session closed.");
}

// Ensure handleSearchFunction is defined if it's used, or remove the call if not.
// Example:
// async function handleSearchFunction(output) {
//     logMessage('Search function called with: ' + JSON.stringify(output));
//     // Implement search functionality here
//     return "Search results";
// }
