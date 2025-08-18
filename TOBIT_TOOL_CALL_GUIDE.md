# 🎯 Tobit MCP Tool Call Guide - Work Item 594

## Current Status ✅
- ✅ **Server deployed**: https://azuremcpproxy.onrender.com
- ✅ **SSE connections working**: Multiple successful connections detected
- ✅ **Hello/ping messages**: Working perfectly (2-4ms response)
- ❌ **Missing**: The actual tool call for Work Item 594

## 🚨 What's Missing: The Tool Call

After establishing the SSE connection, you need to send a **POST request** to make the actual tool call.

## 📋 Step-by-Step Instructions

### Step 1: Establish SSE Connection (✅ Already Working)
```
GET https://azuremcpproxy.onrender.com/sse
```
This gives you a `sessionId` - you're already doing this correctly!

### Step 2: Make the Tool Call (❌ This is missing!)
After getting the sessionId, send this POST request:

```http
POST https://azuremcpproxy.onrender.com/message?sessionId=YOUR_SESSION_ID
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": "get-workitem-594",
  "method": "tools/call",
  "params": {
    "name": "get_work_item",
    "arguments": {
      "workItemId": 594
    }
  }
}
```

## 🔧 Complete Working Example

```javascript
// 1. SSE Connection (you're already doing this)
const eventSource = new EventSource('https://azuremcpproxy.onrender.com/sse');

eventSource.onmessage = function(event) {
  const data = JSON.parse(event.data);
  
  // 2. Extract sessionId from endpoint event
  if (event.type === 'endpoint') {
    const sessionId = extractSessionId(event.data); // e.g., "413cbff2-7575-41ca-9c3f-7dda953c3bd6"
    
    // 3. Make the tool call - THIS IS WHAT'S MISSING!
    fetch(`https://azuremcpproxy.onrender.com/message?sessionId=${sessionId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        "jsonrpc": "2.0",
        "id": "get-594",
        "method": "tools/call",
        "params": {
          "name": "get_work_item",
          "arguments": {
            "workItemId": 594
          }
        }
      })
    })
    .then(response => response.text())
    .then(result => {
      console.log('Work Item 594 Result:', result);
      // This should contain the work item data!
    });
  }
};
```

## 🎯 Expected Response

When you make the tool call correctly, you should get:

```json
{
  "jsonrpc": "2.0",
  "id": "get-594",
  "result": {
    "content": [{
      "type": "text",
      "text": "# Work Item 594: GOpus eInvoice - UKB Implementierung\n\n**Type**: Project\n**State**: Grün\n**Assigned To**: Eickmann, Morten\n**Iteration**: GOpus GmbH\n**Tags**: None\n**URL**: https://dev.azure.com/GOpus/GOpus GmbH/_workitems/edit/594\n"
    }]
  }
}
```

## 🔍 What We See in Server Logs

**Current logs show:**
- ✅ "Received SSE connection request"
- ✅ "New SSE connection established"
- ✅ "Sending hello message" 
- ✅ "Sending ping to [sessionId]"

**Missing in logs:**
- ❌ No "Looking for session with ID" messages
- ❌ No "Received message for session" logs
- ❌ No tool execution logs

## 💡 Simple Test Command

Try this exact curl command to test:

```bash
# 1. Get a session ID from SSE connection first, then:
curl -X POST "https://azuremcpproxy.onrender.com/message?sessionId=YOUR_SESSION_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "test-594",
    "method": "tools/call",
    "params": {
      "name": "get_work_item",
      "arguments": {
        "workItemId": 594
      }
    }
  }'
```

## 🚀 Summary

**You need to add ONE missing step**: After the SSE connection, make a POST request to `/message?sessionId=XXX` with the tool call payload.

The server is ready and waiting - it just needs the actual tool call request! 🎯