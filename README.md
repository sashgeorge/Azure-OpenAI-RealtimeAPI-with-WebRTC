# Azure-OpenAI-RealtimeAPI-with-WebRTC
This solution will use WebRTC protocol to access Azure OpenAI Realtime API and will do function calling using Azure AI Search

##Deploy in Azure Container Apps (ACA)
az containerapp up --resource-group <Your Resource Group Name> --name <ACA name> --ingress external --target-port 8080 --source .
