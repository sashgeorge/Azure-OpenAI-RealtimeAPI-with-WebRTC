
let CONFIG = null;

async function loadConfig() {
    const resp = await fetch('/config');
    if (!resp.ok) {
        throw new Error('Failed to load config from server');
    }
    CONFIG = await resp.json();
    // logMessage('Config loaded: ' + JSON.stringify(CONFIG, null, 2));
}

// Wait for config to load before enabling UI
window.addEventListener('DOMContentLoaded', async () => {
    try {
        await loadConfig();
        // Optionally, enable UI or fire any init code here
        document.getElementById('startSessionBtn').disabled = false;
    } catch (e) {
        alert('Failed to load configuration: ' + e.message);
    }
});


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
    // logMessage('Ephemeral Key Received: ***' + ephemeralKey);
    // logMessage('WebRTC Session Id = ' + sessionId);
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

function updateTranscript(message, type = 'Voice Agent') {
    const p = document.createElement('p');

    if (type === 'Voice Agent' && message.includes('\n')) {
        // Handle multi-line format for Voice Agent
        const lines = message.split('\n');
        lines.forEach((line, index) => {
            if (line.startsWith('**Step ') && line.includes(':**')) {
                const boldEndIndex = line.indexOf(':**') + 3;
                const strongPart = document.createElement('strong');
                strongPart.textContent = line.substring(0, boldEndIndex);
                p.appendChild(strongPart);
                p.appendChild(document.createTextNode(line.substring(boldEndIndex)));
            } else if (line.match(/^\[.*?\]\((vzhome:\/\/.*?\/)\)$/)) { // Matches [Link Name](vzhome://link-path)
                const linkTextMatch = line.match(/^\[(.*?)]/);
                const linkUrlMatch = line.match(/\((vzhome:\/\/.*?)\)$/);
                if (linkTextMatch && linkUrlMatch) {
                    const a = document.createElement('a');
                    a.textContent = linkTextMatch[1];
                    a.href = linkUrlMatch[1];
                    a.target = '_blank'; // Optional: open in new tab
                    p.appendChild(a);
                } else {
                    p.appendChild(document.createTextNode(line));
                }
            } else {
                p.appendChild(document.createTextNode(line));
            }

            if (index < lines.length - 1) {
                p.appendChild(document.createElement('br'));
            }
        });
    } else {
        // Original handling for User messages or single-line Voice Agent messages
        p.appendChild(document.createTextNode(message));
    }

    // Replace spaces in type for CSS class name
    const typeClassName = type.replace(/\s+/g, '-');
    p.className = `message ${typeClassName}-message`;

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
    const startSessionButton = document.getElementById('startSessionBtn'); // Get start session button
    // logMessage('WebRTC Peer Connection Created');
    peerConnection.ontrack = (event) => {
        audioElement.srcObject = event.streams[0];
        startSessionButton.classList.add('audio-active');
        startSessionButton.textContent = 'Session Ready';
        // document.getElementById('audioStatus').style.display = 'inline';
    };

    const audioConstraints = {
        audio: {
            channelCount: 1,
            sampleRate: 24000, // From Controls.js, good for Azure AI Speech
            echoCancellation: true,
            noiseSuppression: true,
        }
    };
    // logMessage(`Requesting audio with constraints: ${JSON.stringify(audioConstraints)}`);
    let clientMedia;
    try {
        clientMedia = await navigator.mediaDevices.getUserMedia(audioConstraints);
    } catch (err) {
        logMessage(`Error getting user media: ${err.message}. Falling back to default audio constraints.`);
        try {
            clientMedia = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (fallbackErr) {
            logMessage(`Fallback getUserMedia error: ${fallbackErr.message}. Cannot start WebRTC audio.`);
            return;
        }
    }
    
    const audioTrack = clientMedia.getAudioTracks()[0];
    if (!audioTrack) {
        logMessage("No audio track found. Cannot start WebRTC audio.");
        return;
    }
    peerConnection.addTrack(audioTrack, clientMedia); // Pass the stream as the second argument

    // Attempt to set Opus as preferred codec
    // This should be done after adding the track and before creating the offer.
    const transceivers = peerConnection.getTransceivers();
    // Find the transceiver that was just added for the audio track.
    // The last added transceiver is usually the one, or find by track.
    const audioTransceiver = transceivers.find(t => t.sender && t.sender.track === audioTrack);

    if (audioTransceiver && typeof audioTransceiver.setCodecPreferences === 'function') {
        const capabilities = RTCRtpSender.getCapabilities('audio');
        if (capabilities && capabilities.codecs) {
            const opusCodecs = capabilities.codecs.filter(c => c.mimeType.toLowerCase() === 'audio/opus');
            let preferredOpusCodec = opusCodecs.find(c => c.sampleRate === 24000);

            if (!preferredOpusCodec && opusCodecs.length > 0) {
                // logMessage('Opus at 24kHz not found, selecting first available Opus codec.');
                preferredOpusCodec = opusCodecs[0]; // Fallback to any Opus codec
            }

            if (preferredOpusCodec) {
                // logMessage(`Found Opus codec: ${JSON.stringify(preferredOpusCodec)}`);
                try {
                    audioTransceiver.setCodecPreferences([preferredOpusCodec]);
                    // logMessage('Attempted to set Opus as preferred codec.');
                } catch (e) {
                    logMessage(`Error setting Opus as preferred codec: ${e.message}`);
                }
            } else {
                logMessage('Opus codec not found in capabilities. Will use browser/server default.');
                // logMessage(`Available audio codecs: ${JSON.stringify(capabilities.codecs.map(c => ({ mimeType: c.mimeType, sampleRate: c.sampleRate, channels: c.channels })))}`);
            }
        } else {
            logMessage('Could not retrieve audio codec capabilities.');
        }
    } else {
        logMessage('setCodecPreferences not available or audio transceiver not found. Will use browser/server default codecs.');
    }

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
                case "conversation.item.input_audio_transcription.completed":
                    updateTranscript(message.transcript, "User");
                    break;
                case "conversation.item.input_audio_transcription.failed":
                    logMessage("conversation.item.input_audio_transcription.failed");
                    break;
                case "error":
                    //converts the message to string
                    const messagestrError = JSON.stringify(event.data); // Renamed to avoid conflict if scopes were different
                    // logMessage("response.audio_transcript.done" + messagestrError);
                    updateTranscript("Error***********" + messagestrError);
                    break;
                case "response.output_item.done":
                    // Handle output item done
                    break;
                case "session.created":
                    logMessage("Session created: ");
                    // Send the initial message to the server for the Greeting
                    sendInitialMessage();
                    sendSessionUpdateForTools();

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
                            sendFunctionOutput(output.call_id, result);
                        }
                    }
                    break;
                // default:
                //     logMessage('Received unhandled message type: ' + message.type);
                //     break;
            }
        } catch (error) {
            logMessage('Error parsing message: ' + error);
        }
    });
    
    dataChannel.addEventListener('close', () => {
        // logMessage('Data channel is closed');
        startSessionButton.classList.remove('audio-active');
        startSessionButton.textContent = 'Start Session';
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
                // modalities: ["text", "audio"],
                instructions: "Introduce Yourself." + CONFIG.GREETING_PROMPT,
            }
        };
        // logMessage("About to send greeting message: " + JSON.stringify(startMessage, null, 2));
        dataChannel.send(JSON.stringify(startMessage));
}

function updateSession() {
    // logMessage('Updating session...');
    if (!dataChannel) return;

    const event = {
      type: 'session.update',
      session: {
        instructions: CONFIG.SYSTEM_PROMPT,
        modalities: ['audio', 'text'],
        temperature: CONFIG.TEMPERATURE,
        input_audio_transcription: { 
            model: CONFIG.TRANSCRIPTION_MODEL
        },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 350,
          create_response: true
        }
      }
    };
    // logMessage("Sending session.update: " + JSON.stringify(event, null, 2));
    dataChannel.send(JSON.stringify(event));
}

function sendSessionUpdateForTools() {
    const event = {
        type: "session.update",
        session: {
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

    // logMessage("Sending conversation.item.create (aka function call): " + JSON.stringify(event, null, 2));
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
    const startSessionButton = document.getElementById('startSessionBtn');
    startSessionButton.classList.remove('audio-active');
    startSessionButton.textContent = 'Start Session';
    document.getElementById('audioStatus').style.display = 'none';
}

// Ensure handleSearchFunction is defined if it's used, or remove the call if not.
// Example:
// async function handleSearchFunction(output) {
//     logMessage('Search function called with: ' + JSON.stringify(output));
//     // Implement search functionality here
//     return "Search results";
// }