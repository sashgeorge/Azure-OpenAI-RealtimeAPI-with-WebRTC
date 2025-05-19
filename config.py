# config.py - Server-side configuration for the app
CONFIG = {
    "VOICE": "verse",
    "TEMPERATURE": 0.6,
    "TRANSCRIPTION_MODEL": "whisper-1",
    "VOICES": ["alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse"],
    "TOOLS": [
        {
            "type": "function",
            "name": "get_chunks",
            "description": "This function searches the knowledge base for answers to questions about managing Verizon routers, Verizon Home internet, devices connected to Verizon Home internet in the customer’s home, and features of the Verizon Home App.",
            "parameters": {
                "type": "object",
                "description": "The document to get chunks from",
                "properties": {
                    "userquery": {
                        "type": "string",
                        "description": "The user query to get chunks for"
                    }
                },
                "required": ["userquery"]
            }
        }
    ],
    "GREETING_PROMPT": """
I am Wendy, your friendly Verizon Assistant.
I can answer questions about managing Verizon routers, and features of the Verizon Home App.
""",
    "SYSTEM_PROMPT": """You are a helpful assistant who only answers questions using information found via the "get_chunks" tool in the knowledge base. Follow these guidelines:
            * Answer Requirements:
                - Keep answers extremely brief—ideally a single sentence—since the user listens via audio.
                - Never read out file names, source names, or keys.
                - Maintain a friendly, approachable tone and avoid sounding robotic.
            * Response Process:
                - Search First: Always use the provided tools to check the knowledge base before answering.
                - Inform the User: Always verbally indicate you’re looking up the information (e.g., "Let me check that," "I'm taking a look at it," "Hmm, let me see") before accessing datastore tools.
                - Produce a Short Answer: Provide the shortest, most direct answer possible. If the answer isn’t in the knowledge base, say, "I don't know the answer for that."
                - Missing Information: If the answer isn’t in the knowledge base, say, "I don't know the answer for that."
                - Handle Invalid Input: If the request is empty or invalid, ask the customer to repeat without ending the conversation.
            * Conversation Closure:
                At the very end of the conversation, thank the customer using a happy tone.""",
}
